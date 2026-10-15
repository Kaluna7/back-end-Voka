const { getEnv } = require('../config/env');
const { resolveDeepseekModel, applyDeepseekThinking } = require('./deepseekService');

/**
 * Second opinion for typed answers that aren't in a question's answer list.
 *
 * AI-written (and hand-written) questions only list a few accepted answers, so a different
 * but correct synonym / antonym / riddle answer / word order used to be marked wrong.
 * Before marking it wrong, ask the AI (fast, no thinking, short timeout). On any failure the
 * answer stays wrong, exactly like before. Verdicts are cached.
 */

const JUDGE_TIMEOUT_MS = 2800;
const CACHE_LIMIT = 5000;
const cache = new Map();

/** Players may type the Latin reading instead of the native script ("jakda" for 작다). */
const ROMAN_NOTE = language =>
  language === 'English'
    ? ''
    : `
If the answer is written in Latin letters, first read it as a romanization of a ${language} word (any common romanization, with or without tone marks or long-vowel marks) and grade that word.`;

const TASKS = {
  synoword: ({ language, prompt, answer, accepted }) =>
    `Game: type a ${language} SYNONYM of the word "${prompt}".
Known correct answers: ${accepted.join(', ') || '(none)'}.
The player typed: "${answer}".
Is the player's answer a real ${language} word (or its romanized reading) with the same or very similar meaning as "${prompt}", usable as a synonym? Spelling variants, other inflections of a correct answer and the romanized reading count as correct. The same word as "${prompt}", unrelated words, misspelled non-words and words from another language are wrong.${ROMAN_NOTE(language)}`,
  antoword: ({ language, prompt, answer, accepted }) =>
    `Game: type a ${language} ANTONYM (opposite) of the word "${prompt}".
Known correct answers: ${accepted.join(', ') || '(none)'}.
The player typed: "${answer}".
Is the player's answer a real ${language} word (or its romanized reading) that means the opposite of "${prompt}"? Spelling variants, other inflections of a correct answer and the romanized reading count as correct. Unrelated words, synonyms, misspelled non-words and words from another language are wrong.${ROMAN_NOTE(language)}`,
  wordDetective: ({ language, prompt, answer, accepted }) =>
    `Game: guess the ${language} word from this clue: "${prompt}".
Known correct answers: ${accepted.join(', ') || '(none)'}.
The player typed: "${answer}".
Does the player's answer correctly and naturally fit the clue as well as the known answers do (a real ${language} word, a spelling variant, another inflection, or its romanized reading)? Vague, unrelated or misspelled non-words are wrong.${ROMAN_NOTE(language)}`,
  sentenceBuilder: ({ language, prompt, answer }) =>
    `Game: put ${language} word pieces in the right order. The expected sentence is: "${prompt}".
The player built: "${answer}" (same pieces, possibly another order).
Is the player's sentence also fully grammatical, natural ${language} with the same meaning? Many languages (for example Korean, Japanese, German, Russian) allow several word orders, e.g. time and place phrases can swap. Judge it as a standard written sentence (not casual speech with afterthoughts): the language's basic rules must hold, e.g. in Korean and Japanese the verb stays at the end. Any order a native speaker would write and accept counts as correct; orders that are ungrammatical, unnatural or change the meaning are wrong.`,
};

const askJudge = async question => {
  const apiKey = getEnv('DEEPSEEK_API_KEY');
  if (!apiKey) {
    return null;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), JUDGE_TIMEOUT_MS);
  const payload = {
    model: resolveDeepseekModel(false),
    stream: false,
    temperature: 0,
    max_tokens: 20,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          'You are a strict but fair language teacher grading a vocabulary game. ' +
          'Reply with JSON only: {"correct": true} or {"correct": false}.',
      },
      { role: 'user', content: question },
    ],
  };
  // Grading must be fast: never spend the budget on thinking.
  applyDeepseekThinking(payload, true);
  try {
    const res = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      return null;
    }
    const data = await res.json();
    const content = String(data?.choices?.[0]?.message?.content || '');
    const json = JSON.parse(content.slice(content.indexOf('{'), content.lastIndexOf('}') + 1));
    return json?.correct === true;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

/**
 * @param {object} args
 * @param {'synoword'|'antoword'|'wordDetective'|'sentenceBuilder'} args.game
 * @param {string} args.language learning language
 * @param {string} args.prompt the question word / clue / expected sentence
 * @param {string} args.answer what the player typed or built
 * @param {string[]} [args.accepted] answers already known to be correct
 * @returns {Promise<boolean>}
 */
const judgeAnswer = async ({ game, language, prompt, answer, accepted = [] }) => {
  const task = TASKS[game];
  const cleanAnswer = String(answer || '').trim().slice(0, 120);
  const cleanPrompt = String(prompt || '').trim().slice(0, 300);
  if (!task || !cleanAnswer || !cleanPrompt) {
    return false;
  }
  const key = `${game}|${language}|${cleanPrompt.toLowerCase()}|${cleanAnswer.toLowerCase()}`;
  if (cache.has(key)) {
    return cache.get(key);
  }
  const verdict = await askJudge(
    task({
      language: language || 'English',
      prompt: cleanPrompt,
      answer: cleanAnswer,
      accepted: accepted.slice(0, 12).map(item => String(item).slice(0, 60)),
    }),
  );
  if (verdict === null) {
    // Timeout / API error: keep the old behaviour (wrong) but don't remember it.
    return false;
  }
  if (cache.size >= CACHE_LIMIT) {
    cache.delete(cache.keys().next().value);
  }
  cache.set(key, verdict);
  return verdict;
};

module.exports = { judgeAnswer };
