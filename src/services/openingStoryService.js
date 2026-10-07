const { getEnv } = require('../config/env');
const { resolveDeepseekModel, applyDeepseekThinking } = require('./deepseekService');
const { resolveCompanionPrompt } = require('../constants/resolveCompanionPrompt');
const { buildBondEmotionContext } = require('../utils/bondPromptContext');
const { clampBondLevel } = require('../utils/companionBondState');
const { pickCompanionLocaleFields } = require('../utils/companionLocaleUtils');

const OPENING_STORY_TIMEOUT_MS = Number(getEnv('OPENING_STORY_TIMEOUT_MS', '50000')) || 50000;
const OPENING_STORY_MAX_TOKENS = Number(getEnv('OPENING_STORY_MAX_TOKENS', '3200')) || 3200;
/** Chat messages are clamped to 8000 chars when persisted — stay safely below. */
const OPENING_STORY_MAX_CHARS = 7500;
/** CJK scripts pack more meaning per character, so length is counted differently. */
const CJK_LANGUAGES = new Set(['Japanese', 'Chinese', 'Korean']);

const timeOfDayLabel = hour => {
  const h = Number(hour);
  if (!Number.isFinite(h) || h < 0 || h > 23) {
    return '';
  }
  if (h < 5) {
    return 'late night';
  }
  if (h < 11) {
    return 'morning';
  }
  if (h < 16) {
    return 'afternoon';
  }
  if (h < 19) {
    return 'early evening';
  }
  return 'night';
};

/** How the first meeting should feel at each closeness level. */
const openingMoodForBond = bond => {
  if (bond <= 0) {
    return 'This first meeting feels cool and distant: the character keeps walls up, speaks sparingly, and only hints at curiosity.';
  }
  if (bond === 1) {
    return 'This first meeting feels guarded: the character is cautious and testing the user, but a small crack of interest shows.';
  }
  if (bond === 2) {
    return 'This first meeting feels like polite, curious warmth: open but measured, glad the user came.';
  }
  if (bond === 3) {
    return 'This first meeting feels unexpectedly easy, as if the character already senses they will get along — relaxed, warm, a little playful.';
  }
  if (bond === 4) {
    return 'The character already feels fond of the user — affectionate, attentive, and openly happy they are here.';
  }
  return 'The character feels a deep, tender connection to the user — emotionally open, gentle, and visibly moved that they came.';
};

/** Concrete vocabulary/grammar budget per learner level so the story is readable practice. */
const levelRule = (rawLevel, isCjk) => {
  const level = String(rawLevel || '').toLowerCase();
  const beginner = /begin|a1|a2|basic|newbie|pemula|elementary|starter/.test(level);
  const advanced = /advanc|c1|c2|fluent|native|mahir|expert|proficient/.test(level);
  if (beginner) {
    return isCjk
      ? 'The user is a BEGINNER: use only very common everyday words and simple grammar, keep each sentence under ~20 characters, and prefer kana/simple characters over rare kanji/hanzi.'
      : 'The user is a BEGINNER (A1–A2): use only very common everyday words, present tense where possible, and keep each sentence under ~12 words.';
  }
  if (advanced) {
    return 'The user is ADVANCED: use rich, idiomatic, natural phrasing exactly as a native writer would.';
  }
  return 'The user is INTERMEDIATE: natural everyday language with some variety, avoiding rare or literary vocabulary.';
};

const buildLearnerLines = (user, localHour) => {
  const onboarding = user?.onboarding && typeof user.onboarding === 'object' ? user.onboarding : {};
  const lines = [];
  const name = typeof user?.name === 'string' ? user.name.trim() : '';
  if (name) {
    lines.push(`- Name: ${name} (use it naturally once or twice — never in every line).`);
  }
  const level = typeof onboarding.level === 'string' ? onboarding.level.trim() : '';
  if (level) {
    lines.push(`- Language level: ${level}.`);
  }
  if (onboarding.gender === 'male') {
    lines.push('- Gender: male — address him with masculine pronouns, honorifics and grammatical forms.');
  } else if (onboarding.gender === 'female') {
    lines.push('- Gender: female — address her with feminine pronouns, honorifics and grammatical forms.');
  } else if (onboarding.gender === 'other') {
    lines.push('- Gender: prefers not to say — use gender-neutral address and never guess.');
  }
  if (Array.isArray(onboarding.interests) && onboarding.interests.length) {
    lines.push(`- Interests: ${onboarding.interests.filter(Boolean).slice(0, 6).join(', ')}.`);
  }
  const goal = typeof onboarding.goal === 'string' ? onboarding.goal.trim() : '';
  if (goal) {
    lines.push(`- Learning goal: ${goal}.`);
  }
  const daypart = timeOfDayLabel(localHour);
  if (daypart) {
    lines.push(`- It is currently ${daypart} for the user.`);
  }
  return lines;
};

