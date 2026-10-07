const { createClient } = require('redis');
const { getEnv } = require('./env');

let client = null;
let connectPromise = null;
let warnedUnavailable = false;

const resolveRedisUrl = () => getEnv('REDIS_URL', 'redis://127.0.0.1:6379');

const getRedisClient = async () => {
  if (client?.isOpen) {
    return client;
  }

  if (connectPromise) {
    return connectPromise;
  }

  const url = resolveRedisUrl();
  const next = createClient({
    url,
    socket: {
      connectTimeout: Number(getEnv('REDIS_CONNECT_TIMEOUT_MS', '2000')) || 2000,
      reconnectStrategy: retries => {
        if (retries >= 5) {
          return false;
        }
        return Math.min(retries * 200, 1000);
      },
    },
  });

  next.on('error', error => {
    if (!warnedUnavailable) {
      warnedUnavailable = true;
      console.warn('[redis] client error:', error?.message || error);
    }
  });

  connectPromise = next
    .connect()
    .then(() => {
      client = next;
      warnedUnavailable = false;
      console.log('[redis] connected');
      return client;
    })
    .catch(error => {
      client = null;
      if (!warnedUnavailable) {
        warnedUnavailable = true;
        console.warn('[redis] unavailable, chat cache disabled:', error?.message || error);
      }
      return null;
    })
    .finally(() => {
      connectPromise = null;
    });

  return connectPromise;
};

const isRedisReady = () => Boolean(client?.isOpen);

module.exports = {
  getRedisClient,
  isRedisReady,
  resolveRedisUrl,
};
