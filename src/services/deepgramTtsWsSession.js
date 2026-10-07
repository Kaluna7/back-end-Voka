const WebSocket = require('ws');
const { getEnv } = require('../config/env');
const {
  REGION_HOSTS,
  getAlternateRegion,
  getDeepgramHost,
  hasStickyRegion,
  rememberWorkingRegion,
  resolveRegion,
} = require('../config/deepgramEndpoints');

const CONNECT_TIMEOUT_MS = Number(getEnv('DEEPGRAM_TTS_WS_CONNECT_TIMEOUT_MS', '800')) || 800;
/** Alternate region may need a bit longer for cold TLS; still far below the old 8–10s stall. */
const ALT_CONNECT_TIMEOUT_MS =
  Number(getEnv('DEEPGRAM_TTS_WS_ALT_CONNECT_TIMEOUT_MS', String(Math.max(CONNECT_TIMEOUT_MS, 1800)))) ||
  Math.max(CONNECT_TIMEOUT_MS, 1800);
const PHRASE_TIMEOUT_MS = Number(getEnv('DEEPGRAM_TTS_WS_PHRASE_TIMEOUT_MS', '12000')) || 12000;
const FLUSH_WARN_LIMIT = 18;

const resolveWsTtsFormat = encodingOverride => {
  const requested = String(
    encodingOverride || getEnv('VOICE_AI_REALTIME_TTS_ENCODING', 'mp3') || 'mp3',
  ).toLowerCase();
  // Deepgram Speak WebSocket only accepts linear16 / mulaw / alaw (not mp3/opus).
  if (requested === 'mulaw' || requested === 'alaw') {
    return {
      encoding: requested,
      container: 'none',
      sampleRate: Number(getEnv('DEEPGRAM_TTS_SAMPLE_RATE', '24000')) || 24000,
      requestSampleRate: true,
      mimeType: 'audio/wav',
      fileExt: 'wav',
    };
  }
  if (requested === 'mp3' || requested === 'opus') {
    console.log('[deepgram-tts-ws] mapping compressed encoding to linear16 for Speak WS', {
      requested,
    });
  }
  return {
    encoding: 'linear16',
    container: 'none',
    sampleRate: Number(getEnv('DEEPGRAM_TTS_SAMPLE_RATE', '24000')) || 24000,
    requestSampleRate: true,
    mimeType: 'audio/wav',
    fileExt: 'wav',
  };
};

const buildSpeakWsUrl = ({ model, encoding, sampleRate, speed, region }) => {
  const format = resolveWsTtsFormat(encoding);
  const host = getDeepgramHost(region);
  const url = new URL(`wss://${host}/v1/speak`);
  url.searchParams.set('model', model || getEnv('DEEPGRAM_TTS_MODEL', 'aura-2-thalia-en'));
  url.searchParams.set('encoding', format.encoding);
  if (format.container) {
    url.searchParams.set('container', format.container);
  }
  if (format.requestSampleRate !== false && (sampleRate || format.sampleRate)) {
    url.searchParams.set('sample_rate', String(sampleRate || format.sampleRate));
  }
  const speedValue = Number(speed);
  if (Number.isFinite(speedValue) && speedValue >= 0.7 && speedValue <= 1.5 && host !== REGION_HOSTS.eu) {
    url.searchParams.set('speed', String(speedValue));
  }
  return { url: url.toString(), format, region, host };
};

const openSocket = (wsUrl, apiKey, timeoutMs) =>
  new Promise((resolve, reject) => {
    const startedAt = Date.now();
    let settled = false;
    const socket = new WebSocket(wsUrl, {
      headers: { Authorization: `Token ${apiKey}` },
      handshakeTimeout: timeoutMs,
      family: getEnv('DEEPGRAM_FORCE_IPV4', 'true').toLowerCase() === 'true' ? 4 : undefined,
    });
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      try {
        socket.terminate();
      } catch {}
      const error = new Error(`Deepgram TTS WS connect timeout (${timeoutMs}ms)`);
      error.code = 'DEEPGRAM_TTS_WS_CONNECT_TIMEOUT';
      reject(error);
    }, timeoutMs);

    socket.once('open', () => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve({ socket, connectionMs: Date.now() - startedAt });
    });
    socket.once('error', error => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      const next = new Error(`Deepgram TTS WS connect failed (${error?.message || error})`);
      next.code = 'DEEPGRAM_TTS_WS_CONNECT_FAILED';
      next.cause = error;
      reject(next);
    });
  });

