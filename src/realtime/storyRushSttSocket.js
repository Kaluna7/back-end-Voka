const { WebSocketServer } = require('ws');
const { matchesWsPath } = require('./wsPathMatch');
const { createDeepgramLiveSession } = require('../services/deepgramStreamingService');
const { resolveDeepgramSttLanguage } = require('../config/learningLanguage');

const WS_PATH = '/ws/story-rush-stt';
const MAX_PENDING_AUDIO_CHUNKS = 160;

const sendJson = (socket, payload) => {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
};

const registerStoryRushSttSocket = server => {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    if (!matchesWsPath(request.url, WS_PATH)) {
      return;
    }
    wss.handleUpgrade(request, socket, head, ws => {
      wss.emit('connection', ws);
    });
  });

  wss.on('connection', ws => {
    ws.storyRushSttSessions = new Map();

    ws.on('close', () => {
      for (const session of ws.storyRushSttSessions.values()) {
        try {
          session.deepgram?.destroy?.();
        } catch {}
      }
      ws.storyRushSttSessions.clear();
    });

    ws.on('message', async rawMessage => {
      let message = null;
      try {
        message = JSON.parse(Buffer.isBuffer(rawMessage) ? rawMessage.toString('utf8') : String(rawMessage));
      } catch {
        sendJson(ws, { type: 'stt_error', message: 'Invalid payload.' });
        return;
      }

      const type = message?.type;

      if (type === 'stt_session_start') {
        const sessionId = String(message?.sessionId || '');
        if (!sessionId) {
          sendJson(ws, { type: 'stt_error', message: 'sessionId required.' });
          return;
        }
        if (ws.storyRushSttSessions.has(sessionId)) {
          const old = ws.storyRushSttSessions.get(sessionId);
          try {
            old?.deepgram?.destroy?.();
          } catch {}
          ws.storyRushSttSessions.delete(sessionId);
        }

        const learningLanguage = String(message?.learningLanguage || 'English');
        const session = {
          sessionId,
          learningLanguage,
          deepgram: null,
          pendingAudio: [],
          reconnecting: false,
          sampleRate: Number(message?.sampleRate || 16000),
          channels: Number(message?.channels || 1),
        };
        ws.storyRushSttSessions.set(sessionId, session);

        const attachDeepgram = async () => {
          if (!ws.storyRushSttSessions.has(sessionId)) {
            return null;
          }
          try {
            session.deepgram?.destroy?.();
          } catch {}
          session.deepgram = null;

          const deepgram = await createDeepgramLiveSession({
            sampleRate: session.sampleRate,
            channels: session.channels,
            language: resolveDeepgramSttLanguage(session.learningLanguage),
            smartFormat: false,
            punctuate: false,
            endpointingMs: 250,
            onTranscript: event => {
              const alt = event?.raw?.channel?.alternatives?.[0];
              const rawConf = alt?.confidence;
              const confidence =
                typeof rawConf === 'number' && Number.isFinite(rawConf) && rawConf > 0
                  ? rawConf
                  : 1;
              sendJson(ws, {
                type: 'stt_partial',
                sessionId,
                transcript: event?.transcript || '',
                confidence,
                isFinal: Boolean(event?.isFinal),
                speechFinal: Boolean(event?.speechFinal),
              });
            },
            onError: error => {
              const code = error?.code || 'STT_STREAM_ERROR';
              const closed = code === 'DEEPGRAM_STREAM_CLOSED';
              sendJson(ws, {
                type: 'stt_error',
                sessionId,
                message: error?.message || 'STT stream error.',
                code,
              });
              if (closed && ws.storyRushSttSessions.has(sessionId) && !session.reconnecting) {
                session.reconnecting = true;
                attachDeepgram()
                  .catch(() => {})
                  .finally(() => {
                    session.reconnecting = false;
                  });
              }
            },
          });
          session.deepgram = deepgram;
          const queued = session.pendingAudio.splice(0);
          queued.forEach(buffer => deepgram.sendAudio(buffer));
          return deepgram;
        };

        try {
          await attachDeepgram();
          sendJson(ws, { type: 'stt_ready', ok: true, sessionId });
        } catch (error) {
          ws.storyRushSttSessions.delete(sessionId);
          sendJson(ws, {
            type: 'stt_ready',
            ok: false,
            sessionId,
            message: error?.message || 'Could not start STT.',
            code: error?.code,
          });
        }
        return;
      }

      if (type === 'audio_chunk') {
        const sessionId = String(message?.sessionId || '');
        const session = ws.storyRushSttSessions.get(sessionId);
        if (!session) {
          return;
        }
        const audioBase64 = typeof message?.audioBase64 === 'string' ? message.audioBase64 : '';
        if (!audioBase64) {
          return;
        }
        const buffer = Buffer.from(audioBase64, 'base64');
        if (session.deepgram) {
          session.deepgram.sendAudio(buffer);
        } else {
          session.pendingAudio.push(buffer);
          if (session.pendingAudio.length > MAX_PENDING_AUDIO_CHUNKS) {
            session.pendingAudio.shift();
          }
        }
        return;
      }

      if (type === 'stt_session_stop') {
        const sessionId = String(message?.sessionId || '');
        const session = ws.storyRushSttSessions.get(sessionId);
        if (session) {
          try {
            session.deepgram?.finalize?.();
            session.deepgram?.destroy?.();
          } catch {}
          ws.storyRushSttSessions.delete(sessionId);
        }
        sendJson(ws, { type: 'stt_stopped', ok: true, sessionId });
      }
    });
  });

  console.log(`StoryRush STT socket ready at ${WS_PATH}`);
};

module.exports = { registerStoryRushSttSocket, WS_PATH };
