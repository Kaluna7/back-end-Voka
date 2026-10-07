const {
  normalizeLearningLanguage,
  usesGoogleTts,
  resolveTtsModelForUser,
} = require('../config/learningLanguage');
const { synthesizeSpeechWithDeepgram } = require('./deepgramService');
const { synthesizeSpeechWithGoogle } = require('./googleTtsService');
const { stripMarkdownForTts } = require('./ttsTextUtils');

/**
 * Unified TTS: Google where Aura has no native voice (KO/AR/ZH/HI/ID/PT, …);
 * Deepgram Aura for EN/ES/FR/DE/NL/IT/JA. STT stays on Deepgram elsewhere.
 */
const synthesizeSpeech = async ({
  text,
  model,
  speed = 1,
  pronunciations = [],
  learningLanguage,
  voiceVariant = 'default',
  user,
  onChunk,
  encoding,
  minChunkBytes,
  ttsWsSession = null,
  onTtsMeta = null,
}) => {
  const lang = learningLanguage
    ? normalizeLearningLanguage(learningLanguage)
    : user
      ? normalizeLearningLanguage(user?.onboarding?.language)
      : null;

  const spokenText = stripMarkdownForTts(text);
  if (!spokenText) {
    const error = new Error('TTS text is empty.');
    error.code = 'DEEPGRAM_TTS_TEXT_EMPTY';
    throw error;
  }

  const resolvedModel =
    lang || user
      ? resolveTtsModelForUser(user || { onboarding: { language: lang } }, model, voiceVariant)
      : model;

  if (lang && usesGoogleTts(lang)) {
    return synthesizeSpeechWithGoogle({
      text: spokenText,
      model: resolvedModel,
      speed,
      learningLanguage: lang,
      voiceVariant,
    });
  }

  return synthesizeSpeechWithDeepgram({
    text: spokenText,
    model: resolvedModel,
    speed,
    pronunciations,
    onChunk,
    encoding,
    minChunkBytes,
    ttsWsSession,
    onTtsMeta,
  });
};

module.exports = {
  synthesizeSpeech,
  synthesizeSpeechWithDeepgram,
  synthesizeSpeechWithGoogle,
};
