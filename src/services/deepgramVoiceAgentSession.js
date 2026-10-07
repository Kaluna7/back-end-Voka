const { DeepgramClient } = require('@deepgram/sdk');
const { getEnv } = require('../config/env');
const {
  getVoiceAgentWsUrlCandidates,
  regionFromHost,
  rememberWorkingRegion,
} = require('../config/deepgramEndpoints');
const { buildVoiceAgentThinkUrl } = require('../config/voiceProvider');
const {
  registerVoiceAgentSession,
  appendVoiceAgentHistory,
  unregisterVoiceAgentSession,
  getVoiceAgentSession,
} = require('./voiceAgentSessionRegistry');
const {
  DEEPSEEK_VOICE_HISTORY_LIMIT,
  DEEPSEEK_VOICE_MAX_TOKENS,
  DEEPSEEK_VOICE_TIMEOUT_MS,
} = require('./deepseekService');
const { resolveDeepgramSttLanguage, normalizeLearningLanguage } = require('../config/learningLanguage');
const { transcribeAudioWithDeepgram } = require('./deepgramService');

const CONNECT_TIMEOUT_MS = Number(getEnv('DEEPGRAM_VOICE_AGENT_CONNECT_TIMEOUT_MS', '10000')) || 10000;
const CONNECT_ATTEMPT_TIMEOUT_MS =
  Number(getEnv('DEEPGRAM_VOICE_AGENT_ATTEMPT_TIMEOUT_MS', '5000')) || 5000;
const OUTPUT_SAMPLE_RATE = Number(getEnv('VOICE_AGENT_OUTPUT_SAMPLE_RATE', '24000')) || 24000;
const MIN_AUDIO_CHUNK_BYTES = Math.max(640, Number(getEnv('VOICE_AGENT_MIN_AUDIO_CHUNK_BYTES', '1920')) || 1920);
const WS_OPEN = 1;

/** Flux Multilingual language codes (language_hint). */
const FLUX_MULTI_LANGS = new Set(['en', 'es', 'fr', 'de', 'hi', 'ru', 'pt', 'ja', 'it', 'nl']);

/** Aura languages where Voice Agent has been reliable with speed control. */
const AURA_SPEED_SAFE_LANGS = new Set(['en', 'es']);

const resolveAgentLanguageCode = language => {
  const name = normalizeLearningLanguage(language);
  if (/^[a-z]{2}(-[a-z]{2})?$/i.test(String(language || '').trim())) {
    return String(language).trim().toLowerCase().slice(0, 2);
  }
  return resolveDeepgramSttLanguage(name);
};

const resolveAgentListenModel = (language, explicitModel) => {
  if (explicitModel) {
    return explicitModel;
  }
  const code = resolveAgentLanguageCode(language);
  // Flux multi often fails to open a turn on quiet mobile mics (esp. JA with AEC).
  // Nova-3 + language code is far more reliable for UserStartedSpeaking.
  if (code === 'ja') {
    return getEnv('VOICE_AGENT_LISTEN_MODEL_JA', 'nova-3');
  }
  if (code !== 'en' && FLUX_MULTI_LANGS.has(code)) {
    return getEnv('VOICE_AGENT_LISTEN_MODEL_MULTI', 'flux-general-multi');
  }
  return getEnv('VOICE_AGENT_LISTEN_MODEL', 'flux-general-en');
};

const logAgent = (message, details = {}) => {
  console.log(`[voice-agent] ${message}`, details);
};

/** Peak abs sample for linear16 LE PCM (0..32767). */
const pcmPeakAbs = buffer => {
  if (!Buffer.isBuffer(buffer) || buffer.length < 2) {
    return 0;
  }
  let peak = 0;
  const end = buffer.length - (buffer.length % 2);
  for (let i = 0; i < end; i += 2) {
    const sample = Math.abs(buffer.readInt16LE(i));
    if (sample > peak) {
      peak = sample;
    }
  }
  return peak;
};

/** Soft AGC — only boost quiet-but-real speech; never amplify noise floor. */
const boostPcm16Le = (buffer, { targetPeak = 10000, maxGain = 4, minPeak = 280 } = {}) => {
  if (!Buffer.isBuffer(buffer) || buffer.length < 2) {
    return buffer;
  }
  const peak = pcmPeakAbs(buffer);
  if (peak < minPeak || peak >= targetPeak) {
    return buffer;
  }
  const gain = Math.min(maxGain, targetPeak / peak);
  const out = Buffer.allocUnsafe(buffer.length);
  const end = buffer.length - (buffer.length % 2);
  for (let i = 0; i < end; i += 2) {
    const sample = buffer.readInt16LE(i);
    const boosted = Math.max(-32768, Math.min(32767, Math.round(sample * gain)));
    out.writeInt16LE(boosted, i);
  }
  return out;
};

const TARGET_MEDIA_CHUNK_BYTES = 2560; // 80ms @ 16kHz mono linear16 (Flux recommendation)
const LISTEN_PCM_BUFFER_MAX_BYTES = 16000 * 2 * 4; // ~4s rolling window

/** True when transcript still looks mid-utterance (JA particles / trailing comma). */
const looksIncompleteAgentTranscript = text => {
  const clean = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) {
    return true;
  }
  const stripped = clean.replace(/[。．.！!？?\s]+$/g, '');
  if (!stripped) {
    return true;
  }
  // 「私の名前を」「今日は」— particle hang = user still speaking.
  if (/[\u3040-\u30ff\u4e00-\u9fff]$/.test(stripped) && /[をはがのでとにもへやかてで]$/.test(stripped)) {
    return true;
  }
  if (/[、，,]$/.test(clean)) {
    return true;
  }
  // English mid-phrase hooks common in learner speech.
  if (/\b(my name is|i am|i'm|i want to|can you|please)\s*$/i.test(stripped)) {
    return true;
  }
  return false;
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

/** SDK joins environment.agent + /v1/agent/converse — pass host origin only. */
const environmentForAgentCandidate = wsUrl => {
  const url = new URL(wsUrl);
  const host = url.host;
  return {
    base: `https://${host}`,
    production: `wss://${host}`,
    agent: `wss://${host}`,
    agentRest: `https://${host}`,
  };
};

const isBinaryAgentPayload = data =>
  (typeof Blob !== 'undefined' && data instanceof Blob) ||
  Buffer.isBuffer(data) ||
  data instanceof ArrayBuffer ||
  ArrayBuffer.isView(data);

const toNodeBuffer = async data => {
  if (Buffer.isBuffer(data)) {
    return data;
  }
  if (data instanceof ArrayBuffer) {
    return Buffer.from(data);
  }
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  }
  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    return Buffer.from(await data.arrayBuffer());
  }
  return null;
};

/**
 * @deepgram/sdk agent V1Socket always JSON.parses websocket frames.
 * Agent TTS is binary — that throw drops audio and can stall the turn pipeline.
 * Replace the SDK handler so binary frames reach onAgentAudio and JSON still works.
 */
const installBinarySafeAgentMessageHandler = (connection, onBinary, onJson) => {
  const sock = connection?.socket;
  if (!sock) {
    return false;
  }
  try {
    sock.binaryType = 'nodebuffer';
  } catch {}

  // Drop every stacked message listener (connect() can register duplicates).
  // Duplicate handlers double PCM chunks → muddy / “heavy” playback.
  try {
    if (Array.isArray(sock._listeners?.message)) {
      sock._listeners.message = [];
    }
  } catch {}
  const previous = connection.handleMessage;
  if (typeof previous === 'function') {
    for (let i = 0; i < 8; i += 1) {
      try {
        sock.removeEventListener('message', previous);
      } catch {
        break;
      }
    }
  }

  connection.handleMessage = event => {
    const raw = event?.data;
    if (raw != null && typeof raw !== 'string') {
      void (async () => {
        try {
          await onBinary(raw);
        } catch {}
      })();
      return;
    }
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      onJson(parsed);
    } catch (error) {
      logAgent('agent json parse failed', { message: error?.message });
    }
  };
  try {
    sock.addEventListener('message', connection.handleMessage);
  } catch {
    return false;
  }
  return true;
};

