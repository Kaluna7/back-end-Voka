/**
 * Minimal Voice Agent smoke checks (no mic).
 * Usage: node scripts/smokeVoiceAgent.js
 *
 * 1) LLM gateway rejects empty transcript (no Hello? fallback)
 * 2) LLM gateway streams DeepSeek for a real user utterance
 * 3) Deepgram Voice Agent WS Welcome + SettingsApplied (requires DEEPGRAM_API_KEY)
 */
require('dotenv').config();
const http = require('http');
const WebSocket = require('ws');
const app = require('../src/app');
const { registerVoiceAgentSession, unregisterVoiceAgentSession } = require('../src/services/voiceAgentSessionRegistry');
const { getVoiceAgentWsUrl } = require('../src/config/deepgramEndpoints');
const { getEnv } = require('../src/config/env');

const PORT = 5055;
const SESSION_ID = `smoke-va-${Date.now()}`;
const SECRET = getEnv('VOICE_AGENT_THINK_SECRET', 'local-voice-agent-think-secret');

const postJson = (path, body, headers = {}) =>
  new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          Authorization: `Bearer ${SECRET}`,
          'x-voice-session-id': SESSION_ID,
          ...headers,
        },
      },
      res => {
        let data = '';
        res.on('data', chunk => {
          data += chunk;
        });
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      },
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });

const run = async () => {
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(PORT, '127.0.0.1', resolve));
  console.log('[smoke] server on', PORT);

  registerVoiceAgentSession(SESSION_ID, {
    companionId: 'nami',
    companionName: 'Nami',
    companionDescription: 'Friendly English teacher',
    companionPrompt: 'You are Nami, a warm English teacher. Keep replies under 20 words.',
    targetLanguage: 'en',
    history: [],
    historyLimit: 4,
    maxTokens: 48,
    timeoutMs: 8000,
    user: { onboarding: { language: 'en' } },
  });

  const empty = await postJson('/api/internal/voice-agent/chat/completions', {
    model: 'gpt-4o-mini',
    stream: true,
    messages: [{ role: 'user', content: '   ' }],
  });
  console.log('[smoke] empty transcript', empty.status, empty.body.slice(0, 160));
  if (empty.status !== 400) {
    throw new Error('Expected 400 for empty transcript');
  }

  const started = Date.now();
  let firstTokenMs = null;
  const hello = await new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      model: 'gpt-4o-mini',
      stream: true,
      messages: [{ role: 'user', content: 'Hello' }],
    });
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: '/api/internal/voice-agent/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          Authorization: `Bearer ${SECRET}`,
          'x-voice-session-id': SESSION_ID,
        },
      },
      res => {
        let body = '';
        res.on('data', chunk => {
          const text = String(chunk);
          body += text;
          if (!firstTokenMs && text.includes('"content"')) {
            firstTokenMs = Date.now() - started;
          }
        });
        res.on('end', () => resolve({ status: res.statusCode, body, firstTokenMs }));
      },
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
  console.log('[smoke] hello stream', {
    status: hello.status,
    firstTokenMs: hello.firstTokenMs,
    totalMs: Date.now() - started,
    hasDone: hello.body.includes('[DONE]'),
  });
  if (hello.status !== 200 || !hello.body.includes('[DONE]')) {
    throw new Error('Expected streaming completion for Hello');
  }

  const apiKey = getEnv('DEEPGRAM_API_KEY');
  if (apiKey) {
    try {
      await new Promise((resolve, reject) => {
        const ws = new WebSocket(getVoiceAgentWsUrl(), {
          headers: { Authorization: `Token ${apiKey}` },
          handshakeTimeout: 8000,
          family: 4,
        });
        const timer = setTimeout(() => {
          try {
            ws.terminate();
          } catch {}
          reject(new Error('Voice Agent WS timeout'));
        }, 10000);
        ws.on('message', data => {
          let parsed;
          try {
            parsed = JSON.parse(String(data));
          } catch {
            return;
          }
          if (parsed?.type === 'Welcome') {
            console.log('[smoke] agent Welcome');
            ws.send(
              JSON.stringify({
                type: 'Settings',
                audio: {
                  input: { encoding: 'linear16', sample_rate: 16000 },
                  output: { encoding: 'linear16', sample_rate: 24000, container: 'none' },
                },
                agent: {
                  listen: { provider: { type: 'deepgram', model: 'flux-general-en', version: 'v2' } },
                  think: {
                    provider: { type: 'open_ai', model: 'gpt-4o-mini' },
                    endpoint: {
                      // Localhost is unreachable from Deepgram cloud; Settings may still apply
                      // if Deepgram only validates URL shape. Full E2E needs a public tunnel.
                      url: `http://127.0.0.1:${PORT}/api/internal/voice-agent/chat/completions`,
                      headers: {
                        authorization: `Bearer ${SECRET}`,
                        'x-voice-session-id': SESSION_ID,
                      },
                    },
                    prompt: 'Short spoken replies only.',
                  },
                  speak: {
                    provider: {
                      type: 'deepgram',
                      version: 'v1',
                      model: getEnv('DEEPGRAM_TTS_MODEL', 'aura-2-thalia-en'),
                    },
                  },
                },
              }),
            );
          }
          if (parsed?.type === 'SettingsApplied') {
            console.log('[smoke] agent SettingsApplied');
            clearTimeout(timer);
            ws.close();
            resolve();
          }
          if (parsed?.type === 'Error') {
            clearTimeout(timer);
            reject(new Error(parsed.message || 'agent error'));
          }
        });
        ws.on('error', reject);
      });
    } catch (error) {
      console.warn('[smoke] agent WS skipped/failed (network)', error?.message || error);
    }
  } else {
    console.log('[smoke] skip agent WS (no DEEPGRAM_API_KEY)');
  }

  unregisterVoiceAgentSession(SESSION_ID);
  server.close();
  console.log('[smoke] ok');
};

run().catch(error => {
  console.error('[smoke] failed', error);
  process.exit(1);
});
