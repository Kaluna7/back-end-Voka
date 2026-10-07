const crypto = require('crypto');
const { getEnv } = require('../config/env');

/**
 * Signed access tokens (HMAC-SHA256, JWT-like): base64url(header).base64url(payload).signature
 * Payload: { sub: userId, ver: user.authVersion, iat, exp, typ: 'access' }.
 * Bumping user.authVersion (password reset, "log out everywhere") revokes old tokens.
 */
const ACCESS_TOKEN_TTL_SECONDS = 60 * 24 * 60 * 60; // 60 days

let warnedAboutSecret = false;
const signingSecret = () => {
  const secret = String(getEnv('AUTH_SIGNING_SECRET', '') || '').trim();
  if (secret.length >= 32) {
    return secret;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('AUTH_SIGNING_SECRET must be set (at least 32 characters) in production.');
  }
  if (!warnedAboutSecret) {
    warnedAboutSecret = true;
    console.warn('[auth] AUTH_SIGNING_SECRET is missing or short. Using a derived dev secret.');
  }
  return crypto.createHash('sha256').update(`moocha-dev:${getEnv('MONGODB_URI', '')}`).digest('hex');
};

const b64url = input => Buffer.from(input).toString('base64url');

const sign = data => crypto.createHmac('sha256', signingSecret()).update(data).digest('base64url');

const HEADER = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));

const createAccessToken = (userId, authVersion = 0) => {
  const now = Math.floor(Date.now() / 1000);
  const payload = b64url(
    JSON.stringify({
      sub: String(userId),
      ver: Number(authVersion) || 0,
      iat: now,
      exp: now + ACCESS_TOKEN_TTL_SECONDS,
      typ: 'access',
    }),
  );
  return `${HEADER}.${payload}.${sign(`${HEADER}.${payload}`)}`;
};

const TOKEN_SHAPE = /^[A-Za-z0-9_-]{10,200}\.[A-Za-z0-9_-]{10,1000}\.[A-Za-z0-9_-]{20,100}$/;

/** Returns { userId, version } for a valid, unexpired token, otherwise null. */
const verifyAccessToken = token => {
  if (typeof token !== 'string' || !TOKEN_SHAPE.test(token)) {
    return null;
  }
  const [header, payload, signature] = token.split('.');
  const expected = Buffer.from(sign(`${header}.${payload}`));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    return null;
  }
  let data;
  try {
    data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (data?.typ !== 'access' || typeof data.sub !== 'string' || typeof data.exp !== 'number') {
    return null;
  }
  if (data.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }
  return { userId: data.sub, version: Number(data.ver) || 0 };
};

/** Reads "Authorization: Bearer <token>". */
const readBearerToken = req => {
  const header = String(req.headers?.authorization || '');
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  return match ? match[1] : '';
};

module.exports = { createAccessToken, verifyAccessToken, readBearerToken };