const buildSettings = ({
  sessionId,
  thinkUrl,
  thinkSecret,
  listenModel,
  speakModel,
  speakSpeed,
  language,
  promptStub,
  history,
  greeting,
}) => {
  const secret = String(thinkSecret || '').trim();
  const headers = {
    'x-voice-session-id': sessionId,
    'ngrok-skip-browser-warning': 'true',
  };
  if (secret) {
    headers.authorization = `Bearer ${secret}`;
  }

  const languageCode = resolveAgentLanguageCode(language);
  const resolvedListenModel = resolveAgentListenModel(language, listenModel);
  const listenVersion = String(resolvedListenModel || '').startsWith('flux') ? 'v2' : 'v1';
  const speakIsFlux = String(speakModel || '').startsWith('flux-');
  const speakModelId = speakModel || getEnv('DEEPGRAM_TTS_MODEL', 'aura-2-thalia-en');
  const speakLangSuffix = String(speakModelId).split('-').pop()?.toLowerCase() || 'en';
  const speedValue = Number(speakSpeed);
  // Speed is not reliably supported for all Aura languages in Voice Agent (JA/DE/… can 400).
  const includeSpeed =
    !speakIsFlux &&
    AURA_SPEED_SAFE_LANGS.has(speakLangSuffix) &&
    Number.isFinite(speedValue) &&
    speedValue >= 0.7 &&
    speedValue <= 1.5 &&
    Math.abs(speedValue - 1) > 0.001;

  const contextMessages = [];
  if (Array.isArray(history)) {
    for (const item of history.slice(-16)) {
      const role = item?.role === 'assistant' || item?.role === 'ai' ? 'assistant' : 'user';
      const content = String(item?.content || item?.text || '').trim();
      if (!content) continue;
      contextMessages.push({ type: 'History', role, content });
    }
  }

  // Flux (v2) only — Multilingual/JA needs patient EOT so mid-sentence pauses
  // (e.g. 「私の名前を…」) do not fire THINKING early.
  const isMulti = resolvedListenModel.includes('multi');
  const isJa = languageCode === 'ja';
  const defaultEot = isJa || isMulti ? '0.75' : '0.7';
  const defaultEager = isJa || isMulti ? '0.55' : '0.5';
  const defaultTimeout = isJa || isMulti ? '4500' : '3000';
  const listenProvider = {
    type: 'deepgram',
    model: resolvedListenModel,
    version: listenVersion,
    ...(listenVersion === 'v2'
      ? {
          eot_threshold: Number(getEnv('VOICE_AGENT_EOT_THRESHOLD', defaultEot)) || Number(defaultEot),
          eager_eot_threshold:
            Number(getEnv('VOICE_AGENT_EAGER_EOT_THRESHOLD', defaultEager)) || Number(defaultEager),
          eot_timeout_ms:
            Number(getEnv('VOICE_AGENT_EOT_TIMEOUT_MS', defaultTimeout)) || Number(defaultTimeout),
          ...(resolvedListenModel.includes('multi') && FLUX_MULTI_LANGS.has(languageCode)
            ? { language_hints: [languageCode] }
            : {}),
        }
      : {
          smart_format: false,
          ...(languageCode && languageCode !== 'en' ? { language: languageCode } : {}),
        }),
  };

  const settings = {
    type: 'Settings',
    experimental: false,
    mip_opt_out: true,
    flags: { history: true },
    audio: {
      input: {
        encoding: 'linear16',
        sample_rate: 16000,
      },
      output: {
        encoding: 'linear16',
        sample_rate: OUTPUT_SAMPLE_RATE,
        container: 'none',
      },
    },
    agent: {
      listen: {
        provider: listenProvider,
      },
      think: {
        provider: {
          type: 'open_ai',
          model: getEnv('VOICE_AGENT_THINK_MODEL_ALIAS', 'gpt-4o-mini'),
          temperature: 0.45,
        },
        endpoint: {
          url: thinkUrl,
          headers,
        },
        // Real persona/memory rebuilt server-side in the LLM gateway.
        prompt:
          promptStub ||
          'You are a voice conversation assistant. Keep replies short and spoken-friendly.',
        context_length: 'max',
      },
      speak: {
        provider: {
          type: 'deepgram',
          version: speakIsFlux ? 'v2' : 'v1',
          model: speakModelId,
          ...(includeSpeed ? { speed: speedValue } : {}),
        },
      },
    },
  };

  if (contextMessages.length) {
    settings.agent.context = { messages: contextMessages };
  }
  if (greeting) {
    settings.agent.greeting = String(greeting);
  }
  return settings;
};

class DeepgramVoiceAgentSession {
  constructor({
    sessionId,
    send,
    user,
    companionId,
    companionName,
    companionDescription,
    companionPrompt,
    targetLanguage,
    history,
    callChatTopic,
    ttsModel,
    ttsSpeed,
    listenModel,
    thinkUrl,
    greeting = '',
    onBotSpeaking = null,
    onVoiceState = null,
  }) {
    this.sessionId = sessionId;
    this.send = send;
    this.onBotSpeaking =
      typeof onBotSpeaking === 'function'
        ? onBotSpeaking
        : null;
    this.onVoiceState =
      typeof onVoiceState === 'function'
        ? onVoiceState
        : null;
    this.voiceState = 'LISTENING';
    this.user = user;
    this.companionId = companionId;
    this.companionName = companionName;
    this.companionDescription = companionDescription;
    this.companionPrompt = companionPrompt;
    this.targetLanguage = targetLanguage;
    this.history = Array.isArray(history) ? [...history] : [];
    this.callChatTopic = callChatTopic;
    this.ttsModel = ttsModel;
    this.ttsSpeed = ttsSpeed;
    this.listenModel = resolveAgentListenModel(targetLanguage, listenModel);
    this.thinkUrl = thinkUrl;
    this.greeting = String(greeting || '').trim();
    this.apiKey = getEnv('DEEPGRAM_API_KEY');
    this.connection = null;
    this.socket = null; // legacy alias → connection.socket when available
    this.destroyed = false;
    this.ready = false;
    this.readyPromise = null;
    this.turnSeq = 0;
    this.activeTurnId = null;
    this.userTurnActive = false;
    this.userTurnFinalized = false;
    this.turnStartedSent = false;
    this.greetingPending = Boolean(String(greeting || '').trim());
    // True only while we expect Deepgram agent TTS for greeting or a finalized user turn.
    this.expectingAgentAudio = this.greetingPending;
    this.ttsStartedSent = false;
    this.sentenceId = 0;
    this.chunkIndex = 0;
    this.audioCoalesce = Buffer.alloc(0);
    this.currentUserText = '';
    this.currentAssistantText = '';
    this.speechFinalAt = 0;
    this.llmStartedAt = 0;
    this.firstTokenAt = 0;
    this.firstAudioAt = 0;
    this.reconnectAttempts = 0;
    this.selectedVoice = ttsModel;
    this.selectedModel = getEnv('DEEPSEEK_VOICE_MODEL') || getEnv('DEEPSEEK_MODEL') || 'deepseek';
    this.keepAliveTimer = null;
    this.audioFramesSent = 0;
    this.mediaFlowChunks = 0;
    this.mediaFlowBytes = 0;
    this.acceptMicAudio = true;
    this.agentUtteranceSpeaking = false;
    this.turnLatencyReport = {};
    this.latencyReportLogCount = 0;
    this.settingsSent = false;
    this.settingsApplied = false;
    this.agentAudioDoneSeq = 0;
    this.lastDeepgramEvent = null;
    this.lastAudioAt = 0;
    this.closePromise = null;
    this.closing = false;
    this.listenWindowStartedAt = 0;
    this.lastUserSpeechAt = 0;
    this.listeningEnergyHits = 0;
    this.listeningEnergyWarned = false;
    this.mediaCoalesce = Buffer.alloc(0);
    this.listenPcmChunks = [];
    this.listenPcmBytes = 0;
    this.sttInjectInFlight = false;
    this.sttInjectDoneForListenWindow = false;
    this.sttInjectEpoch = 0;
    this.ttsWatchdogTimer = null;
    this.incompleteForceArmed = false;
  }

  async start() {
    if (!this.apiKey) {
      const error = new Error('Deepgram is not configured.');
      error.code = 'DEEPGRAM_NOT_CONFIGURED';
      throw error;
    }
    if (!this.thinkUrl) {
      const error = new Error('Voice Agent think URL is not configured.');
      error.code = 'VOICE_AGENT_THINK_URL_MISSING';
      throw error;
    }

    registerVoiceAgentSession(this.sessionId, {
      user: this.user,
      companionId: this.companionId,
      companionName: this.companionName,
      companionDescription: this.companionDescription,
      companionPrompt: this.companionPrompt,
      targetLanguage: this.targetLanguage,
      history: this.history,
      callChatTopic: this.callChatTopic,
      historyLimit: DEEPSEEK_VOICE_HISTORY_LIMIT,
      maxTokens: DEEPSEEK_VOICE_MAX_TOKENS,
      timeoutMs: DEEPSEEK_VOICE_TIMEOUT_MS,
      onLlmRequestStarted: meta => this.onLlmRequestStarted(meta),
      onFirstToken: meta => this.onFirstToken(meta),
      onTokenDelta: meta => this.onTokenDelta(meta),
      onLlmCompleted: meta => this.onLlmCompleted(meta),
    });

    await this.connectAndConfigure();
    return this;
  }

