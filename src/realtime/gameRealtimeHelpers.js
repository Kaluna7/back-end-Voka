const { normalizeLearningLanguage } = require('../config/learningLanguage');

const parseJoinLearningLanguage = payload =>
  normalizeLearningLanguage(payload?.learningLanguage);

const resolveRoomLearningLanguage = humans => {
  const first = humans.find(entry => entry?.learningLanguage);
  return normalizeLearningLanguage(first?.learningLanguage);
};

/**
 * Next AI item from a shuffled per-player deck: every question is used once before any
 * repeats, and a new round never starts with the question just seen.
 */
const drawFromDeck = (holder, items) => {
  if (!Array.isArray(items) || items.length === 0) {
    return null;
  }
  if (!Array.isArray(holder.aiDeck) || holder.aiDeck.length === 0 || holder.aiDeckSize !== items.length) {
    const order = items.map((_, index) => index);
    for (let i = order.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    if (order.length > 1 && order[order.length - 1] === holder.aiLastIndex) {
      [order[0], order[order.length - 1]] = [order[order.length - 1], order[0]];
    }
    holder.aiDeck = order;
    holder.aiDeckSize = items.length;
  }
  const index = holder.aiDeck.pop();
  holder.aiLastIndex = index;
  return [items[index]];
};

/** Main text of a challenge, used to avoid showing the same question twice in a match. */
const challengeKey = challenge =>
  String(
    challenge?.definition ||
      challenge?.sentence ||
      challenge?.prompt ||
      challenge?.clue ||
      challenge?.word ||
      challenge?.title ||
      (Array.isArray(challenge?.tokens) ? challenge.tokens.map(token => token.word).sort().join(' ') : '') ||
      '',
  );

/** Builds a challenge the holder hasn't seen in this match (a few tries for built-in banks). */
const pickFreshChallenge = (holder, make) => {
  if (!holder.seenChallenges) {
    holder.seenChallenges = new Set();
  }
  let challenge = make();
  for (let attempt = 0; attempt < 8 && holder.seenChallenges.has(challengeKey(challenge)); attempt += 1) {
    challenge = make();
  }
  holder.seenChallenges.add(challengeKey(challenge));
  return challenge;
};

module.exports = {
  parseJoinLearningLanguage,
  resolveRoomLearningLanguage,
  drawFromDeck,
  pickFreshChallenge,
};
