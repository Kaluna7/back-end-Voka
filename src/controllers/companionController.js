const { listCompanionCatalog } = require('../services/companionCatalogService');
const { normalizeLearningLanguage } = require('../config/learningLanguage');

const listCompanions = async (req, res) => {
  try {
    const type = typeof req.query?.type === 'string' ? req.query.type.trim() : '';
    const headerLang =
      typeof req.headers?.['x-app-language'] === 'string' ? req.headers['x-app-language'] : '';
    const languageRaw =
      typeof req.query?.language === 'string'
        ? req.query.language
        : typeof req.query?.appLanguage === 'string'
          ? req.query.appLanguage
          : headerLang || 'English';
    const language = normalizeLearningLanguage(languageRaw);
    const companions = await listCompanionCatalog({
      type: type === 'teacher' || type === 'character' ? type : undefined,
      language,
    });
    return res.status(200).json({
      ok: true,
      language,
      companions,
    });
  } catch (error) {
    console.error('[companions] list failed', error?.message || error);
    return res.status(500).json({ message: 'Gagal memuat katalog companion.' });
  }
};

module.exports = {
  listCompanions,
};
