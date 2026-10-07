const { WebSocketServer } = require('ws');
const { User } = require('../models/User');
const {
  sanitizeTeacherCallPayload,
} = require('../utils/teacherCallAccess');
const { getCompanionProfile: getLegacyCompanionProfile } = require('../constants/companions');
const {
  getCompanionProfileSync,
  loadCompanionCache,
} = require('../services/companionCatalogService');
const { resolveCompanionPrompt } = require('../constants/resolveCompanionPrompt');
const { getEnv } = require('../config/env');
const { createDeepgramLiveSession } = require('../services/deepgramStreamingService');
const { transcribeAudioWithDeepgram } = require('../services/deepgramService');
const { RealtimeTurnEngine, prewarmVoiceFiller } = require('../services/realtimeTurnEngine');
const {
  resolveLearningLanguage,
  resolveDeepgramSttLanguage,
  resolveTtsModelForUser,
  resolveVoiceVariantForCompanion,
  usesGoogleTts,
} = require('../config/learningLanguage');
const { prewarmGoogleTts } = require('../services/googleTtsService');
const { prewarmDeepgramTts } = require('../services/deepgramService');
const { createDeepgramTtsWsSession } = require('../services/deepgramTtsWsSession');
const { createDeepgramVoiceAgentSession } = require('../services/deepgramVoiceAgentSession');
const { resolveVoiceProvider, PROVIDERS, buildVoiceAgentThinkUrl } = require('../config/voiceProvider');
const { prewarmDeepseekVoice } = require('../services/deepseekService');
const { isInterviewTeacherCompanionId } = require('../utils/interviewTeacherSetup');
const { syncVoiceBalance, createVoiceMeter } = require('../services/voiceTokenService');
const { attachCompanionMemory } = require('../services/companionMemoryService');

const WS_PATH = '/ws/realtime-voice';
const INTERVIEW_UTTERANCE_COMMIT_MS =
  Number(getEnv('VOICE_AI_INTERVIEW_UTTERANCE_COMMIT_MS', '700')) || 700;

const logRealtimeVoice = (message, details = {}) => {
  console.log(`[realtime-voice] ${message}`, details);
};

const sendJson = (socket, payload) => {
  // Every finished AI turn (legacy engine and Voice Agent) passes here — bill its TTS chars.
  if (payload?.type === 'turn_done' && typeof payload.reply === 'string' && payload.reply) {
    const session = socket.realtimeVoiceSessions?.get(String(payload.sessionId || ''));
    session?.voiceMeter?.addTtsChars(payload.reply.length);
  }
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
};

/** Dev escape hatch: VOICE_TOKENS_UNLIMITED=true skips balance checks and charging. */
const voiceTokensUnlimited = () => String(getEnv('VOICE_TOKENS_UNLIMITED', '')).toLowerCase() === 'true';

/**
 * Bills the call: STT seconds from mic PCM + TTS characters per AI turn, flushed every
 * few seconds. Pushes `voice_balance` to the app and ends the call at zero.
 */
const attachVoiceMeter = (ws, session, userId, initialBalance) => {
  if (voiceTokensUnlimited()) {
    return;
  }
  session.voiceMeter = createVoiceMeter({
    userId,
    initialBalance,
    sampleRate: session.sampleRate || 16000,
    onBalance: voiceTokens => {
      sendJson(ws, { type: 'voice_balance', ok: true, sessionId: session.sessionId, voiceTokens });
    },
    onExhausted: () => {
      logRealtimeVoice('voice tokens exhausted — ending call', { sessionId: session.sessionId });
      sendJson(ws, {
        type: 'voice_quota_exhausted',
        ok: true,
        sessionId: session.sessionId,
        voiceTokens: 0,
      });
      scheduleSessionCleanup(ws, session);
    },
  });
};

const resolveVoiceVariant = companionId => resolveVoiceVariantForCompanion(companionId);

const VOICE_STATES = Object.freeze({
  LISTENING: 'LISTENING',
  USER_SPEAKING: 'USER_SPEAKING',
  THINKING: 'THINKING',
  AI_SPEAKING: 'AI_SPEAKING',
});

/**
 * Single source of truth for voice UI phase (deepgram-agent).
 * Dedupes identical transitions and notifies the client once.
 */
const setSessionVoiceState = (session, nextState, { reason = '', source = 'deepgram-agent' } = {}) => {
  if (!session) {
    return false;
  }
  const to = String(nextState || '').toUpperCase();
  if (!Object.values(VOICE_STATES).includes(to)) {
    return false;
  }
  // null/undefined means "unset" — always allow the first transition (e.g. session_ready).
  const from = session.voiceState ? String(session.voiceState).toUpperCase() : null;
  if (from === to) {
    return false;
  }
  session.voiceState = to;
  // Keep legacy botSpeaking derived for any remaining gates.
  session.botSpeaking = to === VOICE_STATES.AI_SPEAKING;
  try {
    if (session.agentSession) {
      session.agentSession.agentUtteranceSpeaking = session.botSpeaking;
      session.agentSession.voiceState = to;
    }
  } catch {}
  logRealtimeVoice('state transition', {
    sessionId: session.sessionId,
    from: from || '(none)',
    to,
    reason: reason || null,
    source,
  });
  try {
    session.send?.({
      type: 'voice_state',
      ok: true,
      sessionId: session.sessionId,
      state: to,
      reason: reason || undefined,
      voiceProvider: session.voiceProvider || 'legacy',
      source,
    });
  } catch {}
  // Also emit bot_speaking for older client paths; state is authoritative for agent UI.
  try {
    session.send?.({
      type: 'bot_speaking',
      ok: true,
      sessionId: session.sessionId,
      turnId: session.agentSession?.activeTurnId || null,
      active: session.botSpeaking,
      reason: reason || undefined,
      voiceProvider: session.voiceProvider || 'legacy',
      source,
    });
  } catch {}
  return true;
};

