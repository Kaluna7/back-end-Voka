/**
 * How much a character / teacher remembers, by subscription.
 *  - recentMessages: chat turns kept verbatim in the prompt (short-term memory).
 *  - longTermFacts:  key facts about the user extracted from conversations and kept
 *                    across sessions (long-term memory). 0 = disabled.
 */
const MEMORY_TIERS = Object.freeze({
  free: { id: 'free', recentMessages: 10, longTermFacts: 0 },
  basic: { id: 'basic', recentMessages: 20, longTermFacts: 8 },
  pro: { id: 'pro', recentMessages: 40, longTermFacts: 20 },
  premium: { id: 'premium', recentMessages: 80, longTermFacts: 50 },
});

/** Extract new facts after this many user messages since the last extraction. */
const FACT_EXTRACT_EVERY_USER_MESSAGES = 4;

const PLAN_TO_TIER = { starter: 'basic', pro: 'pro', premium: 'premium' };

const resolveMemoryTier = user => {
  const dashboard = user?.dashboard || {};
  if (!dashboard.isPremium) {
    return MEMORY_TIERS.free;
  }
  return MEMORY_TIERS[PLAN_TO_TIER[dashboard.selectedPlan]] || MEMORY_TIERS.basic;
};

module.exports = {
  MEMORY_TIERS,
  FACT_EXTRACT_EVERY_USER_MESSAGES,
  resolveMemoryTier,
};
