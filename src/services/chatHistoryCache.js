const { getRedisClient } = require('../config/redis');
const { getEnv } = require('../config/env');

/** Hot window for DeepSeek context + prompt-cache stability. */
const CHAT_HISTORY_CACHE_LIMIT = Number(getEnv('CHAT_HISTORY_CACHE_LIMIT', '20')) || 20;
const CHAT_HISTORY_TTL_SECONDS = Number(getEnv('CHAT_HISTORY_TTL_SECONDS', '604800')) || 604800;

const historyKey = (userId, companionId) =>
  `chat:hist:${String(userId || '').trim()}:${String(companionId || '').trim()}`;

const normalizeHistoryItem = item => {
  if (!item || typeof item !== 'object') {
    return null;
  }
  const role = item.role === 'ai' || item.role === 'assistant' ? 'ai' : item.role === 'user' ? 'user' : null;
  const text = typeof item.text === 'string' ? item.text.trim() : typeof item.content === 'string' ? item.content.trim() : '';
  if (!role || !text) {
    return null;
  }
  return { role, text };
};

const normalizeHistoryList = (history, limit = CHAT_HISTORY_CACHE_LIMIT) => {
  if (!Array.isArray(history)) {
    return [];
  }
  return history
    .map(normalizeHistoryItem)
    .filter(Boolean)
    .slice(-Math.max(1, limit));
};

const messagesToHistory = (messages, limit = CHAT_HISTORY_CACHE_LIMIT) =>
  normalizeHistoryList(
    (Array.isArray(messages) ? messages : []).map(item => ({
      role: item?.role,
      text: item?.text,
    })),
    limit,
  );

/**
 * Prefer Redis hot window (stable, server-owned) for DeepSeek context.
 * Fallback chain: Redis → client body history → Mongo session messages.
 * On fallback, warm Redis so the next turn gets a cache hit.
 */
const resolveChatHistoryForAi = async ({
  userId,
  companionId,
  clientHistory = [],
  mongoMessages = [],
  limit = CHAT_HISTORY_CACHE_LIMIT,
}) => {
  const redisHistory = await getCachedChatHistory(userId, companionId, limit);
  if (redisHistory.length) {
    return { history: redisHistory, source: 'redis' };
  }

  const fromClient = normalizeHistoryList(clientHistory, limit);
  if (fromClient.length) {
    void setCachedChatHistory(userId, companionId, fromClient);
    return { history: fromClient, source: 'client' };
  }

  const fromMongo = messagesToHistory(mongoMessages, limit);
  if (fromMongo.length) {
    void setCachedChatHistory(userId, companionId, fromMongo);
    return { history: fromMongo, source: 'mongo' };
  }

  return { history: [], source: 'empty' };
};

const getCachedChatHistory = async (userId, companionId, limit = CHAT_HISTORY_CACHE_LIMIT) => {
  try {
    const redis = await getRedisClient();
    if (!redis) {
      return [];
    }
    const raw = await redis.get(historyKey(userId, companionId));
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return normalizeHistoryList(parsed, limit);
  } catch (error) {
    console.warn('[redis] get chat history failed:', error?.message || error);
    return [];
  }
};

const setCachedChatHistory = async (userId, companionId, history) => {
  try {
    const redis = await getRedisClient();
    if (!redis) {
      return false;
    }
    const normalized = normalizeHistoryList(history, CHAT_HISTORY_CACHE_LIMIT);
    const key = historyKey(userId, companionId);
    if (!normalized.length) {
      await redis.del(key);
      return true;
    }
    await redis.set(key, JSON.stringify(normalized), { EX: CHAT_HISTORY_TTL_SECONDS });
    return true;
  } catch (error) {
    console.warn('[redis] set chat history failed:', error?.message || error);
    return false;
  }
};

/** After a successful turn, keep Redis aligned with the last N messages. */
const syncChatHistoryCache = async ({ userId, companionId, messages }) => {
  const history = messagesToHistory(messages, CHAT_HISTORY_CACHE_LIMIT);
  return setCachedChatHistory(userId, companionId, history);
};

const deleteCachedChatHistory = async (userId, companionId) => {
  try {
    const redis = await getRedisClient();
    if (!redis) {
      return false;
    }
    await redis.del(historyKey(userId, companionId));
    return true;
  } catch (error) {
    console.warn('[redis] delete chat history failed:', error?.message || error);
    return false;
  }
};

const deleteCachedChatHistories = async (userId, companionIds = []) => {
  const ids = [...new Set((Array.isArray(companionIds) ? companionIds : []).map(id => String(id || '').trim()).filter(Boolean))];
  if (!ids.length) {
    return;
  }
  await Promise.all(ids.map(companionId => deleteCachedChatHistory(userId, companionId)));
};

module.exports = {
  CHAT_HISTORY_CACHE_LIMIT,
  resolveChatHistoryForAi,
  getCachedChatHistory,
  setCachedChatHistory,
  syncChatHistoryCache,
  deleteCachedChatHistory,
  deleteCachedChatHistories,
  messagesToHistory,
  normalizeHistoryList,
};
