const defaultChats = () => [];

const defaultSkillScores = () => ({
  listening: 15,
  speaking: 15,
  vocabulary: 15,
  grammar: 15,
});

const defaultDashboard = () => ({
  remainingTokens: 10,
  selectedPlan: 'starter',
  isPremium: false,
  chats: defaultChats(),
  skillScores: defaultSkillScores(),
});

module.exports = {
  defaultChats,
  defaultSkillScores,
  defaultDashboard,
};
