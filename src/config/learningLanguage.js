const featuredLanguages = [
  'English',
  'Spanish',
  'Portuguese',
  'French',
  'German',
  'Japanese',
  'Korean',
  'Chinese',
  'Arabic',
  'Hindi',
  'Dutch',
  'Italian',
  'Indonesian',
];

const normalizeLearningLanguage = language => {
  if (typeof language !== 'string') {
    return 'English';
  }
  const clean = language.trim();
  if (!clean) {
    return 'English';
  }
  const match = featuredLanguages.find(
    item => item.toLowerCase() === clean.toLowerCase(),
  );
  return match || clean;
};

/** Google TTS only where Deepgram Aura has no voices (ko / ar / zh). */
const GOOGLE_TTS_LANGUAGES = new Set(['Korean', 'Arabic', 'Chinese']);

const usesGoogleTts = learningLanguage =>
  GOOGLE_TTS_LANGUAGES.has(normalizeLearningLanguage(learningLanguage));

const isCjkLearningLanguage = learningLanguage => {
  const lang = normalizeLearningLanguage(learningLanguage);
  return lang === 'Japanese' || lang === 'Korean' || lang === 'Chinese';
};

const resolveGoogleTtsLanguageCode = learningLanguage => {
  switch (normalizeLearningLanguage(learningLanguage)) {
    case 'Korean':
      return 'ko-KR';
    case 'Arabic':
      return 'ar-XA';
    case 'Chinese':
      return 'cmn-CN';
    default:
      return 'en-US';
  }
};

const resolveGoogleTtsVoice = (learningLanguage, voiceVariant = 'default') => {
  const lang = normalizeLearningLanguage(learningLanguage);
  const useMale = voiceVariant === 'masculine' || voiceVariant === 'interviewer';
  if (lang === 'Korean') {
    // Google docs: A/B = female, C = male (B is not a male voice).
    return useMale ? 'ko-KR-Neural2-C' : 'ko-KR-Neural2-A';
  }
  if (lang === 'Arabic') {
    return useMale ? 'ar-XA-Wavenet-B' : 'ar-XA-Wavenet-A';
  }
  if (lang === 'Chinese') {
    return useMale ? 'cmn-CN-Wavenet-B' : 'cmn-CN-Wavenet-A';
  }
  return 'ko-KR-Neural2-A';
};

const resolveDeepgramSttLanguage = learningLanguage => {
  switch (normalizeLearningLanguage(learningLanguage)) {
    case 'Japanese':
      return 'ja';
    case 'Korean':
      return 'ko';
    case 'Arabic':
      return 'ar';
    case 'Chinese':
      return 'zh';
    case 'Hindi':
      return 'hi';
    case 'Spanish':
      return 'es';
    case 'Portuguese':
      return 'pt';
    case 'French':
      return 'fr';
    case 'German':
      return 'de';
    case 'Dutch':
      return 'nl';
    case 'Italian':
      return 'it';
    case 'Indonesian':
      return 'id';
    case 'English':
    default:
      return 'en';
  }
};

const resolveInterviewerDeepgramTtsModel = lang => {
  switch (lang) {
    case 'Japanese':
      return 'aura-2-fujin-ja';
    case 'Spanish':
    case 'Portuguese':
      return 'aura-2-nestor-es';
    case 'German':
      return 'aura-2-fabian-de';
    case 'French':
      return 'aura-2-hector-fr';
    case 'Dutch':
      return 'aura-2-sander-nl';
    case 'Italian':
      return 'aura-2-flavio-it';
    case 'Indonesian':
      return 'aura-2-orpheus-en';
    default:
      return 'aura-2-orpheus-en';
  }
};

