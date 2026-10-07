const { User } = require('../models/User');
const { verifyAccessToken, readBearerToken } = require('../security/accessTokens');
const { isObjectId } = require('../security/validators');

/** Basic hardening headers (what helmet would set for a JSON API). */
const securityHeaders = (_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
};

const TECHNICAL_MESSAGE =
  /((Type|Reference|Syntax|Range)Error|Error:|Exception|undefined|is not a function|Cannot read|Unexpected token|ECONN|ETIMEDOUT|ENOTFOUND|socket hang up|Mongo|E11000|Cast to|ObjectId|validation failed|at \S+ \(|\.js:\d+|stack|request failed with status)/i;

/**
 * Last line of defence for error text: 5xx answers always get a generic message, and any
 * message that looks like an internal error (exception names, DB errors, stack frames)
 * is replaced, so users never see technical details.
 */
const sanitizeErrorResponses = (_req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = body => {
    if (res.statusCode >= 400 && body && typeof body === 'object' && !Array.isArray(body)) {
      const message = typeof body.message === 'string' ? body.message : '';
      if (res.statusCode >= 500 || (message && TECHNICAL_MESSAGE.test(message))) {
        const safe = { ...body, message: 'Terjadi kesalahan. Coba lagi sebentar lagi.' };
        delete safe.stack;
        delete safe.error;
        return originalJson(safe);
      }
    }
    return originalJson(body);
  };
  next();
};

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/** True when an object contains Mongo operators ($...) or prototype-pollution keys. */
const hasDangerousKeys = (value, depth = 0) => {
  if (depth > 30) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.some(item => hasDangerousKeys(item, depth + 1));
  }
  if (value && typeof value === 'object') {
    return Object.keys(value).some(
      key =>
        key.startsWith('$') ||
        key.includes('\u0000') ||
        FORBIDDEN_KEYS.has(key) ||
        hasDangerousKeys(value[key], depth + 1),
    );
  }
  return false;
};

/** Rejects NoSQL-injection payloads like {"email": {"$ne": null}}. */
const rejectInjection = (req, res, next) => {
  if (hasDangerousKeys(req.body) || hasDangerousKeys(req.query) || hasDangerousKeys(req.params)) {
    return res.status(400).json({ message: 'Permintaan tidak valid.', code: 'INVALID_INPUT' });
  }
  return next();
};

/**
 * Small in-memory fixed-window rate limiter (per process).
 * keyFn picks what to count by (IP, IP + email, user id...).
 */
const rateLimit = ({ windowMs, max, keyFn = req => req.ip, name = 'default', message }) => {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) {
      if (entry.resetAt <= now) {
        hits.delete(key);
      }
    }
  }, Math.min(windowMs, 60000)).unref();

  return (req, res, next) => {
    const key = `${name}:${keyFn(req) || req.ip}`;
    const now = Date.now();
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;
    const remaining = Math.max(0, max - entry.count);
    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(remaining));
    if (entry.count > max) {
      const retryAfterSeconds = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfterSeconds));
      return res.status(429).json({
        message: message || 'Terlalu banyak percobaan. Coba lagi nanti.',
        code: 'RATE_LIMITED',
        retryAfterSeconds,
      });
    }
    return next();
  };
};

const emailKey = req => `${req.ip}|${String(req.body?.email || '').trim().toLowerCase().slice(0, 254)}`;

/**
 * Every /api/users/:userId/* request must carry a valid token for that same user.
 * Tokens are revoked by bumping user.authVersion (e.g. after a password reset).
 */
const requireUserAuth = async (req, res, next) => {
  const { userId } = req.params;
  if (!isObjectId(userId)) {
    return res.status(400).json({ message: 'User tidak valid.', code: 'INVALID_USER_ID' });
  }
  const claims = verifyAccessToken(readBearerToken(req));
  if (!claims) {
    return res.status(401).json({ message: 'Sesi berakhir. Silakan masuk lagi.', code: 'AUTH_REQUIRED' });
  }
  if (claims.userId !== userId) {
    return res.status(403).json({ message: 'Akses ditolak.', code: 'AUTH_FORBIDDEN' });
  }
  const owner = await User.findById(userId).select('authVersion').lean();
  if (!owner || (Number(owner.authVersion) || 0) !== claims.version) {
    return res.status(401).json({ message: 'Sesi berakhir. Silakan masuk lagi.', code: 'AUTH_REQUIRED' });
  }
  req.authUserId = userId;
  return next();
};

module.exports = {
  sanitizeErrorResponses,
  securityHeaders,
  rejectInjection,
  rateLimit,
  emailKey,
  requireUserAuth,
  hasDangerousKeys,
};