/**
 * Legacy boolean speaking sync (legacy provider / compatibility).
 */
const setSessionBotSpeaking = (session, active, { source = 'unknown', reason = '' } = {}) => {
  if (!session) {
    return false;
  }
  if (session.voiceProvider === PROVIDERS.DEEPGRAM_AGENT || session.agentSession) {
    return setSessionVoiceState(
      session,
      active ? VOICE_STATES.AI_SPEAKING : VOICE_STATES.LISTENING,
      { source, reason },
    );
  }
  const next = Boolean(active);
  if (session.botSpeaking === next) {
    return false;
  }
  session.botSpeaking = next;
  try {
    session.engine?.setBotSpeaking?.(next);
  } catch {}
  logRealtimeVoice('bot speaking synchronized', {
    sessionId: session.sessionId,
    active: next,
    source,
    reason: reason || null,
  });
  logRealtimeVoice('bot speaking flag', {
    sessionId: session.sessionId,
    active: next,
    voiceProvider: session.voiceProvider || 'legacy',
  });
  try {
    session.send?.({
      type: 'bot_speaking',
      ok: true,
      sessionId: session.sessionId,
      turnId: null,
      active: next,
      reason: reason || undefined,
      voiceProvider: session.voiceProvider || 'legacy',
      source,
    });
  } catch {}
  return true;
};

const cleanupSession = session => {
  if (session?.sessionId) {
    logRealtimeVoice('cleanup session', {
      sessionId: session.sessionId,
      voiceProvider: session.voiceProvider || 'legacy',
    });
  }
  clearInputFinalizeTimer(session);
  clearInterviewUtteranceCommit(session);
  if (session?.voiceMeter) {
    session.voiceMeter.stop().catch(() => {});
    session.voiceMeter = null;
  }
  try {
    session?.deepgram?.destroy?.();
  } catch {}
  try {
    session?.ttsWsSession?.destroy?.();
  } catch {}
  try {
    session?.engine?.destroy?.();
  } catch {}
};

const cleanupSessionAsync = async session => {
  cleanupSession(session);
  try {
    if (session?.agentSession?.closeGracefully) {
      await session.agentSession.closeGracefully({
        initiatedBy: 'session_cleanup',
        timeoutMs: 2000,
      });
    } else {
      session?.agentSession?.destroy?.();
    }
  } catch {}
  session.agentSession = null;
};

const scheduleSessionCleanup = (ws, session) => {
  if (!session?.sessionId) {
    return;
  }
  const sessionId = session.sessionId;
  session.stopRequested = true;
  try {
    session?.deepgram?.destroy?.();
  } catch {}
  session.deepgram = null;

  const attemptCleanup = () => {
    const current = ws.realtimeVoiceSessions.get(sessionId);
    if (!current || current !== session) {
      return;
    }
    if (session.voiceProvider === PROVIDERS.DEEPGRAM_AGENT || session.agentSession) {
      cleanupSessionAsync(session).finally(() => {
        if (ws.realtimeVoiceSessions.get(sessionId) === session) {
          ws.realtimeVoiceSessions.delete(sessionId);
        }
        sendJson(ws, { type: 'voice_session_stopped', ok: true, sessionId });
      });
      return;
    }
    const engineBusy =
      session.engine &&
      ((typeof session.engine.isTtsIdle === 'function' && !session.engine.isTtsIdle()) ||
        session.engine.started);
    if (engineBusy) {
      setTimeout(attemptCleanup, 100);
      return;
    }
    cleanupSession(session);
    ws.realtimeVoiceSessions.get(sessionId) === session && ws.realtimeVoiceSessions.delete(sessionId);
    sendJson(ws, { type: 'voice_session_stopped', ok: true, sessionId });
  };

  attemptCleanup();
};

const clearInputFinalizeTimer = session => {
  if (session?.inputFinalizeTimer) {
    clearTimeout(session.inputFinalizeTimer);
    session.inputFinalizeTimer = null;
  }
};

const clearInterviewUtteranceCommit = session => {
  if (session?.utteranceCommitTimer) {
    clearTimeout(session.utteranceCommitTimer);
    session.utteranceCommitTimer = null;
  }
};

const scheduleInterviewUtteranceCommit = (ws, session) => {
  const companionId = session?.companionId || session?.engine?.companionId;
  if (!session || !isInterviewTeacherCompanionId(companionId)) {
    return;
  }
  clearInterviewUtteranceCommit(session);
  session.utteranceCommitTimer = setTimeout(() => {
    session.utteranceCommitTimer = null;
    const current = ws.realtimeVoiceSessions.get(session.sessionId);
    if (!current || current !== session || session.stopRequested || session.botSpeaking) {
      return;
    }
    if (session.inputEnded) {
      return;
    }
    if (!session.engine?.hasTranscript?.()) {
      logRealtimeVoice('interview utterance commit skipped, no transcript', {
        sessionId: session.sessionId,
      });
      return;
    }
    logRealtimeVoice('interview auto input end after utterance_end', {
      sessionId: session.sessionId,
      waitMs: INTERVIEW_UTTERANCE_COMMIT_MS,
    });
    handleVoiceInputEnded(ws, session);
  }, INTERVIEW_UTTERANCE_COMMIT_MS);
};

const finalizeDeepgramStream = session => {
  if (!session?.deepgram) {
    return;
  }
  try {
    session.deepgram.finalize();
  } catch {}
  session.deepgram = null;
};

