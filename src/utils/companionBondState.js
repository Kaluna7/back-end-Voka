const BOND_LEVEL_MIN = 0;
const BOND_LEVEL_MAX = 5;
const BOND_SENSITIVITY_MIN = 1;
const BOND_SENSITIVITY_MAX = 10;
const BOND_DEFAULT_LEVEL = 2;
const DEFAULT_BOND_INCREASE_LEVEL = 5;
const DEFAULT_BOND_DECREASE_LEVEL = 5;

const clampBondLevel = value => {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) {
    return BOND_DEFAULT_LEVEL;
  }
  return Math.max(BOND_LEVEL_MIN, Math.min(BOND_LEVEL_MAX, n));
};

const clampBondSensitivityLevel = value => {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) {
    return DEFAULT_BOND_INCREASE_LEVEL;
  }
  return Math.max(BOND_SENSITIVITY_MIN, Math.min(BOND_SENSITIVITY_MAX, n));
};

const sanitizeCompanionBondRow = (raw, fallback = {}) => ({
  bond: clampBondLevel(
    Number.isFinite(Number(raw?.bond)) ? Number(raw.bond) : (fallback.bond ?? BOND_DEFAULT_LEVEL),
  ),
  bondIncreaseLevel: clampBondSensitivityLevel(
    Number.isFinite(Number(raw?.bondIncreaseLevel))
      ? Number(raw.bondIncreaseLevel)
      : (fallback.bondIncreaseLevel ?? DEFAULT_BOND_INCREASE_LEVEL),
  ),
  bondDecreaseLevel: clampBondSensitivityLevel(
    Number.isFinite(Number(raw?.bondDecreaseLevel))
      ? Number(raw.bondDecreaseLevel)
      : (fallback.bondDecreaseLevel ?? DEFAULT_BOND_DECREASE_LEVEL),
  ),
});

const sanitizeCompanionBondStates = (raw, fallbackById = {}) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }
  const out = {};
  Object.entries(raw).forEach(([companionId, row]) => {
    if (typeof companionId !== 'string' || !companionId.trim()) {
      return;
    }
    const fallback = fallbackById[companionId] || {};
    out[companionId] = sanitizeCompanionBondRow(row, fallback);
  });
  return out;
};

module.exports = {
  BOND_DEFAULT_LEVEL,
  DEFAULT_BOND_INCREASE_LEVEL,
  DEFAULT_BOND_DECREASE_LEVEL,
  clampBondLevel,
  clampBondSensitivityLevel,
  sanitizeCompanionBondRow,
  sanitizeCompanionBondStates,
};
