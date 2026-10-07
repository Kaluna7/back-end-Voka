const WINDOW_MS = Number(process.env.PROFILE_AVATAR_RATE_LIMIT_WINDOW_MS || 60 * 1000);
const MAX_REQUESTS = Number(process.env.PROFILE_AVATAR_RATE_LIMIT_MAX || 8);

const buckets = new Map();

const nowMs = () => Date.now();

const getKey = req => {
  const forwarded = req.headers['x-forwarded-for'];
  const ip =
    (typeof forwarded === 'string' && forwarded.split(',')[0].trim()) ||
    req.ip ||
    req.socket?.remoteAddress ||
    '';
  const userId = req.params?.userId || '';
  return `${ip}|${userId}`;
};

const cleanupExpired = () => {
  const threshold = nowMs() - WINDOW_MS;
  buckets.forEach((value, key) => {
    if (value.resetAt <= threshold) {
      buckets.delete(key);
    }
  });
};

setInterval(cleanupExpired, WINDOW_MS).unref();

const profileAvatarUploadRateLimit = (req, res, next) => {
  const avatarUrl = req.body?.avatarUrl;
  if (typeof avatarUrl !== 'string' || !avatarUrl.trim().startsWith('data:')) {
    return next();
  }

  const key = getKey(req);
  const now = nowMs();
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return next();
  }
  if (current.count >= MAX_REQUESTS) {
    return res.status(429).json({
      message: 'Terlalu banyak upload avatar. Coba lagi sebentar.',
    });
  }
  current.count += 1;
  buckets.set(key, current);
  return next();
};

module.exports = {
  profileAvatarUploadRateLimit,
};
