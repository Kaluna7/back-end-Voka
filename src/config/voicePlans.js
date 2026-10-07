const { getEnv } = require('./env');

/**
 * Monthly subscription plans. Voice quota is stored as Voice Tokens, not minutes —
 * tokens are burned by the real STT + TTS cost of each call (see voiceTokenService).
 */
const VOICE_PLANS = Object.freeze({
  starter: { id: 'starter', name: 'Basic', priceIdr: 75000, voiceTokens: 100000 },
  pro: { id: 'pro', name: 'Pro', priceIdr: 129000, voiceTokens: 300000 },
  premium: { id: 'premium', name: 'Premium', priceIdr: 299000, voiceTokens: 1000000 },
});

const PLAN_PERIOD_DAYS = 30;

const numberEnv = (key, fallback) => {
  const value = Number(getEnv(key, String(fallback)));
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

/**
 * Conversion knobs — change these (env) when providers, models or margin change;
 * the plans themselves stay the same.
 *  - STT: Deepgram streaming is billed per minute of audio sent.
 *  - TTS: billed per 1,000 characters spoken.
 *  - VOICE_TOKEN_IDR: how many rupiah of provider cost one Voice Token represents.
 * Defaults land at ≈1,650 tokens per typical call minute (1 min STT + ~400 TTS chars),
 * i.e. 100K ≈ 60 min, 300K ≈ 180 min, 1M ≈ 600 min.
 */
const getVoicePricing = () => ({
  sttIdrPerMinute: numberEnv('VOICE_STT_IDR_PER_MINUTE', 130),
  ttsIdrPer1kChars: numberEnv('VOICE_TTS_IDR_PER_1K_CHARS', 500),
  idrPerVoiceToken: numberEnv('VOICE_TOKEN_IDR', 0.2),
  /** Only used to show "≈ N minutes" in the app. */
  typicalTtsCharsPerMinute: numberEnv('VOICE_TYPICAL_TTS_CHARS_PER_MINUTE', 400),
});

/** Voice Tokens for a slice of usage. Fractional — callers round when charging. */
const voiceTokensForUsage = ({ sttSeconds = 0, ttsChars = 0 }) => {
  const pricing = getVoicePricing();
  const idr =
    (Math.max(0, sttSeconds) / 60) * pricing.sttIdrPerMinute +
    (Math.max(0, ttsChars) / 1000) * pricing.ttsIdrPer1kChars;
  return idr / pricing.idrPerVoiceToken;
};

/** Typical tokens per call minute (for UI estimates and legacy-seconds conversion). */
const estimateVoiceTokensPerMinute = () => {
  const pricing = getVoicePricing();
  return Math.round(voiceTokensForUsage({ sttSeconds: 60, ttsChars: pricing.typicalTtsCharsPerMinute }));
};

/** Free voice tokens every new account gets: about 5 minutes of teacher calls (5 × ~1650). */
const WELCOME_VOICE_TOKENS = Math.max(0, Number(process.env.WELCOME_VOICE_TOKENS || 8250));

module.exports = {
  WELCOME_VOICE_TOKENS,
  VOICE_PLANS,
  PLAN_PERIOD_DAYS,
  getVoicePricing,
  voiceTokensForUsage,
  estimateVoiceTokensPerMinute,
};
