const path = require('path');
const textToSpeech = require('@google-cloud/text-to-speech');
const { getEnv } = require('../config/env');
const {
  normalizeLearningLanguage,
  resolveGoogleTtsLanguageCode,
  resolveGoogleTtsVoice,
} = require('../config/learningLanguage');

let client = null;

const resolveCredentialsPath = () => {
  const configured =
    getEnv('GOOGLE_TTS_CREDENTIALS_PATH') || getEnv('GOOGLE_APPLICATION_CREDENTIALS');
  if (!configured) {
    return null;
  }
  return path.isAbsolute(configured)
    ? configured
    : path.resolve(process.cwd(), configured);
};

const getGoogleTtsClient = () => {
  if (client) {
    return client;
  }
  const keyFilename = resolveCredentialsPath();
  if (!keyFilename) {
    const error = new Error('Google TTS credentials are not configured.');
    error.code = 'GOOGLE_TTS_NOT_CONFIGURED';
    throw error;
  }
  client = new textToSpeech.TextToSpeechClient({ keyFilename });
  return client;
};

const synthesizeSpeechWithGoogle = async ({
  text,
  speed = 1,
  learningLanguage,
  voiceVariant = 'default',
  model,
}) => {
  const speedValue = Number(speed);
  if (!Number.isFinite(speedValue) || speedValue < 0.7 || speedValue > 1.5) {
    const error = new Error('Speed must be between 0.7 and 1.5');
    error.code = 'GOOGLE_TTS_SPEED_INVALID';
    throw error;
  }

  const finalText = String(text || '').trim();
  if (!finalText) {
    const error = new Error('TTS text is empty.');
    error.code = 'GOOGLE_TTS_TEXT_EMPTY';
    throw error;
  }

  const lang = normalizeLearningLanguage(learningLanguage);
  const voiceName =
    voiceVariant === 'masculine' || voiceVariant === 'feminine'
      ? resolveGoogleTtsVoice(lang, voiceVariant)
      : model || resolveGoogleTtsVoice(lang, voiceVariant);
  const languageCode = resolveGoogleTtsLanguageCode(lang);
  const ttsClient = getGoogleTtsClient();

  console.log('[google-tts] request', {
    languageCode,
    voiceName,
    textLength: finalText.length,
  });

  let response;
  try {
    [response] = await ttsClient.synthesizeSpeech({
      input: { text: finalText },
      voice: { languageCode, name: voiceName },
      audioConfig: {
        audioEncoding: 'MP3',
        speakingRate: speedValue,
      },
    });
  } catch (error) {
    const message = error?.message || 'Google TTS request failed.';
    const err = new Error(message);
    if (/PERMISSION_DENIED|has not been used|SERVICE_DISABLED/i.test(message)) {
      err.code = 'GOOGLE_TTS_API_DISABLED';
    } else if (/NOT_FOUND|does not exist|invalid/i.test(message)) {
      err.code = 'GOOGLE_TTS_VOICE_INVALID';
    } else {
      err.code = 'GOOGLE_TTS_REQUEST_FAILED';
    }
    console.error('[google-tts] error', { code: err.code, message });
    throw err;
  }

  if (!response?.audioContent?.length) {
    const error = new Error('Google TTS returned empty audio.');
    error.code = 'GOOGLE_TTS_EMPTY_AUDIO';
    throw error;
  }

  return {
    audioBase64: Buffer.from(response.audioContent).toString('base64'),
    mimeType: 'audio/mpeg',
    modelUsed: voiceName,
    speedUsed: String(speedValue),
    provider: 'google',
  };
};

const prewarmGoogleTts = (learningLanguage, voiceVariant = 'default') => {
  try {
    getGoogleTtsClient();
    return synthesizeSpeechWithGoogle({
      text: '.',
      speed: 1,
      learningLanguage,
      voiceVariant,
    }).catch(() => {});
  } catch {
    return Promise.resolve();
  }
};

module.exports = {
  synthesizeSpeechWithGoogle,
  prewarmGoogleTts,
};