/**
 * Persistent Aura TTS WebSocket for one voice call session.
 * Speak + Flush per phrase; recycle socket before Flush rate-limit.
 */
class DeepgramTtsWsSession {
  constructor({
    model,
    encoding = 'linear16',
    sampleRate,
    speed = 1,
    region = null,
  } = {}) {
    this.model = model;
    this.encoding = encoding;
    this.sampleRate = sampleRate;
    this.speed = speed;
    this.region = region || resolveRegion();
    this.apiKey = getEnv('DEEPGRAM_API_KEY');
    this.socket = null;
    this.connecting = null;
    this.destroyed = false;
    this.flushCount = 0;
    this.flushWindowStartedAt = Date.now();
    this.connectionReuseCount = 0;
    this.lastConnectionMs = 0;
    this.queue = Promise.resolve();
    this.activePhrase = null;
  }

  async ensureConnected({ forceNew = false } = {}) {
    if (this.destroyed) {
      const error = new Error('Deepgram TTS WS session destroyed.');
      error.code = 'DEEPGRAM_TTS_WS_DESTROYED';
      throw error;
    }
    if (!this.apiKey) {
      const error = new Error('Deepgram is not configured.');
      error.code = 'DEEPGRAM_NOT_CONFIGURED';
      throw error;
    }
    if (!forceNew && this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.connectionReuseCount += 1;
      return {
        reused: true,
        region: this.region,
        connectionMs: 0,
        ttsConnectionReuse: this.connectionReuseCount,
      };
    }
    if (this.connecting) {
      return this.connecting;
    }

    this.connecting = (async () => {
      this.teardownSocket();
      const primary = this.region || resolveRegion();
      const candidates = [primary];
      const alternate = getAlternateRegion(primary);
      if (alternate !== primary) {
        candidates.push(alternate);
      }

      let lastError = null;
      for (let i = 0; i < candidates.length; i += 1) {
        const region = candidates[i];
        const { url, format } = buildSpeakWsUrl({
          model: this.model,
          encoding: this.encoding,
          sampleRate: this.sampleRate,
          speed: this.speed,
          region,
        });
        try {
          // Dead primary fails fast; sticky/alternate get cold-TLS budget (~1.8s), not 8–10s.
          const timeoutMs =
            i === 0 && !hasStickyRegion() ? CONNECT_TIMEOUT_MS : ALT_CONNECT_TIMEOUT_MS;
          const { socket, connectionMs } = await openSocket(url, this.apiKey, timeoutMs);
          this.socket = socket;
          this.region = region;
          this.format = format;
          this.lastConnectionMs = connectionMs;
          this.flushCount = 0;
          this.flushWindowStartedAt = Date.now();
          rememberWorkingRegion(region);
          this.bindSocket(socket);
          console.log('[deepgram-tts-ws] connected', {
            region,
            host: getDeepgramHost(region),
            connectionMs,
            retryCount: i,
            model: this.model,
            encoding: format.encoding,
          });
          return {
            reused: false,
            region,
            connectionMs,
            ttsRetryCount: i,
            ttsRetryRegion: i > 0 ? region : null,
            ttsConnectionReuse: this.connectionReuseCount,
          };
        } catch (error) {
          lastError = error;
          console.warn('[deepgram-tts-ws] connect failed', {
            region,
            message: error?.message,
            attempt: i + 1,
          });
        }
      }
      const error = lastError || new Error('Deepgram TTS WS unavailable.');
      error.code = error.code || 'DEEPGRAM_TTS_WS_CONNECT_FAILED';
      throw error;
    })().finally(() => {
      this.connecting = null;
    });

    return this.connecting;
  }

