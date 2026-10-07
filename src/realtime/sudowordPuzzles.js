const { normalizeAnyAnswer, acceptedForms } = require('../services/aiGamePuzzleService');
const pickAi = items => items[Math.floor(Math.random() * items.length)];
const WORD_BANK = [
  'APPLE',
  'HOUSE',
  'WATER',
  'LEARN',
  'STUDY',
  'WORLD',
  'HEART',
  'DREAM',
  'SMILE',
  'LIGHT',
  'NIGHT',
  'CHAIR',
  'PAPER',
  'GRADE',
  'PLANT',
  'BREAD',
  'CLOUD',
  'DANCE',
  'EARTH',
  'FLAME',
  'GRAPE',
  'HAPPY',
  'IMAGE',
  'JUICE',
  'KNIFE',
  'LEMON',
  'MUSIC',
  'OCEAN',
  'PEACE',
  'QUEEN',
  'RIVER',
  'STONE',
  'TABLE',
  'UNITY',
  'VOICE',
  'WATCH',
  'YOUTH',
  'ZEBRA',
  'BRAIN',
  'CLEAN',
  'DRINK',
  'ENJOY',
  'FOCUS',
  'GREEN',
  'HONOR',
  'IDEAL',
  'JOKER',
  'KNOWS',
  'LUNCH',
  'MAGIC',
  'ANGEL',
  'BEACH',
  'CANDY',
  'DELTA',
  'EAGLE',
  'FAITH',
  'GLOBE',
  'HOTEL',
  'IVORY',
  'JOLLY',
  'KARMA',
  'METAL',
  'NURSE',
  'OLIVE',
  'PIANO',
  'QUICK',
  'RADIO',
  'SWEET',
  'TIGER',
  'ULTRA',
  'VITAL',
  'WHEAT',
  'YACHT',
  'ZESTY',
  'AROMA',
  'BLAZE',
  'CRANE',
  'DRAFT',
  'ELBOW',
  'FROST',
  'GHOST',
  'HUMOR',
  'INBOX',
  'JAZZY',
  'KNEEL',
  'LAYER',
  'MANGO',
  'NOBLE',
  'OZONE',
  'PUPIL',
  'QUILT',
  'ROAST',
  'SPARK',
  'TULIP',
  'URBAN',
  'VIVID',
  'WHALE',
  'ZONAL',
  'ALBUM',
  'BLOOM',
];

const BOT_NAMES = [
  // Lucu
  'Mochi',
  'Bubu',
  'Neko酱',
  'Poyo',
  '豆豆',
  '喵喵',
  'Chibi',
  'Pickle',
  'Noodle',
  'Zuzu',
  // Japan (JP)
  'ゆき',
  'さくら',
  'そら',
  'もも',
  'ひなた',
  'りく',
  'あおい',
  'ゆずき',
  'みかん',
  'たろう',
  'けんた',
  'ななみ',
  'はると',
  'そうた',
  'めい',
  // Korea (KR)
  '지수',
  '민호',
  '유나',
  '준우',
  '하은',
  '서연',
  '민지',
  '다솜',
  '태양',
  '지원',
  '하윤',
  '서준',
  '은비',
  '예준',
  '수빈',
  // China (ZH)
  '小明',
  '美玲',
  '雨桐',
  '子涵',
  '浩然',
  '乐乐',
  '琪琪',
  '欣怡',
  '子轩',
  '晨曦',
  '一诺',
  '思远',
  '佳怡',
  '俊杰',
  '诗涵',
  // Lucu (latin)
  'NekoPaw',
  'DouDou',
  'MiaoMiao',
  'Beanie',
  'CocoPop',
  'Fizz',
  'Tibu',
  'Lulu',
  'Mimi',
  'Pip',
  // Jahil
  'TrollGemes',
  'NgakakBro',
  'KangTroll',
  'PrankFox',
  'EZpzKid',
  'LagKing',
  'SneakyCat',
  'CampLurker',
  'RushBNow',
  'Tiltless',
  'NoobHunter',
  'ChaosBean',
  'Mischief',
  'kentang',
  'yakultt',
  'aku takut',
  'who are u',
  'drakula',
  'u',
  'sapi',
  'mouuu',
  // Nama player asli
  'Minho97',
  'LunaPlays',
  'CloudNine',
  'NeoRider',
  'KaiStream',
  'ZetaFox',
  'RioGamer',
  'ArinVN',
  'DewiRP',
  'RizkyOne',
  'SkyWalker',
  'NightOwl',
  'PixelNova',
  'ZeroCool',
  'AquaWolf',
  'StormKid',
  'VexPlay',
  // Japan (romaji)
  'Yuki',
  'Sakura',
  'Sora',
  'Momo',
  'Hinata',
  'Haruto',
  'Nanami',
  'Yuzuki',
  'Aoi',
  'Kenta',
  'Riku',
  'Haru',
  'Yuzu',
  'Kenji',
  'Mei',
  'Kaito',
  'Rin',
  // Korea (romanized)
  'Jisoo',
  'Minho',
  'Yuna',
  'Junwoo',
  'Haeun',
  'Jiwoo',
  'Somin',
  'Dasom',
  'Taeyang',
  'Hayoon',
  'Seojun',
  // China (pinyin)
  'Meilin',
  'Xiaoyu',
  'Yichen',
  'Zihan',
  'Liying',
  'Yuxuan',
  'Chenhao',
  'Weilin',
  'Xinyi',
  'Boyang',
  'Jiahao',
  'Ruolan',
  'Mingyu',
  'Qiqi',
  'Lele',
  'YuTong',
  'ChenHao',
  'JiaYi',
  'HaoRan',
];

