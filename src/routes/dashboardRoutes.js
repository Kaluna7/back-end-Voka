const express = require('express');
const {
  getDashboard,
  saveDashboard,
  saveInterviewTeacherSetup,
  recordSkillEvent,
  saveVoiceCallSummary,
  chatWithAi,
  evaluateReadAloud,
  transcribeSpeech,
  getDeepgramSttToken,
  voiceCallWithAi,
  synthesizeChatTts,
} = require('../controllers/dashboardController');

const router = express.Router();

router.get('/:userId/dashboard', getDashboard);
router.put('/:userId/dashboard', saveDashboard);
router.put('/:userId/interview-teacher-setup', saveInterviewTeacherSetup);
router.post('/:userId/chat', chatWithAi);
router.post('/:userId/chat/tts', synthesizeChatTts);
router.post('/:userId/chat/voice-call', voiceCallWithAi);
router.post('/:userId/skill-events', recordSkillEvent);
router.post('/:userId/voice-call/summary', saveVoiceCallSummary);
router.post('/:userId/speaking/read-aloud/evaluate', evaluateReadAloud);
router.post('/:userId/speaking/transcribe', transcribeSpeech);
router.get('/:userId/deepgram/stt-token', getDeepgramSttToken);

module.exports = router;