  bindSocket(socket) {
    socket.on('message', (data, isBinary) => this.onMessage(data, isBinary));
    socket.on('close', () => {
      if (this.socket === socket) {
        this.socket = null;
      }
      if (this.activePhrase) {
        const { reject } = this.activePhrase;
        this.activePhrase = null;
        reject(Object.assign(new Error('Deepgram TTS WS closed mid-phrase.'), {
          code: 'DEEPGRAM_TTS_WS_CLOSED',
        }));
      }
    });
    socket.on('error', () => {
      // close handler settles active phrase
    });
  }

  onMessage(data, isBinary = false) {
    if (!this.activePhrase) {
      return;
    }

    const asBuffer = Buffer.isBuffer(data)
      ? data
      : data instanceof ArrayBuffer
        ? Buffer.from(data)
        : null;

    // Control frames (Metadata / Flushed / Warning) may arrive as non-binary Buffers.
    if (!isBinary) {
      const text = asBuffer ? asBuffer.toString('utf8') : String(data || '');
      let parsed = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        return;
      }
      if (parsed?.type === 'Flushed') {
        const phrase = this.activePhrase;
        this.activePhrase = null;
        if (phrase.coalesceBuf?.length && typeof phrase.onChunk === 'function') {
          phrase.onChunk(phrase.coalesceBuf, phrase.chunkIndex, false);
          phrase.chunkIndex += 1;
          phrase.coalesceBuf = Buffer.alloc(0);
        }
        if (typeof phrase.onChunk === 'function') {
          phrase.onChunk(Buffer.alloc(0), phrase.chunkIndex, true);
        }
        phrase.resolve({
          audioBuffer: phrase.parts.length ? Buffer.concat(phrase.parts) : Buffer.alloc(0),
          streamedBytes: phrase.streamedBytes,
          firstByteAt: phrase.firstByteAt,
          ttsServerTTFBMs:
            phrase.firstByteAt && phrase.speakSentAt
              ? phrase.firstByteAt - phrase.speakSentAt
              : null,
        });
        return;
      }
      if (parsed?.type === 'Warning' || parsed?.type === 'Error') {
        const phrase = this.activePhrase;
        this.activePhrase = null;
        if (phrase) {
          phrase.reject(
            Object.assign(new Error(parsed.description || parsed.message || 'Deepgram TTS WS error'), {
              code: 'DEEPGRAM_TTS_WS_ERROR',
            }),
          );
        }
      }
      return;
    }

