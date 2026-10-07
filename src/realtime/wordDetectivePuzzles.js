const { normalizeAnyAnswer, acceptedForms } = require('../services/aiGamePuzzleService');
const pickAi = items => items[Math.floor(Math.random() * items.length)];
const { randomBotName, SYNONYM_BANK } = require('./synowordPuzzles');

const EXTRA_SYNONYM_BANK = [
  { word: 'ANGRY', synonyms: ['MAD', 'FURIOUS', 'IRATE', 'UPSET', 'CROSS'] },
  { word: 'JOY', synonyms: ['HAPPINESS', 'DELIGHT', 'BLISS', 'GLEE', 'ECSTASY'] },
  { word: 'FEAR', synonyms: ['DREAD', 'TERROR', 'PANIC', 'FRIGHT', 'ALARM'] },
  { word: 'HOPE', synonyms: ['WISH', 'FAITH', 'TRUST', 'EXPECT', 'DREAM'] },
  { word: 'PEACE', synonyms: ['CALM', 'HARMONY', 'TRANQUIL', 'SERENE', 'STILL'] },
  { word: 'CHAOS', synonyms: ['DISORDER', 'MAYHEM', 'TURMOIL', 'HAVOC', 'BEDLAM'] },
  { word: 'WAR', synonyms: ['BATTLE', 'COMBAT', 'FIGHT', 'CONFLICT', 'STRIFE'] },
  { word: 'FRIEND', synonyms: ['PAL', 'BUDDY', 'MATE', 'ALLY', 'COMPANION'] },
  { word: 'ENEMY', synonyms: ['FOE', 'RIVAL', 'OPPONENT', 'ADVERSARY', 'NEMESIS'] },
  { word: 'CHILD', synonyms: ['KID', 'YOUTH', 'MINOR', 'TOT', 'JUVENILE'] },
  { word: 'ADULT', synonyms: ['GROWN', 'MATURE', 'ELDER', 'SENIOR', 'OFAGE'] },
  { word: 'HOME', synonyms: ['HOUSE', 'ABODE', 'DWELLING', 'RESIDENCE', 'HABITAT'] },
  { word: 'ROAD', synonyms: ['STREET', 'PATH', 'ROUTE', 'LANE', 'HIGHWAY'] },
  { word: 'CAR', synonyms: ['AUTO', 'VEHICLE', 'RIDE', 'MOTOR', 'COUPE'] },
  { word: 'FOOD', synonyms: ['MEAL', 'DISH', 'CUISINE', 'FARE', 'NOURISH'] },
  { word: 'WATER', synonyms: ['LIQUID', 'H2O', 'AQUA', 'FLUID', 'MOISTURE'] },
  { word: 'FIRE', synonyms: ['FLAME', 'BLAZE', 'INFERNO', 'COMBUST', 'HEAT'] },
  { word: 'WIND', synonyms: ['BREEZE', 'GUST', 'GALE', 'DRAFT', 'AIR'] },
  { word: 'RAIN', synonyms: ['SHOWER', 'DRIZZLE', 'DOWNPOUR', 'STORM', 'PRECIP'] },
  { word: 'SUN', synonyms: ['STAR', 'SOL', 'DAYSTAR', 'SUNLIGHT', 'RAYS'] },
  { word: 'MOON', synonyms: ['LUNA', 'SATELLITE', 'CRESCENT', 'NIGHT', 'GLOW'] },
  { word: 'TREE', synonyms: ['PLANT', 'WOOD', 'TIMBER', 'OAK', 'MAPLE'] },
  { word: 'FLOWER', synonyms: ['BLOOM', 'BLOSSOM', 'PETAL', 'BUD', 'FLORA'] },
  { word: 'DOG', synonyms: ['CANINE', 'PUP', 'HOUND', 'MUTT', 'CUR'] },
  { word: 'CAT', synonyms: ['FELINE', 'KITTY', 'TOM', 'TABBY', 'PUSS'] },
  { word: 'BIRD', synonyms: ['AVIAN', 'FOWL', 'WINGED', 'SPARROW', 'EAGLE'] },
  { word: 'FISH', synonyms: ['FIN', 'TROUT', 'SALMON', 'CARP', 'SEAFOOD'] },
  { word: 'BOOK', synonyms: ['TOME', 'VOLUME', 'NOVEL', 'TEXT', 'READ'] },
  { word: 'PEN', synonyms: ['INK', 'QUILL', 'STYLUS', 'MARKER', 'WRITE'] },
  { word: 'SCHOOL', synonyms: ['ACADEMY', 'COLLEGE', 'CLASS', 'CAMPUS', 'INSTITUTE'] },
  { word: 'TEACHER', synonyms: ['TUTOR', 'INSTRUCTOR', 'PROF', 'MENTOR', 'EDUCATOR'] },
  { word: 'STUDENT', synonyms: ['PUPIL', 'LEARNER', 'SCHOLAR', 'TRAINEE', 'DISCIPLE'] },
  { word: 'MONEY', synonyms: ['CASH', 'FUNDS', 'WEALTH', 'CAPITAL', 'CURRENCY'] },
  { word: 'JOB', synonyms: ['WORK', 'ROLE', 'POST', 'TASK', 'CAREER'] },
  { word: 'BOSS', synonyms: ['CHIEF', 'MANAGER', 'LEADER', 'HEAD', 'SUPERVISOR'] },
  { word: 'TEAM', synonyms: ['GROUP', 'SQUAD', 'CREW', 'UNIT', 'GANG'] },
  { word: 'GAME', synonyms: ['MATCH', 'SPORT', 'PLAY', 'CONTEST', 'EVENT'] },
  { word: 'MUSIC', synonyms: ['SONG', 'TUNE', 'MELODY', 'RHYTHM', 'HARMONY'] },
  { word: 'DANCE', synonyms: ['SWAY', 'SPIN', 'TWIRL', 'STEP', 'MOVE'] },
  { word: 'SING', synonyms: ['CHANT', 'HUM', 'CROON', 'VOICE', 'CAROL'] },
  { word: 'PAINT', synonyms: ['DRAW', 'COLOR', 'BRUSH', 'ART', 'SKETCH'] },
  { word: 'WRITE', synonyms: ['SCRIBE', 'NOTE', 'RECORD', 'TYPE', 'AUTHOR'] },
  { word: 'READ', synonyms: ['SCAN', 'STUDY', 'PERUSE', 'SKIM', 'BROWSE'] },
  { word: 'WALK', synonyms: ['STROLL', 'MARCH', 'STEP', 'TREK', 'PACE'] },
  { word: 'RUN', synonyms: ['SPRINT', 'DASH', 'RACE', 'JOG', 'HURRY'] },
  { word: 'JUMP', synonyms: ['LEAP', 'HOP', 'BOUND', 'SPRING', 'VAULT'] },
  { word: 'SLEEP', synonyms: ['REST', 'NAP', 'DOZE', 'SLUMBER', 'DREAM'] },
  { word: 'WAKE', synonyms: ['ROUSE', 'STIR', 'ARISE', 'AWAKE', 'ALERT'] },
  { word: 'EAT', synonyms: ['DINE', 'FEAST', 'DEVOUR', 'CONSUME', 'BITE'] },
  { word: 'DRINK', synonyms: ['SIP', 'SWIG', 'GUZZLE', 'QUAFF', 'CHUG'] },
  { word: 'TALK', synonyms: ['SPEAK', 'CHAT', 'DISCUSS', 'SAY', 'CONVERSE'] },
  { word: 'ASK', synonyms: ['QUERY', 'QUESTION', 'INQUIRE', 'REQUEST', 'SEEK'] },
  { word: 'ANSWER', synonyms: ['REPLY', 'RESPOND', 'RETORT', 'SOLVE', 'RETURN'] },
  { word: 'BUY', synonyms: ['PURCHASE', 'GET', 'ACQUIRE', 'OBTAIN', 'SHOP'] },
  { word: 'SELL', synonyms: ['TRADE', 'VEND', 'MARKET', 'OFFER', 'DEAL'] },
  { word: 'GIFT', synonyms: ['PRESENT', 'DONATION', 'OFFERING', 'BONUS', 'TREAT'] },
  { word: 'PARTY', synonyms: ['GALA', 'FIESTA', 'EVENT', 'BASH', 'GATHER'] },
  { word: 'GIFTED', synonyms: ['TALENTED', 'SKILLED', 'ABLE', 'BRIGHT', 'GENIUS'] },
  { word: 'LAZY', synonyms: ['IDLE', 'SLOTH', 'INERT', 'DULL', 'SLOW'] },
  { word: 'BUSY', synonyms: ['ACTIVE', 'OCCUPIED', 'ENGAGED', 'HASTY', 'SWAMPED'] },
  { word: 'SAFE', synonyms: ['SECURE', 'SOUND', 'PROTECTED', 'GUARDED', 'OKAY'] },
  { word: 'RISK', synonyms: ['DANGER', 'PERIL', 'HAZARD', 'THREAT', 'GAMBLE'] },
  { word: 'LUCK', synonyms: ['CHANCE', 'FATE', 'FORTUNE', 'LOT', 'KARMA'] },
  { word: 'IDEA', synonyms: ['THOUGHT', 'NOTION', 'CONCEPT', 'PLAN', 'THEORY'] },
  { word: 'FACT', synonyms: ['TRUTH', 'REALITY', 'DETAIL', 'DATA', 'PROOF'] },
  { word: 'LIE', synonyms: ['FIB', 'TALE', 'FALSE', 'MYTH', 'FAKE'] },
  { word: 'STORY', synonyms: ['TALE', 'NARRATIVE', 'ACCOUNT', 'SAGA', 'YARN'] },
  { word: 'MOVIE', synonyms: ['FILM', 'FLICK', 'CINEMA', 'SHOW', 'VIDEO'] },
  { word: 'PHONE', synonyms: ['MOBILE', 'CELL', 'HANDSET', 'DEVICE', 'CALL'] },
  { word: 'EMAIL', synonyms: ['MAIL', 'MESSAGE', 'NOTE', 'SEND', 'INBOX'] },
  { word: 'INTERNET', synonyms: ['WEB', 'ONLINE', 'NET', 'CYBER', 'LINK'] },
  { word: 'COMPUTER', synonyms: ['PC', 'LAPTOP', 'DEVICE', 'MACHINE', 'TECH'] },
  { word: 'CODE', synonyms: ['SCRIPT', 'PROGRAM', 'LOGIC', 'HACK', 'APP'] },
  { word: 'DOCTOR', synonyms: ['MEDIC', 'PHYSICIAN', 'HEALER', 'NURSE', 'CLINIC'] },
  { word: 'SICK', synonyms: ['ILL', 'UNWELL', 'AILING', 'WEAK', 'FEVER'] },
  { word: 'HEALTH', synonyms: ['FITNESS', 'WELLNESS', 'VIGOR', 'SOUND', 'STRONG'] },
  { word: 'PAIN', synonyms: ['ACHE', 'HURT', 'STING', 'THROB', 'SORE'] },
  { word: 'CURE', synonyms: ['HEAL', 'FIX', 'REMEDY', 'TREAT', 'MEND'] },
  { word: 'KING', synonyms: ['RULER', 'MONARCH', 'LORD', 'CROWN', 'ROYAL'] },
  { word: 'QUEEN', synonyms: ['RULER', 'MONARCH', 'ROYAL', 'LADY', 'CROWN'] },
  { word: 'CITY', synonyms: ['TOWN', 'URBAN', 'METRO', 'CAPITAL', 'PLACE'] },
  { word: 'COUNTRY', synonyms: ['NATION', 'STATE', 'LAND', 'REALM', 'HOME'] },
  { word: 'WORLD', synonyms: ['EARTH', 'GLOBE', 'PLANET', 'REALM', 'UNIVERSE'] },
  { word: 'NORTH', synonyms: ['UP', 'POLAR', 'ARCTIC', 'TOP', 'BEARING'] },
  { word: 'SOUTH', synonyms: ['DOWN', 'POLAR', 'TROPIC', 'LOW', 'BEARING'] },
  { word: 'EAST', synonyms: ['ORIENT', 'SUNRISE', 'RIGHT', 'ASIA', 'BEARING'] },
  { word: 'WEST', synonyms: ['OCCIDENT', 'SUNSET', 'LEFT', 'BEARING', 'WILD'] },
  { word: 'RED', synonyms: ['CRIMSON', 'SCARLET', 'RUBY', 'ROSE', 'MAROON'] },
  { word: 'BLUE', synonyms: ['AZURE', 'NAVY', 'COBALT', 'SKY', 'TEAL'] },
  { word: 'GREEN', synonyms: ['LIME', 'OLIVE', 'EMERALD', 'MINT', 'JADE'] },
  { word: 'YELLOW', synonyms: ['GOLD', 'AMBER', 'LEMON', 'SUNNY', 'CANARY'] },
  { word: 'BLACK', synonyms: ['DARK', 'EBONY', 'INKY', 'JET', 'SHADOW'] },
  { word: 'WHITE', synonyms: ['PALE', 'IVORY', 'SNOW', 'LIGHT', 'PURE'] },
  { word: 'LOUDLY', synonyms: ['ALOUD', 'NOISY', 'BLARING', 'BOOMING', 'YELL'] },
  { word: 'SOFTLY', synonyms: ['GENTLY', 'QUIET', 'MILD', 'LIGHT', 'HUSH'] },
  { word: 'OFTEN', synonyms: ['FREQUENT', 'USUAL', 'REGULAR', 'COMMON', 'MUCH'] },
  { word: 'RARELY', synonyms: ['SELDOM', 'HARDLY', 'SCARCE', 'UNUSUAL', 'FEW'] },
  { word: 'ALWAYS', synonyms: ['FOREVER', 'EVER', 'CONSTANT', 'EACH', 'ALL'] },
  { word: 'NEVER', synonyms: ['NOT', 'NONE', 'ZERO', 'WITHOUT', 'NO'] },
  { word: 'MAYBE', synonyms: ['PERHAPS', 'POSSIBLE', 'MIGHT', 'COULD', 'CHANCE'] },
  { word: 'SURE', synonyms: ['CERTAIN', 'POSITIVE', 'FIRM', 'CONFIDENT', 'YES'] },
  { word: 'DOUBT', synonyms: ['UNSURE', 'QUESTION', 'SUSPECT', 'HESITATE', 'FEAR'] },
  { word: 'PROBLEM', synonyms: ['ISSUE', 'TROUBLE', 'FAULT', 'BUG', 'SNAG'] },
  { word: 'SOLUTION', synonyms: ['ANSWER', 'FIX', 'RESOLVE', 'CURE', 'KEY'] },
  { word: 'PLAN', synonyms: ['SCHEME', 'PLOT', 'IDEA', 'MAP', 'DESIGN'] },
  { word: 'GOAL', synonyms: ['AIM', 'TARGET', 'END', 'MARK', 'QUEST'] },
  { word: 'WINNER', synonyms: ['CHAMP', 'HERO', 'VICTOR', 'BEST', 'TOP'] },
  { word: 'LOSER', synonyms: ['FAIL', 'LAST', 'BOTTOM', 'OUT', 'BEATEN'] },
  { word: 'FASTEST', synonyms: ['SPEEDY', 'QUICK', 'RAPID', 'SWIFT', 'HASTY'] },
  { word: 'STRONGEST', synonyms: ['TOUGH', 'MIGHTY', 'ROBUST', 'HARDY', 'FIRM'] },
  { word: 'SMARTEST', synonyms: ['WISE', 'BRIGHT', 'CLEVER', 'SHARP', 'GENIUS'] },
  { word: 'BEST', synonyms: ['TOP', 'FINEST', 'GREAT', 'PRIME', 'PEAK'] },
  { word: 'WORST', synonyms: ['BAD', 'LOW', 'POOR', 'AWFUL', 'LAST'] },
  { word: 'FIRST', synonyms: ['INITIAL', 'OPENING', 'LEAD', 'TOP', 'PRIME'] },
  { word: 'LAST', synonyms: ['FINAL', 'END', 'LATEST', 'TAIL', 'CLOSE'] },
  { word: 'NEXT', synonyms: ['FOLLOW', 'SOON', 'AFTER', 'THEN', 'LATER'] },
  { word: 'BEFORE', synonyms: ['PRIOR', 'EARLY', 'AGO', 'PAST', 'FRONT'] },
  { word: 'AFTER', synonyms: ['LATER', 'NEXT', 'FOLLOW', 'THEN', 'POST'] },
  { word: 'ABOVE', synonyms: ['OVER', 'HIGH', 'TOP', 'BEYOND', 'UP'] },
  { word: 'BELOW', synonyms: ['UNDER', 'LOW', 'DOWN', 'BENEATH', 'BASE'] },
  { word: 'INSIDE', synonyms: ['INNER', 'WITHIN', 'INTERNAL', 'IN', 'CORE'] },
  { word: 'OUTSIDE', synonyms: ['OUTER', 'EXTERNAL', 'OUT', 'BEYOND', 'OPEN'] },
];