  connectAndConfigure() {
    if (this.readyPromise) {
      return this.readyPromise;
    }
    this.readyPromise = (async () => {
      const startedAt = Date.now();
      const candidates = getVoiceAgentWsUrlCandidates();
      let lastError = null;

      for (let i = 0; i < candidates.length; i += 1) {
        const wsUrl = candidates[i];
        try {
          await this.openSocketAndApplySettings(wsUrl, {
            attemptTimeoutMs: Math.min(CONNECT_ATTEMPT_TIMEOUT_MS, CONNECT_TIMEOUT_MS),
            startedAt,
            attempt: i,
          });
          try {
            const host = new URL(wsUrl).host;
            const region = regionFromHost(host);
            if (region) {
              rememberWorkingRegion(region);
            }
          } catch {}
          return this;
        } catch (error) {
          lastError = error;
          logAgent('connect attempt failed', {
            sessionId: this.sessionId,
            url: wsUrl,
            attempt: i + 1,
            message: error?.message,
          });
        }
      }

      this.readyPromise = null;
      throw (
        lastError ||
        Object.assign(new Error('Deepgram Voice Agent unavailable'), {
          code: 'VOICE_AGENT_CONNECT_FAILED',
        })
      );
    })();
    return this.readyPromise;
  }

  openSocketAndApplySettings(wsUrl, { attemptTimeoutMs, startedAt, attempt }) {
    return new Promise(async (resolve, reject) => {
      let settled = false;
      let handshakeArmed = false;
      let connection = null;
      this.settingsSent = false;
      this.settingsApplied = false;

      const fail = error => {
        if (settled) return;
        settled = true;
        this.ready = false;
        try {
          connection?.close?.();
        } catch {}
        if (this.connection === connection) {
          this.connection = null;
          this.socket = null;
        }
        reject(error);
      };

      const timer = setTimeout(() => {
        fail(
          Object.assign(new Error(`Deepgram Voice Agent connect timeout (${attemptTimeoutMs}ms)`), {
            code: 'VOICE_AGENT_CONNECT_TIMEOUT',
          }),
        );
      }, attemptTimeoutMs);

      try {
        const client = new DeepgramClient({
          apiKey: this.apiKey,
          environment: environmentForAgentCandidate(wsUrl),
        });
        // Fern SDK: connect() constructs RWS (auto-starts), then we attach handlers,
        // then connection.connect() reconnects so Welcome lands with handlers ready.
        connection = await client.agent.v1.connect({
          reconnectAttempts: 0,
          connectionTimeoutInSeconds: Math.max(2, Math.ceil(attemptTimeoutMs / 1000)),
        });
        this.connection = connection;
        this.socket = connection.socket || null;

        connection.on('open', () => {
          logAgent('socket open', {
            sessionId: this.sessionId,
            connectionMs: Date.now() - startedAt,
            url: wsUrl,
            attempt,
            handshakeArmed,
            transport: '@deepgram/sdk',
          });
        });

        const handleAgentMessage = data => {
          void (async () => {
            if (isBinaryAgentPayload(data)) {
              if (!handshakeArmed && !this.ready) {
                return;
              }
              this.lastDeepgramEvent = 'binary_audio';
              const buffer = await toNodeBuffer(data);
              if (buffer?.length) {
                this.onAgentAudio(buffer);
              }
              return;
            }
            if (!data || typeof data !== 'object') {
              return;
            }
            // Ignore Welcome/Settings from the pre-handler auto-connect socket.
            if (!handshakeArmed && !this.ready) {
              logAgent('pre-handshake event ignored', {
                sessionId: this.sessionId,
                type: data.type || null,
              });
              return;
            }
            if (data.type) {
              this.lastDeepgramEvent = data.type;
            }
            this.onAgentEvent(data, {
              resolveReady: () => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                this.ready = true;
                this.reconnectAttempts = 0;
                this.startKeepAlive();
                logAgent('settings applied', {
                  sessionId: this.sessionId,
                  url: wsUrl,
                  transport: '@deepgram/sdk',
                });
                resolve(this);
              },
              fail: error => {
                clearTimeout(timer);
                fail(error);
              },
              isSettled: () => settled,
              timer,
            });
          })();
        };

        connection.on('message', handleAgentMessage);

        connection.on('close', event => {
          const code = event?.code;
          const reason = String(event?.reason || '');
          logAgent('socket close', {
            sessionId: this.sessionId,
            code,
            reason,
            ready: this.ready,
            url: wsUrl,
            closing: this.closing,
            handshakeArmed,
            lastDeepgramEvent: this.lastDeepgramEvent,
            lastAudioAt: this.lastAudioAt || null,
          });
          if (!settled) {
            // Pre-handshake reconnect close is expected when we call connection.connect().
            if (!handshakeArmed) {
              return;
            }
            clearTimeout(timer);
            fail(
              Object.assign(new Error(`Voice Agent socket closed before ready (${code})`), {
                code: 'VOICE_AGENT_CLOSED_EARLY',
              }),
            );
            return;
          }
          // fail() closes the socket after settled=true — do not poison the next region attempt.
          if (!this.settingsApplied) {
            return;
          }
          this.ready = false;
          this.acceptMicAudio = false;
          this.stopKeepAlive();
          if (!this.destroyed && !this.closing) {
            logAgent('connection closed (no auto-reconnect)', {
              sessionId: this.sessionId,
              code,
              reason,
              audioFramesSent: this.audioFramesSent,
            });
            this.send({
              type: 'voice_error',
              ok: false,
              sessionId: this.sessionId,
              message: 'Voice Agent connection closed.',
              code: 'VOICE_AGENT_CONNECTION_CLOSED',
              voiceProvider: 'deepgram-agent',
            });
          }
        });

        connection.on('error', error => {
          logAgent('socket error', {
            sessionId: this.sessionId,
            message: error?.message,
            url: wsUrl,
            handshakeArmed,
          });
          if (!settled && handshakeArmed) {
            clearTimeout(timer);
            fail(error);
          }
        });

        const bindBinarySafeHandler = () =>
          installBinarySafeAgentMessageHandler(
            connection,
            async raw => {
              if (!handshakeArmed && !this.ready) {
                return;
              }
              this.lastDeepgramEvent = 'binary_audio';
              const buffer = await toNodeBuffer(raw);
              if (buffer?.length) {
                this.onAgentAudio(buffer);
              }
            },
            handleAgentMessage,
          );

        bindBinarySafeHandler();
        // Arm AFTER handlers exist, THEN reconnect so Welcome is not lost / not raced.
        handshakeArmed = true;
        this.settingsSent = false;
        connection.connect();
        await connection.waitForOpen();
        const binarySafe = bindBinarySafeHandler();
        logAgent('binary-safe message handler', {
          sessionId: this.sessionId,
          installed: binarySafe,
          binaryType: connection.socket?.binaryType || null,
          readyState: connection.readyState,
          url: wsUrl,
        });
      } catch (error) {
        clearTimeout(timer);
        fail(error);
      }
    });
  }

  onAgentEvent(parsed, { resolveReady, fail, timer, isSettled }) {
    const type = parsed?.type;
    if (type === 'Welcome') {
      if (this.settingsSent) {
        logAgent('duplicate Welcome ignored', { sessionId: this.sessionId });
        return;
      }
      this.settingsSent = true;
      const settings = buildSettings({
        sessionId: this.sessionId,
        thinkUrl: this.thinkUrl,
        thinkSecret: getEnv('VOICE_AGENT_THINK_SECRET', ''),
        listenModel: this.listenModel,
        speakModel: this.ttsModel,
        speakSpeed: this.ttsSpeed,
        language: this.targetLanguage,
        history: this.historyForAgentContext(),
        greeting:
          this.greeting ||
          'Hello! Great to talk with you today.',
      });
      try {
        this.connection.sendSettings(settings);
        logAgent('settings sent', {
          sessionId: this.sessionId,
          listenModel: settings.agent?.listen?.provider?.model || this.listenModel,
          speakModel: settings.agent?.speak?.provider?.model || this.ttsModel,
          speakSpeed: settings.agent?.speak?.provider?.speed,
          eotThreshold: settings.agent?.listen?.provider?.eot_threshold,
          eotTimeoutMs: settings.agent?.listen?.provider?.eot_timeout_ms,
          languageHints: settings.agent?.listen?.provider?.language_hints || null,
          selectedModel: this.selectedModel,
          selectedVoice: this.selectedVoice,
          thinkUrl: this.thinkUrl,
          hasGreeting: Boolean(settings.agent?.greeting),
          transport: '@deepgram/sdk',
        });
      } catch (error) {
        clearTimeout(timer);
        fail(error);
      }
      return;
    }

    if (type === 'SettingsApplied') {
      if (this.settingsApplied) {
        logAgent('duplicate SettingsApplied ignored', { sessionId: this.sessionId });
        return;
      }
      this.settingsApplied = true;
      // Failed regional attempts may have cleared this on close — re-enable mic path.
      this.acceptMicAudio = true;
      if (this.greetingPending) {
        this.expectingAgentAudio = true;
        this.activeTurnId = this.greetingTurnId();
        logAgent('greeting response armed', {
          sessionId: this.sessionId,
          turnId: this.activeTurnId,
        });
      }
      resolveReady();
      return;
    }

    if (type === 'ConversationText') {
      const role = String(parsed?.role || '').toLowerCase();
      const content = String(parsed?.content || '').trim();
      if (!content) {
        return;
      }
      logAgent('conversation text', {
        sessionId: this.sessionId,
        role,
        chars: content.length,
        preview: content.slice(0, 80),
      });
      if (role === 'user') {
        this.currentUserText = content;
        this.lastUserSpeechAt = Date.now();
        this.listeningEnergyHits = 0;
        this.listeningEnergyWarned = false;
        this.incompleteForceArmed = false;
        if (!this.userTurnActive && !this.isGreetingTurnId(this.activeTurnId)) {
          this.beginUserTurn('conversation_text');
        }
        this.send({
          type: 'stt_partial',
          ok: true,
          sessionId: this.sessionId,
          transcript: content,
          isFinal: false,
          voiceProvider: 'deepgram-agent',
        });
        return;
      }
      if (role === 'assistant') {
        this.currentAssistantText = content;
        if (this.activeTurnId) {
          this.send({
            type: 'ai_partial',
            ok: true,
            sessionId: this.sessionId,
            turnId: this.activeTurnId,
            text: content,
            voiceProvider: 'deepgram-agent',
          });
        }
      }
      return;
    }

    if (type === 'UserStartedSpeaking') {
      logAgent('user started speaking', {
        sessionId: this.sessionId,
        voiceState: this.voiceState,
        greetingPending: this.greetingPending,
      });
      this.greetingPending = false;
      this.lastUserSpeechAt = Date.now();
      this.listeningEnergyHits = 0;
      this.listeningEnergyWarned = false;
      // Cancel in-flight STT inject — native turn owns the conversation now.
      this.sttInjectEpoch += 1;
      this.sttInjectDoneForListenWindow = true;
      this.incompleteForceArmed = false;
      this.beginUserTurn('speech_started');
      this.emitVoiceState('USER_SPEAKING', 'speech_started');
      this.send({
        type: 'barge_in',
        ok: true,
        sessionId: this.sessionId,
        turnId: this.activeTurnId,
        voiceProvider: 'deepgram-agent',
      });
      this.audioCoalesce = Buffer.alloc(0);
      this.chunkIndex = 0;
      return;
    }

    if (type === 'AgentThinking') {
      logAgent('agent thinking', {
        sessionId: this.sessionId,
        turnId: this.activeTurnId,
        transcript: this.currentUserText || '',
      });
      this.finalizeUserTurn('agent_thinking');
      this.expectingAgentAudio = true;
      this.emitVoiceState('THINKING', 'end_of_turn');
      return;
    }

    if (type === 'AgentStartedSpeaking') {
      this.expectingAgentAudio = true;
      this.attachAgentResponseTurn('agent_started_speaking');
      if (!this.ttsStartedSent) {
        this.ttsStartedSent = true;
        this.send({
          type: 'tts_started',
          ok: true,
          sessionId: this.sessionId,
          turnId: this.activeTurnId,
          sentenceId: this.sentenceId,
          voiceProvider: 'deepgram-agent',
          encoding: 'linear16',
          sampleRate: OUTPUT_SAMPLE_RATE,
        });
      }
      return;
    }

    if (type === 'AgentAudioDone') {
      // Duplicate handlers / trailing events must not finalize twice (double WAV commit).
      if (!this.expectingAgentAudio && !this.firstAudioAt) {
        logAgent('orphan AgentAudioDone ignored', {
          sessionId: this.sessionId,
          turnId: this.activeTurnId,
        });
        return;
      }
      this.flushAudioCoalesce(true);
      const turnId = this.activeTurnId;
      const wasGreeting = this.isGreetingTurnId(turnId);
      this.agentAudioDoneSeq += 1;
      this.send({
        type: 'tts_audio_end',
        ok: true,
        sessionId: this.sessionId,
        turnId,
        sentenceId: this.sentenceId,
        chunkIndex: this.chunkIndex,
        done: true,
        encoding: 'linear16',
        mimeType: 'audio/wav',
        sampleRate: OUTPUT_SAMPLE_RATE,
        voiceProvider: 'deepgram-agent',
      });
      const reply = String(this.currentAssistantText || '').trim();
      const userText = String(this.currentUserText || '').trim();
      if (!wasGreeting && (userText || reply)) {
        appendVoiceAgentHistory(this.sessionId, userText, reply);
        this.history = getVoiceAgentSession(this.sessionId)?.history || this.history;
      }
      this.send({
        type: 'turn_done',
        ok: true,
        sessionId: this.sessionId,
        turnId,
        reply,
        transcript: wasGreeting ? '' : userText,
        expectedTtsChunks: Math.max(1, this.sentenceId + 1),
        voiceProvider: 'deepgram-agent',
        greeting: wasGreeting || undefined,
      });
      // Keep the same SDK connection open for the next user turn.
      this.acceptMicAudio = true;
      this.ready = true;
      if (!this.keepAliveTimer) {
        this.startKeepAlive();
      }
      logAgent('agent audio done', {
        sessionId: this.sessionId,
        turnId,
        greeting: wasGreeting,
        connectionOpen: this.connection?.readyState === WS_OPEN,
        acceptMicAudio: this.acceptMicAudio,
      });
      this.emitVoiceState('LISTENING', 'agent_audio_done');
      this.logLatencyPipeline('agent_audio_done');
      this.flushLatencyReport('agent_audio_done');
      this.clearAgentResponseState();
      return;
    }

    if (type === 'LatencyReport') {
      this.mergeLatencyReport(parsed);
      return;
    }

    if (type === 'InjectionRefused') {
      logAgent('InjectionRefused', {
        sessionId: this.sessionId,
        turnId: this.activeTurnId,
        voiceState: this.voiceState,
        message: parsed?.message || parsed?.description || null,
      });
      // default inject while THINKING is refused — force interrupt speak.
      if (this.voiceState === 'THINKING' && !this.firstAudioAt) {
        const text =
          String(this.currentAssistantText || '').trim() || this.friendlyFallbackReply();
        this.injectAgentMessage(text, 'injection_refused_retry', { interrupt: true });
      }
      return;
    }

    if (type === 'Error') {
      logAgent('error', {
        sessionId: this.sessionId,
        message: parsed?.message || parsed?.description,
        code: parsed?.code,
      });
      this.send({
        type: 'voice_error',
        ok: false,
        sessionId: this.sessionId,
        message: parsed?.message || parsed?.description || 'Voice agent error',
        code: parsed?.code || 'VOICE_AGENT_ERROR',
        voiceProvider: 'deepgram-agent',
      });
      // Only reject the connect promise if SettingsApplied never landed.
      // Mid-call speak failures must not crash the Node process.
      if (typeof isSettled === 'function' ? !isSettled() : !this.ready) {
        clearTimeout(timer);
        fail(
          Object.assign(new Error(parsed?.message || 'Voice agent error'), {
            code: parsed?.code || 'VOICE_AGENT_ERROR',
          }),
        );
      }
      return;
    }

    if (type === 'Warning') {
      logAgent('warning', {
        sessionId: this.sessionId,
        message: parsed?.message || parsed?.description,
        code: parsed?.code,
      });
    }
  }

  greetingTurnId() {
    return `va-${this.sessionId}-greeting`;
  }

  isGreetingTurnId(turnId = this.activeTurnId) {
    return Boolean(turnId) && turnId === this.greetingTurnId();
  }

  clearAgentResponseState() {
    this.activeTurnId = null;
    this.userTurnActive = false;
    this.userTurnFinalized = false;
    this.turnStartedSent = false;
    this.greetingPending = false;
    this.expectingAgentAudio = false;
    this.ttsStartedSent = false;
    this.currentAssistantText = '';
    this.currentUserText = '';
    this.firstAudioAt = 0;
    this.speechFinalAt = 0;
    this.llmStartedAt = 0;
    this.firstTokenAt = 0;
    this.sentenceId = 0;
    this.chunkIndex = 0;
    this.audioCoalesce = Buffer.alloc(0);
    this.turnLatencyReport = {};
    this.agentUtteranceSpeaking = false;
  }

  beginUserTurn(reason = 'speech_started') {
    if (this.userTurnActive && this.activeTurnId && !this.isGreetingTurnId(this.activeTurnId)) {
      return this.activeTurnId;
    }
    this.greetingPending = false;
    // Barge-in / new user speech cancels association with any prior agent utterance.
    this.expectingAgentAudio = false;
    this.ttsStartedSent = false;
    this.turnSeq += 1;
    this.activeTurnId = `va-${this.sessionId}-${this.turnSeq}`;
    this.userTurnActive = true;
    this.userTurnFinalized = false;
    this.turnStartedSent = false;
    this.sentenceId = 0;
    this.chunkIndex = 0;
    this.audioCoalesce = Buffer.alloc(0);
    // speechFinalAt is only set on real user end-of-turn — never here.
    this.speechFinalAt = 0;
    this.llmStartedAt = 0;
    this.firstTokenAt = 0;
    this.firstAudioAt = 0;
    this.turnLatencyReport = {};
    this.agentUtteranceSpeaking = false;
    this.currentAssistantText = '';
    logAgent('user turn started', {
      sessionId: this.sessionId,
      turnId: this.activeTurnId,
      reason,
    });
    return this.activeTurnId;
  }

  finalizeUserTurn(reason = 'end_of_turn') {
    // Invariant: agent audio must never finalize/create a user turn.
    if (reason === 'first_audio' || reason === 'agent_started_speaking' || reason === 'first_agent_audio') {
      logAgent('refusing user-turn finalize from agent audio', {
        sessionId: this.sessionId,
        reason,
        transcript: this.currentUserText || '',
      });
      return this.activeTurnId;
    }
    if (!this.activeTurnId || this.isGreetingTurnId(this.activeTurnId)) {
      this.beginUserTurn(reason);
    }
    if (!this.speechFinalAt) {
      this.speechFinalAt = Date.now();
    }
    this.userTurnFinalized = true;
    this.expectingAgentAudio = true;
    logAgent('user end of turn', {
      sessionId: this.sessionId,
      turnId: this.activeTurnId,
      reason,
      transcript: this.currentUserText || '',
      speechFinalAt: this.speechFinalAt,
    });
    this.send({
      type: 'stt_partial',
      ok: true,
      sessionId: this.sessionId,
      transcript: this.currentUserText,
      isFinal: true,
      voiceProvider: 'deepgram-agent',
    });
    if (!this.turnStartedSent) {
      this.turnStartedSent = true;
      this.send({
        type: 'turn_started',
        ok: true,
        sessionId: this.sessionId,
        turnId: this.activeTurnId,
        transcript: this.currentUserText,
        voiceProvider: 'deepgram-agent',
        selectedModel: this.selectedModel,
        selectedVoice: this.selectedVoice,
      });
    }
    return this.activeTurnId;
  }

  /**
   * Attach agent audio/TTS to an existing response turn.
   * Never creates a conversational user turn from first_audio + empty transcript.
   */
  attachAgentResponseTurn(reason = 'agent_audio') {
    if (this.activeTurnId && !this.isGreetingTurnId(this.activeTurnId)) {
      return this.activeTurnId;
    }
    if (this.greetingPending || this.isGreetingTurnId(this.activeTurnId)) {
      this.activeTurnId = this.greetingTurnId();
      this.userTurnActive = false;
      this.userTurnFinalized = false;
      // Greeting is not a user EOT — do not stamp speechFinalAt.
      this.speechFinalAt = 0;
      return this.activeTurnId;
    }
    if (
      reason === 'first_audio' ||
      reason === 'first_agent_audio' ||
      reason === 'agent_started_speaking'
    ) {
      // Invariant: first_audio + empty transcript must NEVER create a user turn.
      logAgent('agent audio without prior user turn — no user turn created', {
        sessionId: this.sessionId,
        reason,
        transcript: this.currentUserText || '',
      });
      return null;
    }
    return this.finalizeUserTurn(reason);
  }

  emitVoiceState(state, reason) {
    const next = String(state || '').toUpperCase();
    if (!next || this.voiceState === next) {
      return;
    }
    const from = this.voiceState || 'LISTENING';
    this.voiceState = next;
    this.agentUtteranceSpeaking = next === 'AI_SPEAKING';
    if (next === 'LISTENING') {
      this.listenWindowStartedAt = Date.now();
      this.listeningEnergyHits = 0;
      this.listeningEnergyWarned = false;
      this.mediaCoalesce = Buffer.alloc(0);
      this.listenPcmChunks = [];
      this.listenPcmBytes = 0;
      this.sttInjectDoneForListenWindow = false;
    }
    logAgent('voice state', {
      sessionId: this.sessionId,
      turnId: this.activeTurnId,
      from,
      to: next,
      reason,
    });
    if (this.onVoiceState) {
      try {
        this.onVoiceState(next, reason);
      } catch (error) {
        logAgent('onVoiceState failed', {
          sessionId: this.sessionId,
          message: error?.message,
        });
      }
      return;
    }
    if (this.onBotSpeaking) {
      try {
        this.onBotSpeaking(next === 'AI_SPEAKING', reason);
      } catch {}
    }
  }

  emitBotSpeaking(active, reason) {
    // Compatibility shim — prefer emitVoiceState.
    if (active) {
      this.emitVoiceState('AI_SPEAKING', reason || 'first_agent_audio');
      return;
    }
    if (reason === 'barge_in') {
      this.emitVoiceState('USER_SPEAKING', 'speech_started');
      return;
    }
    this.emitVoiceState('LISTENING', reason || 'agent_audio_done');
  }

  mergeLatencyReport(parsed) {
    const fields = {
      stt_latency: parsed?.stt_latency,
      ttt_token_latency: parsed?.ttt_token_latency,
      ttt_text_latency: parsed?.ttt_text_latency,
      tts_latency: parsed?.tts_latency,
      total_latency: parsed?.total_latency,
    };
    const next = { ...(this.turnLatencyReport || {}) };
    for (const [key, value] of Object.entries(fields)) {
      if (value === undefined || value === null || value === '') {
        continue;
      }
      const ms = msFromSec(value);
      if (ms === null) {
        continue;
      }
      next[key] = ms;
    }
    this.turnLatencyReport = next;
    const hasThinkOrTts =
      next.ttt_token_latency != null ||
      next.ttt_text_latency != null ||
      next.tts_latency != null ||
      next.total_latency != null;
    this.latencyReportLogCount = (this.latencyReportLogCount || 0) + 1;
    // Partial STT-only reports spam the console; log those sparsely.
    if (hasThinkOrTts || this.latencyReportLogCount === 1 || this.latencyReportLogCount % 25 === 0) {
      logAgent('deepgram latency report', {
        sessionId: this.sessionId,
        turnId: this.activeTurnId,
        stt_latency_ms: next.stt_latency ?? null,
        ttt_token_latency_ms: next.ttt_token_latency ?? null,
        ttt_text_latency_ms: next.ttt_text_latency ?? null,
        tts_latency_ms: next.tts_latency ?? null,
        total_latency_ms: next.total_latency ?? null,
        selectedModel: this.selectedModel,
        selectedVoice: this.selectedVoice,
        partial: !hasThinkOrTts,
      });
    }
    this.send({
      type: 'latency_report',
      ok: true,
      sessionId: this.sessionId,
      turnId: this.activeTurnId,
      voiceProvider: 'deepgram-agent',
      sttLatencyMs: next.stt_latency ?? null,
      tttTokenLatencyMs: next.ttt_token_latency ?? null,
      tttTextLatencyMs: next.ttt_text_latency ?? null,
      ttsLatencyMs: next.tts_latency ?? null,
      totalLatencyMs: next.total_latency ?? null,
      llmFirstTokenMs: next.ttt_text_latency ?? next.ttt_token_latency ?? null,
      selectedModel: this.selectedModel,
      selectedVoice: this.selectedVoice,
      partial: !hasThinkOrTts,
    });
  }

  flushLatencyReport(reason) {
    const report = this.turnLatencyReport || {};
    if (!Object.keys(report).length) {
      return;
    }
    logAgent('deepgram latency report merged', {
      sessionId: this.sessionId,
      turnId: this.activeTurnId,
      reason,
      stt_latency_ms: report.stt_latency ?? null,
      ttt_token_latency_ms: report.ttt_token_latency ?? null,
      ttt_text_latency_ms: report.ttt_text_latency ?? null,
      tts_latency_ms: report.tts_latency ?? null,
      total_latency_ms: report.total_latency ?? null,
      selectedModel: this.selectedModel,
      selectedVoice: this.selectedVoice,
    });
  }

  onLlmRequestStarted({ transcript, model, startedAt }) {
    this.llmRequestSeq = (this.llmRequestSeq || 0) + 1;
    if (transcript) {
      this.currentUserText = String(transcript).trim() || this.currentUserText;
    }
    this.finalizeUserTurn('llm_request');
    if (!this.llmStartedAt) {
      const ts = Number(startedAt);
      this.llmStartedAt = Number.isFinite(ts) && ts > 0 ? ts : Date.now();
    }
    this.emitVoiceState('THINKING', 'end_of_turn');
    logAgent('llm response started', {
      sessionId: this.sessionId,
      turnId: this.activeTurnId,
      model: model || this.selectedModel,
      transcript: this.currentUserText || transcript || '',
      msFromSpeechFinal: deltaMs(this.speechFinalAt, this.llmStartedAt),
    });
  }

  onFirstToken({ msFromLlmStart, model }) {
    if (!this.firstTokenAt) {
      this.firstTokenAt = Date.now();
    }
    logAgent('DeepSeek first token', {
      sessionId: this.sessionId,
      turnId: this.activeTurnId,
      model: model || this.selectedModel,
      msFromLlmStart: msFromLlmStart ?? deltaMs(this.llmStartedAt, this.firstTokenAt),
      msFromSpeechFinal: deltaMs(this.speechFinalAt, this.firstTokenAt),
    });
  }

  onTokenDelta({ text }) {
    if (!this.activeTurnId || !text) {
      return;
    }
    this.currentAssistantText = text;
    this.send({
      type: 'ai_partial',
      ok: true,
      sessionId: this.sessionId,
      turnId: this.activeTurnId,
      text,
      voiceProvider: 'deepgram-agent',
    });
  }

  onLlmCompleted({ reply, msFromLlmStart, msToFirstToken, emptyBecauseAbort }) {
    const text = String(reply || '').trim();
    if (text) {
      this.currentAssistantText = text;
      logAgent('LLM completed', {
        sessionId: this.sessionId,
        turnId: this.activeTurnId,
        msFromLlmStart,
        msToFirstToken,
        chars: text.length,
      });
      // Deepgram often records ttt_text from the think stream but never starts Aura.
      // Speak via InjectAgentMessage as soon as the reply is ready (skip 2.5s dead air).
      this.scheduleSpeakInject(text, 'llm_speak');
      return;
    }

    // Deepgram cancelled the think request because the user kept talking: it will send a
    // fresh request with the full transcript. Injecting a canned reply here interrupted the
    // user ("Yeah, I hear you! Tell me a bit more?" over "I have a dog"). Only fall back if
    // no new request arrives and we are still stuck thinking.
    if (emptyBecauseAbort) {
      const seqAtAbort = this.llmRequestSeq || 0;
      const turnAtAbort = this.activeTurnId;
      logAgent('LLM aborted by Deepgram — waiting for follow-up request', {
        sessionId: this.sessionId,
        turnId: turnAtAbort,
        msFromLlmStart,
      });
      clearTimeout(this.abortFallbackTimer);
      this.abortFallbackTimer = setTimeout(() => {
        this.abortFallbackTimer = null;
        if (
          this.destroyed ||
          this.closing ||
          (this.llmRequestSeq || 0) !== seqAtAbort ||
          this.activeTurnId !== turnAtAbort ||
          this.voiceState !== 'THINKING' ||
          this.firstAudioAt
        ) {
          return;
        }
        const late = this.friendlyFallbackReply();
        this.currentAssistantText = late;
        logAgent('LLM empty — inject fallback (no follow-up request)', {
          sessionId: this.sessionId,
          turnId: turnAtAbort,
          fallback: late,
        });
        this.injectAgentMessage(late, 'llm_empty_fallback');
      }, 2500);
      return;
    }

    // Empty stream (thinking burned tokens etc.) — never stay in THINKING.
    const fallback = this.friendlyFallbackReply();
    this.currentAssistantText = fallback;
    logAgent('LLM empty — inject fallback', {
      sessionId: this.sessionId,
      turnId: this.activeTurnId,
      msFromLlmStart,
      msToFirstToken,
      emptyBecauseAbort: Boolean(emptyBecauseAbort),
      fallback,
    });
    this.injectAgentMessage(fallback, 'llm_empty_fallback');
  }

  friendlyFallbackReply() {
    const code = resolveAgentLanguageCode(this.targetLanguage);
    if (code === 'ja') {
      return 'うん、そうだね！もう少し聞かせて？';
    }
    if (code === 'ko') {
      return '응, 그렇구나! 조금 더 말해줄래?';
    }
    if (code === 'zh' || code === 'zh-cn' || code === 'zh-tw') {
      return '嗯，这样啊！再跟我聊聊吧？';
    }
    if (code === 'id') {
      return 'Hmm, oke! Cerita lagi dong?';
    }
    return "Yeah, I hear you! Tell me a bit more?";
  }

  clearTtsWatchdog() {
    if (this.ttsWatchdogTimer) {
      clearTimeout(this.ttsWatchdogTimer);
      this.ttsWatchdogTimer = null;
    }
  }

  scheduleSpeakInject(reply, reason = 'llm_speak') {
    this.clearTtsWatchdog();
    const text = String(reply || this.currentAssistantText || '').trim() || this.friendlyFallbackReply();
    if (this.destroyed || this.closing) {
      return;
    }
    const turnId = this.activeTurnId;
    // Give stream→Aura a brief window; if it never starts, force-speak via interrupt.
    this.ttsWatchdogTimer = setTimeout(() => {
      this.ttsWatchdogTimer = null;
      if (
        this.destroyed ||
        this.closing ||
        this.firstAudioAt ||
        this.voiceState === 'AI_SPEAKING' ||
        this.voiceState === 'LISTENING' ||
        this.voiceState !== 'THINKING' ||
        this.activeTurnId !== turnId
      ) {
        return;
      }
      logAgent('speak inject (think stream produced no Aura audio)', {
        sessionId: this.sessionId,
        turnId,
        reason,
        voiceState: this.voiceState,
        chars: text.length,
        preview: text.slice(0, 80),
      });
      this.injectAgentMessage(text, reason, { interrupt: true });
      // If interrupt inject is also refused / silent, retry once then escape THINKING.
      this.ttsWatchdogTimer = setTimeout(() => {
        this.ttsWatchdogTimer = null;
        if (
          this.destroyed ||
          this.closing ||
          this.firstAudioAt ||
          this.voiceState !== 'THINKING' ||
          this.activeTurnId !== turnId
        ) {
          return;
        }
        logAgent('speak inject retry still no Aura — second interrupt', {
          sessionId: this.sessionId,
          turnId,
          voiceState: this.voiceState,
        });
        const ok = this.injectAgentMessage(text, `${reason}_retry`, { interrupt: true });
        if (!ok) {
          this.emitVoiceState('LISTENING', 'tts_inject_failed');
        }
      }, 2000);
    }, 800);
  }

  /** @deprecated alias — kept for any older call sites */
  armTtsWatchdog(reply) {
    this.scheduleSpeakInject(reply, 'tts_watchdog');
  }

  injectAgentMessage(content, reason = 'inject', options = {}) {
    const text = String(content || '').trim();
    if (
      !text ||
      this.destroyed ||
      this.closing ||
      !this.ready ||
      !this.connection ||
      this.connection.readyState !== WS_OPEN
    ) {
      return false;
    }
    try {
      // default → InjectionRefused while THINKING (agent mid-turn).
      // interrupt → force Aura to speak the reply now.
      const behavior =
        options.interrupt || this.voiceState === 'THINKING' || !this.firstAudioAt
          ? 'interrupt'
          : 'default';
      this.expectingAgentAudio = true;
      const payload = {
        type: 'InjectAgentMessage',
        message: text,
        behavior,
      };
      if (typeof this.connection.sendInjectAgentMessage === 'function') {
        this.connection.sendInjectAgentMessage(payload);
      } else {
        this.connection.socket.send(JSON.stringify(payload));
      }
      logAgent('InjectAgentMessage sent', {
        sessionId: this.sessionId,
        reason,
        behavior,
        chars: text.length,
        preview: text.slice(0, 80),
      });
      return true;
    } catch (error) {
      logAgent('InjectAgentMessage failed', {
        sessionId: this.sessionId,
        reason,
        message: error?.message,
      });
      return false;
    }
  }

  onAgentAudio(data) {
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
    if (!buffer.length || this.destroyed || this.closing) {
      return;
    }
    // After AgentAudioDone, Deepgram can still emit trailing packets.
    // Never reopen AI_SPEAKING / create turns from those orphans.
    if (!this.expectingAgentAudio && !this.greetingPending) {
      return;
    }
    this.lastAudioAt = Date.now();
    const turnId = this.attachAgentResponseTurn('first_audio');
    if (!turnId) {
      return;
    }
    if (!this.firstAudioAt) {
      this.firstAudioAt = this.lastAudioAt;
      this.clearTtsWatchdog();
      const isGreeting = this.isGreetingTurnId(turnId);
      // Notify client before any audio packets so buffers are not reset mid-stream.
      this.send({
        type: 'tts_started',
        ok: true,
        sessionId: this.sessionId,
        turnId,
        sentenceId: this.sentenceId,
        voiceProvider: 'deepgram-agent',
        encoding: 'linear16',
        sampleRate: OUTPUT_SAMPLE_RATE,
      });
      this.ttsStartedSent = true;
      this.emitVoiceState('AI_SPEAKING', 'first_agent_audio');
      logAgent('agent first audio', {
        sessionId: this.sessionId,
        turnId,
        greeting: Boolean(isGreeting),
        bytes: buffer.length,
        msFromSpeechFinal: deltaMs(this.speechFinalAt, this.firstAudioAt),
        msFromLlmStart: deltaMs(this.llmStartedAt, this.firstAudioAt),
        msFromFirstToken: deltaMs(this.firstTokenAt, this.firstAudioAt),
      });
      this.logLatencyPipeline('first_audio');
    }
    this.audioCoalesce = Buffer.concat([this.audioCoalesce, buffer]);
    while (this.audioCoalesce.length >= MIN_AUDIO_CHUNK_BYTES) {
      const slice = this.audioCoalesce.slice(0, MIN_AUDIO_CHUNK_BYTES);
      this.audioCoalesce = this.audioCoalesce.slice(MIN_AUDIO_CHUNK_BYTES);
      this.emitAudioChunk(slice);
    }
  }

  flushAudioCoalesce(force) {
    if (!this.audioCoalesce.length) {
      return;
    }
    if (!force && this.audioCoalesce.length < MIN_AUDIO_CHUNK_BYTES) {
      return;
    }
    const slice = this.audioCoalesce;
    this.audioCoalesce = Buffer.alloc(0);
    this.emitAudioChunk(slice);
  }

  emitAudioChunk(buffer) {
    const index = this.chunkIndex;
    this.chunkIndex += 1;
    if (index === 0 || index % 10 === 0) {
      logAgent('tts audio chunk emit', {
        sessionId: this.sessionId,
        turnId: this.activeTurnId,
        chunkIndex: index,
        bytes: buffer.length,
        sampleRate: OUTPUT_SAMPLE_RATE,
      });
    }
    this.send({
      type: 'tts_audio_chunk',
      ok: true,
      sessionId: this.sessionId,
      turnId: this.activeTurnId,
      sentenceId: this.sentenceId,
      chunkIndex: index,
      done: false,
      audioBase64: buffer.toString('base64'),
      encoding: 'linear16',
      mimeType: 'audio/wav',
      sampleRate: OUTPUT_SAMPLE_RATE,
      voiceProvider: 'deepgram-agent',
    });
  }

  logLatencyPipeline(reason) {
    logAgent('latency pipeline', {
      sessionId: this.sessionId,
      turnId: this.activeTurnId,
      reason,
      voiceProvider: 'deepgram-agent',
      selectedModel: this.selectedModel,
      selectedVoice: this.selectedVoice,
      msFromSpeechFinalToLlmStart: deltaMs(this.speechFinalAt, this.llmStartedAt),
      msFromLlmStartToFirstToken: deltaMs(this.llmStartedAt, this.firstTokenAt),
      msFromFirstTokenToFirstAudio: deltaMs(this.firstTokenAt, this.firstAudioAt),
      msFromSpeechFinalToFirstAudio: deltaMs(this.speechFinalAt, this.firstAudioAt),
      deepgramLatencyReport: this.turnLatencyReport || {},
    });
  }

  sendAudio(buffer) {
    if (
      this.destroyed ||
      this.closing ||
      !this.acceptMicAudio ||
      !this.ready ||
      !this.connection ||
      this.connection.readyState !== WS_OPEN
    ) {
      if (this.audioFramesSent === 0 || this.audioFramesSent % 25 === 0) {
        logAgent('sendMedia skipped', {
          sessionId: this.sessionId,
          destroyed: this.destroyed,
          closing: this.closing,
          acceptMicAudio: this.acceptMicAudio,
          ready: this.ready,
          connectionOpen: this.connection?.readyState === WS_OPEN,
          voiceState: this.voiceState,
          totalChunks: this.audioFramesSent,
        });
      }
      return false;
    }

    // Do not feed silence/echo into listen while the agent is speaking — Flux/Nova
    // often never open a user turn afterward if the mic path stays open through TTS.
    if (this.voiceState === 'AI_SPEAKING' || this.voiceState === 'THINKING') {
      return false;
    }

    try {
      const raw = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
      const rawPeak = pcmPeakAbs(raw);
      const boosted = boostPcm16Le(raw);
      this.pushListenPcm(boosted);

      if (this.voiceState === 'LISTENING') {
        // Score energy on pre-boost peak so AGC noise doesn't fake speech.
        if (rawPeak >= 900) {
          this.listeningEnergyHits += 1;
        }
        const listenAgeMs = this.listenWindowStartedAt
          ? Date.now() - this.listenWindowStartedAt
          : 0;
        if (
          !this.lastUserSpeechAt &&
          this.listeningEnergyHits >= 14 &&
          listenAgeMs >= 5000 &&
          this.listenPcmBytes >= 48000
        ) {
          if (!this.listeningEnergyWarned) {
            this.listeningEnergyWarned = true;
            logAgent('listening stall: mic energy but no UserStartedSpeaking', {
              sessionId: this.sessionId,
              listenAgeMs,
              energyHits: this.listeningEnergyHits,
              peak: rawPeak,
              audioFramesSent: this.audioFramesSent,
              lastDeepgramEvent: this.lastDeepgramEvent,
              listenModel: this.listenModel,
            });
          }
          // Do NOT InjectUserMessage here — REST STT invents a finished turn
          // (e.g. 「こんにちは。」) and jumps to THINKING while the user is still talking.
        }
      }

      this.mediaCoalesce = Buffer.concat([this.mediaCoalesce, boosted]);

      let sent = false;
      while (this.mediaCoalesce.length >= TARGET_MEDIA_CHUNK_BYTES) {
        const chunk = this.mediaCoalesce.subarray(0, TARGET_MEDIA_CHUNK_BYTES);
        this.mediaCoalesce = this.mediaCoalesce.subarray(TARGET_MEDIA_CHUNK_BYTES);
        this.connection.sendMedia(chunk);
        this.audioFramesSent += 1;
        this.mediaFlowChunks += 1;
        this.mediaFlowBytes += chunk.length;
        sent = true;

        if (this.audioFramesSent === 1 || this.audioFramesSent % 25 === 0) {
          logAgent('sendMedia called', {
            sessionId: this.sessionId,
            bytes: chunk.length,
            totalChunks: this.audioFramesSent,
            connectionOpen: true,
            acceptMicAudio: this.acceptMicAudio,
            voiceState: this.voiceState,
            peak: pcmPeakAbs(chunk),
            rawPeak,
          });
        }
      }
      return sent || this.mediaCoalesce.length > 0;
    } catch (error) {
      logAgent('sendMedia failed', {
        sessionId: this.sessionId,
        message: error?.message,
        totalChunks: this.audioFramesSent,
        voiceState: this.voiceState,
      });
      return false;
    }
  }

  pushListenPcm(buffer) {
    if (!Buffer.isBuffer(buffer) || !buffer.length) {
      return;
    }
    this.listenPcmChunks.push(buffer);
    this.listenPcmBytes += buffer.length;
    while (this.listenPcmBytes > LISTEN_PCM_BUFFER_MAX_BYTES && this.listenPcmChunks.length > 1) {
      const dropped = this.listenPcmChunks.shift();
      this.listenPcmBytes -= dropped?.length || 0;
    }
  }

  injectUserMessage(content, reason = 'inject') {
    const text = String(content || '').trim();
    if (
      !text ||
      this.destroyed ||
      this.closing ||
      !this.ready ||
      !this.connection ||
      this.connection.readyState !== WS_OPEN
    ) {
      return false;
    }
    try {
      if (typeof this.connection.sendInjectUserMessage === 'function') {
        this.connection.sendInjectUserMessage({ type: 'InjectUserMessage', content: text });
      } else {
        const sock = this.connection.socket;
        sock.send(JSON.stringify({ type: 'InjectUserMessage', content: text }));
      }
      this.currentUserText = text;
      this.lastUserSpeechAt = Date.now();
      this.beginUserTurn(reason);
      this.emitVoiceState('USER_SPEAKING', reason);
      this.send({
        type: 'stt_partial',
        ok: true,
        sessionId: this.sessionId,
        transcript: text,
        isFinal: true,
        speechFinal: true,
        voiceProvider: 'deepgram-agent',
      });
      logAgent('InjectUserMessage sent', {
        sessionId: this.sessionId,
        reason,
        chars: text.length,
        preview: text.slice(0, 80),
      });
      return true;
    } catch (error) {
      logAgent('InjectUserMessage failed', {
        sessionId: this.sessionId,
        reason,
        message: error?.message,
      });
      return false;
    }
  }

  async recoverListeningWithSttInject(reason = 'energy_stall') {
    if (
      this.sttInjectInFlight ||
      this.sttInjectDoneForListenWindow ||
      this.destroyed ||
      this.closing ||
      this.voiceState !== 'LISTENING' ||
      this.lastUserSpeechAt
    ) {
      return false;
    }
    this.sttInjectInFlight = true;
    this.sttInjectDoneForListenWindow = true;
    const epoch = this.sttInjectEpoch;
    try {
      const pcm = Buffer.concat(this.listenPcmChunks || []);
      if (pcm.length < 16000) {
        logAgent('stt inject skipped (short buffer)', {
          sessionId: this.sessionId,
          reason,
          bytes: pcm.length,
        });
        this.sttInjectDoneForListenWindow = false;
        return false;
      }
      const language = resolveAgentLanguageCode(this.targetLanguage) || 'ja';
      logAgent('stt inject fallback starting', {
        sessionId: this.sessionId,
        reason,
        bytes: pcm.length,
        language,
      });
      const transcript = await transcribeAudioWithDeepgram({
        audioBuffer: createPcm16WavBuffer({ pcmBuffer: pcm, sampleRate: 16000, channels: 1 }),
        mimeType: 'audio/wav',
        preferRest: true,
        timeoutMs: 8000,
        language,
      });
      if (epoch !== this.sttInjectEpoch || this.lastUserSpeechAt || this.voiceState !== 'LISTENING') {
        logAgent('stt inject discarded (native speech won)', {
          sessionId: this.sessionId,
          reason,
          voiceState: this.voiceState,
        });
        return false;
      }
      const text = String(transcript || '').trim();
      if (!text) {
        logAgent('stt inject empty transcript', { sessionId: this.sessionId, reason });
        this.sttInjectDoneForListenWindow = false;
        return false;
      }
      return this.injectUserMessage(text, `stt_inject_${reason}`);
    } catch (error) {
      logAgent('stt inject failed', {
        sessionId: this.sessionId,
        reason,
        message: error?.message,
        code: error?.code,
      });
      this.sttInjectDoneForListenWindow = false;
      return false;
    } finally {
      this.sttInjectInFlight = false;
    }
  }

  /**
   * Force Flux end-of-turn when the client stops speaking (or native EOT stalls).
   * Agent SDK has no sendForceEndTurn yet — send raw JSON on the socket.
   */
  forceEndTurn(reason = 'client') {
    if (
      this.destroyed ||
      this.closing ||
      !this.ready ||
      !this.connection ||
      this.connection.readyState !== WS_OPEN
    ) {
      return false;
    }
    // While the agent is thinking/speaking there is no user turn to end — the client's
    // silence timer can still fire then (echo / mic tail), which only produced
    // FORCE_END_TURN_UNSUPPORTED warnings.
    if (this.voiceState === 'AI_SPEAKING' || this.voiceState === 'THINKING') {
      logAgent('ForceEndTurn ignored (agent turn in progress)', {
        sessionId: this.sessionId,
        reason,
        voiceState: this.voiceState,
      });
      return false;
    }
    // Never invent a user turn from REST STT — that cuts the speaker mid-sentence.
    if (!this.lastUserSpeechAt && this.voiceState === 'LISTENING') {
      logAgent('ForceEndTurn ignored (no native user turn yet)', {
        sessionId: this.sessionId,
        reason,
        voiceState: this.voiceState,
      });
      return false;
    }
    if (
      this.voiceState === 'USER_SPEAKING' &&
      looksIncompleteAgentTranscript(this.currentUserText)
    ) {
      if (!this.incompleteForceArmed) {
        this.incompleteForceArmed = true;
        logAgent('ForceEndTurn deferred (incomplete transcript)', {
          sessionId: this.sessionId,
          reason,
          transcript: this.currentUserText || '',
        });
        return false;
      }
      logAgent('ForceEndTurn allowed after incomplete defer', {
        sessionId: this.sessionId,
        reason,
        transcript: this.currentUserText || '',
      });
    }
    this.incompleteForceArmed = false;
    try {
      const sock = this.connection.socket;
      if (sock && typeof sock.send === 'function') {
        sock.send(JSON.stringify({ type: 'ForceEndTurn' }));
      } else {
        return false;
      }
      logAgent('ForceEndTurn sent', {
        sessionId: this.sessionId,
        reason,
        voiceState: this.voiceState,
        turnId: this.activeTurnId,
        transcript: this.currentUserText || '',
      });
      return true;
    } catch (error) {
      logAgent('ForceEndTurn failed', {
        sessionId: this.sessionId,
        reason,
        message: error?.message,
      });
      return false;
    }
  }

  setBotSpeaking() {
    // Voice Agent owns utterance speaking latch.
  }

  historyForAgentContext() {
    const greeting = this.greeting;
    if (!greeting) {
      return this.history;
    }
    // Avoid duplicating the Settings greeting inside History context.
    return this.history.filter(item => {
      const content = String(item?.content || item?.text || '').trim();
      return content && content !== greeting;
    });
  }

  startKeepAlive() {
    this.stopKeepAlive();
    this.keepAliveTimer = setInterval(() => {
      const connectionOpen =
        !this.destroyed &&
        !this.closing &&
        Boolean(this.connection) &&
        this.connection.readyState === WS_OPEN;
      logAgent('keepalive', {
        sessionId: this.sessionId,
        connectionOpen,
        voiceState: this.voiceState,
      });
      if (this.mediaFlowChunks > 0 || this.mediaFlowBytes > 0) {
        logAgent('media flowing', {
          sessionId: this.sessionId,
          bytes: this.mediaFlowBytes,
          totalChunks: this.audioFramesSent,
          connectionOpen,
          acceptMicAudio: this.acceptMicAudio,
          voiceState: this.voiceState,
        });
        this.mediaFlowChunks = 0;
        this.mediaFlowBytes = 0;
      }
      if (!connectionOpen) {
        return;
      }
      try {
        this.connection.sendKeepAlive({ type: 'KeepAlive' });
      } catch {}
    }, 5000);
  }

  stopKeepAlive() {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
  }

  closeGracefully({ initiatedBy = 'app', timeoutMs = 2000 } = {}) {
    if (this.closePromise) {
      return this.closePromise;
    }
    this.closePromise = new Promise(resolve => {
      this.closing = true;
      this.acceptMicAudio = false;
      this.ready = false;
      this.stopKeepAlive();
      this.emitVoiceState('LISTENING', 'session_close');

      const connection = this.connection;
      const finish = ({ code, reason, gracefulClose }) => {
        logAgent('shutdown complete', {
          sessionId: this.sessionId,
          closeInitiatedBy: initiatedBy,
          closeCode: code,
          closeReason: reason,
          gracefulClose,
          lastDeepgramEvent: this.lastDeepgramEvent,
          lastAudioTimestamp: this.lastAudioAt || null,
        });
        this.finalizeLocalCleanup();
        resolve({
          closeInitiatedBy: initiatedBy,
          closeCode: code,
          closeReason: reason,
          gracefulClose,
        });
      };

      if (!connection || connection.readyState !== WS_OPEN) {
        try {
          connection?.close?.();
        } catch {}
        finish({ code: 1000, reason: 'already-closed', gracefulClose: true });
        return;
      }

      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        try {
          connection.close();
        } catch {}
        finish({ code: 1006, reason: 'graceful-timeout', gracefulClose: false });
      }, Math.max(300, Number(timeoutMs) || 2000));

      connection.on('close', event => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        finish({
          code: event?.code,
          reason: String(event?.reason || ''),
          gracefulClose: event?.code === 1000 || event?.code === 1005,
        });
      });

      try {
        connection.close();
      } catch (error) {
        clearTimeout(timer);
        settled = true;
        finish({
          code: 1006,
          reason: error?.message || 'close-send-failed',
          gracefulClose: false,
        });
      }
    });
    return this.closePromise;
  }

  finalizeLocalCleanup() {
    this.destroyed = true;
    this.ready = false;
    this.acceptMicAudio = false;
    this.clearTtsWatchdog();
    this.stopKeepAlive();
    unregisterVoiceAgentSession(this.sessionId);
    this.connection = null;
    this.socket = null;
  }

  destroy() {
    void this.closeGracefully({ initiatedBy: 'destroy', timeoutMs: 800 });
  }
}