    if (!asBuffer?.length) {
      return;
    }
    const phrase = this.activePhrase;
    if (!phrase.firstByteAt) {
      phrase.firstByteAt = Date.now();
    }
    phrase.parts.push(asBuffer);
    phrase.streamedBytes += asBuffer.length;
    if (typeof phrase.onChunk === 'function') {
      phrase.coalesceBuf = Buffer.concat([phrase.coalesceBuf, asBuffer]);
      while (phrase.coalesceBuf.length >= phrase.minChunkBytes) {
        const slice = phrase.coalesceBuf.slice(0, phrase.minChunkBytes);
        phrase.coalesceBuf = phrase.coalesceBuf.slice(phrase.minChunkBytes);
        phrase.onChunk(slice, phrase.chunkIndex, false);
        phrase.chunkIndex += 1;
      }
    }
  }

  teardownSocket() {
    const socket = this.socket;
    this.socket = null;
    if (!socket) {
      return;
    }
    try {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'Close' }));
      }
    } catch {}
    try {
      socket.terminate();
    } catch {}
  }

  async maybeRecycleForFlushBudget() {
    const now = Date.now();
    if (now - this.flushWindowStartedAt > 60_000) {
      this.flushCount = 0;
      this.flushWindowStartedAt = now;
    }
    if (this.flushCount >= FLUSH_WARN_LIMIT) {
      console.log('[deepgram-tts-ws] recycling socket before flush rate limit', {
        flushCount: this.flushCount,
        region: this.region,
      });
      await this.ensureConnected({ forceNew: true });
    }
  }

  speak(text, { onChunk, minChunkBytes = 1024, onMeta } = {}) {
    const run = async () => {
      const queuedAt = Date.now();
      let connectMeta = await this.ensureConnected();
      await this.maybeRecycleForFlushBudget();
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
        connectMeta = await this.ensureConnected({ forceNew: true });
      }

      const requestQueuedMs = Date.now() - queuedAt;
      const speakSentAt = Date.now();
      if (typeof onMeta === 'function') {
        try {
          onMeta({
            ttsConnectionReuse: connectMeta.reused ? this.connectionReuseCount : 0,
            ttsRegion: this.region,
            ttsConnectionMs: connectMeta.connectionMs || 0,
            ttsRetryCount: connectMeta.ttsRetryCount || 0,
            ttsRetryRegion: connectMeta.ttsRetryRegion || null,
            ttsRequestQueuedMs: requestQueuedMs,
            transport: 'websocket',
          });
        } catch {}
      }

      const result = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          if (this.activePhrase) {
            this.activePhrase = null;
          }
          reject(
            Object.assign(new Error('Deepgram TTS WS phrase timeout.'), {
              code: 'DEEPGRAM_TTS_WS_TIMEOUT',
            }),
          );
        }, PHRASE_TIMEOUT_MS);

        this.activePhrase = {
          resolve: value => {
            clearTimeout(timer);
            resolve(value);
          },
          reject: error => {
            clearTimeout(timer);
            reject(error);
          },
          onChunk,
          minChunkBytes: Math.max(0, Number(minChunkBytes) || 0),
          coalesceBuf: Buffer.alloc(0),
          chunkIndex: 0,
          parts: [],
          streamedBytes: 0,
          firstByteAt: 0,
          speakSentAt,
        };

        try {
          this.socket.send(JSON.stringify({ type: 'Speak', text }));
          this.socket.send(JSON.stringify({ type: 'Flush' }));
          this.flushCount += 1;
        } catch (error) {
          clearTimeout(timer);
          this.activePhrase = null;
          reject(error);
        }
      });

      return {
        ...result,
        ...connectMeta,
        region: this.region,
        ttsRegion: this.region,
        ttsConnectionMs: connectMeta.connectionMs || 0,
        ttsConnectionReuse: connectMeta.reused
          ? this.connectionReuseCount
          : this.connectionReuseCount,
        ttsRetryCount: connectMeta.ttsRetryCount || 0,
        ttsRetryRegion: connectMeta.ttsRetryRegion || null,
        ttsRequestQueuedMs: requestQueuedMs,
        ttsRequestToFirstAudioMs:
          result.firstByteAt && speakSentAt ? result.firstByteAt - speakSentAt : null,
        ttsServerTTFBMs: result.ttsServerTTFBMs,
        format: this.format,
        reused: Boolean(connectMeta.reused),
      };
    };

    // Serialize phrases on this session so audio order matches sentenceId queue.
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => {});
    return next;
  }

  destroy() {
    this.destroyed = true;
    if (this.activePhrase) {
      const { reject } = this.activePhrase;
      this.activePhrase = null;
      reject(Object.assign(new Error('Deepgram TTS WS session destroyed.'), {
        code: 'DEEPGRAM_TTS_WS_DESTROYED',
      }));
    }
    this.teardownSocket();
  }
}

const createDeepgramTtsWsSession = async options => {
  const session = new DeepgramTtsWsSession(options);
  await session.ensureConnected();
  // Warm path with a tiny utterance so the first real opener is not cold.
  try {
    await session.speak('Hi.', { minChunkBytes: 0 });
  } catch (error) {
    console.warn('[deepgram-tts-ws] prewarm speak failed', error?.message);
  }
  return session;
};

module.exports = {
  DeepgramTtsWsSession,
  createDeepgramTtsWsSession,
  CONNECT_TIMEOUT_MS,
};
