const { getEnv } = require('../config/env');
const {
  getAlternateRegion,
  getListenFluxWsUrl,
  getListenRestUrl,
  getSpeakUrl,
  hasStickyRegion,
  isDeepgramHost,
  isRetryableNetworkError,
  regionFromHost,
  rememberWorkingRegion,
  resolveRegion,
  swapUrlRegion,
  ttsSupportsSpeed,
} = require('../config/deepgramEndpoints');
const { stripMarkdownForTts } = require('./ttsTextUtils');
const WebSocket = require('ws');
const DEFAULT_MODEL = 'flux-general-multi';
const DEFAULT_LANGUAGE = 'multi';
const DEFAULT_TTS_MODEL = 'aura-2-thalia-en';
const OPUS_BIT_RATE = Number(getEnv('DEEPGRAM_TTS_OPUS_BIT_RATE', '64000')) || 64000;
const MP3_BIT_RATE = Number(getEnv('DEEPGRAM_TTS_MP3_BIT_RATE', '48000')) || 48000;
/** Quality-first default: uncompressed linear16 PCM (WAV). */
const DEFAULT_TTS_ENCODING = String(getEnv('DEEPGRAM_TTS_ENCODING', 'linear16')).toLowerCase();
const MIN_TTS_STREAM_BYTES = Number(getEnv('DEEPGRAM_TTS_MIN_CHUNK_BYTES', '512')) || 512;

