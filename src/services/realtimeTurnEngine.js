const { getEnv } = require('../config/env');
const {
  DEEPSEEK_VOICE_HISTORY_LIMIT,
  DEEPSEEK_VOICE_MAX_TOKENS,
  DEEPSEEK_VOICE_TIMEOUT_MS,
  requestDeepseekReplyStreaming,
} = require('./deepseekService');
const { synthesizeSpeech } = require('./ttsService');
const { prewarmDeepgramTts, resolveTtsFormat } = require('./deepgramService');
const {
  resolveTtsModelForUser,
  resolveVoiceVariantForCompanion,
} = require('../config/learningLanguage');
const { stripMarkdownForTts, isSpeakableTtsText } = require('./ttsTextUtils');
const {
  normalizeTranscript,
  countWords,
  countTranscriptUnits,
  meetsVoiceTriggerThreshold,
  takeCompletedSentences,
  CLAUSE_BREAK_RE,
} = require('../utils/transcriptUnits');
const { sanitizeTeacherCallPayload } = require('../utils/teacherCallAccess');
const { isInterviewTeacherCompanionId } = require('../utils/interviewTeacherSetup');

const MIN_TRIGGER_WORDS = Number(getEnv('VOICE_AI_MIN_TRIGGER_WORDS', '3')) || 3;
/** Transcript unchanged this long → start LLM while user may still be speaking (TTS waits for client stop). */
const STABLE_PARTIAL_MS = Number(getEnv('VOICE_AI_STABLE_PARTIAL_MS', '500')) || 500;
/** No transcript growth for this long is treated as user silence (turn handover). */
const SILENCE_TAKEOVER_MS = Number(getEnv('VOICE_AI_SILENCE_TRIGGER_MS', '500')) || 500;
/** Grace after client confirms silence (input_end) so Deepgram can send the final transcript. */
const STT_FINALIZE_MS = Number(getEnv('VOICE_AI_STT_FINALIZE_MS', '0')) || 0;
/** Grace after client input_end when transcript ends mid-phrase (but, the, for…). */
const INCOMPLETE_INPUT_FINALIZE_MS =
  Number(getEnv('VOICE_AI_INCOMPLETE_INPUT_FINALIZE_MS', '600')) || 600;
const MIN_SPEECH_FINAL_CHARS = Number(getEnv('VOICE_AI_MIN_SPEECH_FINAL_CHARS', '2')) || 2;
/** Only start after the client confirms real audio silence (input_end). Transcript silence is not enough. */
const START_ON_PARTIAL = String(getEnv('VOICE_AI_START_ON_PARTIAL', 'false')).toLowerCase() === 'true';
const START_ON_TRANSCRIPT_SILENCE =
  String(getEnv('VOICE_AI_START_ON_TRANSCRIPT_SILENCE', 'false')).toLowerCase() === 'true';
/** Synthesize up to 2 TTS jobs in parallel (opener + remainder) for lower latency. */
const MAX_TTS_CONCURRENCY = Math.max(1, Number(getEnv('VOICE_AI_TTS_CONCURRENCY', '2')) || 2);
const MAX_TTS_SENTENCES = Math.max(3, Number(getEnv('VOICE_AI_MAX_TTS_SENTENCES', '4')) || 4);
/** Max separate TTS synthesis jobs per AI turn (opener + remainder). */
const MAX_TTS_JOBS_PER_TURN = Math.max(1, Number(getEnv('VOICE_AI_MAX_TTS_JOBS', '2')) || 2);
/**
 * First-chunk-first voice turn: flush the first complete sentence to TTS immediately
 * while the LLM still streams, then batch the remainder at turn end. Up to
 * MAX_TTS_CONCURRENCY jobs run in parallel so chunk 2 is ready when chunk 1 plays.
 */
const TTS_STREAM_FIRST_SENTENCE =
  String(getEnv('VOICE_AI_TTS_STREAM_FIRST_SENTENCE', 'true')).toLowerCase() === 'true';
const VOICE_FILLER_ENABLED = String(getEnv('VOICE_AI_FILLER', 'false')).toLowerCase() === 'true';
const VOICE_FILLER_TEXT = getEnv('VOICE_AI_FILLER_TEXT', 'Okay.');
/** Only enqueue TTS on sentence-ending punctuation — avoids "Hey Kaluna," / "That's" micro-splits. */
const EARLY_TTS_ENABLED = String(getEnv('VOICE_AI_EARLY_TTS', 'false')).toLowerCase() === 'true';
const EARLY_TTS_CHARS = Number(getEnv('VOICE_AI_EARLY_TTS_CHARS', '12')) || 12;
/** Main realtime TTS should be small/containerized; raw linear16 causes long drains on slower voices. */
const REALTIME_TTS_ENCODING = String(getEnv('VOICE_AI_REALTIME_TTS_ENCODING', 'mp3')).toLowerCase();
/** Opener (sentence 0): mp3 for reliable mobile playback; minChunkBytes 0 still streams fast. */
const OPENER_TTS_ENCODING = String(getEnv('VOICE_AI_OPENER_TTS_ENCODING', 'mp3')).toLowerCase();
/** Allow a short opener ("Hi Kaluna!") so the first audio can finish and play quickly. */
const MIN_TTS_SENTENCE_WORDS = Number(getEnv('VOICE_AI_MIN_TTS_WORDS', '1')) || 1;
/** Join multiple sentences into one TTS request for natural intonation (max MAX_TTS_SENTENCES). */
const TTS_PHRASE_BATCH = String(getEnv('VOICE_AI_TTS_PHRASE_BATCH', 'true')).toLowerCase() === 'true';
/** Wait for full turn before TTS so every sentence is spoken once, in order. */
const TTS_PHRASE_BATCH_MAX_WAIT_MS =
  Number(getEnv('VOICE_AI_TTS_PHRASE_BATCH_MAX_WAIT_MS', '0')) || 0;
const TTS_PHRASE_BATCH_SENTENCE_LIMIT =
  Math.max(1, Number(getEnv('VOICE_AI_TTS_PHRASE_BATCH_SENTENCE_LIMIT', '4')) || 4);
const STRONG_PUNCT_RE = /[.!?。！？]/;
const COMPLETE_TTS_PHRASE_RE = /[.!?。！？]["')\]}]*$/;
const FALLBACK_PROMPT = getEnv('VOICE_AI_EMPTY_TRANSCRIPT_FALLBACK', 'Hello?');
const BROKEN_TTS_PHRASE_RE =
  /\b(if you don't|if you dont|what does it mean,? if you don't|what does it mean,? if you dont|what country are you hoping|what part of english do|what kind of english do|what kind of things do|do you|can you|could you|would you)\.?$/i;

const logRealtimeTurn = (message, details = {}) => {
  console.log(`[realtime-turn] ${message}`, details);
};

const meetsLlmTriggerThreshold = (clean, speechFinal) =>
  meetsVoiceTriggerThreshold(clean, {
    minWords: MIN_TRIGGER_WORDS,
    minSpeechFinalChars: MIN_SPEECH_FINAL_CHARS,
    speechFinal,
  });

const meetsCommittedUserTurn = clean => {
  if (!normalizeTranscript(clean)) {
    return false;
  }
  if (looksIncompleteTranscript(clean)) {
    return false;
  }
  if (meetsLlmTriggerThreshold(clean, true)) {
    return true;
  }
  const words = countWords(clean);
  if (words >= 1 && words < MIN_TRIGGER_WORDS) {
    return /^(yes|no|yeah|yep|nope|ok|okay|sure|right|exactly|maybe|thanks|thank you)\.?$/i.test(
      normalizeTranscript(clean),
    );
  }
  return false;
};

/** Optional first slice at a clause boundary only (comma, etc.) — never mid-word. */
const takeEarlyTtsChunk = text => {
  const source = String(text || '').trim();
  if (!source || !EARLY_TTS_ENABLED) {
    return { chunk: '', rest: source };
  }
  const { complete, rest: afterSentences } = takeCompletedSentences(source);
  if (complete.length > 0) {
    return { chunk: complete[0], rest: afterSentences + complete.slice(1).join(' ') };
  }
  const clause = source.match(CLAUSE_BREAK_RE);
  if (clause && clause[1].length >= EARLY_TTS_CHARS) {
    return { chunk: clause[1].trim(), rest: source.slice(clause[0].length) };
  }
  return { chunk: '', rest: source };
};

const voiceFillerCache = new Map();

const transcriptsSimilar = (a, b) => {
  const left = normalizeTranscript(a).toLowerCase();
  const right = normalizeTranscript(b).toLowerCase();
  if (!left || !right) {
    return left === right;
  }
  if (left === right) {
    return true;
  }
  const shorter = left.length <= right.length ? left : right;
  const longer = left.length > right.length ? left : right;
  if (longer.startsWith(shorter) && shorter.length / longer.length >= 0.85) {
    return true;
  }
  return false;
};

const isSameUtteranceGrowth = (latest, used) => {
  const left = normalizeTranscript(latest).toLowerCase();
  const right = normalizeTranscript(used).toLowerCase();
  if (!left || !right) {
    return left === right;
  }
  if (left === right || left.startsWith(right) || right.startsWith(left)) {
    return true;
  }
  return transcriptsSimilar(latest, used);
};

const transcriptWords = text =>
  normalizeTranscript(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}'\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);

const isLikelyFinalRevision = (latest, used) => {
  const latestWords = transcriptWords(latest);
  const usedWords = transcriptWords(used);
  if (latestWords.length === 0 || usedWords.length === 0) {
    return false;
  }
  let shared = 0;
  while (
    shared < latestWords.length &&
    shared < usedWords.length &&
    latestWords[shared] === usedWords[shared]
  ) {
    shared += 1;
  }
  return latestWords.length >= usedWords.length && shared >= Math.max(2, Math.floor(usedWords.length * 0.6));
};

const SPOKEN_NUMBER_WORDS = {
  zero: '0',
  one: '1',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9',
  ten: '10',
  eleven: '11',
  twelve: '12',
  thirteen: '13',
  fourteen: '14',
  fifteen: '15',
  sixteen: '16',
  seventeen: '17',
  eighteen: '18',
  nineteen: '19',
  twenty: '20',
  thirty: '30',
  forty: '40',
  fifty: '50',
};

const normalizeSpokenNumbers = text => {
  let result = normalizeTranscript(text).toLowerCase();
  Object.entries(SPOKEN_NUMBER_WORDS).forEach(([word, digit]) => {
    result = result.replace(new RegExp(`\\b${word}\\b`, 'g'), digit);
  });
  return result.replace(/\s+/g, ' ').trim();
};

const isMinorSpokenRevision = (latest, used) => {
  const left = normalizeSpokenNumbers(latest);
  const right = normalizeSpokenNumbers(used);
  return Boolean(left && right && left === right);
};

const normalizeTranscriptForCompare = text =>
  normalizeTranscript(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}'\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const transcriptWordOverlapRatio = (a, b) => {
  const wordsA = transcriptWords(a);
  const wordsB = transcriptWords(b);
  if (wordsA.length === 0 || wordsB.length === 0) {
    return 0;
  }
  const setB = new Set(wordsB);
  let shared = 0;
  wordsA.forEach(word => {
    if (setB.has(word)) {
      shared += 1;
    }
  });
  return shared / Math.min(wordsA.length, wordsB.length);
};

