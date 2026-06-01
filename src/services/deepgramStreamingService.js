const WebSocket = require('ws');
const { getEnv } = require('../config/env');

const DEEPGRAM_LIVE_URL = 'wss://api.eu.deepgram.com/v1/listen';

const parseNetworkError = error => {
  const code = error?.cause?.code || error?.code || 'NETWORK_ERROR';
  const message = error?.cause?.message || error?.message || 'Unknown network issue';
  return `${code}: ${message}`;
};

const buildDeepgramLiveUrl = ({
  sampleRate = 16000,
  channels = 1,
  language,
  smartFormat = true,
  punctuate = true,
  endpointingMs,
} = {}) => {
  const url = new URL(DEEPGRAM_LIVE_URL);
  url.searchParams.set('model', getEnv('DEEPGRAM_STREAM_MODEL', 'nova-3'));
  const streamLanguage =
    typeof language === 'string' && language.trim()
      ? language.trim()
      : getEnv('DEEPGRAM_STREAM_LANGUAGE', 'en');
  url.searchParams.set('language', streamLanguage);
  url.searchParams.set('encoding', 'linear16');
  url.searchParams.set('sample_rate', String(sampleRate));
  url.searchParams.set('channels', String(channels));
  url.searchParams.set(
    'endpointing',
    String(endpointingMs ?? getEnv('DEEPGRAM_ENDPOINTING_MS', '500')),
  );
  url.searchParams.set('interim_results', 'true');
  url.searchParams.set('smart_format', smartFormat ? 'true' : 'false');
  url.searchParams.set('punctuate', punctuate ? 'true' : 'false');
  url.searchParams.set('vad_events', 'true');
  // Deepgram rejects utterance_end_ms below 1000 (HTTP 400 on connect).
  const utteranceEndMs = Number(getEnv('DEEPGRAM_UTTERANCE_END_MS', '0')) || 0;
  if (utteranceEndMs >= 1000) {
    url.searchParams.set('utterance_end_ms', String(utteranceEndMs));
  }
  return url.toString();
};

const extractTranscript = payload => {
  const alt = payload?.channel?.alternatives?.[0];
  return typeof alt?.transcript === 'string' ? alt.transcript.trim() : '';
};

const createDeepgramLiveSession = ({
  sampleRate = 16000,
  channels = 1,
  language,
  smartFormat = true,
  punctuate = true,
  endpointingMs,
  onTranscript,
  onSpeechStarted,
  onUtteranceEnd,
  onError,
}) =>
  new Promise((resolve, reject) => {
    const apiKey = getEnv('DEEPGRAM_API_KEY');
    if (!apiKey) {
      const error = new Error('Deepgram is not configured.');
      error.code = 'DEEPGRAM_NOT_CONFIGURED';
      reject(error);
      return;
    }

    let opened = false;
    let intentionalClose = false;
    const connectTimeoutMs = Number(getEnv('DEEPGRAM_STREAM_CONNECT_TIMEOUT_MS', '3000')) || 3000;
    const forceIpv4 = getEnv('DEEPGRAM_FORCE_IPV4', 'true').toLowerCase() === 'true';
    const socket = new WebSocket(
      buildDeepgramLiveUrl({ sampleRate, channels, language, smartFormat, punctuate, endpointingMs }),
      {
      headers: { Authorization: `Token ${apiKey}` },
      handshakeTimeout: connectTimeoutMs,
      ...(forceIpv4 ? { family: 4 } : {}),
    });

    const safeError = error => {
      if (typeof onError === 'function') {
        onError(error);
      }
    };

    socket.on('open', () => {
      opened = true;
      resolve({
        sendAudio(buffer) {
          if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
            return false;
          }
          if (socket.readyState !== WebSocket.OPEN) {
            return false;
          }
          socket.send(buffer, { binary: true });
          return true;
        },
        flushUtterance() {
          try {
            if (socket.readyState === WebSocket.OPEN) {
              socket.send(JSON.stringify({ type: 'Finalize' }));
            }
          } catch {}
        },
        finalize() {
          try {
            if (socket.readyState === WebSocket.OPEN) {
              socket.send(JSON.stringify({ type: 'CloseStream' }));
            }
          } catch {}
        },
        destroy() {
          intentionalClose = true;
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

    socket.on('message', data => {
      let payload = null;
      try {
        const raw = Buffer.isBuffer(data) ? data.toString('utf8') : String(data);
        payload = JSON.parse(raw);
      } catch {
        return;
      }

      if (payload?.type === 'SpeechStarted') {
        if (typeof onSpeechStarted === 'function') {
          onSpeechStarted(payload);
        }
        return;
      }

      if (payload?.type === 'UtteranceEnd') {
        if (typeof onUtteranceEnd === 'function') {
          onUtteranceEnd(payload);
        }
        return;
      }

      if (payload?.type !== 'Results') {
        return;
      }

      const transcript = extractTranscript(payload);
      if (!transcript) {
        return;
      }
      if (typeof onTranscript === 'function') {
        onTranscript({
          transcript,
          isFinal: Boolean(payload.is_final),
          speechFinal: Boolean(payload.speech_final),
          raw: payload,
        });
      }
    });

    socket.on('error', error => {
      const nextError = new Error(`Deepgram live stream failed (${parseNetworkError(error)})`);
      nextError.code = 'DEEPGRAM_NETWORK_FAILED';
      if (!opened) {
        reject(nextError);
        return;
      }
      safeError(nextError);
    });

    socket.on('close', () => {
      if (opened && !intentionalClose) {
        safeError(Object.assign(new Error('Deepgram live stream closed.'), { code: 'DEEPGRAM_STREAM_CLOSED' }));
      }
    });
  });

module.exports = {
  createDeepgramLiveSession,
};