const resolveTtsFormat = (encodingOverride = null) => {
  const encoding = String(encodingOverride || getEnv('DEEPGRAM_TTS_ENCODING', DEFAULT_TTS_ENCODING)).toLowerCase();
  if (encoding === 'opus') {
    return {
      encoding: 'opus',
      container: 'ogg',
      /** Fixed at 48kHz by Deepgram; do not send sample_rate query param. */
      sampleRate: 48000,
      requestSampleRate: false,
      mimeType: 'audio/ogg',
      fileExt: 'ogg',
    };
  }
  if (encoding === 'mp3') {
    return {
      encoding: 'mp3',
      container: null,
      sampleRate: 22050,
      requestSampleRate: false,
      mimeType: 'audio/mpeg',
      fileExt: 'mp3',
    };
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
/** REST STT: one round-trip, reliable for short M4A clips from the app */
const DEEPGRAM_STT_TIMEOUT_MS = Number(getEnv('DEEPGRAM_STT_TIMEOUT_MS', '10000')) || 10000;
const DEEPGRAM_TTS_TIMEOUT_MS = Number(getEnv('DEEPGRAM_TTS_TIMEOUT_MS', '12000')) || 12000;
/** Aggressive TTS connect — never burn 8s on a dead primary region. */
const DEEPGRAM_TTS_FAILOVER_TIMEOUT_MS =
  Number(getEnv('DEEPGRAM_TTS_FAILOVER_TIMEOUT_MS', '800')) || 800;
/** After primary fails fast, give the working alternate enough time for cold TLS + headers. */
const DEEPGRAM_TTS_FALLBACK_TIMEOUT_MS =
  Number(getEnv('DEEPGRAM_TTS_FALLBACK_TIMEOUT_MS', '2500')) || 2500;
const DEEPGRAM_CONNECT_TIMEOUT_MS = Number(getEnv('DEEPGRAM_CONNECT_TIMEOUT_MS', '3500')) || 3500;
/** Realtime WS often rejects non-linear16 streams; keep off by default for speed + stability */
const DEEPGRAM_REALTIME_STT_FAIL_FAST_MS = 2800;

let deepgramDispatcher = null;
let deepgramFetchImpl = globalThis.fetch.bind(globalThis);
try {
  const undici = require('undici');
  const forceIpv4 = getEnv('DEEPGRAM_FORCE_IPV4', 'true').toLowerCase() === 'true';
  // Must use undici.fetch with undici.Agent — Node's global fetch rejects a
  // foreign Agent (UND_ERR_INVALID_ARG: invalid onRequestStart method).
  if (typeof undici.fetch === 'function') {
    deepgramFetchImpl = undici.fetch.bind(undici);
  }
  deepgramDispatcher = new undici.Agent({
    connect: {
      // Keep connect budget at/under TTS failover so dead regions fail fast.
      timeout: Math.min(
        DEEPGRAM_CONNECT_TIMEOUT_MS,
        Math.max(DEEPGRAM_TTS_FAILOVER_TIMEOUT_MS, 700),
        2000,
      ),
      ...(forceIpv4 ? { family: 4 } : { autoSelectFamily: true, autoSelectFamilyAttemptTimeout: 400 }),
    },
    keepAliveTimeout: 60_000,
    keepAliveMaxTimeout: 60_000,
    connections: 8,
    pipelining: 1,
  });
} catch (error) {
  deepgramDispatcher = null;
  console.warn('[deepgram] undici Agent unavailable, using global fetch:', error?.message || error);
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const parseNetworkError = error => {
  const causeCode = error?.cause?.code || error?.code;
  const causeMessage = error?.cause?.message || error?.message;
  if (causeCode || causeMessage) {
    return `${causeCode || 'NETWORK_ERROR'}: ${causeMessage || 'Unknown network issue'}`;
  }
  return 'NETWORK_ERROR: Unknown network issue';
};

const requestDeepgramFetch = async (url, options, timeoutMs) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await deepgramFetchImpl(url, {
      ...options,
      signal: controller.signal,
      ...(deepgramDispatcher ? { dispatcher: deepgramDispatcher } : {}),
    });
  } finally {
    clearTimeout(timeout);
  }
};

const deepgramFetch = async (
  url,
  options,
  retries = 1,
  timeoutMs = DEEPGRAM_STT_TIMEOUT_MS,
  fetchOptions = {},
) => {
  let lastError = null;
  let requestUrl = url;
  const isTts = Boolean(fetchOptions.tts);
  const sticky = hasStickyRegion();
  /** TTS opener must fail over in <1s; never wait full connect timeout on a dead region. */
  const failoverMs = isTts
    ? DEEPGRAM_TTS_FAILOVER_TIMEOUT_MS
    : Number(getEnv('DEEPGRAM_FAILOVER_TIMEOUT_MS', '3500')) || 3500;
  const primaryTimeoutMs = Math.min(timeoutMs, failoverMs, isTts ? failoverMs : DEEPGRAM_CONNECT_TIMEOUT_MS);
  let retryCount = 0;
  let retryRegion = null;
  const requestStartedAt = Date.now();

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const attemptTimeout = attempt === 0 ? primaryTimeoutMs : timeoutMs;
      const response = await requestDeepgramFetch(requestUrl, options, attemptTimeout);
      const host = new URL(requestUrl).host;
      rememberWorkingRegion(regionFromHost(host));
      response.__deepgramMeta = {
        ttsRegion: regionFromHost(host) || resolveRegion(),
        ttsRetryCount: retryCount,
        ttsRetryRegion: retryRegion,
        ttsConnectionMs: Date.now() - requestStartedAt,
        ttsConnectionReuse: sticky ? 1 : 0,
      };
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await sleep(150 * (attempt + 1));
      }
    }
  }

  try {
    const parsed = new URL(requestUrl);
    if (isDeepgramHost(parsed.host)) {
      const fallbackRegion = getAlternateRegion(regionFromHost(parsed.host) || resolveRegion());
      const fallbackUrl = swapUrlRegion(requestUrl, fallbackRegion);
      if (fallbackUrl !== requestUrl) {
        // TTS: primary already failed fast; give alternate cold-connect budget, not full body timeout.
        const fallbackTimeoutMs = isTts
          ? Math.max(failoverMs, DEEPGRAM_TTS_FALLBACK_TIMEOUT_MS)
          : timeoutMs;
        retryCount = 1;
        retryRegion = fallbackRegion;
        console.warn('[deepgram] retrying request on alternate region', {
          from: parsed.host,
          to: new URL(fallbackUrl).host,
          message: lastError?.message,
          retryable: isRetryableNetworkError(lastError),
          tts: isTts,
          sticky,
          primaryTimeoutMs,
          fallbackTimeoutMs,
        });
        const response = await requestDeepgramFetch(fallbackUrl, options, fallbackTimeoutMs);
        rememberWorkingRegion(fallbackRegion);
        response.__deepgramMeta = {
          ttsRegion: fallbackRegion,
          ttsRetryCount: retryCount,
          ttsRetryRegion: retryRegion,
          ttsConnectionMs: Date.now() - requestStartedAt,
          ttsConnectionReuse: 0,
        };
        return response;
      }
    }
  } catch (fallbackError) {
    lastError = fallbackError;
  }

  const networkDetails = parseNetworkError(lastError);
  const error = new Error(`Deepgram network request failed (${networkDetails})`);
  error.code = 'DEEPGRAM_NETWORK_FAILED';
  error.ttsRetryCount = retryCount;
  error.ttsRetryRegion = retryRegion;
  throw error;
};

