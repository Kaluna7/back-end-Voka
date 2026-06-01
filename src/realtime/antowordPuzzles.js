const { randomBotName } = require('./sudowordPuzzles');

const ANTONYM_BANK = [
  { word: 'HAPPY', antonyms: ['SAD', 'UNHAPPY', 'GLOOMY', 'MISERABLE', 'SORROW'] },
  { word: 'SAD', antonyms: ['HAPPY', 'GLAD', 'JOYFUL', 'CHEERFUL', 'MERRY'] },
  { word: 'BIG', antonyms: ['SMALL', 'TINY', 'LITTLE', 'MINOR', 'PETITE'] },
  { word: 'SMALL', antonyms: ['BIG', 'LARGE', 'HUGE', 'GIANT', 'VAST'] },
  { word: 'FAST', antonyms: ['SLOW', 'SLUGGISH', 'TARDY', 'DELAYED', 'LAZY'] },
  { word: 'SLOW', antonyms: ['FAST', 'QUICK', 'RAPID', 'SWIFT', 'SPEEDY'] },
  { word: 'HOT', antonyms: ['COLD', 'CHILLY', 'FRIGID', 'ICY', 'COOL'] },
  { word: 'COLD', antonyms: ['HOT', 'WARM', 'HEATED', 'BURNING', 'SIZZLING'] },
  { word: 'RICH', antonyms: ['POOR', 'BROKE', 'NEEDY', 'HUMBLE', 'LOWLY'] },
  { word: 'POOR', antonyms: ['RICH', 'WEALTHY', 'AFFLUENT', 'LAVISH', 'OPULENT'] },
  { word: 'LOUD', antonyms: ['QUIET', 'SILENT', 'HUSHED', 'MUTED', 'SOFT'] },
  { word: 'QUIET', antonyms: ['LOUD', 'NOISY', 'BOOMING', 'ROWDY', 'BLARING'] },
  { word: 'LIGHT', antonyms: ['DARK', 'DIM', 'GLOOMY', 'SHADOWY', 'MURKY'] },
  { word: 'DARK', antonyms: ['LIGHT', 'BRIGHT', 'LUMINOUS', 'RADIANT', 'SUNNY'] },
  { word: 'EASY', antonyms: ['HARD', 'TOUGH', 'DIFFICULT', 'HARSH', 'STIFF'] },
  { word: 'HARD', antonyms: ['EASY', 'SIMPLE', 'BASIC', 'LIGHT', 'SMOOTH'] },
  { word: 'NEW', antonyms: ['OLD', 'AGED', 'ANCIENT', 'STALE', 'WORN'] },
  { word: 'OLD', antonyms: ['NEW', 'FRESH', 'RECENT', 'MODERN', 'NOVEL'] },
  { word: 'TRUE', antonyms: ['FALSE', 'FAKE', 'WRONG', 'UNTRUE', 'PHONY'] },
  { word: 'FALSE', antonyms: ['TRUE', 'REAL', 'ACTUAL', 'VALID', 'GENUINE'] },
  { word: 'KIND', antonyms: ['MEAN', 'CRUEL', 'HARSH', 'NASTY', 'RUDE'] },
  { word: 'MEAN', antonyms: ['KIND', 'NICE', 'GENTLE', 'SWEET', 'WARM'] },
  { word: 'CLEAN', antonyms: ['DIRTY', 'FILTHY', 'GRIMY', 'MUDDY', 'MESSY'] },
  { word: 'DIRTY', antonyms: ['CLEAN', 'PURE', 'NEAT', 'TIDY', 'FRESH'] },
  { word: 'STRONG', antonyms: ['WEAK', 'FRAIL', 'FEEBLE', 'FRAGILE', 'TENDER'] },
  { word: 'WEAK', antonyms: ['STRONG', 'TOUGH', 'MIGHTY', 'STURDY', 'ROBUST'] },
  { word: 'BRAVE', antonyms: ['AFRAID', 'SCARED', 'TIMID', 'NERVOUS', 'WARY'] },
  { word: 'AFRAID', antonyms: ['BRAVE', 'BOLD', 'FEARLESS', 'HEROIC', 'VALIANT'] },
  { word: 'SMART', antonyms: ['DUMB', 'SILLY', 'FOOLISH', 'DENSE', 'DULL'] },
  { word: 'DUMB', antonyms: ['SMART', 'CLEVER', 'BRIGHT', 'WITTY', 'SHARP'] },
  { word: 'BEGIN', antonyms: ['END', 'FINISH', 'CLOSE', 'STOP', 'CEASE'] },
  { word: 'END', antonyms: ['BEGIN', 'START', 'OPEN', 'LAUNCH', 'COMMENCE'] },
  { word: 'LOVE', antonyms: ['HATE', 'DETEST', 'LOATHE', 'DESPISE', 'DISLIKE'] },
  { word: 'HATE', antonyms: ['LOVE', 'ADORE', 'CHERISH', 'LIKE', 'VALUE'] },
  { word: 'WIN', antonyms: ['LOSE', 'FAIL', 'FORFEIT', 'MISS', 'SURRENDER'] },
  { word: 'LOSE', antonyms: ['WIN', 'TRIUMPH', 'SUCCEED', 'CONQUER', 'PREVAIL'] },
  { word: 'FULL', antonyms: ['EMPTY', 'VACANT', 'HOLLOW', 'BLANK', 'BARE'] },
  { word: 'EMPTY', antonyms: ['FULL', 'FILLED', 'PACKED', 'STUFFED', 'LOADED'] },
  { word: 'OPEN', antonyms: ['CLOSED', 'SHUT', 'LOCKED', 'SEALED', 'BLOCKED'] },
  { word: 'CLOSED', antonyms: ['OPEN', 'UNLOCKED', 'AJAR', 'CLEAR', 'FREE'] },
  { word: 'YOUNG', antonyms: ['OLD', 'AGED', 'ELDERLY', 'MATURE', 'ANCIENT'] },
  { word: 'ANGRY', antonyms: ['CALM', 'PEACEFUL', 'SERENE', 'MELLOW', 'STILL'] },
  { word: 'CALM', antonyms: ['ANGRY', 'MAD', 'IRATE', 'UPSET', 'FURIOUS'] },
  { word: 'BEAUTIFUL', antonyms: ['UGLY', 'HIDEOUS', 'PLAIN', 'HOMELY', 'GROTESQUE'] },
  { word: 'UGLY', antonyms: ['BEAUTIFUL', 'LOVELY', 'PRETTY', 'GORGEOUS', 'STUNNING'] },
  { word: 'RARE', antonyms: ['COMMON', 'USUAL', 'NORMAL', 'TYPICAL', 'ORDINARY'] },
  { word: 'COMMON', antonyms: ['RARE', 'UNUSUAL', 'SCARCE', 'UNIQUE', 'SPECIAL'] },
  { word: 'GIVE', antonyms: ['TAKE', 'STEAL', 'GRAB', 'SEIZE', 'WITHHOLD'] },
  { word: 'TAKE', antonyms: ['GIVE', 'OFFER', 'DONATE', 'GRANT', 'SUPPLY'] },
  { word: 'RISE', antonyms: ['FALL', 'DROP', 'SINK', 'DECLINE', 'PLUNGE'] },
  { word: 'FALL', antonyms: ['RISE', 'CLIMB', 'ASCEND', 'SOAR', 'MOUNT'] },
  { word: 'DAY', antonyms: ['NIGHT', 'DUSK', 'DARK', 'EVENING', 'MIDNIGHT'] },
  { word: 'NIGHT', antonyms: ['DAY', 'DAWN', 'MORNING', 'NOON', 'LIGHT'] },
  { word: 'WAR', antonyms: ['PEACE', 'TRUCE', 'HARMONY', 'CALM', 'CALMNESS'] },
  { word: 'PEACE', antonyms: ['WAR', 'FIGHT', 'BATTLE', 'CONFLICT', 'CHAOS'] },
  { word: 'SUCCESS', antonyms: ['FAILURE', 'DEFEAT', 'LOSS', 'FLOP', 'FAULT'] },
  { word: 'FAILURE', antonyms: ['SUCCESS', 'WIN', 'TRIUMPH', 'VICTORY', 'GAIN'] },
  { word: 'INCREASE', antonyms: ['DECREASE', 'REDUCE', 'LESSEN', 'SHRINK', 'DROP'] },
  { word: 'DECREASE', antonyms: ['INCREASE', 'GROW', 'EXPAND', 'RAISE', 'BOOST'] },
  { word: 'ACCEPT', antonyms: ['REJECT', 'DENY', 'REFUSE', 'DECLINE', 'DISMISS'] },
  { word: 'REJECT', antonyms: ['ACCEPT', 'APPROVE', 'ALLOW', 'WELCOME', 'EMBRACE'] },
];

