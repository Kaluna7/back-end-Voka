const { Companion, sanitizeCompanionCatalog } = require('../models/Companion');
const { getTeacherSystemPrompt, isTeacherCompanionId } = require('../constants/teacherPrompts');
const { getCompanionProfile: getLegacyCompanionProfile } = require('../constants/companions');
const {
  pickCompanionLocaleFields,
  normalizeLearningLanguage,
} = require('../utils/companionLocaleUtils');

let docsCache = [];
/** @type {Map<string, Map<string, string>>} slug -> language -> prompt */
let promptBySlugLang = new Map();
let cacheLoadedAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

const promptCacheKey = (slug, language) =>
  `${slug}::${normalizeLearningLanguage(language || 'English')}`;

const buildLegacyPromptFallback = slug => {
  if (isTeacherCompanionId(slug)) {
    return getTeacherSystemPrompt(slug);
  }
  const legacy = getLegacyCompanionProfile(slug);
  return typeof legacy?.prompt === 'string' ? legacy.prompt.trim() : '';
};

const hydratePromptMap = docs => {
  const next = new Map();
  docs.forEach(doc => {
    const perLang = new Map();
    const locales =
      doc.locales && typeof doc.locales === 'object' && !(doc.locales instanceof Map)
        ? doc.locales
        : doc.locales instanceof Map
          ? Object.fromEntries(doc.locales)
          : {};

    Object.keys(locales).forEach(lang => {
      const prompt = typeof locales[lang]?.systemPrompt === 'string' ? locales[lang].systemPrompt.trim() : '';
      if (prompt) {
        perLang.set(normalizeLearningLanguage(lang), prompt);
      }
    });

    const topPrompt = typeof doc.systemPrompt === 'string' ? doc.systemPrompt.trim() : '';
    if (topPrompt && !perLang.has('English')) {
      perLang.set('English', topPrompt);
    }

    if (perLang.size > 0) {
      next.set(doc.slug, perLang);
    }
  });
  promptBySlugLang = next;
};

const loadCompanionCache = async ({ force = false } = {}) => {
  const stale = !cacheLoadedAt || Date.now() - cacheLoadedAt > CACHE_TTL_MS;
  if (!force && docsCache.length > 0 && !stale) {
    return docsCache;
  }
  const docs = await Companion.find({ active: true }).sort({ sortOrder: 1, name: 1 }).lean();
  if (!docs.length) {
    docsCache = [];
    promptBySlugLang = new Map();
    cacheLoadedAt = Date.now();
    return docsCache;
  }
  docsCache = docs;
  hydratePromptMap(docs);
  cacheLoadedAt = Date.now();
  return docsCache;
};

const listCompanionCatalog = async ({ type, language } = {}) => {
  const docs = await loadCompanionCache();
  const lang = normalizeLearningLanguage(language || 'English');
  let rows = docs.map(doc => sanitizeCompanionCatalog(doc, lang));
  if (type) {
    rows = rows.filter(item => item.type === type);
  }
  return rows;
};

const resolvePromptFromCache = (slug, language) => {
  const lang = normalizeLearningLanguage(language || 'English');
  const perLang = promptBySlugLang.get(slug);
  if (!perLang) {
    return '';
  }
  return perLang.get(lang) || perLang.get('English') || '';
};

const getCompanionPrompt = async (slug, language = 'English') => {
  if (!slug) {
    return '';
  }
  await loadCompanionCache();
  const cached = resolvePromptFromCache(slug, language);
  if (cached) {
    return cached;
  }
  const doc = await Companion.findOne({ slug, active: true })
    .select('systemPrompt locales slug')
    .lean();
  if (doc) {
    const picked = pickCompanionLocaleFields(doc, language).systemPrompt;
    if (picked) {
      const lang = normalizeLearningLanguage(language);
      if (!promptBySlugLang.has(slug)) {
        promptBySlugLang.set(slug, new Map());
      }
      promptBySlugLang.get(slug).set(lang, picked);
      return picked;
    }
  }
  return buildLegacyPromptFallback(slug);
};

const getCompanionProfile = async (slug, language = 'English') => {
  if (!slug) {
    return null;
  }
  await loadCompanionCache();
  const doc = docsCache.find(item => item.slug === slug);
  const prompt = (await getCompanionPrompt(slug, language)) || '';
  if (!doc && !prompt) {
    return getLegacyCompanionProfile(slug);
  }
  const localized = doc ? pickCompanionLocaleFields(doc, language) : {};
  return {
    id: slug,
    slug,
    name: doc?.name || slug,
    type: doc?.type || (isTeacherCompanionId(slug) ? 'teacher' : 'character'),
    description: localized.description || doc?.description || '',
    prompt,
  };
};

const getCompanionPromptSync = (slug, language = 'English') => {
  if (!slug) {
    return '';
  }
  const cached = resolvePromptFromCache(slug, language);
  if (cached) {
    return cached;
  }
  return buildLegacyPromptFallback(slug);
};

const getCompanionProfileSync = (slug, language = 'English') => {
  if (!slug) {
    return null;
  }
  const doc = docsCache.find(item => item.slug === slug);
  const prompt = getCompanionPromptSync(slug, language);
  if (!doc && !prompt) {
    return getLegacyCompanionProfile(slug);
  }
  const localized = doc ? pickCompanionLocaleFields(doc, language) : {};
  return {
    id: slug,
    slug,
    name: doc?.name || slug,
    type: doc?.type || (isTeacherCompanionId(slug) ? 'teacher' : 'character'),
    description: localized.description || doc?.description || '',
    prompt,
  };
};

/** Raw catalog document (lean) for server-side generation — includes introMessage + locales. */
const getCompanionDocSync = slug => (slug ? docsCache.find(item => item.slug === slug) || null : null);

const invalidateCompanionCache = () => {
  docsCache = [];
  promptBySlugLang = new Map();
  cacheLoadedAt = 0;
};

module.exports = {
  loadCompanionCache,
  listCompanionCatalog,
  getCompanionPrompt,
  getCompanionPromptSync,
  getCompanionProfile,
  getCompanionProfileSync,
  getCompanionDocSync,
  invalidateCompanionCache,
  isTeacherCompanionId,
  promptCacheKey,
};