const normalizeTranscript = value => {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
};

const normalizeBase64Audio = rawValue => {
  if (typeof rawValue !== 'string') {
    return '';
  }
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return '';
  }
  const commaIndex = trimmed.indexOf(',');
  if (trimmed.startsWith('data:') && commaIndex > 0) {
    return trimmed.slice(commaIndex + 1);
  }
  return trimmed;
};

/** Flux v2 /listen — containerized audio (e.g. m4a) omits encoding; raw PCM sets encoding + sample_rate */
const buildDeepgramFluxListenUrl = ({ language: languageOverride, region = resolveRegion() } = {}) => {
  const url = new URL(getListenFluxWsUrl(region));
  url.searchParams.set('model', getEnv('DEEPGRAM_MODEL', DEFAULT_MODEL));
  const eotMs = Math.min(10000, Math.max(500, Number(getEnv('DEEPGRAM_EOT_TIMEOUT_MS', '700')) || 700));
  url.searchParams.set('eot_timeout_ms', String(eotMs));
  url.searchParams.set('eot_threshold', getEnv('DEEPGRAM_EOT_THRESHOLD', '0.62'));
  url.searchParams.set('eager_eot_threshold', getEnv('DEEPGRAM_EAGER_EOT_THRESHOLD', '0.38'));
  const language =
    typeof languageOverride === 'string' && languageOverride.trim()
      ? languageOverride.trim()
      : getEnv('DEEPGRAM_LANGUAGE', DEFAULT_LANGUAGE);
  if (language && language !== 'multi') {
    url.searchParams.set('language_hint', language);
  }
  return url.toString();
};

const extractTranscriptFromWsMessage = payload => {
  if (!payload || typeof payload !== 'object') {
    return '';
  }

  if (payload.type === 'TurnInfo' && typeof payload.transcript === 'string' && payload.transcript.trim()) {
    return payload.transcript.trim();
  }

  if (typeof payload.transcript === 'string' && payload.transcript.trim()) {
    return payload.transcript.trim();
  }

  const candidate =
    payload?.channel?.alternatives?.[0]?.transcript ||
    payload?.results?.channels?.[0]?.alternatives?.[0]?.transcript ||
    '';
  return typeof candidate === 'string' ? candidate.trim() : '';
};

/**
 * Live Flux session: send growing container audio (binary chunks), then CloseStream.
 * Fires onPartial(latestTranscript, event) on TurnInfo Update / EagerEndOfTurn / etc.
 */
