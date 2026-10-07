const { normalizeLearningLanguage, resolveLearningLanguage } = require('../config/learningLanguage');
const { isMessageInLearningLanguage } = require('../utils/languageMatch');

const SKILL_KEYS = ['listening', 'speaking', 'vocabulary', 'grammar'];

/** Activity ids per skill; must match ASSESSMENT_META in the app. */
const SKILL_ACTIVITY_IDS = {
  listening: ['sudoword', 'storyRush', 'call', 'chat'],
  speaking: ['callParticipation', 'callQuality', 'storyRush', 'chat'],
  vocabulary: ['wordGames', 'call', 'chat'],
  grammar: ['wordGames', 'call', 'chat'],
};

const GAME_ACTIVITY_MAP = {
  sudoword: [['listening', 'sudoword']],
  synoword: [['vocabulary', 'wordGames']],
  antoword: [['vocabulary', 'wordGames']],
  wordsense: [['vocabulary', 'wordGames']],
  word_detective: [['vocabulary', 'wordGames']],
  context_master: [['grammar', 'wordGames']],
  sentence_builder: [['grammar', 'wordGames']],
  story_rush: [
    ['speaking', 'storyRush'],
    ['listening', 'storyRush'],
  ],
};

const GAME_SKILL_MAP = Object.fromEntries(
  Object.entries(GAME_ACTIVITY_MAP).map(([key, pairs]) => [key, pairs.map(([skill]) => skill)]),
);

const EMA_ALPHA = 0.18;
const ACTIVITY_EMA_ALPHA = 0.3;

const clampScore = value => Math.max(0, Math.min(100, Math.round(Number(value) || 0)));

const defaultSkillScores = () => ({
  listening: 15,
  speaking: 15,
  vocabulary: 15,
  grammar: 15,
});

const defaultCounts = () => ({
  games: 0,
  calls: 0,
  callDurationSec: 0,
  callUserWords: 0,
  chatMessages: 0,
  chatOffLanguage: 0,
});

const seedSkillScoresFromOnboarding = user => {
  const level = String(user?.onboarding?.level || '').toLowerCase();
  const base = level.includes('advanced') ? 48 : level.includes('intermediate') ? 30 : 15;
  return {
    listening: base,
    speaking: base,
    vocabulary: base,
    grammar: base,
  };
};

const normalizeAccuracy = (accuracy, correct, total) => {
  if (Number.isFinite(accuracy)) {
    return accuracy > 1 ? Math.min(1, accuracy / 100) : Math.max(0, Math.min(1, accuracy));
  }
  const c = Number(correct);
  const t = Number(total);
  if (Number.isFinite(c) && Number.isFinite(t) && t > 0) {
    return Math.max(0, Math.min(1, c / t));
  }
  return 0.5;
};

const sessionScoreFromAccuracy = (accuracy, correct, total) =>
  clampScore(normalizeAccuracy(accuracy, correct, total) * 100);

const mergeScore = (current, sessionScore, alpha) =>
  clampScore(clampScore(current) * (1 - alpha) + clampScore(sessionScore) * alpha);

const resolveLanguage = (user, language) =>
  language ? normalizeLearningLanguage(language) : resolveLearningLanguage(user);

const sanitizeScores = (raw, fallback) => ({
  listening: clampScore(raw?.listening ?? fallback.listening),
  speaking: clampScore(raw?.speaking ?? fallback.speaking),
  vocabulary: clampScore(raw?.vocabulary ?? fallback.vocabulary),
  grammar: clampScore(raw?.grammar ?? fallback.grammar),
});

const sanitizeActivities = raw => {
  const result = {};
  SKILL_KEYS.forEach(skill => {
    result[skill] = {};
    SKILL_ACTIVITY_IDS[skill].forEach(id => {
      const value = raw?.[skill]?.[id];
      result[skill][id] = Number.isFinite(Number(value)) && value !== null ? clampScore(value) : null;
    });
  });
  return result;
};

const sanitizeCounts = raw => {
  const base = defaultCounts();
  Object.keys(base).forEach(key => {
    base[key] = Math.max(0, Math.round(Number(raw?.[key]) || 0));
  });
  return base;
};

