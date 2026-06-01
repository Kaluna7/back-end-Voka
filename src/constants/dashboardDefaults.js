const defaultLessons = () => [
  {
    id: 'l1',
    title: 'Basic Greetings',
    subtitle: 'Learn how to say hello and introduce yourself',
    xp: 10,
    progress: 100,
    status: 'completed',
    types: ['Speaking practice (AI voice)', 'Repeat sentences', 'Pronunciation check', 'Simple Q&A'],
  },
  {
    id: 'l2',
    title: 'Daily Conversation',
    subtitle: 'Talk about daily activities',
    xp: 12,
    progress: 40,
    status: 'current',
    types: ['Speaking practice (AI voice)', 'Repeat sentences', 'Pronunciation check', 'Simple Q&A'],
  },
  {
    id: 'l3',
    title: 'At the Restaurant',
    subtitle: 'Order food and ask for recommendations',
    xp: 14,
    progress: 0,
    status: 'locked',
    types: ['Speaking practice (AI voice)', 'Repeat sentences', 'Pronunciation check', 'Simple Q&A'],
  },
];

const defaultChats = () => [
  {
    id: 'h1',
    title: 'Bob - Daily Conversation',
    preview: 'We practiced introducing yourself and small talk.',
    time: '10:24',
    companion: {
      id: 'bob',
      name: 'Bob',
      type: 'teacher',
      image: 'https://api.dicebear.com/7.x/adventurer/png?seed=TeacherBob&backgroundColor=b6e3f4,c0aede,d1d4f9',
      description: 'Teacher Boy',
    },
    messages: [
      { role: 'ai', text: 'Hi, I am Bob. What do you want to practice today?' },
      { role: 'user', text: 'I want to practice daily conversation.' },
    ],
  },
];

const defaultSkillScores = () => ({
  listening: 15,
  speaking: 15,
  vocabulary: 15,
  grammar: 15,
});

const defaultLearnRouteProgress = () => ({
  spelling: {
    'connect-word': 0,
    'hear-and-type': 0,
    'fill-missing': 0,
    'match-word': 0,
    'sentence-arrangement': 0,
  },
  vocabulary: {
    'choose-meaning': 0,
    'choose-correct-usage': 0,
    'context-meaning': 0,
    'synonym-match': 0,
    'antonym-match': 0,
  },
  sentenceExpression: {
    'complete-sentence-context': 0,
    'situation-response': 0,
    'expand-sentence': 0,
    'mini-conversation-choice': 0,
    'sentence-transformation': 0,
  },
  speakingPractice: {
    'read-aloud': 0,
  },
});

const defaultDashboard = () => ({
  remainingTokens: 10,
  selectedPlan: 'starter',
  isPremium: false,
  lessons: defaultLessons(),
  chats: defaultChats(),
  learnRouteProgress: defaultLearnRouteProgress(),
  skillScores: defaultSkillScores(),
});

module.exports = {
  defaultLessons,
  defaultChats,
  defaultLearnRouteProgress,
  defaultSkillScores,
  defaultDashboard,
};
