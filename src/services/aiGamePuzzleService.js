const { getEnv } = require('../config/env');
const { normalizeLearningLanguage } = require('../config/learningLanguage');
const { GamePuzzleSet } = require('../models/GamePuzzleSet');
const { resolveDeepseekModel, applyDeepseekThinking } = require('./deepseekService');

/**
 * AI-written game questions in the player's learning language.
 *
 * - English keeps the hand-written banks (they are already good).
 * - Every other language gets questions from DeepSeek in the same shape the game uses.
 * - Languages with their own script also get a Latin reading ("roman") for each text,
 *   shown under the native text in the app. Latin-script languages don't need one.
 * - Sets are stored in MongoDB, so each game/language only waits for the AI once.
 */

/** Learning languages written in a non-Latin script, and how to romanize them. */
const ROMANIZATION = {
  Japanese: 'Hepburn romaji (e.g. "ookii")',
  Chinese: 'Hanyu Pinyin with tone marks (e.g. "dà")',
  Korean: 'Revised Romanization of Korean (e.g. "keuda")',
  Arabic: 'a simple Latin transliteration (e.g. "kabeer")',
  Hindi: 'a simple Latin transliteration without diacritics (e.g. "bada")',
  Russian: 'a simple Latin transliteration (e.g. "bolshoy")',
  Thai: 'the Royal Thai General System of transcription',
  Greek: 'a simple Latin transliteration',
  Hebrew: 'a simple Latin transliteration',
};

const needsRoman = language => Boolean(ROMANIZATION[language]);

/** Story Rush counts spoken words split by spaces; scripts without spaces don't fit. */
const NO_WORD_SPACES = new Set(['Japanese', 'Chinese', 'Thai']);

/**
 * Beginner-friendly writing per language, added to every prompt. Learners are beginners,
 * so the native script must be easy to read (no rare kanji/hanzi).
 */
const BEGINNER_SCRIPT_RULES = {
  Japanese:
    'Learners are beginners (JLPT N5). Write the native text the way beginners learn it: mostly hiragana and katakana, ' +
    'using only the simplest N5 kanji (like 日, 月, 火, 水, 木, 金, 土, 山, 川, 大, 小, 人, 口, 目, 手, 上, 下, 中, 学, 生, 先, 本). ' +
    'If a word normally uses harder kanji, write it in hiragana instead. Prefer common everyday words.',
  Chinese:
    'Learners are beginners (HSK 1-2). Use only simplified characters from HSK 1-2 vocabulary and very common everyday words.',
  Korean: 'Learners are beginners (TOPIK I). Use only common everyday Hangul words beginners learn first.',
  Arabic: 'Learners are beginners. Use only common everyday Modern Standard Arabic words.',
  Hindi: 'Learners are beginners. Use only common everyday Hindi words in Devanagari.',
  Russian: 'Learners are beginners. Use only common everyday Russian words.',
  Thai: 'Learners are beginners. Use only common everyday Thai words.',
};

const beginnerRules = language =>
  BEGINNER_SCRIPT_RULES[language] ||
  `Learners are beginners (A1-A2). Use only common everyday ${language} words.`;

const MIN_ITEMS = 12;
/** Sets grow in the background up to this size so long matches don't run out. */
const TARGET_ITEMS = 72;
const TOP_UP_COOLDOWN_MS = 10 * 60 * 1000;
const lastTopUp = new Map();
const GENERATE_TIMEOUT_MS = 60000;

const str = (value, max = 160) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

/** { text, roman } where roman is required only for non-Latin scripts. */
const textPair = (value, language, max = 160) => {
  if (typeof value === 'string') {
    value = { text: value };
  }
  const text = str(value?.text, max);
  if (!text) {
    return null;
  }
  const roman = needsRoman(language) ? str(value?.roman, max) : '';
  if (needsRoman(language) && !roman) {
    return null;
  }
  return roman ? { text, roman } : { text };
};

const pairList = (list, language, min, max = 60) => {
  if (!Array.isArray(list)) {
    return null;
  }
  const pairs = list.map(item => textPair(item, language, max)).filter(Boolean);
  return pairs.length >= min ? pairs : null;
};

