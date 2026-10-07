const crypto = require('crypto');
const { EmailVerificationCode } = require('../models/EmailVerificationCode');
const { sendVerificationCodeEmail } = require('./emailService');

const CODE_TTL_MINUTES = 10;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

const hashCode = (email, purpose, code) =>
  crypto.createHash('sha256').update(`${email}:${purpose}:${code}`).digest('hex');

const generateCode = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');

const normalizeEmail = email => String(email || '').trim().toLowerCase();

/** Error with an HTTP status + stable code the app can map to a message. */
const codeError = (status, code, message, extra = {}) => {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  Object.assign(err, extra);
  return err;
};

/**
 * Creates (or replaces) the code for this email+purpose and emails it.
 * Enforces a resend cooldown so the endpoint can't be used to spam an inbox.
 */
const issueVerificationCode = async ({ email, purpose, displayName, language }) => {
  const normalized = normalizeEmail(email);
  const existing = await EmailVerificationCode.findOne({ email: normalized, purpose }).lean();
  if (existing && Date.now() - new Date(existing.sentAt).getTime() < RESEND_COOLDOWN_MS) {
    const retryAfterMs = RESEND_COOLDOWN_MS - (Date.now() - new Date(existing.sentAt).getTime());
    throw codeError(429, 'CODE_COOLDOWN', 'Tunggu sebentar sebelum meminta kode baru.', {
      retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
    });
  }

  const code = generateCode();
  const now = new Date();
  await EmailVerificationCode.findOneAndUpdate(
    { email: normalized, purpose },
    {
      $set: {
        codeHash: hashCode(normalized, purpose, code),
        attempts: 0,
        sentAt: now,
        expiresAt: new Date(now.getTime() + CODE_TTL_MINUTES * 60 * 1000),
      },
    },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  );

  try {
    await sendVerificationCodeEmail({
      toEmail: normalized,
      code,
      purpose,
      displayName,
      language,
      expiresInMinutes: CODE_TTL_MINUTES,
    });
  } catch (error) {
    // Let the user retry immediately if delivery failed.
    await EmailVerificationCode.deleteOne({ email: normalized, purpose });
    console.error('[email] Failed to send verification code:', error?.message || error);
    throw codeError(502, 'EMAIL_SEND_FAILED', 'Gagal mengirim email. Coba lagi sebentar lagi.');
  }

  return { expiresInSeconds: CODE_TTL_MINUTES * 60, resendAfterSeconds: RESEND_COOLDOWN_MS / 1000 };
};

/**
 * Checks a code. On success the code is consumed (single use).
 * Wrong codes count toward MAX_ATTEMPTS, after which the code is burned.
 */
const consumeVerificationCode = async ({ email, purpose, code }) => {
  const normalized = normalizeEmail(email);
  const cleanCode = String(code || '').replace(/\D/g, '');
  const record = await EmailVerificationCode.findOne({ email: normalized, purpose });

  if (!record || record.expiresAt.getTime() < Date.now()) {
    throw codeError(400, 'CODE_EXPIRED', 'Kode sudah kedaluwarsa. Minta kode baru.');
  }
  if (record.attempts >= MAX_ATTEMPTS) {
    await EmailVerificationCode.deleteOne({ _id: record._id });
    throw codeError(429, 'CODE_TOO_MANY_ATTEMPTS', 'Terlalu banyak percobaan. Minta kode baru.');
  }

  const expected = Buffer.from(record.codeHash, 'hex');
  const actual = Buffer.from(hashCode(normalized, purpose, cleanCode), 'hex');
  if (cleanCode.length !== 6 || !crypto.timingSafeEqual(expected, actual)) {
    await EmailVerificationCode.updateOne({ _id: record._id }, { $inc: { attempts: 1 } });
    const left = Math.max(0, MAX_ATTEMPTS - record.attempts - 1);
    throw codeError(400, 'CODE_INVALID', 'Kode salah.', { attemptsLeft: left });
  }

  await EmailVerificationCode.deleteOne({ _id: record._id });
};

module.exports = {
  issueVerificationCode,
  consumeVerificationCode,
  normalizeEmail,
};