const isSameUtteranceRevision = (prev, next) => {
  if (isSameUtteranceGrowth(next, prev)) {
    return true;
  }
  if (isLikelyFinalRevision(next, prev) || isLikelyFinalRevision(prev, next)) {
    return true;
  }
  if (isMinorSpokenRevision(next, prev)) {
    return true;
  }
  const left = normalizeTranscriptForCompare(prev);
  const right = normalizeTranscriptForCompare(next);
  if (!left || !right) {
    return left === right;
  }
  if (left === right || left.includes(right) || right.includes(left)) {
    return true;
  }
  return transcriptWordOverlapRatio(prev, next) >= 0.65;
};

const pickBestTranscriptVariant = (prev, next) => {
  const prevWords = countWords(prev);
  const nextWords = countWords(next);
  if (Math.abs(prevWords - nextWords) <= 2) {
    const prevHasPunct = /[.!?]["')\]}]*$/.test(prev.trim());
    const nextHasPunct = /[.!?]["')\]}]*$/.test(next.trim());
    if (prevHasPunct && !nextHasPunct) {
      return prev;
    }
    if (nextHasPunct && !prevHasPunct) {
      return next;
    }
  }
  return nextWords >= prevWords ? next : prev;
};

/** Deepgram may emit a new partial stream after isFinal — append only genuinely new segments. */
const mergeTurnTranscript = (previous, incoming) => {
  const prev = normalizeTranscript(previous);
  const next = normalizeTranscript(incoming);
  if (!next) {
    return prev;
  }
  if (!prev) {
    return next;
  }
  if (isSameUtteranceRevision(prev, next)) {
    return pickBestTranscriptVariant(prev, next);
  }
  if (next.includes(prev)) {
    return next;
  }
  if (prev.includes(next)) {
    return prev;
  }
  const prevWords = transcriptWords(prev);
  const nextWords = transcriptWords(next);
  const lastPrev = prevWords[prevWords.length - 1];
  const nextClean = normalizeTranscript(next);
  const isShortContinuation =
    nextWords.length > 0 &&
    nextWords.length <= 4 &&
    INCOMPLETE_TRANSCRIPT_ENDINGS.has(lastPrev) &&
    !/[.!?]["')\]}]*$/.test(prev.trim());
  if (isShortContinuation) {
    return `${prev} ${nextClean}`.replace(/\s+/g, ' ').trim();
  }
  if (/[.!?]["')\]}]*$/.test(prev.trim())) {
    return `${prev} ${next}`.replace(/\s+/g, ' ').trim();
  }
  const overlapMerged = mergeTranscriptOverlap(prev, next);
  if (overlapMerged) {
    return overlapMerged;
  }
  const reverseOverlap = mergeTranscriptOverlap(next, prev);
  if (reverseOverlap) {
    return reverseOverlap;
  }
  const stitched = stitchTranscriptFragments(prev, next);
  if (stitched) {
    return stitched;
  }
  return pickBestTranscriptVariant(prev, next);
};

const mergeTranscriptOverlap = (previous, incoming) => {
  const prevWords = transcriptWords(previous);
  const nextWords = transcriptWords(incoming);
  if (!prevWords.length || !nextWords.length) {
    return null;
  }
  const maxOverlap = Math.min(prevWords.length, nextWords.length);
  for (let size = maxOverlap; size >= 1; size -= 1) {
    const tail = prevWords.slice(-size).join(' ');
    const head = nextWords.slice(0, size).join(' ');
    if (tail === head) {
      return [...prevWords, ...nextWords.slice(size)].join(' ');
    }
  }
  return null;
};

/** Stitch two partial streams when Deepgram reconnects mid-utterance (shared word anchor). */
const stitchTranscriptFragments = (previous, incoming) => {
  const prevW = transcriptWords(previous);
  const nextW = transcriptWords(incoming);
  if (prevW.length < 2 || nextW.length < 2) {
    return null;
  }
  const maxAnchor = Math.min(10, prevW.length, nextW.length);
  for (let len = maxAnchor; len >= 2; len -= 1) {
    for (let i = 0; i <= nextW.length - len; i += 1) {
      const phrase = nextW.slice(i, i + len).join(' ');
      for (let j = 0; j <= prevW.length - len; j += 1) {
        if (prevW.slice(j, j + len).join(' ') !== phrase) {
          continue;
        }
        const merged = [...nextW.slice(0, i + len), ...prevW.slice(j + len)].join(' ').trim();
        if (countWords(merged) >= Math.min(countWords(previous), countWords(incoming))) {
          return merged;
        }
      }
    }
  }
  return null;
};

const dedupeStackedTranscript = text => {
  const clean = normalizeTranscript(text);
  if (!clean) {
    return clean;
  }
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length < 6) {
    return clean;
  }
  for (let split = Math.floor(words.length / 2); split >= 3; split -= 1) {
    const first = words.slice(0, split).join(' ');
    const second = words.slice(split).join(' ');
    if (isSameUtteranceRevision(first, second)) {
      return pickBestTranscriptVariant(first, second);
    }
  }
  return clean;
};

const isCompleteTtsPhrase = text => COMPLETE_TTS_PHRASE_RE.test(String(text || '').trim());

const normalizeTtsPhrase = text =>
  stripMarkdownForTts(text)
    .replace(/\s+/g, ' ')
    .replace(/,\s*\./g, '.')
    .replace(/^(Okay|Nice|Great|I hear you)!\s+(Hi|Hello)\b/i, '$2')
    .trim();

const isBrokenTtsPhrase = text => {
  const clean = normalizeTtsPhrase(text);
  if (!clean) {
    return true;
  }
  if (BROKEN_TTS_PHRASE_RE.test(clean)) {
    return true;
  }
  return /\b(yours sounds|this sounds|it sounds|that sounds)\.?$/i.test(clean);
};

const INCOMPLETE_TRANSCRIPT_ENDINGS = new Set([
  'a',
  'an',
  'am',
  'are',
  'about',
  'and',
  'at',
  'because',
  'before',
  'but',
  'for',
  'from',
  'if',
  'i',
  'in',
  'is',
  'my',
  'of',
  'or',
  'so',
  'the',
  'to',
  'what',
  'while',
  'with',
  'would',
  'do',
  "don't",
  'dont',
  'does',
  "doesn't",
  'doesnt',
  'did',
  "didn't",
  'didnt',
  'can',
  'could',
  'will',
  'should',
  'hoping',
  'looking',
  'going',
  'want',
  'need',
  'like',
]);

const NOISE_ONLY_TRANSCRIPTS = new Set([
  'none',
  'none.',
  'null',
  'silence',
  '...',
]);

const looksIncompleteTranscript = text => {
  const words = transcriptWords(text);
  if (words.length === 0) {
    return true;
  }
  const last = words[words.length - 1];
  if (INCOMPLETE_TRANSCRIPT_ENDINGS.has(last)) {
    return true;
  }
  const normalized = normalizeTranscript(text);
  return /\b(i am|i'm|talk about|what about|because of|my feeling are|i feel because|it is because|do you|do you have|do you have the|what do you|can you|could you|would you|if you don't|if you dont|are you hoping|what country are you hoping)$/i.test(normalized);
};

const completeFinalTtsTail = text => {
  const clean = normalizeTtsPhrase(text);
  if (!isSpeakableTtsText(clean)) {
    return '';
  }
  if (isCompleteTtsPhrase(clean) && !isBrokenTtsPhrase(clean)) {
    return clean;
  }
  let words = clean.split(/\s+/).filter(Boolean);
  while (words.length > 0) {
    const last = words[words.length - 1].toLowerCase().replace(/[^\p{L}\p{N}']/gu, '');
    if (!INCOMPLETE_TRANSCRIPT_ENDINGS.has(last)) {
      break;
    }
    words = words.slice(0, -1);
  }
  const candidate = words.join(' ').trim();
  if (looksIncompleteTranscript(candidate) || isBrokenTtsPhrase(candidate)) {
    return '';
  }
  return countWords(candidate) >= 5 ? `${candidate}.` : '';
};

const isIgnorableVoiceTranscript = text => {
  const clean = normalizeTranscript(text).toLowerCase();
  if (!clean) {
    return true;
  }
  return NOISE_ONLY_TRANSCRIPTS.has(clean);
};

const takeStrongSentenceChunk = text => {
  const strongIdx = String(text || '').search(STRONG_PUNCT_RE);
  if (strongIdx < 0) {
    return null;
  }
  let endIdx = strongIdx + 1;
  while (endIdx < text.length && /["')\]}]/.test(text[endIdx])) {
    endIdx += 1;
  }
  return {
    chunk: text.slice(0, endIdx).trim(),
    rest: text.slice(endIdx).trimStart(),
  };
};

class RealtimeTurnEngine {
  constructor({
    sessionId,
    send,
    user,
    companionName,
    companionDescription,
    companionPrompt,
    targetLanguage,
    history = [],
    companionId,
    ttsModel,
    ttsSpeed = 1,
    pronunciations = [],
    voiceVariant,
    callChatTopic = null,
  }) {
    this.sessionId = sessionId;
    this.send = send;
    this.user = user;
    this.companionId = companionId;
    this.companionName = companionName;
    this.companionDescription = companionDescription;
    this.companionPrompt = companionPrompt;
    this.targetLanguage = targetLanguage;
    this.history = Array.isArray(history) ? history : [];
    this.callChatTopic = typeof callChatTopic === 'string' && callChatTopic.trim() ? callChatTopic.trim() : null;
    this.voiceVariant = voiceVariant || resolveVoiceVariantForCompanion(companionId);
    this.ttsModel = resolveTtsModelForUser(user, ttsModel, this.voiceVariant);
    this.ttsSpeed = ttsSpeed;
    this.pronunciations = Array.isArray(pronunciations) ? pronunciations : [];

    this.latestTranscript = '';
    this.lastTurnCompleteNotifyAt = 0;
    this.lastTurnCompleteDelayMs = Infinity;
    this.started = false;
    this.inputEnded = false;
    this.userTurnCommitted = false;
    this.turnId = 0;
    this.triggerTimer = null;
    this.abortController = null;
    this.completedText = '';
    this.ttsQueue = [];
    this.activeTtsJobs = 0;
    this.ttsAudioSent = false;
    this.sentenceIndex = 0;
    this.stagedSentenceCount = 0;
    this.ttsJobsQueued = 0;
    this.destroyed = false;
    this.botSpeaking = false;
    this.activeTurnPrompt = '';
    this.enqueuedTtsTexts = new Set();
    this.lastLoggedTranscript = '';
    this.stablePartialTimer = null;
    this.silenceTakeoverTimer = null;
    this.firstTtsChunkSent = false;
    this.earlyTtsSent = false;
    this.ttsStartedNotified = false;
    this.openerTtsChunkStarted = false;
    this.fillerSent = false;
    this.turnDoneSent = false;
    this.ttsPendingBuffer = '';
    this.llmEmittedLength = 0;
    this.ttsPhraseBatch = [];
    this.ttsPhraseBatchTimer = null;
    this.lastStagedTtsText = '';
    this.lastTranscriptAt = 0;
    this.noiseOnlyTurn = false;
    this.lastTurnCompleteNotifyAt = 0;
    this.lastTurnCompleteDelayMs = Infinity;
  }

  setBotSpeaking(active) {
    this.botSpeaking = Boolean(active);
  }

  isTtsIdle() {
    return this.ttsQueue.length === 0 && this.activeTtsJobs === 0;
  }

  hasPendingUserTurn() {
    return (
      (this.inputEnded && !this.started) ||
      Boolean(this.triggerTimer) ||
      (this.started && Boolean(this.activeTurnId) && !this.turnDoneSent)
    );
  }

  resetForNextTurn() {
    if (this.hasPendingUserTurn()) {
      logRealtimeTurn('reset skipped, user turn still pending', {
        sessionId: this.sessionId,
        inputEnded: this.inputEnded,
        started: this.started,
        hasTriggerTimer: Boolean(this.triggerTimer),
      });
      return false;
    }
    if (this.activeTtsJobs > 0 || this.ttsQueue.length > 0) {
      logRealtimeTurn('reset skipped, tts still active', {
        sessionId: this.sessionId,
        jobs: this.activeTtsJobs,
        queued: this.ttsQueue.length,
      });
      return false;
    }
    if (this.triggerTimer) {
      clearTimeout(this.triggerTimer);
      this.triggerTimer = null;
    }
    if (this.stablePartialTimer) {
      clearTimeout(this.stablePartialTimer);
      this.stablePartialTimer = null;
    }
    if (this.silenceTakeoverTimer) {
      clearTimeout(this.silenceTakeoverTimer);
      this.silenceTakeoverTimer = null;
    }
    if (this.ttsPhraseBatchTimer) {
      clearTimeout(this.ttsPhraseBatchTimer);
      this.ttsPhraseBatchTimer = null;
    }
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.latestTranscript = '';
    this.started = false;
    this.inputEnded = false;
    this.userTurnCommitted = false;
    this.activeTurnId = null;
    this.completedText = '';
    this.ttsQueue = [];
    this.ttsAudioSent = false;
    this.sentenceIndex = 0;
    this.stagedSentenceCount = 0;
    this.ttsJobsQueued = 0;
    this.botSpeaking = false;
    this.activeTurnPrompt = '';
    this.enqueuedTtsTexts = new Set();
    this.lastLoggedTranscript = '';
    this.firstTtsChunkSent = false;
    this.earlyTtsSent = false;
    this.ttsStartedNotified = false;
    this.openerTtsChunkStarted = false;
    this.fillerSent = false;
    this.turnDoneSent = false;
    this.ttsPendingBuffer = '';
    this.llmEmittedLength = 0;
    this.ttsPhraseBatch = [];
    this.lastStagedTtsText = '';
    this.lastTranscriptAt = 0;
    this.noiseOnlyTurn = false;
    return true;
  }

  abortActiveTurn() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.activeTurnId = null;
    this.started = false;
    this.completedText = '';
    this.ttsQueue = [];
    this.enqueuedTtsTexts = new Set();
    this.activeTurnPrompt = '';
    this.firstTtsChunkSent = false;
    this.earlyTtsSent = false;
    this.ttsStartedNotified = false;
    this.openerTtsChunkStarted = false;
    this.fillerSent = false;
    this.ttsPendingBuffer = '';
    this.llmEmittedLength = 0;
    this.ttsPhraseBatch = [];
    this.lastStagedTtsText = '';
    this.lastTranscriptAt = 0;
    this.noiseOnlyTurn = false;
    if (this.silenceTakeoverTimer) {
      clearTimeout(this.silenceTakeoverTimer);
      this.silenceTakeoverTimer = null;
    }
    if (this.ttsPhraseBatchTimer) {
      clearTimeout(this.ttsPhraseBatchTimer);
      this.ttsPhraseBatchTimer = null;
    }
  }

  updateTurnContext(payload = {}) {
    const sanitized = sanitizeTeacherCallPayload(payload, this.user);
    if (Array.isArray(payload.history)) {
      if (sanitized.history.length >= this.history.length) {
        this.history = sanitized.history;
      }
    }
    if (payload.companionId) {
      this.voiceVariant = resolveVoiceVariantForCompanion(payload.companionId);
      this.ttsModel = resolveTtsModelForUser(this.user, payload.model, this.voiceVariant);
    }
    if (payload.companionName) {
      this.companionName = payload.companionName;
    }
    if (payload.companionDescription) {
      this.companionDescription = payload.companionDescription;
    }
    if (payload.companionPrompt) {
      this.companionPrompt = payload.companionPrompt;
    }
    if (payload.speed != null) {
      this.ttsSpeed = payload.speed;
    }
    if (Array.isArray(payload.pronunciations)) {
      this.pronunciations = payload.pronunciations;
    }
    if (typeof sanitized.callChatTopic === 'string' && sanitized.callChatTopic.trim()) {
      this.callChatTopic = sanitized.callChatTopic.trim();
    } else if (sanitized.callChatTopic === null) {
      this.callChatTopic = null;
    }
  }

  notifyClientTurnComplete(reason, delayMs = 0) {
    if (this.destroyed || this.botSpeaking || this.started || this.inputEnded) {
      return;
    }
    const transcript = normalizeTranscript(this.latestTranscript);
    if (!transcript || looksIncompleteTranscript(transcript)) {
      return;
    }
    if (!meetsLlmTriggerThreshold(transcript, true)) {
      return;
    }
    const now = Date.now();
    if (now - this.lastTurnCompleteNotifyAt < 120 && delayMs >= this.lastTurnCompleteDelayMs) {
      return;
    }
    this.lastTurnCompleteNotifyAt = now;
    this.lastTurnCompleteDelayMs = delayMs;
    logRealtimeTurn('notify client turn complete', {
      sessionId: this.sessionId,
      reason,
      delayMs,
      transcript,
    });
    this.send({
      type: 'stt_turn_complete',
      ok: true,
      sessionId: this.sessionId,
      transcript,
      reason,
      delayMs,
    });
  }

  handleTranscript({ transcript, isFinal, speechFinal }) {
    if (this.destroyed || this.botSpeaking) {
      return;
    }
    const clean = normalizeTranscript(transcript);
    if (!clean) {
      return;
    }
    if (isIgnorableVoiceTranscript(clean)) {
      this.noiseOnlyTurn = true;
      logRealtimeTurn('ignore noise transcript', {
        sessionId: this.sessionId,
        transcript: clean,
        isFinal: Boolean(isFinal),
        speechFinal: Boolean(speechFinal),
      });
      return;
    }
    this.noiseOnlyTurn = false;
    this.latestTranscript = dedupeStackedTranscript(mergeTurnTranscript(this.latestTranscript, clean));
    this.lastTranscriptAt = Date.now();
    const wordCount = countWords(this.latestTranscript);
    if (
      this.latestTranscript !== this.lastLoggedTranscript &&
      (isFinal || speechFinal || wordCount >= MIN_TRIGGER_WORDS)
    ) {
      this.lastLoggedTranscript = this.latestTranscript;
      logRealtimeTurn('transcript update', {
        sessionId: this.sessionId,
        words: wordCount,
        isFinal: Boolean(isFinal),
        speechFinal: Boolean(speechFinal),
        started: this.started,
        transcript: this.latestTranscript,
      });
    }
    this.send({
      type: 'stt_partial',
      ok: true,
      sessionId: this.sessionId,
      transcript: this.latestTranscript,
      isFinal,
      speechFinal,
    });

    const endOfSpeech = Boolean(speechFinal || isFinal);
    const turnTranscript = this.latestTranscript;

    if (
      speechFinal &&
      meetsLlmTriggerThreshold(turnTranscript, true) &&
      !looksIncompleteTranscript(turnTranscript)
    ) {
      this.notifyClientTurnComplete('speech_final', 0);
    }

    if (
      isFinal &&
      !speechFinal &&
      !isInterviewTeacherCompanionId(this.companionId) &&
      meetsLlmTriggerThreshold(turnTranscript, true) &&
      !looksIncompleteTranscript(turnTranscript)
    ) {
      this.notifyClientTurnComplete('speech_final', 0);
    }

    if (!speechFinal && clean && !this.started) {
      if (this.triggerTimer) {
        clearTimeout(this.triggerTimer);
        this.triggerTimer = null;
      }
    }

    if (endOfSpeech && this.inputEnded && !looksIncompleteTranscript(turnTranscript)) {
      this.userTurnCommitted = true;
    }

    if (
      !endOfSpeech &&
      this.started &&
      !this.ttsAudioSent &&
      !isSameUtteranceGrowth(turnTranscript, this.activeTurnPrompt || '')
    ) {
      logRealtimeTurn('abort llm, transcript diverged', {
        sessionId: this.sessionId,
        used: this.activeTurnPrompt,
        latest: turnTranscript,
      });
      this.abortActiveTurn();
      return;
    }

    if (
      endOfSpeech &&
      this.inputEnded &&
      !this.started &&
      meetsLlmTriggerThreshold(turnTranscript, true) &&
      !looksIncompleteTranscript(turnTranscript)
    ) {
      if (this.stablePartialTimer) {
        clearTimeout(this.stablePartialTimer);
        this.stablePartialTimer = null;
      }
      if (this.triggerTimer) {
        clearTimeout(this.triggerTimer);
        this.triggerTimer = null;
      }
      logRealtimeTurn('schedule llm on end of speech', {
        sessionId: this.sessionId,
        transcript: turnTranscript,
        speechFinal: Boolean(speechFinal),
        isFinal: Boolean(isFinal),
        inputEnded: this.inputEnded,
      });
      this.userTurnCommitted = true;
      this.scheduleLlmAfterSilence(0);
      return;
    }

    if (
      endOfSpeech &&
      this.started &&
      !this.ttsAudioSent &&
      !transcriptsSimilar(turnTranscript, this.activeTurnPrompt || '')
    ) {
      const used = normalizeTranscript(this.activeTurnPrompt || '');
      const latest = normalizeTranscript(turnTranscript);
      if (
        isSameUtteranceGrowth(latest, used) ||
        isLikelyFinalRevision(latest, used) ||
        isMinorSpokenRevision(latest, used)
      ) {
        this.latestTranscript = latest.length >= used.length ? latest : used;
        logRealtimeTurn('keep llm on speech_final refinement', {
          sessionId: this.sessionId,
          used,
          latest: this.latestTranscript,
        });
        return;
      }
      if (
        countWords(latest) < Math.max(2, Math.floor(countWords(used) * 0.6)) ||
        (!isSameUtteranceGrowth(latest, used) && !isLikelyFinalRevision(latest, used))
      ) {
        logRealtimeTurn('ignore junk transcript revision', {
          sessionId: this.sessionId,
          used,
          latest,
          inputEnded: this.inputEnded,
        });
        return;
      }
      logRealtimeTurn('transcript revised on speech_final', {
        sessionId: this.sessionId,
        used: this.activeTurnPrompt,
        latest: turnTranscript,
      });
      this.abortActiveTurn();
      if (looksIncompleteTranscript(turnTranscript)) {
        logRealtimeTurn('wait for incomplete speech_final revision', {
          sessionId: this.sessionId,
          transcript: turnTranscript,
        });
        this.scheduleLlmAfterSilence(Math.max(STT_FINALIZE_MS, 300), { trustSilence: true });
        return;
      }
      this.userTurnCommitted = true;
      this.scheduleLlmAfterSilence(0);
      return;
    }

    if (START_ON_TRANSCRIPT_SILENCE && !endOfSpeech && !this.started && !this.inputEnded) {
      this.scheduleSilenceTakeover(turnTranscript);
      this.scheduleStablePartialStart(turnTranscript);
    }

    if (this.inputEnded && !this.started && clean && (endOfSpeech || isFinal)) {
      if (this.triggerTimer) {
        clearTimeout(this.triggerTimer);
        this.triggerTimer = null;
      }
      const finalizeDelay = looksIncompleteTranscript(this.latestTranscript)
        ? Math.max(STT_FINALIZE_MS, INCOMPLETE_INPUT_FINALIZE_MS)
        : STT_FINALIZE_MS;
      logRealtimeTurn('reschedule llm after late transcript fragment', {
        sessionId: this.sessionId,
        transcript: this.latestTranscript,
        finalizeMs: finalizeDelay,
      });
      this.scheduleLlmAfterSilence(finalizeDelay, { trustSilence: true });
    }
  }

  scheduleSilenceTakeover(clean) {
    if (this.destroyed || this.botSpeaking || this.started || this.inputEnded) {
      return;
    }
    const snapshot = normalizeTranscript(clean);
    if (!meetsLlmTriggerThreshold(snapshot, false) || looksIncompleteTranscript(snapshot)) {
      return;
    }
    if (this.silenceTakeoverTimer) {
      clearTimeout(this.silenceTakeoverTimer);
    }
    this.silenceTakeoverTimer = setTimeout(() => {
      this.silenceTakeoverTimer = null;
      if (this.destroyed || this.started || this.botSpeaking || this.inputEnded) {
        return;
      }
      const latest = normalizeTranscript(this.latestTranscript);
      if (!latest || latest !== snapshot) {
        return;
      }
      if (!meetsLlmTriggerThreshold(latest, false) || looksIncompleteTranscript(latest)) {
        return;
      }
      const silenceMs = this.lastTranscriptAt ? Date.now() - this.lastTranscriptAt : SILENCE_TAKEOVER_MS;
      if (silenceMs < SILENCE_TAKEOVER_MS) {
        return;
      }
      logRealtimeTurn(`start llm on ${SILENCE_TAKEOVER_MS}ms transcript silence`, {
        sessionId: this.sessionId,
        transcript: latest,
        silenceMs,
      });
      this.startLlmFromPartial(false).catch(error => {
        if (this.destroyed || error?.code === 'DEEPSEEK_ABORTED') {
          return;
        }
        this.send({
          type: 'voice_error',
          ok: false,
          sessionId: this.sessionId,
          message: 'AI response failed.',
        });
      });
    }, SILENCE_TAKEOVER_MS);
  }

  scheduleStablePartialStart(clean) {
    if (!START_ON_PARTIAL || this.destroyed || this.botSpeaking || this.started) {
      return;
    }
    const snapshot = normalizeTranscript(clean);
    if (!meetsLlmTriggerThreshold(snapshot, false) || looksIncompleteTranscript(snapshot)) {
      return;
    }
    if (this.stablePartialTimer) {
      clearTimeout(this.stablePartialTimer);
    }
    this.stablePartialTimer = setTimeout(() => {
      this.stablePartialTimer = null;
      if (this.destroyed || this.started || this.botSpeaking) {
        return;
      }
      const latest = normalizeTranscript(this.latestTranscript);
      if (!latest || latest !== snapshot) {
        return;
      }
      if (!meetsLlmTriggerThreshold(latest, false) || looksIncompleteTranscript(latest)) {
        return;
      }
      logRealtimeTurn('start llm from stable partial', {
        sessionId: this.sessionId,
        transcript: latest,
        stableMs: STABLE_PARTIAL_MS,
      });
      this.startLlmFromPartial(false).catch(error => {
        if (this.destroyed || error?.code === 'DEEPSEEK_ABORTED') {
          return;
        }
        this.send({
          type: 'voice_error',
          ok: false,
          sessionId: this.sessionId,
          message: 'AI response failed.',
        });
      });
    }, STABLE_PARTIAL_MS);
  }

  scheduleLlmAfterSilence(delayMs = STT_FINALIZE_MS, options = {}) {
    if (this.triggerTimer) {
      clearTimeout(this.triggerTimer);
    }
    const snapshot = normalizeTranscript(this.latestTranscript);
    const trustSilence = Boolean(options.trustSilence);
    this.triggerTimer = setTimeout(() => {
      this.triggerTimer = null;
      if (this.destroyed || this.started || this.botSpeaking) {
        return;
      }
      const latest = normalizeTranscript(this.latestTranscript);
      if (!latest) {
        return;
      }
      if (
        latest !== snapshot &&
        !(trustSilence && (isSameUtteranceGrowth(latest, snapshot) || isLikelyFinalRevision(latest, snapshot)))
      ) {
        return;
      }
      if (trustSilence) {
        if (!meetsCommittedUserTurn(latest)) {
          if (!(this.inputEnded && countWords(latest) >= MIN_TRIGGER_WORDS)) {
            return;
          }
          logRealtimeTurn('proceed after input_end timeout despite incomplete tail', {
            sessionId: this.sessionId,
            transcript: latest,
          });
        }
      } else if (!meetsLlmTriggerThreshold(latest, true) || looksIncompleteTranscript(latest)) {
        return;
      }
      logRealtimeTurn('start llm after silence gate', {
        sessionId: this.sessionId,
        transcript: latest,
        delayMs,
        trustSilence,
      });
      this.startLlmFromPartial(true).catch(error => {
        if (this.destroyed || error?.code === 'DEEPSEEK_ABORTED') {
          return;
        }
        this.send({
          type: 'voice_error',
          ok: false,
          sessionId: this.sessionId,
          message: 'AI response failed.',
        });
      });
    }, delayMs);
  }

  async startLlmFromPartial(force = false) {
    if (this.destroyed) {
      return;
    }
    if (this.started && !force) {
      return;
    }
    const prompt = dedupeStackedTranscript(this.latestTranscript);
    if (!prompt) {
      if (force) {
        logRealtimeTurn('empty turn', { sessionId: this.sessionId });
        this.send({
          type: 'turn_empty',
          ok: true,
          sessionId: this.sessionId,
        });
      }
      return;
    }
    if (!force && !meetsLlmTriggerThreshold(prompt, false)) {
      return;
    }

    this.started = true;
    const turnId = `turn-${Date.now()}-${this.turnId++}`;
    this.activeTurnId = turnId;
    this.activeTurnPrompt = prompt;
    this.abortController = new AbortController();
    this.completedText = '';
    this.ttsAudioSent = false;
    this.sentenceIndex = 0;
    this.stagedSentenceCount = 0;
    this.ttsJobsQueued = 0;
    this.enqueuedTtsTexts = new Set();
    this.firstTtsChunkSent = false;
    this.earlyTtsSent = false;
    this.ttsStartedNotified = false;
    this.openerTtsChunkStarted = false;
    this.fillerSent = false;
    this.turnDoneSent = false;
    this.ttsPendingBuffer = '';
    this.llmEmittedLength = 0;
    this.ttsPhraseBatch = [];
    this.lastStagedTtsText = '';
    if (this.ttsPhraseBatchTimer) {
      clearTimeout(this.ttsPhraseBatchTimer);
      this.ttsPhraseBatchTimer = null;
    }
    this.turnStartedAt = Date.now();

    prewarmDeepgramTts(this.ttsModel).catch(() => {});
    this.maybeSendFillerAudio(turnId).catch(() => {});

    this.send({
      type: 'turn_started',
      ok: true,
      sessionId: this.sessionId,
      turnId,
      transcript: prompt,
    });
    this.send({
      type: 'ai_partial',
      ok: true,
      sessionId: this.sessionId,
      turnId,
      text: '…',
    });

    let fullReply = '';
    logRealtimeTurn('llm streaming start', {
      sessionId: this.sessionId,
      turnId,
      promptWords: countWords(prompt),
    });
    fullReply = await requestDeepseekReplyStreaming({
      message: prompt,
      companionId: this.companionId,
      companionName: this.companionName,
      companionDescription: this.companionDescription,
      companionPrompt: this.companionPrompt,
      targetLanguage: this.targetLanguage,
      history: this.history,
      timeoutMs: DEEPSEEK_VOICE_TIMEOUT_MS,
      historyLimit: DEEPSEEK_VOICE_HISTORY_LIMIT,
      maxTokens: DEEPSEEK_VOICE_MAX_TOKENS,
      forVoice: true,
      user: this.user,
      callChatTopic: this.callChatTopic,
      signal: this.abortController.signal,
      onDelta: text => {
        if (this.destroyed || this.activeTurnId !== turnId) {
          return;
        }
        this.send({
          type: 'ai_partial',
          ok: true,
          sessionId: this.sessionId,
          turnId,
          text,
        });
        this.processIncrementalTts(turnId, text);
      },
    });

    if (this.destroyed || this.activeTurnId !== turnId) {
      return;
    }

    const pendingTail = this.ttsPendingBuffer.trim();
    if (pendingTail && isCompleteTtsPhrase(pendingTail)) {
      this.stageTtsPhrase(turnId, pendingTail);
    } else if (pendingTail) {
      const completedTail = completeFinalTtsTail(pendingTail);
      if (completedTail) {
        this.stageTtsPhrase(turnId, completedTail);
      } else {
        logRealtimeTurn('skip incomplete tts tail', {
          sessionId: this.sessionId,
          turnId,
          text: pendingTail,
        });
      }
    }
    this.ttsPendingBuffer = '';
    const tail = stripMarkdownForTts(fullReply.slice(this.completedText.length));
    if (isSpeakableTtsText(tail) && isCompleteTtsPhrase(tail)) {
      this.stageTtsPhrase(turnId, tail);
    } else if (isSpeakableTtsText(tail)) {
      const completedTail = completeFinalTtsTail(tail);
      if (completedTail) {
        this.stageTtsPhrase(turnId, completedTail);
      } else {
        logRealtimeTurn('skip incomplete final tts tail', {
          sessionId: this.sessionId,
          turnId,
          text: tail,
        });
      }
    }
    this.flushTtsPhraseBatch(turnId, { force: true });
    this.completedText = fullReply;
    const hasPendingTtsText =
      this.ttsPhraseBatch.length > 0 ||
      isSpeakableTtsText(this.ttsPendingBuffer) ||
      isSpeakableTtsText(stripMarkdownForTts(fullReply.slice(this.completedText.length)));
    const hasTtsInFlight =
      this.ttsAudioSent ||
      this.ttsQueue.length > 0 ||
      this.activeTtsJobs > 0 ||
      hasPendingTtsText;
    if (this.userTurnCommitted && !hasTtsInFlight && isSpeakableTtsText(fullReply)) {
      this.runFallbackTtsJob(turnId, stripMarkdownForTts(fullReply)).catch(() => {});
    }
    this.sendTurnDone(turnId, prompt, fullReply);
  }

  sendTurnDone(turnId, prompt, fullReply) {
    if (this.turnDoneSent || this.destroyed || this.activeTurnId !== turnId) {
      return;
    }
    this.turnDoneSent = true;
    logRealtimeTurn('turn done', {
      sessionId: this.sessionId,
      turnId,
      replyLength: fullReply.length,
      ttsInFlight: this.ttsQueue.length + this.activeTtsJobs,
    });
    this.send({
      type: 'turn_done',
      ok: true,
      sessionId: this.sessionId,
      turnId,
      transcript: prompt,
      reply: fullReply,
      expectedTtsChunks: Math.max(this.ttsJobsQueued, this.sentenceIndex),
    });
    if (prompt && fullReply) {
      this.history = [
        ...this.history,
        { role: 'user', text: prompt },
        { role: 'ai', text: fullReply },
      ].slice(-Math.max(2, DEEPSEEK_VOICE_HISTORY_LIMIT * 2));
    }
  }

  async maybeSendFillerAudio(turnId) {
    if (!VOICE_FILLER_ENABLED || this.destroyed || this.fillerSent) {
      return;
    }
    const cacheKey = `${this.ttsModel}|${this.ttsSpeed}|mp3`;
    let cached = voiceFillerCache.get(cacheKey);
    if (!cached) {
      cached = synthesizeSpeech({
        text: VOICE_FILLER_TEXT,
        model: this.ttsModel,
        speed: this.ttsSpeed,
        pronunciations: this.pronunciations,
        learningLanguage: this.targetLanguage,
        voiceVariant: this.voiceVariant,
        user: this.user,
        encoding: 'mp3',
      });
      voiceFillerCache.set(cacheKey, cached);
    }
    const result = await cached;
    if (this.destroyed || this.activeTurnId !== turnId || this.fillerSent) {
      return;
    }
    this.fillerSent = true;
    this.send({
      type: 'tts_audio',
      ok: true,
      sessionId: this.sessionId,
      turnId,
      sentenceId: -1,
      text: VOICE_FILLER_TEXT,
      audioBase64: result.audioBase64,
      mimeType: result.mimeType || 'audio/wav',
      encoding: result.encoding || 'mp3',
      sampleRate: result.sampleRate,
      filler: true,
    });
    logRealtimeTurn('filler audio sent', { sessionId: this.sessionId, turnId });
  }

  stageTtsPhrase(turnId, phrase) {
    const text = normalizeTtsPhrase(phrase);
    if (
      !isSpeakableTtsText(text) ||
      isBrokenTtsPhrase(text) ||
      this.destroyed ||
      this.activeTurnId !== turnId
    ) {
      return;
    }
    const dedupeKey = text.toLowerCase();
    if (dedupeKey === this.lastStagedTtsText) {
      logRealtimeTurn('skip duplicate staged tts phrase', {
        sessionId: this.sessionId,
        turnId,
        text,
      });
      return;
    }
    this.lastStagedTtsText = dedupeKey;
    if (TTS_PHRASE_BATCH && this.ttsPhraseBatch.some(item => item.toLowerCase() === dedupeKey)) {
      logRealtimeTurn('skip duplicate staged tts phrase in batch', {
        sessionId: this.sessionId,
        turnId,
        text,
      });
      return;
    }
    if (!TTS_PHRASE_BATCH) {
      this.enqueueTts(turnId, text, { priority: !this.firstTtsChunkSent });
      this.firstTtsChunkSent = true;
      return;
    }
    this.ttsPhraseBatch.push(text);
    this.stagedSentenceCount += 1;
    logRealtimeTurn('tts phrase staged', {
      sessionId: this.sessionId,
      turnId,
      batchSize: this.ttsPhraseBatch.length,
      text,
    });
    if (
      TTS_STREAM_FIRST_SENTENCE &&
      !this.firstTtsChunkSent &&
      (this.userTurnCommitted || this.inputEnded || this.started) &&
      isCompleteTtsPhrase(text) &&
      this.ttsPhraseBatch.length === 1
    ) {
      this.flushTtsPhraseBatch(turnId, { force: true, reason: 'first_sentence' });
      return;
    }
    if (this.ttsPhraseBatch.length >= TTS_PHRASE_BATCH_SENTENCE_LIMIT) {
      this.flushTtsPhraseBatch(turnId, { force: true, reason: 'max_sentences' });
      return;
    }
    this.scheduleTtsPhraseBatchFlush(turnId);
  }

  scheduleTtsPhraseBatchFlush(turnId) {
    if (!TTS_PHRASE_BATCH || TTS_PHRASE_BATCH_MAX_WAIT_MS <= 0) {
      return;
    }
    if (this.ttsPhraseBatchTimer) {
      return;
    }
    this.ttsPhraseBatchTimer = setTimeout(() => {
      this.ttsPhraseBatchTimer = null;
      if (this.destroyed || this.activeTurnId !== turnId) {
        return;
      }
      this.flushTtsPhraseBatch(turnId, { force: true, reason: 'max_wait' });
    }, TTS_PHRASE_BATCH_MAX_WAIT_MS);
  }

  flushTtsPhraseBatch(turnId, options = {}) {
    if (!this.ttsPhraseBatch.length) {
      return;
    }
    if (
      !this.userTurnCommitted &&
      !(options.force && (this.inputEnded || this.started)) &&
      options.reason !== 'first_sentence'
    ) {
      if (!this.ttsPhraseBatchTimer) {
        this.ttsPhraseBatchTimer = setTimeout(() => {
          this.ttsPhraseBatchTimer = null;
          if (this.destroyed || this.activeTurnId !== turnId) {
            return;
          }
          this.flushTtsPhraseBatch(turnId, { force: true, reason: 'wait_commit' });
        }, 80);
      }
      return;
    }
    if (this.ttsPhraseBatchTimer) {
      clearTimeout(this.ttsPhraseBatchTimer);
      this.ttsPhraseBatchTimer = null;
    }
    if (!options.force && this.ttsPhraseBatch.length < TTS_PHRASE_BATCH_SENTENCE_LIMIT) {
      return;
    }
    const combined = normalizeTtsPhrase(this.ttsPhraseBatch.join(' '));
    this.ttsPhraseBatch = [];
    if (!combined || isBrokenTtsPhrase(combined)) {
      return;
    }
    logRealtimeTurn('tts phrase batch flush', {
      sessionId: this.sessionId,
      turnId,
      words: countWords(combined),
      text: combined,
      reason: options.reason || 'force',
    });
    this.enqueueTts(turnId, combined, { priority: !this.firstTtsChunkSent });
    this.firstTtsChunkSent = true;
  }

  processIncrementalTts(turnId, fullText) {
    const source = String(fullText || '');
    if (source.length <= this.llmEmittedLength) {
      return;
    }
    let pending = `${this.ttsPendingBuffer}${source.slice(this.llmEmittedLength)}`;
    this.llmEmittedLength = source.length;

    while (pending.length > 0 && this.stagedSentenceCount < MAX_TTS_SENTENCES) {
      const nextSentence = takeStrongSentenceChunk(pending);
      if (!nextSentence) {
        if (!this.firstTtsChunkSent && EARLY_TTS_ENABLED) {
          const earlyChunk = takeEarlyTtsChunk(pending);
          const earlyText = stripMarkdownForTts(earlyChunk.chunk);
          const words = countWords(earlyText);
          if (words >= MIN_TTS_SENTENCE_WORDS && isSpeakableTtsText(earlyText)) {
            logRealtimeTurn('tts early chunk ready', {
              sessionId: this.sessionId,
              turnId,
              words,
              text: earlyText,
            });
            this.stageTtsPhrase(turnId, earlyText);
            this.completedText += `${earlyText} `;
            this.firstTtsChunkSent = true;
            pending = earlyChunk.rest;
            continue;
          }
        }
        break;
      }
      const { chunk } = nextSentence;
      const words = countWords(chunk);
      if (words < MIN_TTS_SENTENCE_WORDS || !isSpeakableTtsText(chunk)) {
        break;
      }
      logRealtimeTurn('tts sentence ready', {
        sessionId: this.sessionId,
        turnId,
        words,
        text: chunk,
      });
      this.stageTtsPhrase(turnId, chunk);
      this.completedText += `${chunk} `;
      pending = nextSentence.rest;
    }

    this.ttsPendingBuffer = pending;
  }

  processTextForSentences(turnId, fullText) {
    const nextText = String(fullText || '');
    if (nextText.length <= this.completedText.length) {
      return;
    }
    const replyBaseLength = this.completedText.length;
    let remaining = nextText.slice(replyBaseLength);
    const initialRemainingLength = remaining.length;
    while (remaining.length > 0) {
      const { complete, rest: afterSentences } = takeCompletedSentences(remaining);
      if (complete.length > 0) {
        complete.forEach(sentence => {
          this.enqueueTts(turnId, sentence, {
            priority: !this.firstTtsChunkSent,
          });
          this.firstTtsChunkSent = true;
        });
        remaining = afterSentences;
        continue;
      }
      break;
    }
    if (EARLY_TTS_ENABLED && !this.earlyTtsSent && remaining.length > 0) {
      const { chunk, rest } = takeEarlyTtsChunk(remaining);
      if (chunk) {
        this.enqueueTts(turnId, chunk, { priority: true });
        this.firstTtsChunkSent = true;
        this.earlyTtsSent = true;
        remaining = rest;
      }
    }
    const consumed = initialRemainingLength - remaining.length;
    if (consumed > 0) {
      this.completedText = nextText.slice(0, replyBaseLength + consumed);
    }
  }

  enqueueTts(turnId, sentence, options = {}) {
    const text = normalizeTtsPhrase(sentence);
    if (
      !isSpeakableTtsText(text) ||
      isBrokenTtsPhrase(text) ||
      this.destroyed ||
      this.activeTurnId !== turnId
    ) {
      return;
    }
    if (!this.userTurnCommitted && !this.inputEnded && !this.started) {
      this.stageTtsPhrase(turnId, text);
      return;
    }
    if (this.ttsJobsQueued >= MAX_TTS_JOBS_PER_TURN) {
      const lastJob = this.ttsQueue.find(item => item.turnId === turnId);
      if (lastJob) {
        lastJob.text = normalizeTtsPhrase(`${lastJob.text} ${text}`);
        logRealtimeTurn('tts merged into queued job', {
          sessionId: this.sessionId,
          turnId,
          text: lastJob.text,
        });
        return;
      }
      logRealtimeTurn('tts job dropped, turn job limit reached', {
        sessionId: this.sessionId,
        turnId,
        text,
      });
      return;
    }
    const dedupeKey = text.toLowerCase();
    if (this.enqueuedTtsTexts.has(dedupeKey)) {
      return;
    }
    this.enqueuedTtsTexts.add(dedupeKey);
    this.ttsJobsQueued += 1;
    const job = {
      turnId,
      sentenceId: this.sentenceIndex++,
      text,
      priority: Boolean(options.priority),
    };
    if (job.priority) {
      this.ttsQueue.unshift(job);
    } else {
      this.ttsQueue.push(job);
    }
    logRealtimeTurn('tts queued', {
      sessionId: this.sessionId,
      turnId,
      queued: this.ttsQueue.length,
      text,
    });
    this.notifyTtsStarted(turnId, job);
    this.pumpTtsQueue();
  }

  notifyTtsStarted(turnId, job) {
    if (this.ttsStartedNotified || this.destroyed || this.activeTurnId !== turnId) {
      return;
    }
    if (job.sentenceId < 0) {
      return;
    }
    this.ttsStartedNotified = true;
    logRealtimeTurn('tts started', {
      sessionId: this.sessionId,
      turnId,
      sentenceId: job.sentenceId,
    });
    this.send({
      type: 'tts_started',
      ok: true,
      sessionId: this.sessionId,
      turnId,
      sentenceId: job.sentenceId,
    });
  }

  pumpTtsQueue() {
    /** Opener (sentence 0) runs alone until first audio bytes stream, then remainder can synth in parallel. */
    const maxActiveJobs = this.openerTtsChunkStarted ? MAX_TTS_CONCURRENCY : 1;
    while (!this.destroyed && this.activeTtsJobs < maxActiveJobs && this.ttsQueue.length > 0) {
      let pickIdx = 0;
      if (!this.openerTtsChunkStarted) {
        const openerIdx = this.ttsQueue.findIndex(item => item.sentenceId === 0);
        if (openerIdx >= 0) {
          pickIdx = openerIdx;
        } else {
          const priorityIdx = this.ttsQueue.findIndex(item => item.priority);
          pickIdx = priorityIdx >= 0 ? priorityIdx : 0;
        }
      } else {
        const priorityIdx = this.ttsQueue.findIndex(item => item.priority);
        pickIdx = priorityIdx >= 0 ? priorityIdx : 0;
      }
      const job = this.ttsQueue.splice(pickIdx, 1)[0];
      this.activeTtsJobs += 1;
      this.runTtsJob(job)
        .catch(error => {
          logRealtimeTurn('tts failed', {
            sessionId: this.sessionId,
            turnId: job.turnId,
            sentenceId: job.sentenceId,
            message: error?.message,
            code: error?.code,
          });
          this.send({
            type: 'tts_error',
            ok: false,
            sessionId: this.sessionId,
            turnId: job.turnId,
            sentenceId: job.sentenceId,
            message: 'TTS failed.',
          });
        })
        .finally(() => {
          this.activeTtsJobs -= 1;
          this.pumpTtsQueue();
        });
    }
  }

  async runTtsJob(job) {
    if (this.destroyed || this.activeTurnId !== job.turnId) {
      return;
    }
    let chunkIndex = 0;
    let firstChunkSent = false;
    let streamedBytes = 0;
    const jobEncoding = job.sentenceId === 0 ? OPENER_TTS_ENCODING : REALTIME_TTS_ENCODING;
    const ttsFormat = resolveTtsFormat(jobEncoding);
    const streamEncoding = ttsFormat.encoding;
    const streamMimeType = ttsFormat.mimeType;
    const streamSampleRate = ttsFormat.sampleRate || 48000;
    /** Opener: zero coalesce so chunk 0 reaches the client immediately. */
    const minChunkBytes = job.sentenceId === 0 ? 0 : undefined;
    const result = await synthesizeSpeech({
      text: job.text,
      model: this.ttsModel,
      speed: this.ttsSpeed,
      pronunciations: this.pronunciations,
      learningLanguage: this.targetLanguage,
      voiceVariant: this.voiceVariant,
      user: this.user,
      encoding: streamEncoding,
      minChunkBytes,
      onChunk: (buffer, index, done) => {
        if (this.destroyed || this.activeTurnId !== job.turnId) {
          return;
        }
        if (done) {
          return;
        }
        if (!buffer?.length) {
          return;
        }
        chunkIndex = index;
        streamedBytes += buffer.length;
        if (!firstChunkSent) {
          firstChunkSent = true;
          if (job.sentenceId === 0 && !this.openerTtsChunkStarted) {
            this.openerTtsChunkStarted = true;
            logRealtimeTurn('tts opener streaming', {
              sessionId: this.sessionId,
              turnId: job.turnId,
              sentenceId: job.sentenceId,
            });
            setImmediate(() => this.pumpTtsQueue());
          }
          const latencyMs = this.turnStartedAt ? Date.now() - this.turnStartedAt : null;
          logRealtimeTurn('tts first chunk', {
            sessionId: this.sessionId,
            turnId: job.turnId,
            sentenceId: job.sentenceId,
            bytes: buffer.length,
            encoding: streamEncoding,
            msSinceLlmStart: latencyMs,
          });
        }
        this.send({
          type: 'tts_audio_chunk',
          ok: true,
          sessionId: this.sessionId,
          turnId: job.turnId,
          sentenceId: job.sentenceId,
          chunkIndex: index,
          done: false,
          audioBase64: buffer.toString('base64'),
          encoding: streamEncoding,
          mimeType: streamMimeType,
          sampleRate: streamSampleRate,
        });
      },
    });
    if (this.destroyed || this.activeTurnId !== job.turnId) {
      return;
    }
    if (result.streamed || firstChunkSent) {
      this.send({
        type: 'tts_audio_end',
        ok: true,
        sessionId: this.sessionId,
        turnId: job.turnId,
        sentenceId: job.sentenceId,
        text: job.text,
        mimeType: streamMimeType,
        encoding: streamEncoding,
        sampleRate: streamSampleRate,
        chunkCount: chunkIndex + 1,
        streamedBytes,
      });
    } else if (result.audioBase64) {
      this.send({
        type: 'tts_audio',
        ok: true,
        sessionId: this.sessionId,
        turnId: job.turnId,
        sentenceId: job.sentenceId,
        text: job.text,
        audioBase64: result.audioBase64,
        mimeType: result.mimeType || streamMimeType,
        encoding: streamEncoding,
        sampleRate: streamSampleRate,
      });
    }
    if (job.sentenceId >= 0) {
      this.ttsAudioSent = true;
    }
    const latencyMs = this.turnStartedAt ? Date.now() - this.turnStartedAt : null;
    logRealtimeTurn('tts audio sent', {
      sessionId: this.sessionId,
      turnId: job.turnId,
      sentenceId: job.sentenceId,
      audioBytes: streamedBytes || result.audioBase64?.length || 0,
      msSinceLlmStart: latencyMs,
      streamed: Boolean(firstChunkSent),
    });
  }

  async runFallbackTtsJob(turnId, text) {
    if (this.destroyed || this.activeTurnId !== turnId) {
      return;
    }
    try {
      logRealtimeTurn('tts fallback starting', {
        sessionId: this.sessionId,
        turnId,
        text,
      });
      const result = await synthesizeSpeech({
        text,
        model: this.ttsModel,
        speed: this.ttsSpeed,
        pronunciations: this.pronunciations,
        learningLanguage: this.targetLanguage,
        voiceVariant: this.voiceVariant,
        user: this.user,
        encoding: REALTIME_TTS_ENCODING,
      });
      if (this.destroyed || this.activeTurnId !== turnId) {
        return;
      }
      this.send({
        type: 'tts_audio',
        ok: true,
        sessionId: this.sessionId,
        turnId,
        sentenceId: this.sentenceIndex++,
        text,
        audioBase64: result.audioBase64,
        mimeType: result.mimeType || 'audio/wav',
        encoding: result.encoding || REALTIME_TTS_ENCODING,
        sampleRate: result.sampleRate,
      });
      this.ttsAudioSent = true;
      logRealtimeTurn('tts fallback audio sent', {
        sessionId: this.sessionId,
        turnId,
        audioBytes: result.audioBase64?.length || 0,
      });
    } catch (error) {
      logRealtimeTurn('tts fallback failed', {
        sessionId: this.sessionId,
        turnId,
        message: error?.message,
        code: error?.code,
      });
      this.send({
        type: 'tts_error',
        ok: false,
        sessionId: this.sessionId,
        turnId,
        message: 'TTS failed.',
      });
    }
  }

  waitForTtsDrain() {
    return new Promise(resolve => {
      const check = () => {
        if (this.destroyed || (this.ttsQueue.length === 0 && this.activeTtsJobs === 0)) {
          resolve();
          return;
        }
        setTimeout(check, 25);
      };
      check();
    });
  }

  hasTranscript() {
    return Boolean(normalizeTranscript(this.latestTranscript));
  }

  markUtteranceEnd() {
    if (this.started || this.destroyed) {
      return;
    }
    if (!this.inputEnded) {
      return;
    }
    const clean = normalizeTranscript(this.latestTranscript);
    if (!meetsLlmTriggerThreshold(clean, true) || looksIncompleteTranscript(clean)) {
      return;
    }
    this.userTurnCommitted = true;
    logRealtimeTurn('schedule llm on utterance_end', {
      sessionId: this.sessionId,
      transcript: clean,
    });
    this.send({
      type: 'force_end_user_turn',
      ok: true,
      sessionId: this.sessionId,
      transcript: clean,
    });
    this.scheduleLlmAfterSilence(0);
  }

  markInputEnded() {
    if (this.inputEnded && !this.started) {
      logRealtimeTurn('duplicate input end ignored', {
        sessionId: this.sessionId,
        hasTranscript: Boolean(this.latestTranscript),
        hasTriggerTimer: Boolean(this.triggerTimer),
      });
      return;
    }
    this.inputEnded = true;
    this.userTurnCommitted = true;
    if (this.stablePartialTimer) {
      clearTimeout(this.stablePartialTimer);
      this.stablePartialTimer = null;
    }
    if (this.silenceTakeoverTimer) {
      clearTimeout(this.silenceTakeoverTimer);
      this.silenceTakeoverTimer = null;
    }
    logRealtimeTurn('input ended', {
      sessionId: this.sessionId,
      started: this.started,
      hasTranscript: Boolean(this.latestTranscript),
    });
    if (this.activeTurnId && this.ttsPhraseBatch.length > 0) {
      this.flushTtsPhraseBatch(this.activeTurnId, { force: true, reason: 'input_end' });
    }
    if (this.started) {
      return;
    }
    if (this.triggerTimer) {
      logRealtimeTurn('input end, llm already scheduled', {
        sessionId: this.sessionId,
      });
      return;
    }

      if (!this.started) {
      if (!this.latestTranscript) {
        if (this.noiseOnlyTurn) {
          logRealtimeTurn('empty turn from noise transcript', {
            sessionId: this.sessionId,
          });
          this.send({
            type: 'turn_empty',
            ok: true,
            sessionId: this.sessionId,
          });
          return;
        }
        const recentTranscriptMs = this.lastTranscriptAt ? Date.now() - this.lastTranscriptAt : Infinity;
        if (recentTranscriptMs < 2500) {
          logRealtimeTurn('empty input end ignored, recent transcript still settling', {
            sessionId: this.sessionId,
            recentTranscriptMs,
          });
          return;
        }
        this.latestTranscript = FALLBACK_PROMPT;
        logRealtimeTurn('fallback prompt for empty transcript', {
          sessionId: this.sessionId,
          prompt: this.latestTranscript,
        });
      }
      if (looksIncompleteTranscript(this.latestTranscript)) {
        logRealtimeTurn('input ended with incomplete transcript, wait for refinement', {
          sessionId: this.sessionId,
          transcript: this.latestTranscript,
        });
        const finalizeDelay = Math.max(STT_FINALIZE_MS, INCOMPLETE_INPUT_FINALIZE_MS);
        this.scheduleLlmAfterSilence(finalizeDelay, { trustSilence: true });
        return;
      }
      if (!meetsCommittedUserTurn(this.latestTranscript)) {
        logRealtimeTurn('input ended with short transcript, wait for refinement', {
          sessionId: this.sessionId,
          transcript: this.latestTranscript,
        });
        this.scheduleLlmAfterSilence(Math.max(STT_FINALIZE_MS, INCOMPLETE_INPUT_FINALIZE_MS), {
          trustSilence: true,
        });
        return;
      }
      logRealtimeTurn('schedule llm on input end', {
        sessionId: this.sessionId,
        finalizeMs: STT_FINALIZE_MS,
        incomplete: false,
      });
      this.scheduleLlmAfterSilence(STT_FINALIZE_MS, { trustSilence: true });
    }
  }

  destroy() {
    this.destroyed = true;
    logRealtimeTurn('destroy', { sessionId: this.sessionId });
    if (this.triggerTimer) {
      clearTimeout(this.triggerTimer);
      this.triggerTimer = null;
    }
    if (this.stablePartialTimer) {
      clearTimeout(this.stablePartialTimer);
      this.stablePartialTimer = null;
    }
    if (this.silenceTakeoverTimer) {
      clearTimeout(this.silenceTakeoverTimer);
      this.silenceTakeoverTimer = null;
    }
    if (this.ttsPhraseBatchTimer) {
      clearTimeout(this.ttsPhraseBatchTimer);
      this.ttsPhraseBatchTimer = null;
    }
    if (this.abortController) {
      this.abortController.abort();
    }
    this.ttsQueue = [];
    this.lastStagedTtsText = '';
  }
}

const prewarmVoiceFiller = ({ ttsModel, ttsSpeed = 1, pronunciations = [], targetLanguage, voiceVariant, user }) => {
  if (!VOICE_FILLER_ENABLED) {
    return Promise.resolve(null);
  }
  const cacheKey = `${ttsModel}|${ttsSpeed}|mp3`;
  if (!voiceFillerCache.has(cacheKey)) {
    voiceFillerCache.set(
      cacheKey,
      synthesizeSpeech({
        text: VOICE_FILLER_TEXT,
        model: ttsModel,
        speed: ttsSpeed,
        pronunciations,
        learningLanguage: targetLanguage,
        voiceVariant,
        user,
        encoding: 'mp3',
      }),
    );
  }
  return voiceFillerCache.get(cacheKey);
};

module.exports = {
  RealtimeTurnEngine,
  prewarmVoiceFiller,
};
