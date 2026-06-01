const mongoose = require('mongoose');

const googleSignupPendingSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    lookupToken: { type: String, required: true, index: true },
    googleSub: { type: String, required: true, trim: true },
    name: { type: String, default: '' },
    avatarUrl: { type: String, default: '' },
    codeHash: { type: String, required: true },
    codeSentAt: { type: Date, default: Date.now },
    emailVerifiedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

const GoogleSignupPending = mongoose.model('GoogleSignupPending', googleSignupPendingSchema);

module.exports = { GoogleSignupPending };