const scheduleDeepgramFinalize = (ws, session) => {
  clearInputFinalizeTimer(session);
  session.inputFinalizeTimer = setTimeout(() => {
    session.inputFinalizeTimer = null;
    const current = ws.realtimeVoiceSessions.get(session.sessionId);
    if (!current || current !== session || !session.inputEnded) {
      return;
    }
    finalizeDeepgramStream(session);
  }, VOICE_INPUT_FINALIZE_GRACE_MS);
};

const handleVoiceInputEnded = (ws, session) => {
  if (!session) {
    return;
  }
  clearInterviewUtteranceCommit(session);
  if (session.inputEnded && session.engine?.inputEnded && !session.engine?.started) {
    logRealtimeVoice('duplicate input end ignored', {
      sessionId: session.sessionId,
      hasTriggerTimer: Boolean(session.engine?.triggerTimer),
    });
    return;
  }
  session.inputEnded = true;

  const hasBufferedAudio = session.recordedAudio?.length > 0 || session.pendingAudio?.length > 0;
  if (session.deepgramFailed) {
    if (hasBufferedAudio) {
      runBufferedSttFallback(session);
      return;
    }
    if (session.engine && !session.engine.inputEnded) {
      session.engine.markInputEnded();
    }
    return;
  }

  if (session.connectingDeepgram && !session.deepgram && hasBufferedAudio) {
    return;
  }

  if (session.deepgram?.flushUtterance) {
    try {
      session.deepgram.flushUtterance();
    } catch {}
  }

  if (!session.engine?.hasTranscript?.() && hasBufferedAudio) {
    setTimeout(() => {
      const current = ws.realtimeVoiceSessions.get(session.sessionId);
      if (!current || current !== session || session.stopRequested || !session.inputEnded) {
        return;
      }
      if (session.engine && !session.engine.inputEnded) {
        session.engine.markInputEnded();
      }
    }, Number(getEnv('VOICE_INPUT_EMPTY_TRANSCRIPT_GRACE_MS', '300')) || 300);
    return;
  }

  if (session.engine && !session.engine.inputEnded) {
    session.engine.markInputEnded();
  }
  /** Keep Deepgram websocket alive for the whole call. */
};

const prepareSessionNextTurn = session => {
  if (!session) {
    return;
  }
  if (session.preparedForNextTurn && session.audioChunks === 0 && !session.engine?.started) {
    logRealtimeVoice('duplicate next turn reset ignored', {
      sessionId: session.sessionId,
    });
    return;
  }
  clearInputFinalizeTimer(session);
  clearInterviewUtteranceCommit(session);
  session.inputEnded = false;
  session.fallbackStarted = false;
  session.recordedAudio = [];
  session.pendingAudio = [];
  session.audioChunks = 0;
  session.audioBytes = 0;
  session.botSpeaking = false;
  session.preparedForNextTurn = true;
  session.resetInProgress = false;
  const resetOk = session.engine?.resetForNextTurn?.();
  if (resetOk === false) {
    session.deferredTurnReset = true;
    logRealtimeVoice('defer session reset, user turn still pending', {
      sessionId: session.sessionId,
    });
    return;
  }
  session.deferredTurnReset = false;
  if (session.engine?.setBotSpeaking) {
    session.engine.setBotSpeaking(false);
  }
  if (session.deepgram?.flushUtterance) {
    try {
      session.deepgram.flushUtterance();
    } catch {}
  }
  logRealtimeVoice('session prepared for next turn', {
    sessionId: session.sessionId,
    deepgramLive: Boolean(session.deepgram),
  });
};