const CLUE_BANK = [...SYNONYM_BANK, ...EXTRA_SYNONYM_BANK];

const CLUE_TEMPLATES = word => {
  const w = String(word || '').toLowerCase();
  const variants = [
    `Another word for ${w}`,
    `A synonym of ${w}`,
    `Find a word similar to ${w}`,
    `What is another word for ${w}?`,
    `Say a word that means the same as ${w}`,
  ];
  return variants[Math.floor(Math.random() * variants.length)];
};

const normalizeAnswer = value =>
  String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, '');

const pickEntry = () => CLUE_BANK[Math.floor(Math.random() * CLUE_BANK.length)];

const buildChallenge = (_learningLanguage = 'English', aiItems = null) => {
  if (Array.isArray(aiItems) && aiItems.length) {
    const item = pickAi(aiItems);
    return {
      id: `wd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      ai: true,
      clue: item.clue.text,
      clueRoman: item.clue.roman || '',
      base: '',
      accepted: acceptedForms([item.answer, ...(item.alternatives || [])]),
    };
  }
  const entry = pickEntry();
  const accepted = [...new Set(entry.synonyms.map(normalizeAnswer).filter(w => w.length >= 2))];
  return {
    id: `wd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    clue: CLUE_TEMPLATES(entry.word),
    base: normalizeAnswer(entry.word),
    accepted,
  };
};

const serializeChallenge = challenge => ({
  id: challenge.id,
  clue: challenge.clue,
  clueRoman: challenge.clueRoman || '',
});

const isCorrectAnswer = (challenge, answer) => {
  if (challenge.ai) {
    const normalized = normalizeAnyAnswer(answer);
    return Boolean(normalized) && challenge.accepted.includes(normalized);
  }
  const normalized = normalizeAnswer(answer);
  if (!normalized || normalized.length < 2) {
    return false;
  }
  if (normalized === challenge.base) {
    return false;
  }
  return challenge.accepted.includes(normalized);
};

const pickBotAnswer = (challenge, shouldBeCorrect = true) => {
  const pool = challenge.accepted.filter(word => word.length >= (challenge.ai ? 1 : 2));
  if (shouldBeCorrect || pool.length === 0) {
    return pool[Math.floor(Math.random() * pool.length)] || 'WORD';
  }
  return `WRONG${Math.floor(Math.random() * 90)}`;
};

const calcWordDetectiveExp = (finalScore, rank = 5) => {
  const safeScore = Math.max(0, Number(finalScore) || 0);
  const base = Math.floor(safeScore / 10);
  const winBonus = rank === 1 ? 3 : rank === 2 ? 1 : 0;
  return Math.max(safeScore > 0 ? 1 : 0, base + winBonus);
};

module.exports = {
  CLUE_COUNT: CLUE_BANK.length,
  MATCH_DURATION_MS: 5 * 60 * 1000,
  POINTS_CORRECT: 15,
  POINTS_WRONG: 5,
  buildChallenge,
  serializeChallenge,
  isCorrectAnswer,
  normalizeAnswer,
  pickBotAnswer,
  randomBotName,
  calcWordDetectiveExp,
};
