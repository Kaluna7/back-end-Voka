const { User, buildOwnerId } = require('../models/User');
const { Character } = require('../models/Character');
const { CompanionMemory } = require('../models/CompanionMemory');
const { EmailVerificationCode } = require('../models/EmailVerificationCode');
const { GoogleSignupPending } = require('../models/GoogleSignupPending');
const { InvitationRedeemEvent } = require('../models/InvitationRedeemEvent');
const { getRedisClient } = require('../config/redis');
const { cancelUserGoogleSubscription } = require('./googlePlayBillingService');

/** Removes the user's cached chat histories (chat:hist:<userId>:<companionId>). */
const deleteCachedChats = async userId => {
  try {
    const redis = await getRedisClient();
    if (!redis) {
      return;
    }
    const keys = [];
    for await (const key of redis.scanIterator({ MATCH: `chat:hist:${userId}:*`, COUNT: 200 })) {
      keys.push(...(Array.isArray(key) ? key : [key]));
    }
    if (keys.length) {
      await redis.del(keys);
    }
  } catch (error) {
    console.warn('[account-delete] redis cleanup failed:', error?.message || error);
  }
};

/**
 * Permanently deletes an account and the data tied to it: profile (incl. photo), progress,
 * chats, AI memories, created characters, pending codes and invitation records.
 * A Google Play subscription is set to not renew first, so a deleted account is never charged
 * again (Google keeps the order history it needs for billing law).
 */
const deleteUserAccount = async userId => {
  const user = await User.findById(userId).select('email provider providerUid dashboard.billingProvider').lean();
  if (!user) {
    const err = new Error('Account not found.');
    err.status = 404;
    throw err;
  }

  if (user.dashboard?.billingProvider === 'google_play') {
    await cancelUserGoogleSubscription(userId).catch(error =>
      console.warn('[account-delete] could not stop Play renewal:', error?.message || error),
    );
  }

  const ownerId = buildOwnerId({ provider: user.provider, email: user.email, providerUid: user.providerUid });
  const email = String(user.email || '').toLowerCase();
  await Promise.all([
    ownerId ? Character.deleteMany({ ownerId }) : null,
    CompanionMemory.deleteMany({ userId: user._id }),
    email ? EmailVerificationCode.deleteMany({ email }) : null,
    email ? GoogleSignupPending.deleteMany({ email }) : null,
    InvitationRedeemEvent.deleteMany({ $or: [{ redeemerUserId: user._id }, { referrerUserId: user._id }] }),
    deleteCachedChats(String(user._id)),
  ]);
  await User.deleteOne({ _id: user._id });
  console.log('[account-delete] account deleted', { userId: String(user._id) });
};

module.exports = { deleteUserAccount };
