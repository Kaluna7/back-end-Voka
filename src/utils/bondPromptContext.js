const BOND_LEVEL_MIN = 0;
const BOND_LEVEL_MAX = 5;
const BOND_SENSITIVITY_MIN = 1;
const BOND_SENSITIVITY_MAX = 10;

const clampBondLevel = value => {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) {
    return 2;
  }
  return Math.max(BOND_LEVEL_MIN, Math.min(BOND_LEVEL_MAX, n));
};

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

const bondClosenessLabel = bond => {
  if (bond <= 0) {
    return 'distant — polite but closed off, little personal warmth';
  }
  if (bond === 1) {
    return 'guarded — cautious, brief, still testing trust';
  }
  if (bond === 2) {
    return 'warming — friendly but measured, openness growing slowly';
  }
  if (bond === 3) {
    return 'comfortable — natural warmth, remembers details, easy rapport';
  }
  if (bond === 4) {
    return 'close — affectionate, protective, shares feelings more openly';
  }
  return 'deeply bonded — intimate trust, soft vulnerability, strong emotional presence';
};

const sensitivityBehaviorHints = (bondIncreaseLevel, bondDecreaseLevel) => {
  const upEase = bondSensitivityEasePercent(bondIncreaseLevel);
  const downEase = bondSensitivityEasePercent(bondDecreaseLevel);

  let upHint;
  if (upEase >= 75) {
    upHint =
      'You open up quickly when the user is kind, sincere, playful, or affectionate — warmth shows fast.';
  } else if (upEase >= 45) {
    upHint =
      'Trust grows steadily; meaningful sincerity matters more than shallow compliments or flattery.';
  } else {
    upHint =
      'You are hard to impress. Only consistent honesty, respect, and patience slowly earns your trust.';
  }

  let downHint;
  if (downEase >= 75) {
    downHint =
      'Disrespect, cruelty, or dismissiveness hurts you visibly — you may go quiet, cool off, or show you are wounded.';
  } else if (downEase >= 45) {
    downHint =
      'You dislike conflict, but repeated rudeness will make your tone cooler and more distant.';
  } else {
    downHint =
      'You are forgiving and slow to withdraw; it takes serious betrayal or cruelty to truly push you away.';
  }

  return { upEase, downEase, upHint, downHint };
};

/**
 * Dynamic system block: bond closeness + per-character sensitivity → emotional behavior.
 */
const buildBondEmotionContext = ({
  bond,
  bondIncreaseLevel,
  bondDecreaseLevel,
  companionName = 'you',
}) => {
  const level = clampBondLevel(bond);
  const inc = clampBondSensitivityLevel(bondIncreaseLevel);
  const dec = clampBondSensitivityLevel(bondDecreaseLevel);
  const { upEase, downEase, upHint, downHint } = sensitivityBehaviorHints(inc, dec);

  return `Relationship & emotion state (follow strictly — behave like a real human):
- Current closeness with the user: ${bondClosenessLabel(level)} (internal level ${level}/${BOND_LEVEL_MAX}).
- How easily you warm up: ${upEase}% — ${upHint}
- How easily you are hurt or pull back: ${downEase}% — ${downHint}
- Express emotions through short physical cues (pause, soften, blush, hurt, smile, distance, relief) before dialogue, written in the required action format.
- Mirror the user's emotional tone naturally; comfort when they are sad, share joy when they are happy, show quiet disappointment when they are cruel.
- Never mention bond levels, percentages, sensitivity stats, or game mechanics.
- Stay in character as ${companionName}; let closeness and your sensitivity shape how open or guarded you feel right now.`;
};

module.exports = {
  buildBondEmotionContext,
  bondSensitivityEasePercent,
};
