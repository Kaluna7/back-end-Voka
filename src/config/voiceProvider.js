const { getEnv } = require('./env');

const PROVIDERS = {
  LEGACY: 'legacy',
  DEEPGRAM_AGENT: 'deepgram-agent',
};

const normalizeVoiceProvider = value => {
  const raw = String(value || '')
    .trim()
    .toLowerCase();
  if (!raw) {
    return null;
  }
  if (raw === 'legacy' || raw === 'classic' || raw === 'voka') {
    return PROVIDERS.LEGACY;
  }
  if (
    raw === 'deepgram-agent' ||
    raw === 'deepgram_agent' ||
    raw === 'agent' ||
    raw === 'voice-agent'
  ) {
    return PROVIDERS.DEEPGRAM_AGENT;
  }
  return null;
};

/**
 * Resolve voice orchestration provider.
 * Payload can override env for A/B. Missing/invalid think URL forces legacy.
 */
const resolveVoiceProvider = (payload = {}) => {
  const fromPayload = normalizeVoiceProvider(payload?.voiceProvider);
  const fromEnv = normalizeVoiceProvider(getEnv('VOICE_PROVIDER', PROVIDERS.DEEPGRAM_AGENT));
  const requested = fromPayload || fromEnv || PROVIDERS.DEEPGRAM_AGENT;

  if (requested !== PROVIDERS.DEEPGRAM_AGENT) {
    return PROVIDERS.LEGACY;
  }

  const thinkUrl = String(getEnv('VOICE_AGENT_THINK_URL', '') || '').trim();
  const publicBase = String(getEnv('VOICE_AGENT_PUBLIC_BASE_URL', '') || '').trim();
  if (!thinkUrl && !publicBase) {
    console.warn(
      '[voice-provider] deepgram-agent requested but VOICE_AGENT_THINK_URL / VOICE_AGENT_PUBLIC_BASE_URL missing — using legacy',
    );
    return PROVIDERS.LEGACY;
  }
  return PROVIDERS.DEEPGRAM_AGENT;
};

const buildVoiceAgentThinkUrl = sessionId => {
  const explicit = String(getEnv('VOICE_AGENT_THINK_URL', '') || '').trim();
  if (explicit) {
    return explicit.includes('{sessionId}')
      ? explicit.split('{sessionId}').join(encodeURIComponent(sessionId))
      : explicit;
  }
  const base = String(getEnv('VOICE_AGENT_PUBLIC_BASE_URL', '') || '')
    .trim()
    .replace(/\/$/, '');
  if (!base) {
    return '';
  }
  return `${base}/api/internal/voice-agent/chat/completions`;
};

module.exports = {
  PROVIDERS,
  normalizeVoiceProvider,
  resolveVoiceProvider,
  buildVoiceAgentThinkUrl,
};
