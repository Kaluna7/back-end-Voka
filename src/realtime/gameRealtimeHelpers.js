const { normalizeLearningLanguage } = require('../config/learningLanguage');

const parseJoinLearningLanguage = payload =>
  normalizeLearningLanguage(payload?.learningLanguage);

const resolveRoomLearningLanguage = humans => {
  const first = humans.find(entry => entry?.learningLanguage);
  return normalizeLearningLanguage(first?.learningLanguage);
};

module.exports = {
  parseJoinLearningLanguage,
  resolveRoomLearningLanguage,
};