const createFluxStreamingSttSession = ({ apiKey, onPartial, language }) =>
  new Promise((resolve, reject) => {
    let opened = false;
    let bestTranscript = '';
    let fatalMessage = null;

    const socket = new WebSocket(buildDeepgramFluxListenUrl({ language }), {
      headers: {
        Authorization: `Token ${apiKey}`,
      },
      handshakeTimeout: Number(getEnv('DEEPGRAM_STREAM_CONNECT_TIMEOUT_MS', '5000')) || 5000,
    });

    const handleMessage = raw => {
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return;
      }
      if (parsed.type === 'FatalError' || parsed.type === 'Error') {
        fatalMessage = parsed.description || parsed.message || 'Deepgram Flux error';
        return;
      }
      if (parsed.type === 'TurnInfo') {
        const line = extractTranscriptFromWsMessage(parsed);
        if (line) {
          bestTranscript = line;
        }
        if (typeof onPartial === 'function' && parsed.event) {
          onPartial(bestTranscript, parsed.event);
        }
      } else {
        const line = extractTranscriptFromWsMessage(parsed);
        if (line && line.length > bestTranscript.length) {
          bestTranscript = line;
        }
      }
    };

    socket.on('message', data => {
      const raw = Buffer.isBuffer(data) ? data.toString('utf8') : String(data);
      handleMessage(raw);
    });

    socket.on('error', error => {
      if (!opened) {
        const nextError = new Error(`Deepgram Flux connect failed (${parseNetworkError(error)})`);
        nextError.code = 'DEEPGRAM_NETWORK_FAILED';
        reject(nextError);
      }
    });

    socket.on('open', () => {
      opened = true;
      resolve({
        sendMediaChunk(buffer) {
          if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
            return;
          }
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(buffer, { binary: true });
          }
        },
        closeAndWaitFinalTranscript() {
          return new Promise((res, rej) => {
            let finished = false;
            const settle = (ok, value) => {
              if (finished) {
                return;
              }
              finished = true;
              clearTimeout(waitTimer);
              try {
                socket.removeListener('close', onClose);
              } catch {}
              if (ok) {
                res(value);
              } else {
                rej(value);
              }
            };
            const onClose = () => {
              if (fatalMessage) {
                const err = new Error(fatalMessage);
                err.code = 'DEEPGRAM_REQUEST_FAILED';
                settle(false, err);
                return;
              }
              settle(true, normalizeTranscript(bestTranscript));
            };
            const waitTimer = setTimeout(() => {
              settle(true, normalizeTranscript(bestTranscript));
            }, 1800);
            socket.once('close', onClose);
            try {
              if (socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({ type: 'CloseStream' }));
              } else {
                settle(true, normalizeTranscript(bestTranscript));
              }
            } catch (error) {
              settle(false, error);
            }
          });
        },
        destroy() {
          try {
            if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CLOSING) {
              socket.close();
            } else if (socket.readyState !== WebSocket.CLOSED && typeof socket.terminate === 'function') {
              socket.terminate();
            }
          } catch {}
        },
      });
    });
  });

const transcribeAudioWithDeepgramRealtime = async ({ audioBuffer, apiKey, timeoutMs }) =>
  new Promise((resolve, reject) => {
    let resolved = false;
    let bestTranscript = '';

    const socket = new WebSocket(buildDeepgramFluxListenUrl(), {
      headers: {
        Authorization: `Token ${apiKey}`,
      },
      handshakeTimeout: timeoutMs,
    });

    const finalize = (error, transcript = '') => {
      if (resolved) {
        return;
      }
      resolved = true;
      clearTimeout(timeout);
      try {
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CLOSING) {
          socket.close();
        } else if (socket.readyState !== WebSocket.CLOSED && typeof socket.terminate === 'function') {
          socket.terminate();
        }
      } catch {}

      if (error) {
        reject(error);
        return;
      }
      resolve(transcript);
    };

    const timeout = setTimeout(() => {
      const error = new Error('Deepgram realtime transcription timed out.');
      error.code = 'DEEPGRAM_NETWORK_FAILED';
      finalize(error);
    }, timeoutMs);

    socket.on('open', () => {
      try {
        socket.send(audioBuffer, { binary: true });
        socket.send(JSON.stringify({ type: 'CloseStream' }));
      } catch (error) {
        const nextError = new Error(`Failed to stream audio to Deepgram: ${error?.message || 'Unknown error'}`);
        nextError.code = 'DEEPGRAM_NETWORK_FAILED';
        finalize(nextError);
      }
    });

    socket.on('message', data => {
      try {
        const raw = Buffer.isBuffer(data) ? data.toString('utf8') : String(data);
        const parsed = JSON.parse(raw);
        const transcript = extractTranscriptFromWsMessage(parsed);
        if (transcript && transcript.length > bestTranscript.length) {
          bestTranscript = transcript;
        }
      } catch {}
    });

    socket.on('close', () => {
      finalize(null, normalizeTranscript(bestTranscript));
    });

    socket.on('error', error => {
      const nextError = new Error(`Deepgram realtime request failed (${parseNetworkError(error)})`);
      nextError.code = 'DEEPGRAM_NETWORK_FAILED';
      finalize(nextError);
    });
  });