const buildOpeningStoryMessages = ({
  doc,
  targetLanguage,
  user,
  bond,
  bondIncreaseLevel,
  bondDecreaseLevel,
  localHour,
}) => {
  const name = doc.name;
  const nativeName = typeof doc.nativeName === 'string' ? doc.nativeName.trim() : '';
  const learnerLevel =
    typeof user?.onboarding?.level === 'string' ? user.onboarding.level.trim() : '';
  const level = clampBondLevel(bond);
  const canonStory = pickCompanionLocaleFields(doc, 'English').introMessage || doc.introMessage || '';
  const persona = resolveCompanionPrompt(doc.slug, '', targetLanguage);
  const isCjk = CJK_LANGUAGES.has(targetLanguage);
  const lengthRule = isCjk
    ? 'Length: 30–40 sentences in total (about 1000–1500 characters; never stop before 1000) — a full, unhurried scene. Narration paragraphs carry 2–4 sentences each.'
    : 'Length: roughly 400–600 words in total — a full, unhurried scene.';
  const learnerLines = buildLearnerLines(user, localHour);

  const system = [
    persona,
    buildBondEmotionContext({
      bond: level,
      bondIncreaseLevel,
      bondDecreaseLevel,
      companionName: name,
    }),
  ]
    .filter(Boolean)
    .join('\n\n');

  const nameRule = nativeName
    ? `Refer to the character as "${name}" (native spelling: ${nativeName}) — never invent another spelling.`
    : `Refer to the character exactly as "${name}" — never invent kanji/hanzi/hangul or another spelling for the name.`;

  const task = `Write ${name}'s OPENING SCENE — the very first message the user sees when they start chatting with ${name} for the first time.

CANON REFERENCE (English — use ONLY for setting, atmosphere, personality and a few key details):
"""
${canonStory || `${name} meets the user for the first time.`}
"""
This is a NEW scene, not a translation: change the wording, the small details, the order of beats and the pacing. At most a few short phrases may echo the reference.

EMOTIONAL DIRECTION (this must clearly shape the greeting, body language and dialogue):
- ${openingMoodForBond(level)}
- Let feelings show through small physical cues (a pause, a glance away, a soft laugh, fidgeting hands, a held breath) — never by naming the feeling flatly.
- Make it vivid and cinematic but intimate: sounds, light, scent, texture, small concrete details.

STORY ARC (let each beat breathe — this is a short story, not a greeting):
1. Hook: open on an atmospheric moment already in motion, before ${name} notices the user.
2. Noticing: ${name} sees the user — a revealing first reaction in body language, then the first words.
3. Glimpse inside: ${name} shares something personal and specific (a habit, a worry, a small memory, why they are here tonight) that fits their persona.
4. Emotional turn: a moment of vulnerability, tension, humor or tenderness that matches the closeness level above.
5. Invitation: ${name} draws the user in with a warm, specific question or offer that is easy and inviting to answer.
${learnerLines.length ? `\nABOUT THE USER (personalize subtly; you may adjust time-of-day details to match as long as the canon setting still makes sense):\n${learnerLines.join('\n')}\n` : ''}
LANGUAGE (highest priority):
- Write EVERYTHING in ${targetLanguage} — narration AND dialogue. No other language, no translations, no romanization, no notes.
- ${nameRule}
- ${levelRule(learnerLevel, isCjk)}

FORMAT (strict):
- Wrap every narration/action paragraph in [exp]...[/exp].
- Write ${name}'s spoken lines as plain paragraphs (no quotation marks, no speaker labels).
- Alternate narration and dialogue in 10–16 short paragraphs separated by blank lines; keep each paragraph 1–3 sentences so it stays easy to read.
- Start with an [exp] scene paragraph. End with ${name} saying something that invites the user to reply (usually a question).
- ${lengthRule}
- No markdown, headings, emojis, lists, or meta commentary. Output only the scene.`;

  return [
    { role: 'system', content: system },
    { role: 'user', content: task },
  ];
};

