const WINDOW_MS = Number(process.env.INVITE_RATE_LIMIT_WINDOW_MS || 60 * 1000);
const MAX_REQUESTS = Number(process.env.INVITE_RATE_LIMIT_MAX || 10);

const buckets = new Map();

const nowMs = () => Date.now();

const getKey = req => {
  const forwarded = req.headers['x-forwarded-for'];
  const ip =
    (typeof forwarded === 'string' && forwarded.split(',')[0].trim()) ||
    req.ip ||
    req.socket?.remoteAddress ||
    '';
  const deviceId =
    (typeof req.headers['x-device-id'] === 'string' && req.headers['x-device-id']) ||
    (typeof req.headers['x-installation-id'] === 'string' && req.headers['x-installation-id']) ||
    '';
  const userId = req.params?.userId || '';
  return `${ip}|${deviceId}|${userId}`;
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

const invitationRedeemRateLimit = (req, res, next) => {
  const key = getKey(req);
  const now = nowMs();
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return next();
  }
  if (current.count >= MAX_REQUESTS) {
    return res.status(429).json({
      message: 'Terlalu banyak percobaan redeem. Coba lagi sebentar.',
    });
  }
  current.count += 1;
  buckets.set(key, current);
  return next();
};

const invitationBasicWaf = (req, res, next) => {
  const code = typeof req.body?.code === 'string' ? req.body.code : '';
  if (code.length > 24) {
    return res.status(400).json({ message: 'Kode undangan tidak valid.' });
  }
  return next();
};

module.exports = {
  invitationRedeemRateLimit,
  invitationBasicWaf,
};