const pairFormat = language =>
  needsRoman(language)
    ? `{"text": "<${language} in native script>", "roman": "<reading in ${ROMANIZATION[language]}>"}`
    : `{"text": "<${language} text>"}`;

/** Per game: how many items per AI call, the instructions, and a validator/normalizer. */
const SPECS = {
  sudoword: {
    batch: 30,
    prompt: language => `Create 30 different common ${language} words for a "fill the missing letter" game.
Rules: every "word" has 4 to 6 letters using only A-Z (no accents, no spaces).${
      needsRoman(language)
        ? ` ${language} is not written in Latin letters, so "word" is the romanized form (${ROMANIZATION[language]}) and "native" is the same word in ${language} script.`
        : ` Use real ${language} words (replace accented letters with the plain letter).`
    }
JSON: {"items": [{"word": "ABCDE"${needsRoman(language) ? ', "native": "<native script>"' : ''}}]}`,
    validate: (item, language) => {
      const word = str(item?.word, 10).toUpperCase();
      // The letter boxes flex, so 4-6 letters fit (exactly 5 was too strict for romanized words).
      if (!/^[A-Z]{4,6}$/.test(word)) {
        return null;
      }
      const native = needsRoman(language) ? str(item?.native, 20) : '';
      return native ? { word, native } : { word };
    },
  },
  synoword: {
    batch: 24,
    prompt: language => `Create 24 ${language} vocabulary items for a synonym game.
Each item: a common ${language} word and 1 to 4 single-word ${language} synonyms (all real ${language}, never English).
Each text uses this format: ${pairFormat(language)}
JSON: {"items": [{"word": <text>, "answers": [<text>, ...]}]}`,
    validate: (item, language) => {
      const word = textPair(item?.word, language, 40);
      // Beginner words often have just one common synonym/opposite, so one is enough.
      const answers = pairList(item?.answers, language, 1, 40);
      return word && answers ? { word, answers } : null;
    },
  },
  antoword: {
    batch: 24,
    prompt: language => `Create 24 ${language} vocabulary items for an antonym (opposite) game.
Each item: a common ${language} word and 1 to 4 single-word ${language} antonyms (all real ${language}, never English).
Each text uses this format: ${pairFormat(language)}
JSON: {"items": [{"word": <text>, "answers": [<text>, ...]}]}`,
    validate: (item, language) => {
      const word = textPair(item?.word, language, 40);
      // Beginner words often have just one common synonym/opposite, so one is enough.
      const answers = pairList(item?.answers, language, 1, 40);
      return word && answers ? { word, answers } : null;
    },
  },
  wordDetective: {
    batch: 24,
    prompt: language => `Create 24 ${language} riddles for a "guess the word" game.
Each item: a short ${language} clue (one sentence, does NOT contain the answer), the ${language} answer word, and 0 to 3 other ${language} words that also fit.
Each text uses this format: ${pairFormat(language)}
JSON: {"items": [{"clue": <text>, "answer": <text>, "alternatives": [<text>, ...]}]}`,
    validate: (item, language) => {
      const clue = textPair(item?.clue, language, 200);
      const answer = textPair(item?.answer, language, 40);
      const alternatives = pairList(item?.alternatives || [], language, 0, 40) || [];
      return clue && answer ? { clue, answer, alternatives } : null;
    },
  },
  wordsense: {
    batch: 24,
    prompt: language => `Create 24 ${language} multiple-choice vocabulary questions.
Each item: a simple ${language} definition, the correct ${language} word, and exactly 3 wrong but plausible ${language} words.
Each text uses this format: ${pairFormat(language)}
JSON: {"items": [{"definition": <text>, "correct": <text>, "wrong": [<text>, <text>, <text>]}]}`,
    validate: (item, language) => {
      const definition = textPair(item?.definition, language, 200);
      const correct = textPair(item?.correct, language, 40);
      const wrong = pairList(item?.wrong, language, 3, 40);
      return definition && correct && wrong ? { definition, correct, wrong: wrong.slice(0, 3) } : null;
    },
  },
  contextMaster: {
    batch: 24,
    prompt: language => `Create 24 ${language} fill-in-the-blank questions.
Each item: a natural ${language} sentence with exactly one blank written as "___", the correct ${language} word for the blank, and exactly 2 wrong ${language} words.
If a reading is required, the reading of the sentence must also contain "___" where the blank is.
Each text uses this format: ${pairFormat(language)}
JSON: {"items": [{"sentence": <text>, "correct": <text>, "wrong": [<text>, <text>]}]}`,
    validate: (item, language) => {
      const sentence = textPair(item?.sentence, language, 220);
      const correct = textPair(item?.correct, language, 40);
      const wrong = pairList(item?.wrong, language, 2, 40);
      if (!sentence || !correct || !wrong || !sentence.text.includes('___')) {
        return null;
      }
      return { sentence, correct, wrong: wrong.slice(0, 2) };
    },
  },
  sentenceBuilder: {
    batch: 24,
    prompt: language => `Create 24 natural everyday ${language} sentences for a "put the words in order" game.
Split each sentence into 4 to 9 word pieces in the correct order (for languages written without spaces, split into natural word units).
Each piece uses this format: ${pairFormat(language)}
JSON: {"items": [{"words": [<piece>, <piece>, ...]}]}`,
    validate: (item, language) => {
      const words = pairList(item?.words, language, 4, 30);
      return words && words.length <= 9 ? { words } : null;
    },
  },
  storyRush: {
    batch: 8,
    skip: language => NO_WORD_SPACES.has(language),
    prompt: language => `Write 8 short ${language} stories to read aloud (40 to 60 words each, simple everyday language, words separated by spaces).
Each story has a title and a body. Each text uses this format: ${pairFormat(language)}
JSON: {"items": [{"title": <text>, "body": <text>}]}`,
    validate: (item, language) => {
      const title = textPair(item?.title, language, 80);
      const body = textPair(item?.body, language, 900);
      if (!title || !body) {
        return null;
      }
      const words = body.text.split(/\s+/).filter(Boolean).length;
      return words >= 25 && words <= 90 ? { title, body } : null;
    },
  },
};

