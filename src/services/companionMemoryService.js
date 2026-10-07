const { getEnv } = require('../config/env');
const { CompanionMemory } = require('../models/CompanionMemory');
const { FACT_EXTRACT_EVERY_USER_MESSAGES, resolveMemoryTier } = require('../config/memoryTiers');

const MEMORY_KEY = '__companionMemoryFacts';
const EXTRACT_TIMEOUT_MS = 12000;
const inFlight = new Set();

const resolveExtractModel = () =>
  getEnv('DEEPSEEK_MEMORY_MODEL') || getEnv('DEEPSEEK_MODEL') || 'deepseek-v4-flash';

/**
 * Loads the user's long-term facts for this companion (capped by plan) and stashes them on
 * the in-memory user object, where the prompt builder picks them up — for text chat and
 * for both voice providers, which all receive the same `user`.
 */
const attachCompanionMemory = async (user, companionId) => {
  if (!user || !companionId) {
    return [];
  }
  const tier = resolveMemoryTier(user);
  let facts = [];
  if (tier.longTermFacts > 0) {
    const doc = await CompanionMemory.findOne({ userId: user._id, companionId: String(companionId) })
      .select('facts')
      .lean()
      .catch(() => null);
    facts = (doc?.facts || []).slice(-tier.longTermFacts).map(item => item.text);
  }
  const store = user[MEMORY_KEY] && typeof user[MEMORY_KEY] === 'object' ? user[MEMORY_KEY] : {};
  store[String(companionId)] = facts;
  user[MEMORY_KEY] = store;
  return facts;
};

const getAttachedMemoryFacts = (user, companionId) => {
  const store = user?.[MEMORY_KEY];
  const facts = store && Array.isArray(store[String(companionId)]) ? store[String(companionId)] : [];
  return facts.filter(Boolean);
};

/** Prompt layer: what the companion remembers about the user. */
const buildLongTermMemoryContext = (user, companionId, companionName = '') => {
  const facts = getAttachedMemoryFacts(user, companionId);
  if (!facts.length) {
    return '';
  }
  return `Long-term memory — things ${companionName || 'you'} already know about the user from earlier conversations:\n${facts
    .map(fact => `- ${fact}`)
    .join('\n')}\nBring these up naturally when relevant (ask how something went, remember preferences). Never list them, never say "according to my memory", and never contradict them.`;
};

const normalizeFact = text =>
  String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);

const requestFactUpdate = async ({ existingFacts, history, companionName, maxFacts }) => {
  const apiKey = getEnv('DEEPSEEK_API_KEY');
  if (!apiKey) {
    return null;
  }
  const transcript = history
    .slice(-16)
    .map(item => `${item.role === 'ai' ? companionName || 'AI' : 'User'}: ${String(item.text || '').replace(/\s+/g, ' ').trim()}`)
    .join('\n');
  const prompt = `You maintain a companion's long-term memory about the USER (not about the companion).

Existing memory (may be empty):
${existingFacts.length ? existingFacts.map(f => `- ${f}`).join('\n') : '(none)'}

Recent conversation:
${transcript}

Return the UPDATED memory as JSON: {"facts": ["...", "..."]}
Rules:
- Only durable, useful facts about the user: name/nickname, age, job/school, location, family, pets, hobbies, likes/dislikes, goals, upcoming events (with rough date), important feelings or experiences, how they like to be treated.
- Merge duplicates, update facts that changed, drop trivia and small talk.
- Each fact one short sentence in English, third person ("User has a dog named Mochi.").
- At most ${maxFacts} facts, most important first.
- If nothing worth remembering, return the existing memory unchanged.`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EXTRACT_TIMEOUT_MS);
  try {
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
      body: JSON.stringify({
        model: resolveExtractModel(),
        stream: false,
        temperature: 0.1,
        max_tokens: 900,
        thinking: { type: 'disabled' },
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'You output only valid JSON.' },
          { role: 'user', content: prompt },
        ],
      }),
    });
    if (!response.ok) {
      return null;
    }
    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content || '';
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed?.facts)) {
      return null;
    }
    return parsed.facts.map(normalizeFact).filter(Boolean).slice(0, maxFacts);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
};

/**
 * Call after each user turn (fire-and-forget). Every few user messages the recent
 * conversation is distilled into the companion's long-term memory, capped by plan.
 */
const recordTurnForMemory = async ({ user, companionId, companionName, history }) => {
  const tier = resolveMemoryTier(user);
  if (!user?._id || !companionId || tier.longTermFacts <= 0) {
    return;
  }
  const key = `${user._id}:${companionId}`;
  const doc = await CompanionMemory.findOneAndUpdate(
    { userId: user._id, companionId: String(companionId) },
    { $inc: { userMessagesSinceExtract: 1 } },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  ).lean();
  if (!doc || doc.userMessagesSinceExtract < FACT_EXTRACT_EVERY_USER_MESSAGES || inFlight.has(key)) {
    return;
  }
  inFlight.add(key);
  try {
    const existingFacts = (doc.facts || []).map(item => item.text);
    const nextFacts = await requestFactUpdate({
      existingFacts,
      history: Array.isArray(history) ? history : [],
      companionName,
      maxFacts: tier.longTermFacts,
    });
    if (!nextFacts) {
      return;
    }
    const now = new Date();
    await CompanionMemory.updateOne(
      { _id: doc._id },
      {
        $set: {
          facts: nextFacts.map(text => ({ text, updatedAt: now })),
          userMessagesSinceExtract: 0,
        },
      },
    );
  } finally {
    inFlight.delete(key);
  }
};

/** Wipes memory when the user deletes a chat. */
const clearCompanionMemory = (userId, companionIds) =>
  CompanionMemory.deleteMany({ userId, companionId: { $in: companionIds.map(String) } }).catch(() => {});

module.exports = {
  attachCompanionMemory,
  buildLongTermMemoryContext,
  recordTurnForMemory,
  clearCompanionMemory,
};