const ensureDeepgramForSession = (ws, session) => {
  const sessionId = session.sessionId;
  if (
    session.stopRequested ||
    session.connectingDeepgram ||
    session.deepgram ||
    isSttUnavailable()
  ) {
    return;
  }
  if (session.deepgramFailed && (session.deepgramConnectAttempts || 0) >= 2) {
    return;
  }
  session.connectingDeepgram = true;
  if (!session.deepgramConnectAttempts) {
    logRealtimeVoice('connecting deepgram for call', { sessionId });
  } else {
    logRealtimeVoice('reconnecting deepgram for call', {
      sessionId,
      attempt: session.deepgramConnectAttempts + 1,
    });
  }

  createDeepgramLiveSession({
    sampleRate: session.sampleRate,
    channels: session.channels,
    language: session.sttLanguage,
    endpointingMs: Number(getEnv('DEEPGRAM_ENDPOINTING_MS', '500')) || 500,
    onTranscript: event => {
      const current = ws.realtimeVoiceSessions.get(sessionId);
      if (!current || current.botSpeaking) {
        return;
      }
      if (event?.isFinal || event?.speechFinal) {
        logRealtimeVoice('stt transcript', {
          sessionId,
          isFinal: Boolean(event?.isFinal),
          speechFinal: Boolean(event?.speechFinal),
          transcript: event?.transcript,
        });
      }
      current.engine.handleTranscript(event);
    },
    onUtteranceEnd: () => {
      const current = ws.realtimeVoiceSessions.get(sessionId);
      if (!current || current.botSpeaking) {
        return;
      }
      logRealtimeVoice('deepgram utterance end', { sessionId });
      current.engine?.markUtteranceEnd?.();
      sendJson(ws, { type: 'utterance_end', sessionId });
      if (isInterviewTeacherCompanionId(current.companionId || current.engine?.companionId)) {
        sendJson(ws, {
          type: 'commit_user_turn',
          ok: true,
          sessionId,
          waitMs: INTERVIEW_UTTERANCE_COMMIT_MS,
        });
        scheduleInterviewUtteranceCommit(ws, current);
      }
    },
    onError: error => {
      const current = ws.realtimeVoiceSessions.get(sessionId);
      if (!current) {
        return;
      }
      current.connectingDeepgram = false;
      if (error?.code === 'DEEPGRAM_STREAM_CLOSED') {
        if (current.stopRequested) {
          logRealtimeVoice('deepgram stream closed on session stop', { sessionId });
          return;
        }
        if (current.botSpeaking) {
          logRealtimeVoice('deepgram stream paused while bot speaking', { sessionId });
          current.deepgram = null;
          current.connectingDeepgram = false;
          setTimeout(() => {
            const latest = ws.realtimeVoiceSessions.get(sessionId);
            if (
              latest &&
              latest === current &&
              !latest.stopRequested &&
              !latest.botSpeaking &&
              (latest.audioChunks || 0) > 0
            ) {
              ensureDeepgramForSession(ws, latest);
            }
          }, 300);
          return;
        }
        if (current.audioChunks === 0 && !current.inputEnded) {
          logRealtimeVoice('deepgram idle close before mic audio, defer reconnect', { sessionId });
          current.deepgram = null;
          current.connectingDeepgram = false;
          // Do NOT auto-reconnect here — wait for the first audio_chunk from the mic.
          return;
        }
        const now = Date.now();
        if (current.lastDeepgramReconnectAt && now - current.lastDeepgramReconnectAt < 1500) {
          logRealtimeVoice('deepgram reconnect throttled', { sessionId });
          current.deepgram = null;
          current.connectingDeepgram = false;
          return;
        }
        current.lastDeepgramReconnectAt = now;
        logRealtimeVoice('deepgram stream closed unexpectedly, reconnecting', { sessionId });
        current.deepgram = null;
        if (!current.deepgramFailed) {
          ensureDeepgramForSession(ws, current);
        }
        return;
      }
      logRealtimeVoice('deepgram stream error', {
        sessionId,
        message: error?.message,
        code: error?.code,
      });
      sendJson(ws, {
        type: 'voice_error',
        ok: false,
        sessionId,
        message: error?.code === 'DEEPGRAM_STREAM_CLOSED' ? 'Voice stream closed.' : 'STT connection issue.',
      });
    },
  })
    .then(deepgram => {
      const current = ws.realtimeVoiceSessions.get(sessionId);
      if (!current || current.stopRequested) {
        deepgram.destroy();
        return;
      }
      current.connectingDeepgram = false;
      current.deepgram = deepgram;
      current.deepgramFailed = false;
      logRealtimeVoice('deepgram connected for call', { sessionId });
      const queued = current.pendingAudio.splice(0);
      queued.forEach(buffer => deepgram.sendAudio(buffer));
    })
    .catch(error => {
      const current = ws.realtimeVoiceSessions.get(sessionId);
      if (!current || current.stopRequested) {
        return;
      }
      current.connectingDeepgram = false;
      current.deepgramConnectAttempts = (current.deepgramConnectAttempts || 0) + 1;
      if (current.deepgramConnectAttempts >= 2) {
        current.deepgramFailed = true;
        logRealtimeVoice('deepgram connect failed, using REST STT fallback', {
          sessionId,
          message: error?.message,
          code: error?.code,
          bufferedChunks: current.pendingAudio.length,
          attempts: current.deepgramConnectAttempts,
        });
        sendJson(ws, {
          type: 'voice_session_ready',
          ok: true,
          sessionId,
          sttMode: 'rest_fallback',
        });
        if (current.inputEnded) {
          runBufferedSttFallback(current);
        }
        return;
      }
      setTimeout(() => ensureDeepgramForSession(ws, current), 400);
    });
};

const MAX_PENDING_AUDIO_CHUNKS = 120;
const MAX_RECORDED_AUDIO_CHUNKS = 600;
const VOICE_INPUT_FINALIZE_GRACE_MS =
  Number(getEnv('VOICE_INPUT_FINALIZE_GRACE_MS', '200')) || 200;
const FALLBACK_STT_TIMEOUT_MS = Number(getEnv('DEEPGRAM_STREAM_REST_FALLBACK_TIMEOUT_MS', '10000')) || 10000;
const STT_UNAVAILABLE_BACKOFF_MS = Number(getEnv('DEEPGRAM_UNAVAILABLE_BACKOFF_MS', '30000')) || 30000;
let sttUnavailableUntil = 0;

const isSttUnavailable = () => Date.now() < sttUnavailableUntil;

const markSttUnavailable = reason => {
  sttUnavailableUntil = Date.now() + STT_UNAVAILABLE_BACKOFF_MS;
  logRealtimeVoice('stt unavailable backoff enabled', {
    reason,
    backoffMs: STT_UNAVAILABLE_BACKOFF_MS,
  });
};

const createPcm16WavBuffer = ({ pcmBuffer, sampleRate = 16000, channels = 1 }) => {
  const dataSize = pcmBuffer.length;
  const byteRate = sampleRate * channels * 2;
  const blockAlign = channels * 2;
  const header = Buffer.alloc(44);

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmBuffer]);
};

