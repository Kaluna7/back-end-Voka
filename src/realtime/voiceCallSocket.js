const { WebSocketServer } = require('ws');
const {
  processVoiceCallTurn,
  processVoiceCallFromTranscript,
  prefetchVoiceCallDeepseek,
  finalizeVoiceCallWithReplyText,
  transcriptsMatchForEagerReuse,
} = require('../controllers/dashboardController');
const { User } = require('../models/User');
const {
  resolveLearningLanguage,
  resolveDeepgramSttLanguage,
  resolveTtsModelForUser,
  resolveVoiceVariantForCompanion,
} = require('../config/learningLanguage');
const { getEnv } = require('../config/env');
const { synthesizeSpeech } = require('../services/ttsService');
const {
  createFluxStreamingSttSession,
  transcribeAudioWithDeepgram,
  normalizeBase64Audio,
  prewarmDeepgramTts,
} = require('../services/deepgramService');

const WS_PATH = '/ws/voice-call';

const sendJson = (socket, payload) => {
  if (socket.readyState !== socket.OPEN) {
    return;
  }
  socket.send(JSON.stringify(payload));
};

const splitReplyIntoTtsSentences = reply => {
  const t = String(reply || '').trim();
  if (!t) {
    return [];
  }
  const parts = t
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(Boolean);
  if (parts.length > 0) {
    return parts;
  }
  return [t];
};

const takeCompletedSentences = text => {
  const source = String(text || '').trim();
  if (!source) {
    return { complete: [], rest: '' };
  }
  const matches = source.match(/[^.!?]+[.!?]+(?=\s|$)/g) || [];
  const complete = matches.map(item => item.trim()).filter(Boolean);
  const consumed = complete.join(' ');
  const rest = consumed ? source.slice(consumed.length).trim() : source;
  return { complete, rest };
};

const resolveVoiceVariant = companionId => resolveVoiceVariantForCompanion(companionId);

const buildTtsContext = (user, payload) => {
  const learningLanguage = resolveLearningLanguage(user);
  const voiceVariant = resolveVoiceVariant(payload?.companionId);
  return {
    learningLanguage,
    voiceVariant,
    resolvedModel: resolveTtsModelForUser(user, payload?.model, voiceVariant),
    user,
  };
};

const createLiveSentenceTtsStreamer = (ws, requestId, payload, ttsContext) => {
  let emittedText = '';
  let queue = Promise.resolve();
  let emittedCount = 0;

  const enqueueSentence = sentence => {
    const text = String(sentence || '').trim();
    if (!text) {
      return;
    }
    const index = emittedCount;
    emittedCount += 1;
    queue = queue
      .then(async () => {
        const attempt = () =>
          synthesizeSpeech({
            text,
            speed: payload.speed,
            model: ttsContext.resolvedModel,
            pronunciations: payload.pronunciations,
            learningLanguage: ttsContext.learningLanguage,
            voiceVariant: ttsContext.voiceVariant,
            user: ttsContext.user,
          });
        let chunk = null;
        try {
          chunk = await attempt();
        } catch (firstError) {
          await new Promise(resolve => setTimeout(resolve, 350));
          chunk = await attempt();
        }
        if (!chunk || !chunk.audioBase64) {
          return;
        }
        sendJson(ws, {
          type: 'voice_call_tts_sentence',
          ok: true,
          requestId,
          index,
          total: null,
          audioBase64: chunk.audioBase64,
          mimeType: chunk.mimeType || 'audio/mpeg',
        });
      })
      .catch(() => {});
  };

  const onAiDelta = fullText => {
    const current = String(fullText || '');
    if (current.length <= emittedText.length) {
      return;
    }
    const next = current.slice(emittedText.length);
    const { complete, rest } = takeCompletedSentences(next);
    complete.forEach(enqueueSentence);
    emittedText = current.slice(0, current.length - rest.length);
  };

  const finish = async finalReply => {
    const current = String(finalReply || '').trim();
    const tail = current.slice(emittedText.length).trim();
    if (tail) {
      enqueueSentence(tail);
    }
    await queue;
    sendJson(ws, {
      type: 'voice_call_tts_done',
      ok: emittedCount > 0,
      requestId,
      ttsChunked: emittedCount > 0,
      mimeType: 'audio/mpeg',
      message: emittedCount > 0 ? null : 'Voice output is temporarily unavailable.',
    });
    return emittedCount > 0;
  };

  return { onAiDelta, finish };
};

