const express = require('express');
const {
  getDashboard,
  saveDashboard,
  deleteChatSessions,
  saveInterviewTeacherSetup,
  recordSkillEvent,
  getSkillProgress,
  saveVoiceCallSummary,
  chatWithAi,
  createOpeningStory,
  transcribeSpeech,
  getDeepgramSttToken,
  voiceCallWithAi,
  synthesizeChatTts,
  getVoiceTokenBalance,
  activateSubscriptionPlan,
  cancelSubscription,
  resumeSubscription,
  verifyGooglePlayPurchase,
  getGooglePlayProducts,
} = require('../controllers/dashboardController');
const { reportGameXp, getGameLeaderboard } = require('../controllers/gameLeaderboardController');

const router = express.Router();

router.get('/:userId/dashboard', getDashboard);
router.get('/:userId/voice-tokens', getVoiceTokenBalance);
router.post('/:userId/subscription/activate', activateSubscriptionPlan);
router.post('/:userId/subscription/cancel', cancelSubscription);
router.post('/:userId/subscription/resume', resumeSubscription);
router.post('/:userId/billing/google/verify', verifyGooglePlayPurchase);
router.get('/:userId/billing/google/products', getGooglePlayProducts);
router.put('/:userId/dashboard', saveDashboard);
router.post('/:userId/dashboard/chats/delete', deleteChatSessions);
router.put('/:userId/interview-teacher-setup', saveInterviewTeacherSetup);
router.post('/:userId/chat', chatWithAi);
router.post('/:userId/chat/opening-story', createOpeningStory);
router.post('/:userId/chat/tts', synthesizeChatTts);
router.post('/:userId/chat/voice-call', voiceCallWithAi);
router.post('/:userId/skill-events', recordSkillEvent);
router.get('/:userId/skill-progress', getSkillProgress);
router.post('/:userId/voice-call/summary', saveVoiceCallSummary);
router.post('/:userId/speaking/transcribe', transcribeSpeech);
router.get('/:userId/deepgram/stt-token', getDeepgramSttToken);
router.post('/:userId/games/xp', reportGameXp);
router.get('/:userId/games/leaderboard', getGameLeaderboard);

module.exports = router;
