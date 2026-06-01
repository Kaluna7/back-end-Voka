const normalizeTranscript = text =>
  String(text || '')
    .replace(/\s+/g, ' ')
    .trim();

const countWords = text =>
  String(text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;

/** CJK + Japanese kana */
const CJK_CHAR_RE = /[\u3000-\u9fff\u3040-\u30ff\uac00-\ud7af]/g;

const isCjkHeavyText = text => {
  const clean = normalizeTranscript(text);
  if (!clean) {
    return false;
  }
  const cjkChars = (clean.match(CJK_CHAR_RE) || []).length;
  return cjkChars >= Math.max(2, Math.ceil(clean.length * 0.35));
};

/** Word / character units for voice turn triggers (all languages). */
const countTranscriptUnits = text => {
  const clean = normalizeTranscript(text);
  const words = countWords(clean);
  if (words >= 2) {
    return words;
  }
  if (isCjkHeavyText(clean)) {
    const cjkChars = (clean.match(CJK_CHAR_RE) || []).length;
    return Math.max(2, Math.ceil(cjkChars / 2));
  }
  const letters = clean.replace(/[^\p{L}\p{N}]/gu, '');
  if (letters.length >= 4) {
    return 2;
  }
  return words;
};

const meetsVoiceTriggerThreshold = (text, { minWords = 2, minSpeechFinalChars = 2, speechFinal = false } = {}) => {
  const clean = normalizeTranscript(text);
  if (!clean) {
    return false;
  }
  if (speechFinal) {
    return clean.length >= minSpeechFinalChars;
  }
  return countTranscriptUnits(clean) >= minWords;
};

/** Sentence boundaries across Latin, CJK, Arabic, Devanagari. */
const SENTENCE_END_RE = /[^.!?。！？؟।]+[.!?。！？؟।]+(?=\s|$)/g;
const CLAUSE_BREAK_RE = /^(.{4,}?[,，、;；:：،])\s*/u;

const takeCompletedSentences = text => {
  const source = String(text || '');
  const matches = source.match(SENTENCE_END_RE) || [];
  const complete = matches.map(item => item.trim()).filter(Boolean);
  const consumedLength = matches.join('').length;
  return {
    complete,
    rest: source.slice(consumedLength),
  };
};

module.exports = {
  normalizeTranscript,
  countWords,
  countTranscriptUnits,
  meetsVoiceTriggerThreshold,
  isCjkHeavyText,
  takeCompletedSentences,
  CLAUSE_BREAK_RE,
  CJK_CHAR_RE,
};