const transcribeAudioWithDeepgramRest = async ({
  audioBuffer,
  mimeType = 'audio/wav',
  apiKey,
  timeoutMs = DEEPGRAM_STT_TIMEOUT_MS,
  language: languageOverride,
}) => {
  const configuredModel = getEnv('DEEPGRAM_MODEL', DEFAULT_MODEL);
  const model = /^flux-/i.test(configuredModel) ? 'nova-3' : configuredModel;
  const language =
    typeof languageOverride === 'string' && languageOverride.trim()
      ? languageOverride.trim()
      : getEnv('DEEPGRAM_LANGUAGE', DEFAULT_LANGUAGE);
  const url = new URL(getListenRestUrl());
  url.searchParams.set('model', model);
  url.searchParams.set('language', language);
  url.searchParams.set('smart_format', 'true');
  url.searchParams.set('punctuate', 'true');

  let response = await deepgramFetch(
    url.toString(),
    {
      method: 'POST',
      headers: {
        Authorization: `Token ${apiKey}`,
        'Content-Type': mimeType,
      },
      body: audioBuffer,
    },
    0,
    timeoutMs,
  );

  if (!response.ok && language === 'multi') {
    const fallbackUrl = new URL(getListenRestUrl());
    fallbackUrl.searchParams.set('model', model);
    fallbackUrl.searchParams.set('detect_language', 'true');
    fallbackUrl.searchParams.set('smart_format', 'true');
    fallbackUrl.searchParams.set('punctuate', 'true');
    response = await deepgramFetch(
      fallbackUrl.toString(),
      {
        method: 'POST',
        headers: {
          Authorization: `Token ${apiKey}`,
          'Content-Type': mimeType,
        },
        body: audioBuffer,
      },
      0,
      timeoutMs,
    );
  }

  if (!response.ok) {
    const responseBody = await response.text().catch(() => '');
    const messageSuffix = responseBody ? `: ${responseBody}` : '';
    const error = new Error(`Deepgram request failed with status ${response.status}${messageSuffix}`);
    error.code = 'DEEPGRAM_REQUEST_FAILED';
    throw error;
  }

  const data = await response.json();
  return normalizeTranscript(data?.results?.channels?.[0]?.alternatives?.[0]?.transcript);
};

const transcribeAudioWithDeepgram = async ({
  audioBuffer,
  mimeType = 'audio/wav',
  preferRest = false,
  timeoutMs = DEEPGRAM_STT_TIMEOUT_MS,
  language,
}) => {
  const apiKey = getEnv('DEEPGRAM_API_KEY');
  if (!apiKey) {
    const error = new Error('Deepgram is not configured.');
    error.code = 'DEEPGRAM_NOT_CONFIGURED';
    throw error;
  }

  if (!Buffer.isBuffer(audioBuffer) || audioBuffer.length === 0) {
    const error = new Error('Audio payload is invalid.');
    error.code = 'DEEPGRAM_INVALID_AUDIO';
    throw error;
  }

  const useRealtimeFirst = !preferRest && getEnv('DEEPGRAM_REALTIME_STT', 'false').toLowerCase() === 'true';

  if (useRealtimeFirst) {
    try {
      const realtimeTranscript = await transcribeAudioWithDeepgramRealtime({
        audioBuffer,
        apiKey,
        timeoutMs: DEEPGRAM_REALTIME_STT_FAIL_FAST_MS,
      });
      if (realtimeTranscript) {
        return realtimeTranscript;
      }
    } catch (error) {
      if (error?.code !== 'DEEPGRAM_NETWORK_FAILED') {
        throw error;
      }
    }
  }

  return transcribeAudioWithDeepgramRest({ audioBuffer, mimeType, apiKey, timeoutMs, language });
};

