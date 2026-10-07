const express = require('express');
const { voiceAgentChatCompletions } = require('../controllers/voiceAgentLlmController');

const router = express.Router();

/** Deepgram Voice Agent BYO LLM — OpenAI Chat Completions compatible. */
router.post('/chat/completions', voiceAgentChatCompletions);

module.exports = router;
