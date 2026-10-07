const {
  featuredLanguages,
  normalizeLearningLanguage,
} = require('../config/learningLanguage');

/** Languages stored on companion.locales (learning + app UI overlap). */
const COMPANION_LOCALE_LANGUAGES = [...featuredLanguages];

const learningLanguageDirective = language => {
  const lang = normalizeLearningLanguage(language);
  return `CRITICAL — Learning language lock:
The user is learning ${lang}. In EVERY reply you MUST speak and write only in ${lang}.
Do not use any other language unless the user explicitly asks for a translation.
If any other instruction conflicts with this language rule, follow this language rule.`;
};

const buildLocalizedSystemPrompt = (basePrompt, language) => {
  const base = String(basePrompt || '').trim();
  const directive = learningLanguageDirective(language);
  if (!base) {
    return directive;
  }
  if (base.includes('Learning language lock')) {
    return base;
  }
  return `${base}\n\n${directive}`;
};

const readLocaleBucket = (locales, language) => {
  if (!locales || typeof locales !== 'object') {
    return null;
  }
  const lang = normalizeLearningLanguage(language);
  if (locales instanceof Map) {
    return locales.get(lang) || locales.get('English') || null;
  }
  return locales[lang] || locales.English || null;
};

/**
 * Resolve UI + prompt fields for a language. Falls back to English locale, then top-level fields.
 */
const pickCompanionLocaleFields = (doc, language) => {
  const lang = normalizeLearningLanguage(language || 'English');
  const bucket = readLocaleBucket(doc?.locales, lang) || {};
  const english = readLocaleBucket(doc?.locales, 'English') || {};

  const pick = key => {
    const fromBucket = typeof bucket[key] === 'string' ? bucket[key].trim() : '';
    if (fromBucket) {
      return fromBucket;
    }
    const fromEnglish = typeof english[key] === 'string' ? english[key].trim() : '';
    if (fromEnglish) {
      return fromEnglish;
    }
    const fromTop = typeof doc?.[key] === 'string' ? doc[key].trim() : '';
    return fromTop;
  };

  return {
    description: pick('description'),
    bondProfileStory: pick('bondProfileStory'),
    introMessage: pick('introMessage'),
    systemPrompt: pick('systemPrompt'),
    language: lang,
  };
};

/**
 * Build a full locales map for seeding. `translatedByLanguage` may override UI fields per lang.
 * Every language always gets a systemPrompt with learning-language lock.
 */
const buildCompanionLocalesMap = ({
  description = '',
  bondProfileStory = '',
  introMessage = '',
  systemPrompt = '',
  translatedByLanguage = null,
} = {}) => {
  const basePrompt = String(systemPrompt || '').trim();
  const locales = {};

  COMPANION_LOCALE_LANGUAGES.forEach(lang => {
    const override =
      translatedByLanguage && typeof translatedByLanguage === 'object'
        ? translatedByLanguage[lang] || null
        : null;
    const isEnglish = lang === 'English';
    locales[lang] = {
      description: String(override?.description || (isEnglish ? description : '') || description || '').trim(),
      bondProfileStory: String(
        override?.bondProfileStory || (isEnglish ? bondProfileStory : '') || bondProfileStory || '',
      ).trim(),
      introMessage: String(
        override?.introMessage || (isEnglish ? introMessage : '') || introMessage || '',
      ).trim(),
      systemPrompt: buildLocalizedSystemPrompt(
        String(override?.systemPrompt || basePrompt).trim(),
        lang,
      ),
    };
  });

  return locales;
};

module.exports = {
  COMPANION_LOCALE_LANGUAGES,
  learningLanguageDirective,
  buildLocalizedSystemPrompt,
  pickCompanionLocaleFields,
  buildCompanionLocalesMap,
  normalizeLearningLanguage,
};
