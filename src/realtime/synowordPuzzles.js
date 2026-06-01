const { randomBotName } = require('./sudowordPuzzles');

const SYNONYM_BANK = [
  { word: 'HAPPY', synonyms: ['GLAD', 'JOYFUL', 'MERRY', 'CHEERFUL', 'CONTENT'] },
  { word: 'SAD', synonyms: ['UNHAPPY', 'SORROW', 'GLOOMY', 'BLUE', 'UPSET'] },
  { word: 'BIG', synonyms: ['LARGE', 'HUGE', 'GIANT', 'VAST', 'GREAT'] },
  { word: 'SMALL', synonyms: ['TINY', 'LITTLE', 'MINOR', 'PETITE', 'SLIM'] },
  { word: 'FAST', synonyms: ['QUICK', 'RAPID', 'SWIFT', 'SPEEDY', 'HASTY'] },
  { word: 'SLOW', synonyms: ['SLUGGISH', 'TARDY', 'LATE', 'DELAYED', 'LAZY'] },
  { word: 'SMART', synonyms: ['CLEVER', 'BRIGHT', 'WITTY', 'SHARP', 'WISE'] },
  { word: 'DUMB', synonyms: ['SILLY', 'FOOLISH', 'DENSE', 'DULL', 'OBTUSE'] },
  { word: 'BRAVE', synonyms: ['BOLD', 'FEARLESS', 'HEROIC', 'VALIANT', 'DARING'] },
  { word: 'AFRAID', synonyms: ['SCARED', 'TIMID', 'NERVOUS', 'WARY', 'ANXIOUS'] },
  { word: 'CALM', synonyms: ['PEACEFUL', 'SERENE', 'QUIET', 'STILL', 'MELLOW'] },
  { word: 'COLD', synonyms: ['CHILLY', 'FRIGID', 'ICY', 'COOL', 'FROSTY'] },
  { word: 'HOT', synonyms: ['WARM', 'BURNING', 'HEATED', 'SCALDING', 'SIZZLING'] },
  { word: 'RICH', synonyms: ['WEALTHY', 'AFFLUENT', 'LAVISH', 'OPULENT', 'PROSPEROUS'] },
  { word: 'POOR', synonyms: ['BROKE', 'NEEDY', 'HUMBLE', 'LOWLY', 'MEAGER'] },
  { word: 'LOUD', synonyms: ['NOISY', 'BOOMING', 'ROWDY', 'THUNDERY', 'BLARING'] },
  { word: 'QUIET', synonyms: ['SILENT', 'HUSHED', 'MUTED', 'SOFT', 'STILL'] },
  { word: 'BEGIN', synonyms: ['START', 'OPEN', 'LAUNCH', 'COMMENCE', 'INITIATE'] },
  { word: 'END', synonyms: ['FINISH', 'CLOSE', 'STOP', 'CEASE', 'CONCLUDE'] },
  { word: 'LOVE', synonyms: ['ADORE', 'CHERISH', 'LIKE', 'VALUE', 'TREASURE'] },
  { word: 'HATE', synonyms: ['DETEST', 'LOATHE', 'DESPISE', 'DISLIKE', 'ABHOR'] },
  { word: 'HELP', synonyms: ['AID', 'ASSIST', 'SUPPORT', 'SERVE', 'BACK'] },
  { word: 'HURT', synonyms: ['HARM', 'INJURE', 'WOUND', 'DAMAGE', 'ACHE'] },
  { word: 'EASY', synonyms: ['SIMPLE', 'BASIC', 'LIGHT', 'SMOOTH', 'EFFORTLESS'] },
  { word: 'HARD', synonyms: ['TOUGH', 'DIFFICULT', 'HARSH', 'STIFF', 'STERN'] },
  { word: 'NEW', synonyms: ['FRESH', 'RECENT', 'MODERN', 'NOVEL', 'LATEST'] },
  { word: 'OLD', synonyms: ['AGED', 'ANCIENT', 'STALE', 'WORN', 'DATED'] },
  { word: 'TRUE', synonyms: ['REAL', 'ACTUAL', 'VALID', 'GENUINE', 'FACTUAL'] },
  { word: 'FALSE', synonyms: ['FAKE', 'WRONG', 'UNTRUE', 'PHONY', 'BOGUS'] },
  { word: 'KIND', synonyms: ['NICE', 'GENTLE', 'SWEET', 'WARM', 'CARING'] },
  { word: 'MEAN', synonyms: ['CRUEL', 'HARSH', 'NASTY', 'RUDE', 'SPITEFUL'] },
  { word: 'FUNNY', synonyms: ['SILLY', 'COMIC', 'AMUSING', 'WITTY', 'DROLL'] },
  { word: 'SERIOUS', synonyms: ['GRAVE', 'STERN', 'SOLEMN', 'SOBER', 'STRICT'] },
  { word: 'CLEAN', synonyms: ['PURE', 'NEAT', 'TIDY', 'FRESH', 'SPOTLESS'] },
  { word: 'DIRTY', synonyms: ['FILTHY', 'GRIMY', 'MUDDY', 'MESSY', 'SOILED'] },
  { word: 'STRONG', synonyms: ['TOUGH', 'MIGHTY', 'STURDY', 'ROBUST', 'FIRM'] },
  { word: 'WEAK', synonyms: ['FRAIL', 'FEEBLE', 'FRAGILE', 'TENDER', 'SOFT'] },
  { word: 'BEAUTIFUL', synonyms: ['LOVELY', 'PRETTY', 'GORGEOUS', 'STUNNING', 'FAIR'] },
  { word: 'UGLY', synonyms: ['HIDEOUS', 'PLAIN', 'HOMELY', 'UNATTRACTIVE', 'GROTESQUE'] },
  { word: 'ANGRY', synonyms: ['MAD', 'IRATE', 'UPSET', 'CROSS', 'WRATHFUL'] },
  { word: 'TIRED', synonyms: ['WEARY', 'SLEEPY', 'DRAINED', 'SPENT', 'EXHAUSTED'] },
  { word: 'HUNGRY', synonyms: ['STARVING', 'FAMISHED', 'EAGER', 'RAVENOUS', 'PECKISH'] },
  { word: 'SCARED', synonyms: ['AFRAID', 'FEARFUL', 'TIMID', 'NERVOUS', 'ALARMED'] },
  { word: 'LUCKY', synonyms: ['FORTUNATE', 'BLESSED', 'FAVORED', 'HAPPY', 'CHARMED'] },
  { word: 'RARE', synonyms: ['UNUSUAL', 'SCARCE', 'UNIQUE', 'SPECIAL', 'EXOTIC'] },
  { word: 'COMMON', synonyms: ['USUAL', 'NORMAL', 'TYPICAL', 'ORDINARY', 'REGULAR'] },
  { word: 'EMPTY', synonyms: ['VACANT', 'HOLLOW', 'BLANK', 'BARE', 'VOID'] },
  { word: 'FULL', synonyms: ['FILLED', 'PACKED', 'STUFFED', 'LOADED', 'COMPLETE'] },
  { word: 'WIN', synonyms: ['TRIUMPH', 'SUCCEED', 'CONQUER', 'PREVAIL', 'EARN'] },
  { word: 'LOSE', synonyms: ['FAIL', 'FORFEIT', 'MISS', 'SURRENDER', 'DROPPED'] },
  { word: 'BUILD', synonyms: ['MAKE', 'CREATE', 'FORM', 'CRAFT', 'RAISE'] },
  { word: 'BREAK', synonyms: ['SMASH', 'CRACK', 'SHATTER', 'SPLIT', 'RUIN'] },
  { word: 'FIND', synonyms: ['LOCATE', 'DISCOVER', 'SPOT', 'DETECT', 'UNCOVER'] },
  { word: 'HIDE', synonyms: ['CONCEAL', 'COVER', 'MASK', 'SHIELD', 'BURY'] },
  { word: 'SPEAK', synonyms: ['TALK', 'SAY', 'TELL', 'STATE', 'VOICE'] },
  { word: 'LISTEN', synonyms: ['HEAR', 'HEED', 'ATTEND', 'MONITOR', 'NOTICE'] },
  { word: 'THINK', synonyms: ['PONDER', 'REASON', 'REFLECT', 'CONSIDER', 'MUSE'] },
  { word: 'LEARN', synonyms: ['STUDY', 'MASTER', 'GRASP', 'ABSORB', 'TRAIN'] },
  { word: 'TEACH', synonyms: ['TRAIN', 'GUIDE', 'COACH', 'TUTOR', 'INSTRUCT'] },
  { word: 'WORK', synonyms: ['LABOR', 'TOIL', 'GRIND', 'STRIVE', 'OPERATE'] },
  { word: 'PLAY', synonyms: ['GAME', 'SPORT', 'FROLIC', 'REVEL', 'AMUSE'] },
];

