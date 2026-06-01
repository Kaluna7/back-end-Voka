const { User, sanitizeUser, sanitizeDashboard } = require('../models/User');
const { InvitationRedeemEvent } = require('../models/InvitationRedeemEvent');
const { normalizeInvitationCode } = require('../utils/invitationCode');
const { getDeviceContext } = require('../services/deviceService');
const { evaluateInvitationRisk } = require('../services/invitationRiskEngine');
const { grantInvitationRewards, rewardPayload } = require('../services/invitationRewardService');

const INVITE_REWARD_HOLD_MS = Number(process.env.INVITE_REWARD_HOLD_MS || 0);

const redeemInvitationCode = async (req, res) => {
  const { userId } = req.params;
  const code = normalizeInvitationCode(req.body?.code);

  if (!code || code.length < 4) {
    return res.status(400).json({ message: 'Kode undangan tidak valid.' });
  }

  const user = await User.findById(userId);
  if (!user) {
    return res.status(404).json({ message: 'User tidak ditemukan.' });
  }

  if (user.invitationRedeemedAt || user.referredByUserId) {
    return res.status(409).json({ message: 'Anda sudah pernah menggunakan kode undangan.' });
  }

  const referrer = await User.findOne({ invitationCode: code });
  if (!referrer) {
    return res.status(404).json({ message: 'Kode undangan tidak ditemukan.' });
  }

  if (String(referrer._id) === String(user._id)) {
    return res.status(400).json({ message: 'Tidak bisa menggunakan kode undangan sendiri.' });
  }

  const deviceContext = getDeviceContext(req);
  const risk = await evaluateInvitationRisk({ user, referrer, deviceContext });
  if (risk.blocked) {
    await InvitationRedeemEvent.create({
      redeemerUserId: user._id,
      referrerUserId: referrer._id,
      invitationCode: code,
      ipHash: deviceContext.ipHash,
      deviceHash: deviceContext.deviceHash,
      userAgentHash: deviceContext.userAgentHash,
      riskScore: risk.score,
      riskFlags: risk.flags,
      status: 'blocked',
      reason: risk.reason,
    });
    return res.status(403).json({ message: risk.reason });
  }

  const holdMs = risk.holdForReview ? Math.max(10 * 60 * 1000, INVITE_REWARD_HOLD_MS) : INVITE_REWARD_HOLD_MS;
  const unlockAt = holdMs > 0 ? new Date(Date.now() + holdMs) : null;

  user.referredByUserId = referrer._id;
  user.invitationRedeemedAt = new Date();
  user.invitationRewardStatus = unlockAt ? 'pending' : 'granted';
  user.invitationRewardUnlockAt = unlockAt;
  user.invitationRewardGrantedAt = unlockAt ? null : new Date();

  const rewards = unlockAt ? rewardPayload() : grantInvitationRewards(user);

  await user.save();
  await InvitationRedeemEvent.create({
    redeemerUserId: user._id,
    referrerUserId: referrer._id,
    invitationCode: code,
    ipHash: deviceContext.ipHash,
    deviceHash: deviceContext.deviceHash,
    userAgentHash: deviceContext.userAgentHash,
    riskScore: risk.score,
    riskFlags: risk.flags,
    status: unlockAt ? 'pending' : 'granted',
    rewardUnlockAt: unlockAt,
    rewardGrantedAt: unlockAt ? null : new Date(),
  });

  return res.status(200).json({
    message: unlockAt
      ? 'Kode undangan diterima. Hadiah sedang divalidasi.'
      : 'Kode undangan berhasil digunakan.',
    user: sanitizeUser(user),
    dashboard: sanitizeDashboard(user),
    rewards,
    rewardStatus: user.invitationRewardStatus,
    rewardUnlockAt: user.invitationRewardUnlockAt,
  });
};

const claimInvitationReward = async (req, res) => {
  const { userId } = req.params;
  const user = await User.findById(userId);
  if (!user) {
    return res.status(404).json({ message: 'User tidak ditemukan.' });
  }
  if (user.invitationRewardStatus === 'granted') {
    return res.status(200).json({
      message: 'Hadiah sudah diberikan.',
      user: sanitizeUser(user),
      dashboard: sanitizeDashboard(user),
      rewards: rewardPayload(),
      rewardStatus: user.invitationRewardStatus,
      rewardUnlockAt: user.invitationRewardUnlockAt,
    });
  }
  if (user.invitationRewardStatus !== 'pending') {
    return res.status(409).json({ message: 'Tidak ada hadiah invitation yang menunggu.' });
  }
  if (user.invitationRewardUnlockAt && user.invitationRewardUnlockAt.getTime() > Date.now()) {
    return res.status(409).json({
      message: 'Hadiah belum bisa diklaim.',
      rewardStatus: user.invitationRewardStatus,
      rewardUnlockAt: user.invitationRewardUnlockAt,
    });
  }

  const rewards = grantInvitationRewards(user);
  user.invitationRewardUnlockAt = null;
  await user.save();
  await InvitationRedeemEvent.findOneAndUpdate(
    { redeemerUserId: user._id, status: 'pending' },
    { status: 'granted', rewardGrantedAt: new Date() },
    { sort: { createdAt: -1 } },
  );

  return res.status(200).json({
    message: 'Hadiah invitation berhasil diklaim.',
    user: sanitizeUser(user),
    dashboard: sanitizeDashboard(user),
    rewards,
    rewardStatus: user.invitationRewardStatus,
    rewardUnlockAt: user.invitationRewardUnlockAt,
  });
};

module.exports = {
  redeemInvitationCode,
  claimInvitationReward,
};
