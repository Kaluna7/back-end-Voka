const { User } = require('../models/User');
const {
  VOICE_PLANS,
  PLAN_PERIOD_DAYS,
  voiceTokensForUsage,
  estimateVoiceTokensPerMinute,
} = require('../config/voicePlans');

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Lazily keeps a user's voice balance current:
 *  - converts the old `bonusCallSeconds` (store bundles / invite rewards) into tokens once;
 *  - refills the plan allowance when the 30-day period rolls over (no rollover of leftovers).
 * Uses an atomic update so concurrent requests can't double-grant.
 */
const syncVoiceBalance = async userId => {
  const user = await User.findById(userId).select('dashboard.voiceTokens dashboard.bonusCallSeconds dashboard.isPremium dashboard.selectedPlan dashboard.voicePeriodEndsAt dashboard.subscriptionCancelAtPeriodEnd dashboard.billingProvider').lean();
  if (!user) {
    return null;
  }
  const dashboard = user.dashboard || {};
  const set = {};
  const inc = {};

  const legacySeconds = Math.max(0, Number(dashboard.bonusCallSeconds || 0));
  if (legacySeconds > 0) {
    inc['dashboard.voiceTokens'] = Math.round((legacySeconds / 60) * estimateVoiceTokensPerMinute());
    set['dashboard.bonusCallSeconds'] = 0;
  }

  const plan = VOICE_PLANS[dashboard.selectedPlan];
  const periodEnd = dashboard.voicePeriodEndsAt ? new Date(dashboard.voicePeriodEndsAt).getTime() : 0;
  if (dashboard.billingProvider === 'google_play') {
    if (dashboard.isPremium && periodEnd && periodEnd <= Date.now()) {
      // Missed RTDN? Ask Google whether it renewed or expired.
      // Lazy require: googlePlayBillingService imports this module's model only.
      await require('./googlePlayBillingService')
        .refreshGoogleSubscription(userId)
        .catch(error => console.warn('[google-play] refresh failed', error?.message));
    }
    if (Object.keys(inc).length) {
      await User.updateOne({ _id: userId }, { $inc: inc, $set: set });
    }
    return getVoiceBalance(userId);
  }
  if (dashboard.isPremium && dashboard.subscriptionCancelAtPeriodEnd && periodEnd && periodEnd <= Date.now()) {
    // Cancelled subscription ran out: back to free, plan allowance expires.
    set['dashboard.isPremium'] = false;
    set['dashboard.voiceTokens'] = inc['dashboard.voiceTokens'] || 0;
    delete inc['dashboard.voiceTokens'];
    set['dashboard.voicePeriodEndsAt'] = null;
    set['dashboard.subscriptionCancelAtPeriodEnd'] = false;
  } else if (dashboard.isPremium && plan && periodEnd && periodEnd <= Date.now()) {
    // Advance whole periods so a long absence doesn't refill more than once.
    let nextEnd = periodEnd;
    while (nextEnd <= Date.now()) {
      nextEnd += PLAN_PERIOD_DAYS * DAY_MS;
    }
    set['dashboard.voiceTokens'] = plan.voiceTokens + (inc['dashboard.voiceTokens'] || 0);
    delete inc['dashboard.voiceTokens'];
    set['dashboard.voicePeriodEndsAt'] = new Date(nextEnd);
  }

  if (Object.keys(set).length || Object.keys(inc).length) {
    const update = {};
    if (Object.keys(set).length) {
      update.$set = set;
    }
    if (Object.keys(inc).length) {
      update.$inc = inc;
    }
    // Guard on the values we read so a parallel sync can't apply the same change twice.
    await User.updateOne(
      {
        _id: userId,
        'dashboard.bonusCallSeconds': dashboard.bonusCallSeconds ?? { $exists: false },
        'dashboard.voicePeriodEndsAt': dashboard.voicePeriodEndsAt ?? null,
      },
      update,
    );
  }
  return getVoiceBalance(userId);
};

const getVoiceBalance = async userId => {
  const user = await User.findById(userId).select('dashboard.voiceTokens dashboard.voicePeriodEndsAt dashboard.selectedPlan dashboard.isPremium dashboard.subscriptionCancelAtPeriodEnd').lean();
  if (!user) {
    return null;
  }
  return {
    voiceTokens: Math.max(0, Math.floor(Number(user.dashboard?.voiceTokens || 0))),
    voicePeriodEndsAt: user.dashboard?.voicePeriodEndsAt || null,
    voiceTokensPerMinute: estimateVoiceTokensPerMinute(),
    isPremium: Boolean(user.dashboard?.isPremium),
    planId: user.dashboard?.selectedPlan || 'starter',
    cancelAtPeriodEnd: Boolean(user.dashboard?.subscriptionCancelAtPeriodEnd),
  };
};