/** Repair common format slips so the client's [exp] renderer always gets balanced tags. */
const normalizeOpeningStory = raw => {
  let text = String(raw || '')
    .replace(/^```[a-z]*\s*/i, '')
    .replace(/```\s*$/i, '')
    .replace(/\[\s*exp\s*\]/gi, '[exp]')
    .replace(/\[\s*\/\s*exp\s*\]/gi, '[/exp]')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!text) {
    return '';
  }

  // Repair each paragraph's tags: keep well-formed [exp]…[/exp] runs; otherwise strip
  // every tag (plus stray brackets the model leaves behind) and re-wrap narration once.
  const WELL_FORMED = /^(?:\[exp\][^[\]]+\[\/exp\]|[^[\]])+$/;
  text = text
    .split('\n\n')
    .map(paragraph => {
      const compact = paragraph.replace(/\[exp\]\s*\[\/exp\]/g, '').trim();
      if (!compact || WELL_FORMED.test(compact)) {
        return compact;
      }
      const isNarration = /^\s*\[exp\]/.test(compact);
      const bare = compact
        .replace(/\[\/?exp\]/g, '')
        .replace(/[[\]]/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
      if (!bare) {
        return '';
      }
      return isNarration ? `[exp]${bare}[/exp]` : bare;
    })
    .filter(Boolean)
    .join('\n\n');

  // The client treats [exp] as the marker of a real story bubble — guarantee one.
  if (!text.includes('[exp]')) {
    const [first, ...rest] = text.split('\n\n');
    text = [`[exp]${first}[/exp]`, ...rest].join('\n\n');
  }

  if (text.length > OPENING_STORY_MAX_CHARS) {
    const paragraphs = text.split('\n\n');
    let kept = '';
    for (const paragraph of paragraphs) {
      const next = kept ? `${kept}\n\n${paragraph}` : paragraph;
      if (next.length > OPENING_STORY_MAX_CHARS) {
        break;
      }
      kept = next;
    }
    text = kept || text.slice(0, OPENING_STORY_MAX_CHARS);
  }
  return text;
};

/**
 * Generate a companion's first-chat opening scene in the learner's target language,
 * shaped by the canon DB story, persona, bond closeness and the learner's profile.
 */
const generateOpeningStory = async ({
  doc,
  targetLanguage,
  user,
  bond,
  bondIncreaseLevel,
  bondDecreaseLevel,
  localHour,
}) => {
  const apiKey = getEnv('DEEPSEEK_API_KEY');
  if (!apiKey) {
    const error = new Error('DeepSeek is not configured.');
    error.code = 'DEEPSEEK_NOT_CONFIGURED';
    throw error;
  }

  const model = resolveDeepseekModel(false);
  const payload = {
    model,
    stream: false,
    temperature: 0.85,
    max_tokens: OPENING_STORY_MAX_TOKENS,
    messages: buildOpeningStoryMessages({
      doc,
      targetLanguage,
      user,
      bond,
      bondIncreaseLevel,
      bondDecreaseLevel,
      localHour,
    }),
  };
  // Force thinking off (the `true` flag): reasoning would eat the story's token budget.
  applyDeepseekThinking(payload, true);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENING_STORY_TIMEOUT_MS);
  let response;
  try {
    response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify(payload),
    });
  } catch {
    const error = new Error('DeepSeek opening story timed out or failed.');
    error.code = 'DEEPSEEK_NETWORK_FAILED';
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    let detail = '';
    try {
      detail = (await response.text()).slice(0, 300);
    } catch {}
    console.log('[opening-story] request failed', { model, status: response.status, detail });
    const error = new Error(`DeepSeek request failed with status ${response.status}`);
    error.code = 'DEEPSEEK_REQUEST_FAILED';
    throw error;
  }

  const data = await response.json();
  const story = normalizeOpeningStory(data?.choices?.[0]?.message?.content);
  // Anything this short is a refusal or a truncated reply, not a scene.
  if (story.length < 120) {
    const error = new Error('Opening story came back empty or too short.');
    error.code = 'DEEPSEEK_EMPTY_RESPONSE';
    throw error;
  }
  return story;
};

/** Canon DB story in the closest available language — used when generation fails. */
const resolveFallbackOpeningStory = (doc, targetLanguage) =>
  pickCompanionLocaleFields(doc, targetLanguage).introMessage || doc?.introMessage || '';

module.exports = {
  generateOpeningStory,
  resolveFallbackOpeningStory,
  normalizeOpeningStory,
};