const memoryCache = new Map();
const inflight = new Map();
const cacheKey = (gameKey, language) => `${gameKey}:${language}`;

const callDeepseekJson = async prompt => {
  const apiKey = getEnv('DEEPSEEK_API_KEY');
  if (!apiKey) {
    return null;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GENERATE_TIMEOUT_MS);
  const payload = {
    model: resolveDeepseekModel(false),
    stream: false,
    temperature: 0.9,
    max_tokens: 7000,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          'You write accurate, natural language-learning game content for beginner learners (A1 to A2 level). ' +
          'Every word must be real and correctly spelled. Never repeat an item. Reply with JSON only.',
      },
      { role: 'user', content: prompt },
    ],
  };
  applyDeepseekThinking(payload, true);
  try {
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      console.warn('[ai-puzzles] DeepSeek status', response.status);
      return null;
    }
    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content || '';
    return JSON.parse(content.slice(content.indexOf('{'), content.lastIndexOf('}') + 1));
  } catch (error) {
    console.warn('[ai-puzzles] generation failed', error?.message);
    return null;
  } finally {
    clearTimeout(timeout);
  }
};

const itemSignature = item => JSON.stringify(item).toLowerCase();

const generateItems = async (gameKey, language) => {
  const spec = SPECS[gameKey];
  const json = await callDeepseekJson(`${spec.prompt(language)}

${beginnerRules(language)}`);
  const raw = Array.isArray(json?.items) ? json.items : [];
  const seen = new Set();
  return raw
    .map(item => spec.validate(item, language))
    .filter(item => {
      if (!item) {
        return false;
      }
      const signature = itemSignature(item);
      if (seen.has(signature)) {
        return false;
      }
      seen.add(signature);
      return true;
    });
};

/** True when this game should use AI questions for this language. */
const usesAiPuzzles = (gameKey, learningLanguage) => {
  const language = normalizeLearningLanguage(learningLanguage);
  const spec = SPECS[gameKey];
  return Boolean(spec && language && language !== 'English' && !spec.skip?.(language));
};

/**
 * AI items for this game + language, generating (once) if needed.
 * Resolves to null when AI questions aren't used or can't be made (callers fall back to the built-in bank).
 */