const runBufferedSttFallback = async session => {
  if (session.fallbackStarted) {
    return;
  }
  session.fallbackStarted = true;

  const recorded =
    session.recordedAudio?.length > 0 ? session.recordedAudio : session.pendingAudio;
  const audioBuffer = Buffer.concat(recorded);
  logRealtimeVoice('rest fallback starting', {
    sessionId: session.sessionId,
    chunks: recorded.length,
    bytes: audioBuffer.length,
  });

  if (!audioBuffer.length) {
    session.engine.markInputEnded();
    return;
  }

  try {
    const transcript = await transcribeAudioWithDeepgram({
      audioBuffer: createPcm16WavBuffer({
        pcmBuffer: audioBuffer,
        sampleRate: session.sampleRate,
        channels: session.channels,
      }),
      mimeType: 'audio/wav',
      preferRest: true,
      timeoutMs: FALLBACK_STT_TIMEOUT_MS,
      language: session.sttLanguage,
    });

    logRealtimeVoice('rest fallback transcript', {
      sessionId: session.sessionId,
      hasTranscript: Boolean(transcript),
      transcript,
    });

    if (transcript) {
      session.engine.handleTranscript({
        transcript,
        isFinal: true,
        speechFinal: true,
      });
    }
    session.engine.markInputEnded();
  } catch (error) {
    logRealtimeVoice('rest fallback failed', {
      sessionId: session.sessionId,
      message: error?.message,
      code: error?.code,
    });
    if (error?.code === 'DEEPGRAM_NETWORK_FAILED') {
      markSttUnavailable(error?.message);
    }
    if (typeof session.send === 'function') {
      session.send({
        type: 'turn_empty',
        ok: true,
        sessionId: session.sessionId,
        sttUnavailable: true,
        message: 'Speech service is temporarily unreachable.',
      });
      return;
    }
    session.engine.markInputEnded();
  }
};