const isPlayerLikeName = name => {
  const trimmed = String(name || '').trim();
  return (
    trimmed.length >= 2 &&
    !/bot|computer|cpu|npc|ai|guest|player\d|master|bozz/i.test(trimmed)
  );
};

const { getSudowordWordBank } = require('./puzzleLocales');

const WORD_LENGTH = 5;

const normalizeWord = value =>
  String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, '');

const isValidSudoword = word =>
  typeof word === 'string' && word.length === WORD_LENGTH && /^[A-Z]+$/.test(word);

const sanitizeWordBank = (bank, fallback = WORD_BANK) => {
  const cleaned = (Array.isArray(bank) ? bank : [])
    .map(normalizeWord)
    .filter(isValidSudoword);
  if (cleaned.length > 0) {
    return cleaned;
  }
  return fallback.map(normalizeWord).filter(isValidSudoword);
};

const pickWord = (bank = WORD_BANK) => {
  const safe = sanitizeWordBank(bank, WORD_BANK);
  return safe[Math.floor(Math.random() * safe.length)] || 'MANGO';
};

const buildChallenge = (learningLanguage = 'English', aiItems = null) => {
  if (Array.isArray(aiItems) && aiItems.length) {
    const item = pickAi(aiItems);
    const blank = Math.floor(Math.random() * item.word.length);
    return {
      id: `ch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      word: item.word,
      native: item.native || '',
      letters: item.word.split('').map((letter, index) => (index === blank ? null : letter)),
      blankIndex: blank,
      answer: item.word[blank],
    };
  }
  const localizedBank = getSudowordWordBank(learningLanguage);
  const bank = sanitizeWordBank(
    localizedBank && localizedBank.length > 0 ? localizedBank : WORD_BANK,
    WORD_BANK,
  );
  const word = pickWord(bank);
  const blankIndex = Math.floor(Math.random() * word.length);
  const letters = word.split('').map((letter, index) => (index === blankIndex ? null : letter));
  return {
    id: `ch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    word,
    letters,
    blankIndex,
    answer: word[blankIndex],
  };
};

const serializeChallenge = challenge => ({
  native: challenge.native || '',
  id: challenge.id,
  letters: challenge.letters,
  blankIndex: challenge.blankIndex,
});

const randomBotName = used => {
  const validNames = BOT_NAMES.filter(isPlayerLikeName);
  let pool = validNames.filter(name => !used.has(name));
  if (pool.length === 0) {
    pool = validNames;
  }
  const pick = pool[Math.floor(Math.random() * pool.length)] || `桃桃${100 + used.size}`;
  used.add(pick);
  return pick;
};

const calcSudowordExp = (finalScore, rank = 5) => {
  const safeScore = Math.max(0, Number(finalScore) || 0);
  const base = Math.floor(safeScore / 10);
  const winBonus = rank === 1 ? 3 : rank === 2 ? 1 : 0;
  return Math.max(safeScore > 0 ? 1 : 0, base + winBonus);
};

module.exports = {
  MATCH_DURATION_MS: 2 * 60 * 1000,
  POINTS_CORRECT: 15,
  POINTS_WRONG: 5,
  calcSudowordExp,
  buildChallenge,
  serializeChallenge,
  randomBotName,
};
