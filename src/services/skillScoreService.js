const SKILL_KEYS = ['listening', 'speaking', 'vocabulary', 'grammar'];

const GAME_SKILL_MAP = {
  sudoword: ['listening'],
  synoword: ['vocabulary'],
  antoword: ['vocabulary'],
  wordsense: ['vocabulary'],
  word_detective: ['vocabulary'],
  context_master: ['grammar'],
  sentence_builder: ['grammar'],
  story_rush: ['speaking', 'listening'],
};

const PRACTICE_ROUTE_SKILL = {
  spelling: 'listening',
  vocabulary: 'vocabulary',
  sentenceExpression: 'grammar',
  speakingPractice: 'speaking',
};

const EMA_ALPHA = 0.18;

const clampScore = value => Math.max(0, Math.min(100, Math.round(Number(value) || 0)));

const defaultSkillScores = () => ({
  listening: 15,
  speaking: 15,
  vocabulary: 15,
  grammar: 15,
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

const sessionScoreFromAccuracy = accuracy => clampScore(normalizeAccuracy(accuracy) * 100);

const mergeSkillScore = (current, sessionScore) => {
  const base = clampScore(current);
  const session = clampScore(sessionScore);
  return clampScore(base * (1 - EMA_ALPHA) + session * EMA_ALPHA);
};

const ensureSkillScores = user => {
  if (!user.dashboard) {
    user.dashboard = {};
  }
  const existing = user.dashboard.skillScores;
  const hasAll =
    existing &&
    SKILL_KEYS.every(key => Number.isFinite(Number(existing[key])));
  if (!hasAll) {
    user.dashboard.skillScores = {
      ...defaultSkillScores(),
      ...seedSkillScoresFromOnboarding(user),
      ...(existing || {}),
    };
    user.markModified('dashboard.skillScores');
  }
  return user.dashboard.skillScores;
};

const getSkillScores = user => {
  const scores = user?.dashboard?.skillScores;
  const fallback = {
    ...defaultSkillScores(),
    ...seedSkillScoresFromOnboarding(user),
  };
  if (!scores) {
    return fallback;
  }
  return {
    listening: clampScore(scores.listening ?? fallback.listening),
    speaking: clampScore(scores.speaking ?? fallback.speaking),
    vocabulary: clampScore(scores.vocabulary ?? fallback.vocabulary),
    grammar: clampScore(scores.grammar ?? fallback.grammar),
  };
};

const applySkillUpdates = (user, updates) => {
  if (!updates || typeof updates !== 'object') {
    return getSkillScores(user);
  }
  const scores = ensureSkillScores(user);
  SKILL_KEYS.forEach(key => {
    if (updates[key] == null) {
      return;
    }
    scores[key] = mergeSkillScore(scores[key], updates[key]);
  });
  user.markModified('dashboard.skillScores');
  return getSkillScores(user);
};

const mapSessionToSkills = (skillNames, sessionScore) => {
  const updates = {};
  skillNames.forEach(key => {
    if (SKILL_KEYS.includes(key)) {
      updates[key] = sessionScore;
    }
  });
  return updates;
};

const evaluateVoiceCall = ({ turns = [], durationSec = 0 }) => {
  const safeTurns = Array.isArray(turns) ? turns : [];
  const userTexts = safeTurns
    .map(turn => (typeof turn?.user === 'string' ? turn.user.trim() : ''))
    .filter(Boolean);
  const userWordCount = userTexts.join(' ').split(/\s+/).filter(Boolean).length;
  const turnCount = userTexts.length;
  const duration = Math.max(0, Number(durationSec) || 0);

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

  const speakingSession = clampScore((participation * 0.55 + utteranceQuality * 0.45) * 100);
  const listeningSession = clampScore(
    (Math.min(1, turnCount / 6) * 0.62 + Math.min(1, duration / 120) * 0.38) * 100,
  );

  const uniqueWords = new Set(
    userTexts
      .join(' ')
      .toLowerCase()
      .split(/\W+/)
      .filter(word => word.length > 2),
  );
  const vocabularySession = clampScore(28 + uniqueWords.size * 2.2);

  return {
    speaking: speakingSession,
    listening: listeningSession,
    vocabulary: Math.round(vocabularySession * 0.55),
    grammar: Math.round(listeningSession * 0.45),
  };
};

const evaluateChatMessage = message => {
  const words = String(message || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  const lengthScore = clampScore(38 + words * 7);
  return {
    speaking: Math.round(lengthScore * 0.62),
    vocabulary: Math.round(lengthScore * 0.5),
    grammar: Math.round(lengthScore * 0.46),
    listening: Math.round(lengthScore * 0.34),
  };
};

const recordGameActivity = ({ gameKey, correct, total, accuracy }) => {
  const skills = GAME_SKILL_MAP[gameKey] || ['vocabulary'];
  const sessionScore = sessionScoreFromAccuracy(accuracy, correct, total);
  return mapSessionToSkills(skills, sessionScore);
};

const recordPracticeActivity = ({ routeCategory, accuracy, progress }) => {
  const skillKey = PRACTICE_ROUTE_SKILL[routeCategory];
  if (!skillKey) {
    return {};
  }
  const acc =
    accuracy != null
      ? normalizeAccuracy(accuracy)
      : normalizeAccuracy(null, progress, 100);
  return { [skillKey]: sessionScoreFromAccuracy(acc) };
};

const recordSkillActivity = async (user, payload = {}) => {
  const { source } = payload;
  let updates = {};

  if (source === 'game') {
    updates = recordGameActivity(payload);
  } else if (source === 'practice') {
    updates = recordPracticeActivity(payload);
  } else if (source === 'chat') {
    updates = evaluateChatMessage(payload.message);
  } else if (source === 'call') {
    updates = evaluateVoiceCall(payload);
  } else if (payload.skills && typeof payload.skills === 'object') {
    Object.entries(payload.skills).forEach(([key, value]) => {
      if (SKILL_KEYS.includes(key)) {
        updates[key] = sessionScoreFromAccuracy(value);
      }
    });
  } else if (payload.accuracy != null || (payload.correct != null && payload.total != null)) {
    const sessionScore = sessionScoreFromAccuracy(
      payload.accuracy,
      payload.correct,
      payload.total,
    );
    const targetSkills = Array.isArray(payload.targetSkills)
      ? payload.targetSkills.filter(key => SKILL_KEYS.includes(key))
      : ['speaking'];
    updates = mapSessionToSkills(targetSkills.length ? targetSkills : ['speaking'], sessionScore);
  }

  if (!Object.keys(updates).length) {
    return getSkillScores(user);
  }

  applySkillUpdates(user, updates);
  await user.save();
  return getSkillScores(user);
};

const recordVoiceCallSummary = async (user, { turns, durationSec }) => {
  const updates = evaluateVoiceCall({ turns, durationSec });
  applySkillUpdates(user, updates);
  await user.save();
  return getSkillScores(user);
};

module.exports = {
  SKILL_KEYS,
  GAME_SKILL_MAP,
  getSkillScores,
  ensureSkillScores,
  applySkillUpdates,
  recordSkillActivity,
  recordVoiceCallSummary,
  evaluateVoiceCall,
  evaluateChatMessage,
  sessionScoreFromAccuracy,
};