/** Turn auto-renew off (cancel) or back on (resume). The current period is kept. */
const setSubscriptionCancelAtPeriodEnd = async (userId, cancel) => {
  const result = await User.updateOne(
    { _id: userId, 'dashboard.isPremium': true },
    { $set: { 'dashboard.subscriptionCancelAtPeriodEnd': Boolean(cancel) } },
  );
  if (!result.matchedCount) {
    const err = new Error('Tidak ada langganan aktif.');
    err.status = 400;
    throw err;
  }
  return getVoiceBalance(userId);
};

/**
 * Deducts tokens atomically and returns what's left (never below 0).
 * `$inc` can't clamp, so a follow-up update floors negatives back to 0.
 */
const chargeVoiceTokens = async (userId, tokens) => {
  const amount = Math.max(0, Math.ceil(tokens));
  if (!amount) {
    return (await getVoiceBalance(userId))?.voiceTokens ?? 0;
  }
  const updated = await User.findOneAndUpdate(
    { _id: userId },
    { $inc: { 'dashboard.voiceTokens': -amount } },
    { returnDocument: 'after', projection: { 'dashboard.voiceTokens': 1 } },
  ).lean();
  const remaining = Number(updated?.dashboard?.voiceTokens || 0);
  if (remaining < 0) {
    await User.updateOne({ _id: userId, 'dashboard.voiceTokens': { $lt: 0 } }, { $set: { 'dashboard.voiceTokens': 0 } });
    return 0;
  }
  return remaining;
};

/** Adds tokens (store bundles, rewards). */
const grantVoiceTokens = async (userId, tokens) => {
  const amount = Math.max(0, Math.floor(tokens));
  if (amount) {
    await User.updateOne({ _id: userId }, { $inc: { 'dashboard.voiceTokens': amount } });
  }
  return getVoiceBalance(userId);
};

/** Starts / switches a monthly plan: fresh allowance + new 30-day period. */
const activateVoicePlan = async (userId, planId) => {
  const plan = VOICE_PLANS[planId];
  if (!plan) {
    const err = new Error('Unknown plan.');
    err.status = 400;
    throw err;
  }
  await User.updateOne(
    { _id: userId },
    {
      $set: {
        'dashboard.selectedPlan': plan.id,
        'dashboard.isPremium': true,
        'dashboard.voiceTokens': plan.voiceTokens,
        'dashboard.voicePeriodEndsAt': new Date(Date.now() + PLAN_PERIOD_DAYS * DAY_MS),
        'dashboard.subscriptionCancelAtPeriodEnd': false,
      },
    },
  );
  return getVoiceBalance(userId);
};

/**
 * Per-call meter: accumulates STT seconds (from PCM bytes) and TTS characters, and
 * flushes the cost to the database every few seconds. Calls `onExhausted` once the
 * balance reaches zero so the socket can end the call.
 */
const createVoiceMeter = ({ userId, initialBalance, sampleRate = 16000, onBalance, onExhausted }) => {
  let pendingSttSeconds = 0;
  let pendingTtsChars = 0;
  let balance = Math.max(0, Number(initialBalance) || 0);
  let flushing = false;
  let exhausted = false;
  let stopped = false;
  const bytesPerSecond = Math.max(1, sampleRate * 2);

  const estimatedRemaining = () =>
    balance - voiceTokensForUsage({ sttSeconds: pendingSttSeconds, ttsChars: pendingTtsChars });

  const flush = async () => {
    if (flushing || (!pendingSttSeconds && !pendingTtsChars)) {
      return balance;
    }
    flushing = true;
    const cost = voiceTokensForUsage({ sttSeconds: pendingSttSeconds, ttsChars: pendingTtsChars });
    pendingSttSeconds = 0;
    pendingTtsChars = 0;
    try {
      balance = await chargeVoiceTokens(userId, cost);
      onBalance?.(balance);
      if (balance <= 0 && !exhausted) {
        exhausted = true;
        onExhausted?.();
      }
    } catch (error) {
      console.warn('[voice-tokens] charge failed', error?.message || error);
    } finally {
      flushing = false;
    }
    return balance;
  };

  const timer = setInterval(() => {
    if (!stopped) {
      flush();
    }
  }, 5000);

  const checkLocal = () => {
    if (!exhausted && estimatedRemaining() <= 0) {
      flush();
    }
  };

  return {
    addAudioBytes(bytes) {
      if (stopped) {
        return;
      }
      pendingSttSeconds += Math.max(0, bytes) / bytesPerSecond;
      checkLocal();
    },
    addTtsChars(chars) {
      if (stopped) {
        return;
      }
      pendingTtsChars += Math.max(0, chars);
      checkLocal();
    },
    get balance() {
      return balance;
    },
    async stop() {
      if (stopped) {
        return balance;
      }
      stopped = true;
      clearInterval(timer);
      flushing = false;
      return flush();
    },
  };
};

module.exports = {
  syncVoiceBalance,
  getVoiceBalance,
  chargeVoiceTokens,
  grantVoiceTokens,
  activateVoicePlan,
  setSubscriptionCancelAtPeriodEnd,
  createVoiceMeter,
};