const streamVoiceCallTtsOverWs = async (ws, requestId, result, payload, ttsContext) => {
  if (result.misunderstood) {
    sendJson(ws, {
      type: 'voice_call_result',
      ok: true,
      requestId,
      data: result,
    });
    return;
  }

  const reply = String(result.reply || '').trim();
  const sentences = splitReplyIntoTtsSentences(reply);
  if (!sentences.length) {
    sendJson(ws, {
      type: 'voice_call_error',
      ok: false,
      requestId,
      message: 'Empty AI reply.',
    });
    return;
  }

  const speed = payload.speed;
  const pronunciations = payload.pronunciations;

  let mimeType = 'audio/mpeg';
  let ttsError = null;
  let sentAnySentence = false;

  sendJson(ws, {
    type: 'voice_call_result',
    ok: true,
    requestId,
    data: {
      transcript: result.transcript,
      reply: result.reply,
      audioBase64: '',
      mimeType,
      ttsChunked: true,
      ttsStreaming: true,
      ttsError: null,
    },
  });

  const synthesizeWithRetry = async sentenceText => {
    const attempt = () =>
      synthesizeSpeech({
        text: sentenceText,
        speed,
        model: ttsContext.resolvedModel,
        pronunciations,
        learningLanguage: ttsContext.learningLanguage,
        voiceVariant: ttsContext.voiceVariant,
        user: ttsContext.user,
      });
    try {
      return await attempt();
    } catch (firstError) {
      await new Promise(resolve => setTimeout(resolve, 350));
      return attempt();
    }
  };

  for (let i = 0; i < sentences.length; i += 1) {
    try {
      const chunk = await synthesizeWithRetry(sentences[i]);
      if (!chunk || !chunk.audioBase64) {
        throw new Error('Empty TTS audio chunk.');
      }
      mimeType = chunk.mimeType || 'audio/mpeg';
      sendJson(ws, {
        type: 'voice_call_tts_sentence',
        ok: true,
        requestId,
        index: i,
        total: sentences.length,
        audioBase64: chunk.audioBase64,
        mimeType: chunk.mimeType || 'audio/mpeg',
      });
      sentAnySentence = true;
    } catch (sentenceError) {
      ttsError = ttsError || 'Sebagian suara gagal diproses, coba lagi.';
    }
  }

  if (!sentAnySentence) {
    ttsError = 'Voice output is temporarily unavailable.';
  }

  sendJson(ws, {
    type: 'voice_call_tts_done',
    ok: sentAnySentence,
    requestId,
    ttsChunked: sentAnySentence,
    mimeType,
    message: ttsError,
  });
};

const mapVoiceCallError = error => {
  const statusCode = Number(error?.statusCode || 0);
  const isConfigError =
    error?.code === 'DEEPGRAM_NOT_CONFIGURED' || error?.code === 'DEEPSEEK_NOT_CONFIGURED';

  let messageText = 'Suara belum bisa diproses. Coba bicara lagi.';
  if (statusCode >= 400 && statusCode < 500) {
    messageText = error?.message || messageText;
  } else if (isConfigError) {
    messageText = error?.message || 'Voice call service is not configured.';
  }
  return messageText;
};