const registerRealtimeVoiceSocket = server => {
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
    ws.realtimeVoiceSessions = new Map();
    ws.isAlive = true;
    logRealtimeVoice('client connected');

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('close', () => {
      logRealtimeVoice('client closed', { sessions: ws.realtimeVoiceSessions.size });
      for (const session of ws.realtimeVoiceSessions.values()) {
        cleanupSession(session);
      }
      ws.realtimeVoiceSessions.clear();
    });

    ws.on('message', async rawMessage => {
      let message = null;
      try {
        message = JSON.parse(Buffer.isBuffer(rawMessage) ? rawMessage.toString('utf8') : String(rawMessage));
      } catch {
        sendJson(ws, { type: 'voice_error', ok: false, message: 'Invalid realtime voice payload.' });
        return;
      }
      // Always act for the signed-in user, never for a userId the client typed in.
      if (message && typeof message === 'object') {
        message.userId = ws.authUserId;
      }

      const type = message?.type;

      if (type === 'voice_session_start') {
        const sessionId = String(message?.sessionId || '');
        const userId = typeof message?.userId === 'string' ? message.userId : '';
        const payload = message?.payload && typeof message.payload === 'object' ? message.payload : {};
        logRealtimeVoice('session start requested', { sessionId, userId: Boolean(userId) });
        if (isSttUnavailable()) {
          logRealtimeVoice('session rejected during stt backoff', {
            sessionId,
            retryAfterMs: sttUnavailableUntil - Date.now(),
          });
          sendJson(ws, {
            type: 'voice_session_ready',
            ok: false,
            sessionId,
            code: 'STT_UNAVAILABLE',
            message: 'Speech service is temporarily unreachable.',
          });
          return;
        }
        if (!sessionId || !userId) {
          sendJson(ws, { type: 'voice_error', ok: false, sessionId, message: 'sessionId and userId are required.' });
          return;
        }
        for (const [activeId, activeSession] of ws.realtimeVoiceSessions.entries()) {
          if (activeId !== sessionId && activeSession && !activeSession.stopRequested) {
            logRealtimeVoice('replacing prior call session on same socket', {
              previous: activeId,
              next: sessionId,
              previousHadAudio: activeSession.audioChunks > 0,
              previousChunks: activeSession.audioChunks,
            });
            cleanupSession(activeSession);
            ws.realtimeVoiceSessions.delete(activeId);
          }
        }
        if (ws.realtimeVoiceSessions.has(sessionId)) {
          const existing = ws.realtimeVoiceSessions.get(sessionId);
          if (existing && !existing.stopRequested) {
            logRealtimeVoice('duplicate session start ignored', { sessionId });
            sendJson(ws, {
              type: 'voice_session_ready',
              ok: true,
              sessionId,
              reused: true,
              sttMode: existing.deepgramFailed
                ? 'rest_fallback'
                : existing.deepgram
                  ? 'live'
                  : 'connecting',
            });
            return;
          }
          cleanupSession(existing);
          ws.realtimeVoiceSessions.delete(sessionId);
        }

        try {
          const user = await User.findById(userId);
          if (!user) {
            sendJson(ws, { type: 'voice_error', ok: false, sessionId, message: 'User tidak ditemukan.' });
            return;
          }

          let voiceBalance = null;
          if (!voiceTokensUnlimited()) {
            voiceBalance = await syncVoiceBalance(userId);
            if (!voiceBalance || voiceBalance.voiceTokens <= 0) {
              logRealtimeVoice('session rejected: no voice tokens', { sessionId });
              sendJson(ws, {
                type: 'voice_session_ready',
                ok: false,
                sessionId,
                code: 'VOICE_TOKENS_EMPTY',
                message: 'Voice tokens habis.',
                voiceTokens: 0,
              });
              return;
            }
          }

          // Long-term memory (by plan) rides on the user object into every voice prompt.
          await attachCompanionMemory(user, payload.companionId).catch(() => []);
          const sanitizedCall = sanitizeTeacherCallPayload(payload, user);
          await loadCompanionCache();
          const learningLanguage = resolveLearningLanguage(user);
          const companion =
            getCompanionProfileSync(payload.companionId, learningLanguage) ||
            getLegacyCompanionProfile(payload.companionId);
          const voiceVariant = resolveVoiceVariant(payload.companionId);
          const ttsModel = resolveTtsModelForUser(user, payload.model, voiceVariant);
          const sttLanguage = resolveDeepgramSttLanguage(learningLanguage);
          const useGoogle = usesGoogleTts(learningLanguage);
          const companionPrompt = resolveCompanionPrompt(
            payload.companionId,
            payload.companionPrompt,
            learningLanguage,
          );
          let voiceProvider = resolveVoiceProvider(payload);
          if (useGoogle && voiceProvider === PROVIDERS.DEEPGRAM_AGENT) {
            logRealtimeVoice('deepgram-agent unavailable without Aura TTS; using legacy + Google TTS', {
              sessionId,
              learningLanguage,
            });
            voiceProvider = PROVIDERS.LEGACY;
          }

          if (voiceProvider === PROVIDERS.DEEPGRAM_AGENT) {
            let agentSession = null;
            let agentVoiceSession = null;
            const send = body => {
              // Speaking state is owned by setSessionBotSpeaking — skip raw bot_speaking fanout.
              if (body?.type === 'bot_speaking') {
                return;
              }
              sendJson(ws, body);
            };
            try {
              const firstAssistant = (sanitizedCall.history || []).find(item => {
                const role = String(item?.role || '').toLowerCase();
                const text = String(item?.content || item?.text || '').trim();
                return (role === 'assistant' || role === 'ai') && text;
              });
              const greetingText = String(
                payload.greeting || firstAssistant?.content || firstAssistant?.text || '',
              ).trim();
              agentSession = await createDeepgramVoiceAgentSession({
                sessionId,
                send,
                user,
                companionId: payload.companionId,
                companionName: companion?.name || payload.companionName,
                companionDescription: companion?.description || payload.companionDescription,
                companionPrompt,
                targetLanguage: learningLanguage,
                history: sanitizedCall.history,
                callChatTopic: sanitizedCall.callChatTopic,
                ttsModel,
                ttsSpeed: payload.speed,
                greeting: greetingText || 'Hello! Great to talk with you today.',
                thinkUrl: buildVoiceAgentThinkUrl(sessionId),
                onVoiceState: (state, reason) => {
                  if (agentVoiceSession) {
                    setSessionVoiceState(agentVoiceSession, state, {
                      source: 'deepgram-agent',
                      reason,
                    });
                  }
                },
              });
            } catch (error) {
              logRealtimeVoice('deepgram-agent start failed; falling back to legacy', {
                sessionId,
                message: error?.message,
                code: error?.code,
              });
              voiceProvider = PROVIDERS.LEGACY;
            }

            if (agentSession && voiceProvider === PROVIDERS.DEEPGRAM_AGENT) {
              const session = {
                sessionId,
                companionId: payload.companionId,
                send: body => sendJson(ws, body),
                voiceProvider: PROVIDERS.DEEPGRAM_AGENT,
                agentSession,
                engine: null,
                ttsWsSession: null,
                learningLanguage,
                sttLanguage,
                deepgram: null,
                pendingAudio: [],
                recordedAudio: [],
                inputEnded: false,
                deepgramFailed: false,
                deepgramConnectAttempts: 0,
                fallbackStarted: false,
                connectingDeepgram: false,
                botSpeaking: false,
                voiceState: VOICE_STATES.LISTENING,
                stopRequested: false,
                preparedForNextTurn: false,
                resetInProgress: false,
                sampleRate: Number(message?.sampleRate || 16000),
                channels: Number(message?.channels || 1),
                audioChunks: 0,
                audioBytes: 0,
                lastDeepgramReconnectAt: 0,
              };
              agentVoiceSession = session;
              // Point agent sends (non-speaking) at session.send; speaking uses onVoiceState.
              agentSession.send = body => {
                if (body?.type === 'bot_speaking' || body?.type === 'voice_state') {
                  return;
                }
                session.send(body);
              };
              ws.realtimeVoiceSessions.set(sessionId, session);
              attachVoiceMeter(ws, session, userId, voiceBalance?.voiceTokens);
              sendJson(ws, {
                type: 'voice_session_ready',
                ok: true,
                sessionId,
                sttMode: 'agent',
                voiceProvider: PROVIDERS.DEEPGRAM_AGENT,
              });
              session.voiceState = null;
              setSessionVoiceState(session, VOICE_STATES.LISTENING, {
                source: 'deepgram-agent',
                reason: 'session_ready',
              });
              prewarmDeepseekVoice({
                companionId: payload.companionId,
                companionName: companion?.name || payload.companionName,
                companionDescription: companion?.description || payload.companionDescription,
                companionPrompt,
                targetLanguage: learningLanguage,
              }).catch(() => {});
              logRealtimeVoice('voice session language', {
                sessionId,
                learningLanguage,
                sttLanguage,
                voiceProvider: PROVIDERS.DEEPGRAM_AGENT,
                ttsProvider: 'deepgram-agent',
                selectedVoice: ttsModel,
              });
              return;
            }
          }

          // ---- legacy RealtimeTurnEngine path (kept for A/B + fallback) ----
          const send = body => sendJson(ws, body);
          let ttsWsSession = null;
          if (!useGoogle) {
            try {
              ttsWsSession = await createDeepgramTtsWsSession({
                model: ttsModel,
                encoding: 'linear16',
                speed: payload.speed,
              });
              logRealtimeVoice('deepgram tts ws ready', {
                sessionId,
                region: ttsWsSession.region,
                connectionMs: ttsWsSession.lastConnectionMs,
              });
            } catch (error) {
              logRealtimeVoice('deepgram tts ws unavailable, http keep-alive fallback', {
                sessionId,
                message: error?.message,
              });
              prewarmDeepgramTts(ttsModel).catch(() => {});
            }
          }

          const engine = new RealtimeTurnEngine({
            sessionId,
            send,
            user,
            companionName: companion?.name || payload.companionName,
            companionDescription: companion?.description || payload.companionDescription,
            companionPrompt,
            targetLanguage: learningLanguage,
            history: sanitizedCall.history,
            companionId: payload.companionId,
            ttsModel,
            ttsSpeed: payload.speed,
            pronunciations: payload.pronunciations,
            voiceVariant,
            callChatTopic: sanitizedCall.callChatTopic,
            ttsWsSession,
          });

          const session = {
            sessionId,
            companionId: payload.companionId,
            send,
            voiceProvider: PROVIDERS.LEGACY,
            agentSession: null,
            engine,
            ttsWsSession,
            learningLanguage,
            sttLanguage,
            deepgram: null,
            pendingAudio: [],
            recordedAudio: [],
            inputEnded: false,
            deepgramFailed: false,
            deepgramConnectAttempts: 0,
            fallbackStarted: false,
            connectingDeepgram: false,
            botSpeaking: false,
            stopRequested: false,
            preparedForNextTurn: false,
            resetInProgress: false,
            sampleRate: Number(message?.sampleRate || 16000),
            channels: Number(message?.channels || 1),
            audioChunks: 0,
            audioBytes: 0,
            lastDeepgramReconnectAt: 0,
          };
          ws.realtimeVoiceSessions.set(sessionId, session);
          attachVoiceMeter(ws, session, userId, voiceBalance?.voiceTokens);
          sendJson(ws, {
            type: 'voice_session_ready',
            ok: true,
            sessionId,
            sttMode: 'connecting',
            voiceProvider: PROVIDERS.LEGACY,
          });
          logRealtimeVoice('call session created, deepgram deferred until mic audio', {
            sessionId,
            voiceProvider: PROVIDERS.LEGACY,
          });
          prewarmDeepseekVoice({
            companionId: payload.companionId,
            companionName: companion?.name || payload.companionName,
            companionDescription: companion?.description || payload.companionDescription,
            companionPrompt,
            targetLanguage: learningLanguage,
          }).catch(() => {});
          if (useGoogle) {
            prewarmGoogleTts(learningLanguage, voiceVariant);
          }
          prewarmVoiceFiller({
            ttsModel,
            ttsSpeed: payload.speed,
            pronunciations: payload.pronunciations,
            targetLanguage: learningLanguage,
            voiceVariant,
            user,
          }).catch(() => {});
          logRealtimeVoice('voice session language', {
            sessionId,
            learningLanguage,
            sttLanguage,
            voiceProvider: PROVIDERS.LEGACY,
            ttsProvider: useGoogle ? 'google' : 'deepgram',
            ttsTransport: ttsWsSession ? 'websocket' : useGoogle ? 'google' : 'http',
          });
        } catch (error) {
          sendJson(ws, {
            type: 'voice_error',
            ok: false,
            sessionId,
            message: error?.message || 'Could not start realtime voice session.',
          });
        }
        return;
      }

      if (type === 'bot_speaking') {
        const sessionId = String(message?.sessionId || '');
        const session = ws.realtimeVoiceSessions.get(sessionId);
        if (session) {
          // deepgram-agent: speaking is owned by AgentAudioDone / first audio — ignore client echoes.
          if (session.voiceProvider === PROVIDERS.DEEPGRAM_AGENT || session.agentSession) {
            logRealtimeVoice('bot speaking client echo ignored for deepgram-agent', {
              sessionId,
              active: Boolean(message?.active),
              sessionActive: session.botSpeaking,
            });
            return;
          }
          setSessionBotSpeaking(session, Boolean(message?.active), {
            source: 'client',
            reason: 'client_echo',
          });
          if (
            !session.botSpeaking &&
            !session.stopRequested &&
            !session.deepgram &&
            !session.connectingDeepgram &&
            !session.deepgramFailed &&
            (session.audioChunks || 0) > 0
          ) {
            ensureDeepgramForSession(ws, session);
          }
        }
        return;
      }

      if (type === 'voice_turn_reset') {
        const sessionId = String(message?.sessionId || '');
        const session = ws.realtimeVoiceSessions.get(sessionId);
        if (session) {
          if (session.voiceProvider === PROVIDERS.DEEPGRAM_AGENT || session.agentSession) {
            session.preparedForNextTurn = true;
            session.inputEnded = false;
            sendJson(ws, {
              type: 'voice_turn_reset_ack',
              ok: true,
              sessionId,
              voiceProvider: PROVIDERS.DEEPGRAM_AGENT,
            });
            return;
          }
          if (session.resetInProgress) {
            sendJson(ws, { type: 'voice_turn_reset_ack', ok: true, sessionId, duplicate: true });
            return;
          }
          session.resetInProgress = true;
          void (async () => {
            try {
              if (session.engine?.waitForTtsDrain) {
                await session.engine.waitForTtsDrain();
              }
            } catch {
              /* ignore */
            }
            const current = ws.realtimeVoiceSessions.get(sessionId);
            if (!current || current !== session || session.stopRequested) {
              return;
            }
            prepareSessionNextTurn(session);
            // Defer Deepgram until mic audio — same as session create.
            if (
              !session.deepgram &&
              !session.connectingDeepgram &&
              !session.deepgramFailed &&
              (session.audioChunks || 0) > 0
            ) {
              ensureDeepgramForSession(ws, session);
            }
          })().finally(() => {
            if (ws.realtimeVoiceSessions.get(sessionId) === session) {
              session.resetInProgress = false;
            }
          });
        }
        sendJson(ws, { type: 'voice_turn_reset_ack', ok: true, sessionId });
        return;
      }

      if (type === 'audio_chunk') {
        const sessionId = String(message?.sessionId || '');
        const session = ws.realtimeVoiceSessions.get(sessionId);
        if (!session) {
          return;
        }
        session.preparedForNextTurn = false;
        const audioBase64 = typeof message?.audioBase64 === 'string' ? message.audioBase64 : '';
        if (!audioBase64) {
          return;
        }
        const buffer = Buffer.from(audioBase64, 'base64');
        session.voiceMeter?.addAudioBytes(buffer.length);

        if (session.voiceProvider === PROVIDERS.DEEPGRAM_AGENT || session.agentSession) {
          session.audioChunks += 1;
          session.audioBytes += buffer.length;
          if (session.audioChunks === 1 || session.audioChunks % 25 === 0) {
            logRealtimeVoice('mic chunk received', {
              sessionId,
              bytes: buffer.length,
              chunks: session.audioChunks,
              voiceState: session.voiceState || null,
              connectionOpen: session.agentSession?.connection?.readyState === 1,
              acceptMicAudio: session.agentSession?.acceptMicAudio !== false,
            });
          }
          // Always forward PCM — Voice Agent needs audio during bot speech for barge-in.
          session.agentSession?.sendAudio?.(buffer);
          return;
        }

        if (session.botSpeaking) {
          if (session.deepgram) {
            try {
              session.deepgram.sendAudio(buffer);
            } catch {}
          }
          return;
        }
        if (
          !session.deepgram &&
          !session.deepgramFailed &&
          !session.connectingDeepgram &&
          !session.stopRequested
        ) {
          ensureDeepgramForSession(ws, session);
        }
        try {
          session.audioChunks += 1;
          session.audioBytes += buffer.length;
          if (session.audioChunks === 1 || session.audioChunks % 50 === 0) {
            logRealtimeVoice('audio chunk received', {
              sessionId,
              chunks: session.audioChunks,
              bytes: session.audioBytes,
              deepgramReady: Boolean(session.deepgram),
              deepgramFailed: Boolean(session.deepgramFailed),
              pending: session.pendingAudio.length,
            });
          }
          session.recordedAudio.push(buffer);
          if (session.recordedAudio.length > MAX_RECORDED_AUDIO_CHUNKS) {
            session.recordedAudio.shift();
          }
          if (session.deepgram) {
            session.deepgram.sendAudio(buffer);
          } else if (!session.deepgramFailed) {
            session.pendingAudio.push(buffer);
            if (session.pendingAudio.length > MAX_PENDING_AUDIO_CHUNKS) {
              session.pendingAudio.shift();
            }
          }
        } catch {}
        return;
      }

      if (type === 'voice_input_end') {
        const sessionId = String(message?.sessionId || '');
        const session = ws.realtimeVoiceSessions.get(sessionId);
        if (session) {
          if (session.voiceProvider === PROVIDERS.DEEPGRAM_AGENT || session.agentSession) {
            // Client silence / hang-up: force Flux EOT (native threshold alone often stalls on JA).
            const forced = session.agentSession?.forceEndTurn?.('client_input_end');
            logRealtimeVoice('input end → ForceEndTurn for deepgram-agent', {
              sessionId,
              chunks: session.audioChunks,
              bytes: session.audioBytes,
              forced: Boolean(forced),
            });
            return;
          }
          if (session.botSpeaking) {
            logRealtimeVoice('ignore input end while bot speaking', {
              sessionId,
              chunks: session.audioChunks,
              bytes: session.audioBytes,
            });
            return;
          }
          const payload = message?.payload && typeof message.payload === 'object' ? message.payload : {};
          session.engine?.updateTurnContext?.(payload);
          logRealtimeVoice('input end received', {
            sessionId,
            chunks: session.audioChunks,
            bytes: session.audioBytes,
            deepgramReady: Boolean(session.deepgram),
            deepgramFailed: Boolean(session.deepgramFailed),
          });
          handleVoiceInputEnded(ws, session);
          if (session.connectingDeepgram && !session.deepgram && !session.deepgramFailed) {
            const waitStartedAt = Date.now();
            const fastFallbackMs = 650;
            const attemptFastSttFallback = () => {
              const current = ws.realtimeVoiceSessions.get(sessionId);
              if (!current || current !== session || !session.inputEnded || session.fallbackStarted) {
                return;
              }
              if (session.deepgram || session.engine?.started) {
                return;
              }
              if (Date.now() - waitStartedAt < fastFallbackMs) {
                return;
              }
              if (!session.recordedAudio?.length && !session.pendingAudio?.length) {
                if (session.engine && !session.engine.inputEnded) {
                  session.engine.markInputEnded();
                }
                return;
              }
              logRealtimeVoice('stt connect slow, REST fallback', {
                sessionId,
                waitedMs: Date.now() - waitStartedAt,
              });
              session.connectingDeepgram = false;
              session.deepgramFailed = true;
              runBufferedSttFallback(session);
            };
            setTimeout(attemptFastSttFallback, fastFallbackMs);
          }
        }
        return;
      }

      if (type === 'voice_session_stop') {
        const sessionId = String(message?.sessionId || '');
        const session = ws.realtimeVoiceSessions.get(sessionId);
        if (session) {
          logRealtimeVoice('session stop requested', { sessionId });
          scheduleSessionCleanup(ws, session);
        } else {
          sendJson(ws, { type: 'voice_session_stopped', ok: true, sessionId });
        }
        return;
      }

      sendJson(ws, { type: 'voice_error', ok: false, message: 'Unsupported realtime voice message type.' });
    });
  });

  const interval = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, 15000);

  wss.on('close', () => {
    clearInterval(interval);
  });
};

module.exports = {
  registerRealtimeVoiceSocket,
};