const resolveDeepgramTtsModel = (learningLanguage, voiceVariant = 'default') => {
  const lang = normalizeLearningLanguage(learningLanguage);
  if (voiceVariant === 'interviewer') {
    return resolveInterviewerDeepgramTtsModel(lang);
  }
  const masculine = voiceVariant === 'masculine';
  if (lang === 'Japanese') {
    return masculine ? 'aura-2-fujin-ja' : 'aura-2-izanami-ja';
  }
  if (lang === 'Spanish') {
    return masculine ? 'aura-2-javier-es' : 'aura-2-estrella-es';
  }
  if (lang === 'Portuguese') {
    return masculine ? 'aura-2-javier-es' : 'aura-2-estrella-es';
  }
  if (lang === 'German') {
    return masculine ? 'aura-2-julius-de' : 'aura-2-viktoria-de';
  }
  if (lang === 'French') {
    return masculine ? 'aura-2-hector-fr' : 'aura-2-agathe-fr';
  }
  if (lang === 'Dutch') {
    return masculine ? 'aura-2-sander-nl' : 'aura-2-rhea-nl';
  }
  if (lang === 'Italian') {
    return masculine ? 'aura-2-dionisio-it' : 'aura-2-livia-it';
  }
  if (lang === 'Indonesian') {
    return masculine ? 'aura-2-orion-en' : 'aura-2-thalia-en';
  }
  if (lang === 'Hindi') {
    return masculine ? 'aura-2-orion-en' : 'aura-2-thalia-en';
  }
  if (masculine) {
    return 'aura-2-orion-en';
  }
  return 'aura-2-thalia-en';
};

const resolveTtsModelForUser = (user, clientModel, voiceVariant = 'default') => {
  const learningLanguage = normalizeLearningLanguage(user?.onboarding?.language);
  if (usesGoogleTts(learningLanguage)) {
    return resolveGoogleTtsVoice(learningLanguage, voiceVariant);
  }
  const preferred = resolveDeepgramTtsModel(learningLanguage, voiceVariant);
  if (!clientModel || typeof clientModel !== 'string') {
    return preferred;
  }
  const model = clientModel.trim();
  if (!model) {
    return preferred;
  }
  /** Teacher/character gender must win over a stale client model (e.g. Thalia for Bob). */
  if (voiceVariant === 'masculine' || voiceVariant === 'feminine' || voiceVariant === 'interviewer') {
    return preferred;
  }
  const lang = learningLanguage;
  const wrongSuffixes = {
    Japanese: ['-en', '-es', '-de', '-fr'],
    Spanish: ['-en', '-ja', '-de'],
    Portuguese: ['-en', '-ja', '-de'],
    German: ['-en', '-ja', '-es'],
    French: ['-en', '-ja', '-es', '-de'],
    Dutch: ['-en', '-ja', '-es', '-de', '-fr'],
    Italian: ['-en', '-ja', '-es', '-de', '-fr'],
    Indonesian: ['-en', '-ja', '-es', '-de', '-fr'],
    Hindi: ['-en', '-ja', '-es', '-de', '-fr'],
    Chinese: ['-en', '-ja', '-es', '-de'],
    English: ['-ja', '-es', '-de', '-fr'],
    Korean: ['-en', '-ja', '-es', '-de'],
    Arabic: ['-en', '-ja', '-es', '-de'],
  };
  const bad = wrongSuffixes[lang] || [];
  if (bad.some(suffix => model.endsWith(suffix))) {
    return preferred;
  }
  return model;
};

const resolveLearningLanguage = user =>
  normalizeLearningLanguage(user?.onboarding?.language);

const resolveVoiceVariantForCompanion = companionId => {
  const id = String(companionId || '').toLowerCase();
  if (id === 'leo') {
    return 'interviewer';
  }
  if (id === 'bob' || id === 'kael') {
    return 'masculine';
  }
  if (id === 'nami') {
    return 'feminine';
  }
  return 'feminine';
};

module.exports = {
  featuredLanguages,
  normalizeLearningLanguage,
  usesGoogleTts,
  isCjkLearningLanguage,
  GOOGLE_TTS_LANGUAGES,
  resolveGoogleTtsLanguageCode,
  resolveGoogleTtsVoice,
  resolveDeepgramSttLanguage,
  resolveDeepgramTtsModel,
  resolveTtsModelForUser,
  resolveVoiceVariantForCompanion,
  resolveLearningLanguage,
};