const getGamePuzzles = async (gameKey, learningLanguage) => {
  if (!usesAiPuzzles(gameKey, learningLanguage)) {
    return null;
  }
  const language = normalizeLearningLanguage(learningLanguage);
  const key = cacheKey(gameKey, language);
  const cached = memoryCache.get(key);
  if (cached && cached.length >= MIN_ITEMS) {
    if (cached.length < TARGET_ITEMS) {
      topUpInBackground(gameKey, language, key);
    }
    return cached;
  }
  if (inflight.has(key)) {
    return inflight.get(key);
  }
  const task = (async () => {
    try {
      const stored = await GamePuzzleSet.findOne({ gameKey, language }).lean();
      if (stored?.items?.length >= MIN_ITEMS) {
        memoryCache.set(key, stored.items);
        return stored.items;
      }
      const items = await generateItems(gameKey, language);
      if (items.length < MIN_ITEMS / 2) {
        return stored?.items?.length ? stored.items : null;
      }
      const merged = [...(stored?.items || []), ...items];
      await GamePuzzleSet.updateOne(
        { gameKey, language },
        { $set: { items: merged } },
        { upsert: true },
      );
      memoryCache.set(key, merged);
      console.log(`[ai-puzzles] ${gameKey}/${language}: ${merged.length} items ready`);
      return merged;
    } catch (error) {
      console.warn('[ai-puzzles] load failed', error?.message);
      return null;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, task);
  return task;
};

/** Adds another AI batch (deduplicated) to a small set, at most every few minutes. */
function topUpInBackground(gameKey, language, key) {
  const now = Date.now();
  if (inflight.has(key) || now - (lastTopUp.get(key) || 0) < TOP_UP_COOLDOWN_MS) {
    return;
  }
  lastTopUp.set(key, now);
  generateItems(gameKey, language)
    .then(async fresh => {
      const current = memoryCache.get(key) || [];
      const seen = new Set(current.map(itemSignature));
      const additions = fresh.filter(item => !seen.has(itemSignature(item)));
      if (!additions.length) {
        return;
      }
      const merged = [...current, ...additions].slice(0, TARGET_ITEMS);
      memoryCache.set(key, merged);
      await GamePuzzleSet.updateOne({ gameKey, language }, { $set: { items: merged } }, { upsert: true });
      console.log(`[ai-puzzles] ${gameKey}/${language}: grew to ${merged.length} items`);
    })
    .catch(() => null);
}

/** Start preparing questions early (e.g. as soon as a player starts searching). */
const prewarmGamePuzzles = (gameKey, learningLanguage) => {
  getGamePuzzles(gameKey, learningLanguage).catch(() => null);
};

/**
 * Same as getGamePuzzles but gives up after `timeoutMs` so a match never waits forever.
 * The generation keeps going in the background for the next match.
 */
const getGamePuzzlesWithin = (gameKey, learningLanguage, timeoutMs) =>
  Promise.race([
    getGamePuzzles(gameKey, learningLanguage),
    new Promise(resolve => setTimeout(() => resolve(null), timeoutMs)),
  ]);

/**
 * Answer comparison that works for every script: Unicode-normalized, case-folded,
 * spaces/punctuation removed; Latin text also loses accents ("café" = "cafe").
 */
const normalizeAnyAnswer = value => {
  let text = String(value || '').normalize('NFKC').toLowerCase();
  text = text.replace(/[\s\p{P}\p{S}]/gu, '');
  if (/^[\p{Script=Latin}\d]+$/u.test(text)) {
    text = text.normalize('NFD').replace(/\p{M}/gu, '');
  }
  return text;
};

/** Accepted answers for a list of { text, roman } (both forms count). */
const acceptedForms = pairs => {
  const forms = new Set();
  (pairs || []).forEach(pair => {
    [pair?.text, pair?.roman].forEach(form => {
      const normalized = normalizeAnyAnswer(form);
      if (normalized) {
        forms.add(normalized);
      }
    });
  });
  return [...forms];
};

module.exports = {
  getGamePuzzles,
  getGamePuzzlesWithin,
  prewarmGamePuzzles,
  usesAiPuzzles,
  normalizeAnyAnswer,
  acceptedForms,
  needsRoman,
};