const normalizeAnswer = value =>
  String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, '');

const { getSynowordBank } = require('./puzzleLocales');

const pickPair = (learningLanguage = 'English') => {
  const bank = getSynowordBank(learningLanguage) || SYNONYM_BANK;
  return bank[Math.floor(Math.random() * bank.length)];
};

const buildChallenge = (learningLanguage = 'English') => {
  const pair = pickPair(learningLanguage);
  const accepted = [...new Set(pair.synonyms.map(normalizeAnswer).filter(word => word.length >= 2))];
  return {
    id: `syn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
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

const calcSynowordExp = (finalScore, rank = 5) => {
  const safeScore = Math.max(0, Number(finalScore) || 0);
  const base = Math.floor(safeScore / 10);
  const winBonus = rank === 1 ? 3 : rank === 2 ? 1 : 0;
  return Math.max(safeScore > 0 ? 1 : 0, base + winBonus);
};

module.exports = {
  SYNONYM_BANK,
  MATCH_DURATION_MS: 5 * 60 * 1000,
  POINTS_CORRECT: 15,
  POINTS_WRONG: 5,
  buildChallenge,
  serializeChallenge,
  isCorrectAnswer,
  normalizeAnswer,
  pickBotAnswer,
  randomBotName,
  calcSynowordExp,
};