const registerVoiceCallSocket = server => {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    if (!request.url || !request.url.startsWith(WS_PATH)) {
      return;
    }

    wss.handleUpgrade(request, socket, head, ws => {
      // Set by the upgrade guard in registerRealtimeSockets from the verified token.
      ws.authUserId = request.authUserId || '';
      wss.emit('connection', ws);
    });
  });

  wss.on('connection', ws => {
    ws.voiceFluxStreams = new Map();

    ws.on('close', () => {
      if (ws.voiceFluxStreams && ws.voiceFluxStreams.size > 0) {
        for (const entry of ws.voiceFluxStreams.values()) {
          try {
            entry.session?.destroy?.();
          } catch {}
        }
        ws.voiceFluxStreams.clear();
      }
    });

    ws.on('message', async message => {
      let parsed = null;
      try {
        parsed = JSON.parse(Buffer.isBuffer(message) ? message.toString('utf8') : String(message));
      } catch {
        sendJson(ws, {
          type: 'voice_call_error',
          ok: false,
          message: 'Invalid websocket payload.',
        });
        return;
      }
      // Always act for the signed-in user, never for a userId the client typed in.
      if (parsed && typeof parsed === 'object') {
        parsed.userId = ws.authUserId;
      }

      const msgType = parsed?.type;

      if (msgType === 'voice_call_stream_start') {
        const requestId = parsed?.requestId || null;
        const userId = typeof parsed?.userId === 'string' ? parsed.userId : '';
        if (!userId || !requestId) {
          sendJson(ws, {
            type: 'voice_call_stream_ready',
            ok: false,
            requestId,
            message: 'userId and requestId are required.',
          });
          return;
        }
        const apiKey = getEnv('DEEPGRAM_API_KEY');
        if (!apiKey) {
          sendJson(ws, {
            type: 'voice_call_stream_ready',
            ok: false,
            requestId,
            message: 'Deepgram is not configured.',
          });
          return;
        }
        const streamId = String(requestId);
        if (ws.voiceFluxStreams.has(streamId)) {
          sendJson(ws, {
            type: 'voice_call_stream_ready',
            ok: false,
            requestId,
            message: 'Stream already exists for this id.',
          });
          return;
        }
        const voicePrefetchPayload = parsed.payload && typeof parsed.payload === 'object' ? parsed.payload : {};
        const streamEntry = {
          session: null,
          userId,
          voicePrefetchPayload,
          eagerTranscriptSnapshot: null,
          eagerReplyPromise: null,
        };
        ws.voiceFluxStreams.set(streamId, streamEntry);
        try {
          const user = await User.findById(userId);
          if (user) {
            try {
              const warmContext = buildTtsContext(user, voicePrefetchPayload);
              prewarmDeepgramTts(warmContext.resolvedModel).catch(() => {});
            } catch {}
          }
          const sttLanguage = user
            ? resolveDeepgramSttLanguage(resolveLearningLanguage(user))
            : undefined;
          const session = await createFluxStreamingSttSession({
            apiKey,
            language: sttLanguage,
            onPartial: (text, event) => {
              sendJson(ws, {
                type: 'voice_call_stt_partial',
                ok: true,
                streamId,
                text: text || '',
                event: event || '',
              });
              if (event !== 'EagerEndOfTurn') {
                return;
              }
              const inner = ws.voiceFluxStreams.get(streamId);
              if (!inner || !inner.userId) {
                return;
              }
              const snap = String(text || '').trim();
              if (snap.length < 4) {
                return;
              }
              inner.eagerTranscriptSnapshot = snap;
              inner.eagerReplyPromise = prefetchVoiceCallDeepseek({
                userId: inner.userId,
                transcript: snap,
                companionId: inner.voicePrefetchPayload.companionId,
                companionName: inner.voicePrefetchPayload.companionName,
                companionDescription: inner.voicePrefetchPayload.companionDescription,
                companionPrompt: inner.voicePrefetchPayload.companionPrompt,
                history: inner.voicePrefetchPayload.history,
              });
            },
          });
          streamEntry.session = session;
          sendJson(ws, {
            type: 'voice_call_stream_ready',
            ok: true,
            requestId,
            streamId,
          });
        } catch (error) {
          ws.voiceFluxStreams.delete(streamId);
          sendJson(ws, {
            type: 'voice_call_stream_ready',
            ok: false,
            requestId,
            message: error?.message || 'Could not start live transcription.',
          });
        }
        return;
      }

      if (msgType === 'voice_call_stream_chunk') {
        const streamId = String(parsed?.streamId || '');
        const chunkBase64 = typeof parsed?.chunkBase64 === 'string' ? parsed.chunkBase64 : '';
        const entry = ws.voiceFluxStreams?.get(streamId);
        if (!entry || !entry.session || !chunkBase64) {
          return;
        }
        try {
          entry.session.sendMediaChunk(Buffer.from(chunkBase64, 'base64'));
        } catch {}
        return;
      }

      if (msgType === 'voice_call_stream_finish') {
        const requestId = parsed?.requestId || null;
        const streamId = String(parsed?.streamId || '');
        const userId = typeof parsed?.userId === 'string' ? parsed.userId : '';
        const payload = parsed?.payload && typeof parsed.payload === 'object' ? parsed.payload : {};
        const entry = ws.voiceFluxStreams?.get(streamId);

        if (!entry) {
          sendJson(ws, {
            type: 'voice_call_error',
            ok: false,
            requestId,
            message: 'Stream session expired. Try again.',
          });
          return;
        }

        const eagerSnap = entry.eagerTranscriptSnapshot;
        const eagerPromise = entry.eagerReplyPromise;

        ws.voiceFluxStreams.delete(streamId);

        const user = await User.findById(userId);
        if (!user) {
          sendJson(ws, {
            type: 'voice_call_error',
            ok: false,
            requestId,
            message: 'User tidak ditemukan.',
          });
          return;
        }
        const sttLanguage = resolveDeepgramSttLanguage(resolveLearningLanguage(user));

        let transcript = '';
        try {
          transcript = await entry.session.closeAndWaitFinalTranscript();
        } catch (e) {
          try {
            entry.session.destroy();
          } catch {}
          sendJson(ws, {
            type: 'voice_call_error',
            ok: false,
            requestId,
            message: e?.message || 'Live transcription failed.',
          });
          return;
        }
        try {
          entry.session.destroy();
        } catch {}

        const cleanFlux = String(transcript || '').trim();
        if (cleanFlux) {
          transcript = cleanFlux;
        } else if (
          getEnv('DEEPGRAM_STREAM_REST_FALLBACK', 'false').toLowerCase() === 'true' &&
          typeof payload.audioBase64 === 'string' &&
          payload.audioBase64.trim()
        ) {
          try {
            const apiKey = getEnv('DEEPGRAM_API_KEY');
            if (apiKey) {
              const buf = Buffer.from(normalizeBase64Audio(payload.audioBase64), 'base64');
              transcript = await transcribeAudioWithDeepgram({
                audioBuffer: buf,
                mimeType:
                  typeof payload.audioMimeType === 'string' && payload.audioMimeType.trim()
                    ? payload.audioMimeType
                    : 'audio/wav',
                preferRest: true,
                timeoutMs: Number(getEnv('DEEPGRAM_STREAM_REST_FALLBACK_TIMEOUT_MS', '4500')) || 4500,
                language: sttLanguage,
              });
            }
          } catch {}
        } else {
          transcript = '';
        }

        const finalTranscript = String(transcript || '').trim();

        try {
          const ttsContext = buildTtsContext(user, payload);
          const voiceParams = {
            userId,
            user,
            transcript: finalTranscript,
            companionId: payload.companionId,
            companionName: payload.companionName,
            companionDescription: payload.companionDescription,
            companionPrompt: payload.companionPrompt,
            history: payload.history,
            speed: payload.speed,
            model: payload.model,
            pronunciations: payload.pronunciations,
          };

          let result = null;
          if (eagerSnap && eagerPromise && transcriptsMatchForEagerReuse(finalTranscript, eagerSnap)) {
            const cached = await eagerPromise;
            if (typeof cached === 'string' && cached.trim()) {
              result = await finalizeVoiceCallWithReplyText({
                transcript: finalTranscript,
                reply: cached.trim(),
                speed: payload.speed,
                model: payload.model,
                pronunciations: payload.pronunciations,
                skipTts: true,
                user,
                companionId: payload.companionId,
              });
            }
          }
          let liveTtsStreamer = null;
          if (!result) {
            liveTtsStreamer = createLiveSentenceTtsStreamer(ws, requestId, payload, ttsContext);
            result = await processVoiceCallFromTranscript(voiceParams, {
              skipTts: true,
              onAiDelta: text =>
                {
                  sendJson(ws, {
                    type: 'voice_call_ai_partial',
                    ok: true,
                    requestId,
                    text: text || '',
                  });
                  liveTtsStreamer.onAiDelta(text);
                },
            });
          }
          if (liveTtsStreamer) {
            sendJson(ws, {
              type: 'voice_call_result',
              ok: true,
              requestId,
              data: {
                transcript: result.transcript,
                reply: result.reply,
                audioBase64: '',
                mimeType: 'audio/mpeg',
                ttsChunked: true,
                ttsStreaming: true,
                ttsError: null,
              },
            });
            await liveTtsStreamer.finish(result.reply);
          } else {
            await streamVoiceCallTtsOverWs(ws, requestId, result, payload, ttsContext);
          }
        } catch (error) {
          sendJson(ws, {
            type: 'voice_call_error',
            ok: false,
            requestId,
            message: mapVoiceCallError(error),
          });
        }
        return;
      }

      if (msgType !== 'voice_call_turn') {
        sendJson(ws, {
          type: 'voice_call_error',
          ok: false,
          requestId: parsed?.requestId || null,
          message: 'Unsupported websocket message type.',
        });
        return;
      }

      const requestId = parsed?.requestId || null;
      const userId = typeof parsed?.userId === 'string' ? parsed.userId : '';
      const payload = parsed?.payload && typeof parsed.payload === 'object' ? parsed.payload : {};

      if (!userId) {
        sendJson(ws, {
          type: 'voice_call_error',
          ok: false,
          requestId,
          message: 'userId is required.',
        });
        return;
      }

      try {
        const result = await processVoiceCallTurn({
          userId,
          ...payload,
        });
        sendJson(ws, {
          type: 'voice_call_result',
          ok: true,
          requestId,
          data: result,
        });
      } catch (error) {
        sendJson(ws, {
          type: 'voice_call_error',
          ok: false,
          requestId,
          message: mapVoiceCallError(error),
        });
      }
    });
  });
};

module.exports = {
  registerVoiceCallSocket,
};
