const mongoose = require('mongoose');

const invitationRedeemEventSchema = new mongoose.Schema(
  {
    redeemerUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    referrerUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    invitationCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    ipHash: { type: String, default: '' },
    deviceHash: { type: String, default: '' },
    userAgentHash: { type: String, default: '' },
    riskScore: { type: Number, default: 0 },
    riskFlags: { type: [String], default: [] },
    status: {
      type: String,
      enum: ['blocked', 'pending', 'granted'],
      required: true,
    },
    reason: { type: String, default: '' },
    rewardUnlockAt: { type: Date, default: null },
    rewardGrantedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

invitationRedeemEventSchema.index({ deviceHash: 1, createdAt: -1 });
invitationRedeemEventSchema.index({ ipHash: 1, createdAt: -1 });

const InvitationRedeemEvent = mongoose.model('InvitationRedeemEvent', invitationRedeemEventSchema);

module.exports = { InvitationRedeemEvent };