/** Scores a brand-new language entry starts from. */
const initialScoresForLanguage = (user, language) => {
  const legacy = user?.dashboard?.skillScores;
  const hasLegacy = legacy && SKILL_KEYS.every(key => Number.isFinite(Number(legacy[key])));
  const isCurrentLanguage = language === resolveLearningLanguage(user);
  if (isCurrentLanguage && hasLegacy && !user?.dashboard?.skillProgress) {
    return sanitizeScores(legacy, defaultSkillScores());
  }
  return isCurrentLanguage
    ? { ...defaultSkillScores(), ...seedSkillScoresFromOnboarding(user) }
    : defaultSkillScores();
};

const readLanguageEntry = (user, language) => {
  const entry = user?.dashboard?.skillProgress?.[language];
  const fallbackScores = initialScoresForLanguage(user, language);
  return {
    scores: sanitizeScores(entry?.scores, fallbackScores),
    activities: sanitizeActivities(entry?.activities),
    counts: sanitizeCounts(entry?.counts),
  };
};

const getSkillScores = (user, language) => readLanguageEntry(user, resolveLanguage(user, language)).scores;

const getSkillBreakdown = (user, language) => {
  const lang = resolveLanguage(user, language);
  const entry = readLanguageEntry(user, lang);
  return { language: lang, activities: entry.activities, counts: entry.counts };
};

const buildSkillPayload = (user, language) => ({
  skillScores: getSkillScores(user, language),
  skillBreakdown: getSkillBreakdown(user, language),
});

/**
 * updates = {
 *   scores: { [skill]: sessionScore },
 *   activities: { [skill]: { [activityId]: sessionScore } },
 *   counts: { [countKey]: increment },
 * }
 */
const applySkillUpdates = (user, updates, language) => {
  const lang = resolveLanguage(user, language);
  if (!updates || typeof updates !== 'object') {
    return getSkillScores(user, lang);
  }
  if (!user.dashboard) {
    user.dashboard = {};
  }
  const progress =
    user.dashboard.skillProgress && typeof user.dashboard.skillProgress === 'object'
      ? user.dashboard.skillProgress
      : {};
  const entry = readLanguageEntry(user, lang);

  SKILL_KEYS.forEach(skill => {
    const session = updates.scores?.[skill];
    if (session != null) {
      entry.scores[skill] = mergeScore(entry.scores[skill], session, EMA_ALPHA);
    }
    const activityUpdates = updates.activities?.[skill] || {};
    Object.entries(activityUpdates).forEach(([id, value]) => {
      if (value == null || !SKILL_ACTIVITY_IDS[skill].includes(id)) {
        return;
      }
      const previous = entry.activities[skill][id];
      entry.activities[skill][id] =
        previous == null ? clampScore(value) : mergeScore(previous, value, ACTIVITY_EMA_ALPHA);
    });
  });
  Object.entries(updates.counts || {}).forEach(([key, value]) => {
    if (key in entry.counts) {
      entry.counts[key] += Math.max(0, Math.round(Number(value) || 0));
    }
  });

  user.dashboard.skillProgress = { ...progress, [lang]: entry };
  user.markModified('dashboard.skillProgress');
  if (lang === resolveLearningLanguage(user)) {
    user.dashboard.skillScores = { ...entry.scores };
    user.markModified('dashboard.skillScores');
  }
  return entry.scores;
};

const evaluateVoiceCall = ({ turns = [], durationSec = 0, language }) => {
  const safeTurns = Array.isArray(turns) ? turns : [];
  const userTexts = safeTurns
    .map(turn => (typeof turn?.user === 'string' ? turn.user.trim() : ''))
    .filter(Boolean);
  const joined = userTexts.join(' ');
  const userWordCount = joined.split(/\s+/).filter(Boolean).length;
  const turnCount = userTexts.length;
  const duration = Math.max(0, Number(durationSec) || 0);
  const inLanguage = !language || !joined || isMessageInLearningLanguage(joined, language);

  const participation =
    Math.min(1, userWordCount / 45) * 0.42 +
    Math.min(1, turnCount / 8) * 0.33 +
    Math.min(1, duration / 180) * 0.25;

  const avgWordsPerTurn = turnCount > 0 ? userWordCount / turnCount : 0;
  let utteranceQuality = 0.35;
  if (turnCount > 0) {
    if (avgWordsPerTurn < 1) {
      utteranceQuality = 0.38;
    } else if (avgWordsPerTurn > 24) {
      utteranceQuality = 0.72;
    } else {
      utteranceQuality = 0.45 + Math.min(0.5, avgWordsPerTurn / 14);
    }
  }

  const participationScore = clampScore(participation * 100);
  const qualityScore = clampScore(utteranceQuality * 100);
  const speakingSession = clampScore(participationScore * 0.55 + qualityScore * 0.45);
  const listeningSession = clampScore(
    (Math.min(1, turnCount / 6) * 0.62 + Math.min(1, duration / 120) * 0.38) * 100,
  );
  const uniqueWords = new Set(
    joined
      .toLowerCase()
      .split(/\W+/)
      .filter(word => word.length > 2),
  );
  const vocabularySession = Math.round(clampScore(28 + uniqueWords.size * 2.2) * 0.55);
  const grammarSession = Math.round(listeningSession * 0.45);

  const updates = {
    scores: { speaking: speakingSession, listening: listeningSession },
    activities: {
      listening: { call: listeningSession },
      speaking: { callParticipation: participationScore, callQuality: qualityScore },
    },
    counts: { calls: 1, callDurationSec: duration, callUserWords: userWordCount },
  };
  if (inLanguage) {
    updates.scores.vocabulary = vocabularySession;
    updates.scores.grammar = grammarSession;
    updates.activities.vocabulary = { call: vocabularySession };
    updates.activities.grammar = { call: grammarSession };
  }
  return updates;
};

