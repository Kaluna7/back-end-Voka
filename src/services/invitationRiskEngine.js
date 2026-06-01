const { InvitationRedeemEvent } = require('../models/InvitationRedeemEvent');

const REDEEM_MIN_ACCOUNT_AGE_MS = Number(process.env.INVITE_MIN_ACCOUNT_AGE_MS || 10 * 60 * 1000);
const DEVICE_DAILY_LIMIT = Number(process.env.INVITE_DEVICE_DAILY_LIMIT || 1);
const IP_DAILY_LIMIT = Number(process.env.INVITE_IP_DAILY_LIMIT || 3);
const REFERRER_DAILY_LIMIT = Number(process.env.INVITE_REFERRER_DAILY_LIMIT || 20);

const evaluateInvitationRisk = async ({ user, referrer, deviceContext }) => {
  const now = Date.now();
  const lookback = new Date(now - 24 * 60 * 60 * 1000);
  const flags = [];
  let score = 0;

  const accountAgeMs = now - new Date(user.createdAt || now).getTime();
  if (accountAgeMs < REDEEM_MIN_ACCOUNT_AGE_MS) {
    flags.push('new_account');
    score += 45;
  }

  if (!deviceContext.deviceHash) {
    flags.push('missing_device_id');
    score += 20;
  }

  const [deviceRedeemCount, ipRedeemCount, referrerRedeemCount] = await Promise.all([
    deviceContext.deviceHash
      ? InvitationRedeemEvent.countDocuments({
          deviceHash: deviceContext.deviceHash,
          createdAt: { $gte: lookback },
          status: { $in: ['pending', 'granted'] },
        })
      : Promise.resolve(0),
    deviceContext.ipHash
      ? InvitationRedeemEvent.countDocuments({
          ipHash: deviceContext.ipHash,
          createdAt: { $gte: lookback },
          status: { $in: ['pending', 'granted'] },
        })
      : Promise.resolve(0),
    InvitationRedeemEvent.countDocuments({
      referrerUserId: referrer._id,
      createdAt: { $gte: lookback },
      status: { $in: ['pending', 'granted'] },
    }),
  ]);

  if (deviceRedeemCount >= DEVICE_DAILY_LIMIT) {
    flags.push('device_limit');
    score += 70;
  }
  if (ipRedeemCount >= IP_DAILY_LIMIT) {
    flags.push('ip_limit');
    score += 40;
  }
  if (referrerRedeemCount >= REFERRER_DAILY_LIMIT) {
    flags.push('referrer_spike');
    score += 30;
  }

  const blocked = score >= 70;
  const holdForReview = !blocked && score >= 35;

  return {
    blocked,
    holdForReview,
    score,
    flags,
    reason: blocked
      ? 'Aktivitas redeem terdeteksi tidak normal.'
      : holdForReview
        ? 'Redeem perlu validasi tambahan.'
        : '',
  };
};

module.exports = {
  evaluateInvitationRisk,
};
