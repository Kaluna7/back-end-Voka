const BOND_SENSITIVITY_MIN = 1;
const BOND_SENSITIVITY_MAX = 10;

const clampBondSensitivityLevel = value => {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) {
    return 5;
  }
  return Math.max(BOND_SENSITIVITY_MIN, Math.min(BOND_SENSITIVITY_MAX, n));
};

const bondSensitivityEasePercent = level => {
  const L = clampBondSensitivityLevel(level);
  const span = BOND_SENSITIVITY_MAX - BOND_SENSITIVITY_MIN;
  return Math.round(((BOND_SENSITIVITY_MAX - L) / span) * 100);
};

/**
 * Chance that one qualifying message actually moves the bond, indexed by sensitivity level.
 * Level 1 moves on every message; level 10 needs roughly a dozen before one step lands.
 */
const BOND_STEP_CHANCE_BY_LEVEL = [1, 1, 0.85, 0.7, 0.55, 0.45, 0.35, 0.25, 0.17, 0.12, 0.08];

const bondStepChance = level => BOND_STEP_CHANCE_BY_LEVEL[clampBondSensitivityLevel(level)];

/**
 * Map AI sentiment (-1, 0, 1) to bond delta using per-character sensitivity tiers.
 */
const computeBondDeltaFromSentiment = (sentiment, sensitivity, random = Math.random) => {
  const score = Math.max(-1, Math.min(1, Math.round(Number(sentiment) || 0)));
  if (score === 0) {
    return 0;
  }
  const level = score > 0 ? sensitivity.bondIncreaseLevel : sensitivity.bondDecreaseLevel;
  if (random() >= bondStepChance(level)) {
    return 0;
  }
  return score > 0 ? 1 : -1;
};

module.exports = {
  bondSensitivityEasePercent,
  bondStepChance,
  computeBondDeltaFromSentiment,
};