const evaluateChatMessage = (message, language) => {
  const text = String(message || '').trim();
  if (!text) {
    return {};
  }
  if (language && !isMessageInLearningLanguage(text, language)) {
    return { counts: { chatOffLanguage: 1 } };
  }
  const words = text.split(/\s+/).filter(Boolean);
  const uniqueRatio = words.length
    ? new Set(words.map(word => word.toLowerCase())).size / words.length
    : 0;
  const lengthScore = clampScore(38 + words.length * 7);
  const scores = {
    speaking: Math.round(lengthScore * 0.62),
    vocabulary: Math.round(lengthScore * (0.4 + uniqueRatio * 0.15)),
    grammar: Math.round(lengthScore * 0.46),
    listening: Math.round(lengthScore * 0.34),
  };
  return {
    scores,
    activities: {
      listening: { chat: scores.listening },
      speaking: { chat: scores.speaking },
      vocabulary: { chat: scores.vocabulary },
      grammar: { chat: scores.grammar },
    },
    counts: { chatMessages: 1 },
  };
};

const recordGameActivity = ({ gameKey, correct, total, accuracy }) => {
  const pairs = GAME_ACTIVITY_MAP[gameKey] || [['vocabulary', 'wordGames']];
  const sessionScore = sessionScoreFromAccuracy(accuracy, correct, total);
  const updates = { scores: {}, activities: {}, counts: { games: 1 } };
  pairs.forEach(([skill, activityId]) => {
    updates.scores[skill] = sessionScore;
    updates.activities[skill] = { ...(updates.activities[skill] || {}), [activityId]: sessionScore };
  });
  return updates;
};

const hasUpdates = updates =>
  Boolean(
    updates &&
      (Object.keys(updates.scores || {}).length ||
        Object.keys(updates.activities || {}).length ||
        Object.keys(updates.counts || {}).length),
  );

const resolveSkillActivityUpdates = (payload = {}, language) => {
  const { source } = payload;
  if (source === 'game') {
    return recordGameActivity(payload);
  }
  if (source === 'chat') {
    return evaluateChatMessage(payload.message, language);
  }
  if (source === 'call') {
    return evaluateVoiceCall({ ...payload, language });
  }
  return {};
};

const recordSkillActivity = async (user, payload = {}, options = {}) => {
  const language = resolveLanguage(user, options.language);
  const updates = resolveSkillActivityUpdates(payload, language);
  if (hasUpdates(updates)) {
    applySkillUpdates(user, updates, language);
    if (options.persist !== false) {
      await user.save();
    }
  }
  return buildSkillPayload(user, language);
};

const recordVoiceCallSummary = async (user, { turns, durationSec, language }) => {
  const lang = resolveLanguage(user, language);
  applySkillUpdates(user, evaluateVoiceCall({ turns, durationSec, language: lang }), lang);
  await user.save();
  return buildSkillPayload(user, lang);
};

module.exports = {
  SKILL_KEYS,
  SKILL_ACTIVITY_IDS,
  GAME_SKILL_MAP,
  defaultSkillScores,
  getSkillScores,
  getSkillBreakdown,
  buildSkillPayload,
  applySkillUpdates,
  hasUpdates,
  resolveSkillActivityUpdates,
  recordSkillActivity,
  recordVoiceCallSummary,
  evaluateVoiceCall,
  evaluateChatMessage,
  sessionScoreFromAccuracy,
};
