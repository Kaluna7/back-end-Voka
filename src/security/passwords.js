const crypto = require('crypto');
const { promisify } = require('util');

const scrypt = promisify(crypto.scrypt);

/**
 * Password hashing with scrypt (built into Node, memory-hard).
 * Stored format: scrypt$<N>$<r>$<p>$<saltB64>$<hashB64>
 */
const PARAMS = { N: 16384, r: 8, p: 1 };
const KEY_LENGTH = 64;
const PREFIX = 'scrypt$';

const isPasswordHash = value => typeof value === 'string' && value.startsWith(PREFIX);

const hashPassword = async plain => {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(String(plain), salt, KEY_LENGTH, { ...PARAMS, maxmem: 64 * 1024 * 1024 });
  return [
    'scrypt',
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString('base64'),
    Buffer.from(key).toString('base64'),
  ].join('$');
};

const safeEqual = (a, b) => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  // Compare equal-length buffers so timing never reveals the length either.
  if (left.length !== right.length) {
    crypto.timingSafeEqual(left, left);
    return false;
  }
  return crypto.timingSafeEqual(left, right);
};

/**
 * Checks a password against what is stored.
 * Returns { ok, needsRehash } — needsRehash is true for legacy plain-text passwords,
 * so the caller can upgrade them to a hash right after a successful login.
 */
const verifyPassword = async (plain, stored) => {
  if (typeof stored !== 'string' || !stored || typeof plain !== 'string') {
    return { ok: false, needsRehash: false };
  }
  if (!isPasswordHash(stored)) {
    return { ok: safeEqual(plain, stored), needsRehash: true };
  }
  const [, n, r, p, saltB64, hashB64] = stored.split('$');
  const expected = Buffer.from(hashB64 || '', 'base64');
  if (!expected.length) {
    return { ok: false, needsRehash: false };
  }
  const key = await scrypt(plain, Buffer.from(saltB64 || '', 'base64'), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: 64 * 1024 * 1024,
  });
  const ok = crypto.timingSafeEqual(Buffer.from(key), expected);
  return { ok, needsRehash: ok && Number(n) < PARAMS.N };
};

module.exports = { hashPassword, verifyPassword, isPasswordHash };
