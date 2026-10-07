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
const { registerStoryRushSttSocket } = require('./storyRushSttSocket');

const { verifyAccessToken } = require('../security/accessTokens');

/** Token from ?token=... (React Native WebSocket can't set headers) or Authorization. */
const readUpgradeToken = request => {
  try {
    const url = new URL(String(request.url || ''), 'http://localhost');
    const fromQuery = url.searchParams.get('token');
    if (fromQuery) {
      return fromQuery;
    }
  } catch {
    // fall through
  }
  const match = /^Bearer\s+(\S+)$/i.exec(String(request.headers?.authorization || ''));
  return match ? match[1] : '';
};

/**
 * Wraps the server so every socket's `upgrade` listener only runs for authenticated requests.
 * One guard (registered first) verifies the token and either tags the request with the user id
 * or answers 401 and closes the connection.
 */
const withUpgradeAuth = server => {
  server.on('upgrade', (request, socket) => {
    if (!String(request.url || '').startsWith('/ws/')) {
      return;
    }
    const claims = verifyAccessToken(readUpgradeToken(request));
    if (!claims) {
      request.wsRejected = true;
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    request.authUserId = claims.userId;
  });
  return new Proxy(server, {
    get(target, prop) {
      if (prop === 'on' || prop === 'addListener') {
        return (event, listener) => {
          if (event !== 'upgrade') {
            return target.on(event, listener);
          }
          return target.on(event, (request, socket, head) => {
            if (request.wsRejected) {
              return undefined;
            }
            return listener(request, socket, head);
          });
        };
      }
      const value = Reflect.get(target, prop, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
};

/** Attach every WebSocket route used by the mobile app. */
const registerAllRealtimeSockets = rawServer => {
  // One `upgrade` listener per WS path (12 routes) + the auth guard.
  rawServer.setMaxListeners(20);
  const server = withUpgradeAuth(rawServer);

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
  registerStoryRushSttSocket(server);
};

module.exports = { registerAllRealtimeSockets };
