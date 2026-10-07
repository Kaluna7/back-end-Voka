const mongoose = require('mongoose');

/** One active code per (email, purpose). Mongo's TTL index removes it once expired. */
const emailVerificationCodeSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    purpose: { type: String, enum: ['signup', 'reset_password'], required: true },
    codeHash: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    sentAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

emailVerificationCodeSchema.index({ email: 1, purpose: 1 }, { unique: true });
emailVerificationCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const EmailVerificationCode = mongoose.model('EmailVerificationCode', emailVerificationCodeSchema);

module.exports = { EmailVerificationCode };