const buildPronunciationText = (text, pronunciations = []) => {
  if (!Array.isArray(pronunciations) || pronunciations.length === 0) {
    return text;
  }

  let nextText = String(text || '');
  pronunciations.forEach(item => {
    const word = typeof item?.word === 'string' ? item.word.trim() : '';
    const pronounce = typeof item?.pronounce === 'string' ? item.pronounce.trim() : '';
    if (!word || !pronounce) {
      return;
    }
    const escapedReplacement = `\\\\{"word": "${word}", "pronounce": "${pronounce}"\\\\}`;
    const safeWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    nextText = nextText.replace(new RegExp(safeWord, 'g'), escapedReplacement);
  });
  return nextText;
};

const buildDeepgramTtsUrl = ({ model, speed = 1, encoding = 'opus' } = {}) => {
  const format = resolveTtsFormat(encoding);
  const url = new URL(getSpeakUrl());
  url.searchParams.set('model', model || getEnv('DEEPGRAM_TTS_MODEL', DEFAULT_TTS_MODEL));
  url.searchParams.set('encoding', format.encoding);
  if (format.container) {
    url.searchParams.set('container', format.container);
  }
  if (format.requestSampleRate !== false && format.sampleRate) {
    url.searchParams.set('sample_rate', String(format.sampleRate));
  }
  if (format.encoding === 'opus' && OPUS_BIT_RATE > 0) {
    url.searchParams.set('bit_rate', String(OPUS_BIT_RATE));
  }
  if (format.encoding === 'mp3' && MP3_BIT_RATE > 0) {
    url.searchParams.set('bit_rate', String(MP3_BIT_RATE));
  }
  if (ttsSupportsSpeed()) {
    const speedValue = Number(speed);
    if (Number.isFinite(speedValue) && speedValue >= 0.7 && speedValue <= 1.5) {
      url.searchParams.set('speed', String(speedValue));
    }
  }
  return url;
};

const streamDeepgramTtsResponse = async (response, onChunk, minChunkBytesOverride = null) => {
  const coalesceMin =
    typeof minChunkBytesOverride === 'number' && minChunkBytesOverride >= 0
      ? minChunkBytesOverride
      : MIN_TTS_STREAM_BYTES;
  let coalesceBuf = Buffer.alloc(0);
  let chunkIndex = 0;

  const flushCoalesced = (done = false) => {
    if (typeof onChunk !== 'function') {
      coalesceBuf = Buffer.alloc(0);
      return;
    }
    if (coalesceBuf.length > 0) {
      onChunk(coalesceBuf, chunkIndex, false);
      chunkIndex += 1;
      coalesceBuf = Buffer.alloc(0);
    }
    if (done) {
      onChunk(Buffer.alloc(0), chunkIndex, true);
    }
  };

  const pushAudio = buffer => {
    if (!buffer?.length) {
      return;
    }
    if (typeof onChunk !== 'function') {
      return;
    }
    if (coalesceMin <= 0) {
      onChunk(buffer, chunkIndex, false);
      chunkIndex += 1;
      return;
    }
    coalesceBuf = Buffer.concat([coalesceBuf, buffer]);
    while (coalesceBuf.length >= coalesceMin) {
      onChunk(coalesceBuf.slice(0, coalesceMin), chunkIndex, false);
      chunkIndex += 1;
      coalesceBuf = coalesceBuf.slice(coalesceMin);
    }
  };
  const body = response.body;
  if (!body || typeof body.getReader !== 'function') {
    const audioArrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(audioArrayBuffer);
    pushAudio(buffer);
    flushCoalesced(true);
    return buffer;
  }

  const reader = body.getReader();
  const parts = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (!value?.length) {
        continue;
      }
      const buffer = Buffer.from(value);
      parts.push(buffer);
      pushAudio(buffer);
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {}
  }
  flushCoalesced(true);
  return parts.length ? Buffer.concat(parts) : Buffer.alloc(0);
};