const msFromSec = value => {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return null;
  }
  // Deepgram may send seconds (float) or already-ms integers.
  if (Math.abs(n) > 120) {
    return Math.round(n);
  }
  return Math.round(n * 1000);
};

/** Absolute Date.now() deltas only; never mix with performance.now(). */
const deltaMs = (from, to) => {
  if (!Number.isFinite(from) || from <= 0) {
    return null;
  }
  if (!Number.isFinite(to) || to <= 0) {
    return null;
  }
  const d = to - from;
  if (!Number.isFinite(d) || d < 0 || d > 120000) {
    return null;
  }
  return Math.round(d);
};

const createDeepgramVoiceAgentSession = async options => {
  const thinkUrl = options.thinkUrl || buildVoiceAgentThinkUrl(options.sessionId);
  const session = new DeepgramVoiceAgentSession({ ...options, thinkUrl });
  await session.start();
  if (!session.ready || session.connection?.readyState !== WS_OPEN) {
    try {
      session.destroy?.();
    } catch {}
    throw Object.assign(new Error('Voice Agent socket not ready after SettingsApplied'), {
      code: 'VOICE_AGENT_NOT_READY',
    });
  }
  return session;
};

module.exports = {
  DeepgramVoiceAgentSession,
  createDeepgramVoiceAgentSession,
  buildSettings,
};
