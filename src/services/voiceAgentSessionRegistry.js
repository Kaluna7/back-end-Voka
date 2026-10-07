/**
 * In-memory registry so Deepgram Voice Agent can call our OpenAI-compatible
 * LLM gateway and we can rebuild prompts with companion/memory context.
 */
const sessions = new Map();

const registerVoiceAgentSession = (sessionId, context) => {
  if (!sessionId) {
    return;
  }
  sessions.set(String(sessionId), {
    ...context,
    sessionId: String(sessionId),
    updatedAt: Date.now(),
  });
};

const getVoiceAgentSession = sessionId => {
  if (!sessionId) {
    return null;
  }
  return sessions.get(String(sessionId)) || null;
};

const updateVoiceAgentSession = (sessionId, patch) => {
  const current = getVoiceAgentSession(sessionId);
  if (!current) {
    return null;
  }
  const next = {
    ...current,
    ...patch,
    sessionId: String(sessionId),
    updatedAt: Date.now(),
  };
  sessions.set(String(sessionId), next);
  return next;
};

const appendVoiceAgentHistory = (sessionId, userText, assistantText) => {
  const current = getVoiceAgentSession(sessionId);
  if (!current) {
    return null;
  }
  const history = Array.isArray(current.history) ? [...current.history] : [];
  if (userText) {
    history.push({ role: 'user', content: String(userText) });
  }
  if (assistantText) {
    history.push({ role: 'assistant', content: String(assistantText) });
  }
  const limit = Math.max(8, Number(current.historyLimit) || 8);
  while (history.length > limit * 2) {
    history.shift();
  }
  return updateVoiceAgentSession(sessionId, { history });
};

const unregisterVoiceAgentSession = sessionId => {
  if (!sessionId) {
    return;
  }
  sessions.delete(String(sessionId));
};

module.exports = {
  registerVoiceAgentSession,
  getVoiceAgentSession,
  updateVoiceAgentSession,
  appendVoiceAgentHistory,
  unregisterVoiceAgentSession,
};
