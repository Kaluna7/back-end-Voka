const { normalizeLearningLanguage } = require('../config/learningLanguage');

const SCRIPT_PATTERNS = {
  kana: /[\u3040-\u30ff]/g,
  han: /[\u4e00-\u9fff]/g,
  hangul: /[\uac00-\ud7af\u1100-\u11ff]/g,
  arabic: /[\u0600-\u06ff]/g,
  devanagari: /[\u0900-\u097f]/g,
  latin: /[a-zA-Z\u00c0-\u024f]/g,
};

const SCRIPT_LANGUAGES = {
  Japanese: ['kana', 'han'],
  Chinese: ['han'],
  Korean: ['hangul'],
  Arabic: ['arabic'],
  Hindi: ['devanagari'],
};

const STOPWORDS = {
  English: 'the a an is are was were i you he she it we they my your this that what how do does did not and but with for to of in on have has can will would im its dont yes no please thanks hello',
  Indonesian: 'aku saya kamu dia kita kami mereka yang dan di ke dari ini itu apa bagaimana tidak bukan ada sudah belum mau bisa dengan untuk juga ya iya gak nggak aja dong sih kok lagi banget',
  Spanish: 'el la los las un una es son yo tu usted que de en y por para con no si como estoy eres esta pero muy gracias hola',
  Portuguese: 'o os um uma eu voce ele ela que de em e por para com nao sim como estou esta mas muito obrigado ola',
  French: 'le la les un une est sont je tu vous il elle que de en et pour avec ne pas oui comment suis mais tres merci bonjour',
  German: 'der die das ein eine ist sind ich du sie er es und nicht ja wie mit fur zu von auf aber sehr danke hallo',
  Dutch: 'de het een is zijn ik jij je hij zij wij en niet ja hoe met voor van op maar heel dank hallo',
  Italian: 'il lo la gli le un una e sono io tu lui lei che di in per con non si come sto ma molto grazie ciao',
};

const STOPWORD_SETS = Object.fromEntries(
  Object.entries(STOPWORDS).map(([language, words]) => [language, new Set(words.split(' '))]),
);

const countMatches = (text, pattern) => (text.match(pattern) || []).length;

const normalizeWord = word =>
  word
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z]/g, '');

/**
 * Returns whether `message` looks like it is written in `learningLanguage`.
 * Short or ambiguous text (no script or stopword signal) counts as a match so
 * greetings like "ok" are not punished.
 */
const isMessageInLearningLanguage = (message, learningLanguage) => {
  const text = String(message || '');
  const language = normalizeLearningLanguage(learningLanguage);
  const scriptCounts = Object.fromEntries(
    Object.entries(SCRIPT_PATTERNS).map(([key, pattern]) => [key, countMatches(text, pattern)]),
  );
  const letterTotal = Object.values(scriptCounts).reduce((sum, value) => sum + value, 0);
  if (letterTotal === 0) {
    return true;
  }

  const targetScripts = SCRIPT_LANGUAGES[language];
  if (targetScripts) {
    const targetCount = targetScripts.reduce((sum, key) => sum + scriptCounts[key], 0);
    if (language === 'Chinese' && scriptCounts.kana > 0) {
      return false;
    }
    return targetCount / letterTotal >= 0.4;
  }

  if (scriptCounts.latin / letterTotal < 0.6) {
    return false;
  }

  const targetSet = STOPWORD_SETS[language];
  if (!targetSet) {
    return true;
  }
  const words = text.split(/\s+/).map(normalizeWord).filter(Boolean);
  const hits = Object.fromEntries(
    Object.entries(STOPWORD_SETS).map(([key, set]) => [
      key,
      words.filter(word => set.has(word)).length,
    ]),
  );
  const targetHits = hits[language] || 0;
  const bestOther = Math.max(
    0,
    ...Object.entries(hits)
      .filter(([key]) => key !== language)
      .map(([, value]) => value),
  );
  if (targetHits === 0 && bestOther === 0) {
    return true;
  }
  return targetHits >= bestOther;
};

module.exports = { isMessageInLearningLanguage };
