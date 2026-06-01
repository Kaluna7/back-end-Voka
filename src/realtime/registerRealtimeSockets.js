const { registerVoiceCallSocket } = require('./voiceCallSocket');
const { registerRealtimeVoiceSocket } = require('./realtimeVoiceSocket');
const { registerGameLobbySocket } = require('./gameLobbySocket');
const { registerSudowordSocket } = require('./sudowordSocket');
const { registerSynowordSocket } = require('./synowordSocket');
const { registerAntowordSocket } = require('./antowordSocket');
const { registerWordsenseSocket } = require('./wordsenseSocket');
const { registerWordDetectiveSocket } = require('./wordDetectiveSocket');
const { registerContextMasterSocket } = require('./contextMasterSocket');
const { registerSentenceBuilderSocket } = require('./sentenceBuilderSocket');
const { registerStoryRushSocket } = require('./storyRushSocket');
// StoryRush STT: client → Deepgram direct (token from REST). Relay socket disabled.

/** Attach every WebSocket route used by the mobile app. */
const registerAllRealtimeSockets = server => {
  // One `upgrade` listener per WS path (12 routes).
  server.setMaxListeners(20);

  registerVoiceCallSocket(server);
  console.log('Voice call socket ready at /ws/voice-call');

  registerRealtimeVoiceSocket(server);
  console.log('Realtime voice socket ready at /ws/realtime-voice');

  registerGameLobbySocket(server);
  registerSudowordSocket(server);
  registerSynowordSocket(server);
  registerAntowordSocket(server);
  registerWordsenseSocket(server);
  registerWordDetectiveSocket(server);
  registerContextMasterSocket(server);
  registerSentenceBuilderSocket(server);
  registerStoryRushSocket(server);
};

module.exports = { registerAllRealtimeSockets };