const synthesizeSpeechWithDeepgram = async ({
  text,
  model,
  speed = 1,
  pronunciations = [],
  onChunk,
  encoding,
  minChunkBytes,
  ttsWsSession = null,
  onTtsMeta = null,
}) => {
  const apiKey = getEnv('DEEPGRAM_API_KEY');
  if (!apiKey) {
    const error = new Error('Deepgram is not configured.');
    error.code = 'DEEPGRAM_NOT_CONFIGURED';
    throw error;
  }

  const speedValue = Number(speed);
  if (!Number.isFinite(speedValue) || speedValue < 0.7 || speedValue > 1.5) {
    const error = new Error('Speed must be between 0.7 and 1.5');
    error.code = 'DEEPGRAM_TTS_SPEED_INVALID';
    throw error;
  }

  const finalText = stripMarkdownForTts(buildPronunciationText(text, pronunciations));
  if (!finalText.trim()) {
    const error = new Error('TTS text is empty.');
    error.code = 'DEEPGRAM_TTS_TEXT_EMPTY';
    throw error;
  }

  const requestedEncoding =
    typeof encoding === 'string' && encoding.trim()
      ? encoding.trim().toLowerCase()
      : String(getEnv('DEEPGRAM_TTS_ENCODING', DEFAULT_TTS_ENCODING) || DEFAULT_TTS_ENCODING).toLowerCase();
  const format = resolveTtsFormat(requestedEncoding);
  const chunkMin =
    typeof minChunkBytes === 'number' && minChunkBytes >= 0 ? minChunkBytes : MIN_TTS_STREAM_BYTES;
  const emitMeta = meta => {
    if (typeof onTtsMeta === 'function') {
      try {
        onTtsMeta(meta);
      } catch {}
    }
  };

  // Prefer persistent WebSocket session for realtime voice (connection reuse).
  if (ttsWsSession && typeof ttsWsSession.speak === 'function' && !ttsWsSession.destroyed) {
    const queuedAt = Date.now();
    console.log('[deepgram-tts] request', {
      model: model || getEnv('DEEPGRAM_TTS_MODEL', DEFAULT_TTS_MODEL),
      encoding: format.encoding,
      transport: 'websocket',
      text: finalText,
      streaming: Boolean(onChunk),
      minChunkBytes: chunkMin,
    });
    try {
      const wsResult = await ttsWsSession.speak(finalText, {
        onChunk,
        minChunkBytes: chunkMin,
        onMeta: emitMeta,
      });
      const ttsMeta = {
        ttsConnectionReuse: wsResult.ttsConnectionReuse,
        ttsRegion: wsResult.ttsRegion,
        ttsConnectionMs: wsResult.ttsConnectionMs,
        ttsServerTTFBMs: wsResult.ttsServerTTFBMs,
        ttsRetryCount: wsResult.ttsRetryCount,
        ttsRetryRegion: wsResult.ttsRetryRegion,
        ttsRequestQueuedMs: wsResult.ttsRequestQueuedMs ?? Date.now() - queuedAt,
        ttsRequestToFirstAudioMs: wsResult.ttsRequestToFirstAudioMs,
        transport: 'websocket',
      };
      emitMeta(ttsMeta);
      console.log('[deepgram-tts] response', {
        ok: true,
        transport: 'websocket',
        ...ttsMeta,
      });
      const streamedOnly = Boolean(onChunk);
      return {
        audioBase64: streamedOnly ? '' : (wsResult.audioBuffer || Buffer.alloc(0)).toString('base64'),
        mimeType: wsResult.format?.mimeType || format.mimeType,
        encoding: wsResult.format?.encoding || format.encoding,
        container: wsResult.format?.container || format.container,
        sampleRate: wsResult.format?.sampleRate || format.sampleRate,
        fileExt: wsResult.format?.fileExt || format.fileExt,
        streamed: streamedOnly,
        modelUsed: model || DEFAULT_TTS_MODEL,
        speedUsed: String(speedValue),
        ttsMeta,
      };
    } catch (wsError) {
      console.warn('[deepgram-tts] websocket speak failed, falling back to http', {
        message: wsError?.message,
        code: wsError?.code,
      });
      // Fall through to HTTP keep-alive path for this phrase only.
    }
  }

  const url = buildDeepgramTtsUrl({ model, speed: speedValue, encoding: format.encoding });
  console.log('[deepgram-tts] request', {
    model: url.searchParams.get('model'),
    encoding: format.encoding,
    container: format.container || 'default',
    sampleRate: format.sampleRate,
    transport: 'http',
    stickyRegion: hasStickyRegion() ? resolveRegion() : null,
    ...(format.encoding === 'opus' ? { bitRate: OPUS_BIT_RATE } : {}),
    ...(format.encoding === 'mp3' ? { bitRate: MP3_BIT_RATE } : {}),
    ...(ttsSupportsSpeed() ? { speed: speedValue } : {}),
    text: finalText,
    streaming: Boolean(onChunk),
    minChunkBytes: chunkMin,
  });

  const responseStartedAt = Date.now();
  const response = await deepgramFetch(
    url.toString(),
    {
      method: 'POST',
      headers: {
        Authorization: `Token ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: finalText }),
    },
    0,
    DEEPGRAM_TTS_TIMEOUT_MS,
    { tts: true },
  );
  const meta = response.__deepgramMeta || {};
  const ttsMeta = {
    ...meta,
    transport: 'http',
    ttsServerTTFBMs: meta.ttsConnectionMs || Date.now() - responseStartedAt,
  };
  emitMeta(ttsMeta);
  console.log('[deepgram-tts] response', {
    ok: response.ok,
    status: response.status,
    contentType: response.headers.get('content-type'),
    ...ttsMeta,
  });

  if (!response.ok) {
    const responseBody = await response.text().catch(() => '');
    const messageSuffix = responseBody ? `: ${responseBody}` : '';
    const error = new Error(`Deepgram TTS request failed with status ${response.status}${messageSuffix}`);
    error.code = 'DEEPGRAM_TTS_REQUEST_FAILED';
    throw error;
  }

  const audioBuffer = await streamDeepgramTtsResponse(response, onChunk, chunkMin);
  const streamedOnly = Boolean(onChunk);
  return {
    audioBase64: streamedOnly ? '' : audioBuffer.toString('base64'),
    mimeType: format.mimeType,
    encoding: format.encoding,
    container: format.container,
    sampleRate: format.sampleRate,
    fileExt: format.fileExt,
    streamed: streamedOnly,
    modelUsed: response.headers.get('dg-model-name') || model || DEFAULT_TTS_MODEL,
    speedUsed: response.headers.get('dg-speed-used') || String(speedValue),
    ttsMeta,
  };
};

const deepgramTtsPrewarmCache = new Map();

const prewarmDeepgramTts = async (model = DEFAULT_TTS_MODEL) => {
  const key = String(model || DEFAULT_TTS_MODEL);
  if (deepgramTtsPrewarmCache.has(key)) {
    return deepgramTtsPrewarmCache.get(key);
  }
  const promise = synthesizeSpeechWithDeepgram({
    text: 'Hi.',
    model: key,
    speed: 1,
    encoding: 'mp3',
  })
    .then(result => {
      console.log('[deepgram-tts] prewarm ok', {
        model: key,
        ttsRegion: result?.ttsMeta?.ttsRegion || resolveRegion(),
        sticky: hasStickyRegion(),
      });
      return result;
    })
    .catch(error => {
      deepgramTtsPrewarmCache.delete(key);
      console.log('[deepgram-tts] prewarm failed', { model: key, message: error?.message });
      throw error;
    });
  deepgramTtsPrewarmCache.set(key, promise);
  return promise;
};

module.exports = {
  deepgramFetch,
  transcribeAudioWithDeepgram,
  normalizeBase64Audio,
  synthesizeSpeechWithDeepgram,
  prewarmDeepgramTts,
  createFluxStreamingSttSession,
  resolveTtsFormat,
  DEFAULT_TTS_ENCODING,
};

