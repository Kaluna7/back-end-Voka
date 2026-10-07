const crypto = require('crypto');
const { getEnv } = require('../config/env');

const signingSecret = () =>
  getEnv('AUTH_SIGNING_SECRET') || getEnv('MONGODB_URI', 'moocha-unsafe-dev-secret');

const signSetupToken = email => {
  const exp = Math.floor(Date.now() / 1000) + 30 * 60;
  const payload = JSON.stringify({ email: email.toLowerCase().trim(), exp, typ: 'google_setup' });
  const sig = crypto.createHmac('sha256', signingSecret()).update(payload).digest('hex');
  return Buffer.from(JSON.stringify({ p: payload, s: sig }), 'utf8').toString('base64url');
};

const verifySetupToken = token => {
  if (!token || typeof token !== 'string') {
    return null;
  }
  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!parsed?.p || !parsed?.s) {
    return null;
  }
  const expected = crypto.createHmac('sha256', signingSecret()).update(parsed.p).digest('hex');
  try {
    if (!crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(parsed.s, 'hex'))) {
      return null;
    }
  } catch {
    return null;
  }
  let data;
  try {
    data = JSON.parse(parsed.p);
  } catch {
    return null;
  }
  if (data.typ !== 'google_setup' || typeof data.email !== 'string' || typeof data.exp !== 'number') {
    return null;
  }
  if (data.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }
  return { email: data.email.toLowerCase().trim() };
};

module.exports = {
  signSetupToken,
  verifySetupToken,
};