const normalizeAnswer = value =>
  String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, '');

const { getAntowordBank } = require('./puzzleLocales');

const pickPair = (learningLanguage = 'English') => {
  const bank = getAntowordBank(learningLanguage) || ANTONYM_BANK;
  return bank[Math.floor(Math.random() * bank.length)];
};

const buildChallenge = (learningLanguage = 'English') => {
  const pair = pickPair(learningLanguage);
  const accepted = [...new Set(pair.antonyms.map(normalizeAnswer).filter(word => word.length >= 2))];
  return {
    id: `ant_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    prompt: pair.word,
    accepted,
  };
};

const serializeChallenge = challenge => ({
  id: challenge.id,
  prompt: challenge.prompt,
});

const isCorrectAnswer = (challenge, answer) => {
  const normalized = normalizeAnswer(answer);
  if (!normalized || normalized.length < 2) {
    return false;
  }
  if (normalized === normalizeAnswer(challenge.prompt)) {
    return false;
  }
  return challenge.accepted.includes(normalized);
};

const pickBotAnswer = challenge => {
  const pool = challenge.accepted.filter(word => word.length >= 2);
  if (pool.length === 0) {
    return 'WORD';
  }
  return pool[Math.floor(Math.random() * pool.length)];
};

const calcAntowordExp = (finalScore, rank = 5) => {
  const safeScore = Math.max(0, Number(finalScore) || 0);
  const base = Math.floor(safeScore / 10);
  const winBonus = rank === 1 ? 3 : rank === 2 ? 1 : 0;
  return Math.max(safeScore > 0 ? 1 : 0, base + winBonus);
};

module.exports = {
  MATCH_DURATION_MS: 5 * 60 * 1000,
  POINTS_CORRECT: 15,
  POINTS_WRONG: 5,
  buildChallenge,
  serializeChallenge,
  isCorrectAnswer,
  normalizeAnswer,
  pickBotAnswer,
  randomBotName,
  calcAntowordExp,
};
