/**
 * Seed katalog guru & karakter sistem ke MongoDB (companions collection).
 * Menyimpan locales (description/bio/intro/systemPrompt) untuk semua learning language.
 * Jalankan: node src/scripts/seedCompanions.js
 *
 * Optional: COMPANION_LOCALES_JSON=path to override UI translations
 * Generate: node src/scripts/generateCompanionLocales.js
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { connectDatabase } = require('../config/database');
const { Companion } = require('../models/Companion');
const { COMPANION_SEED_ENTRIES } = require('../data/companionSeedData');
const { invalidateCompanionCache } = require('../services/companionCatalogService');
const { buildCompanionLocalesMap } = require('../utils/companionLocaleUtils');

const DEFAULT_LOCALES_PATH = path.join(__dirname, '../data/companionLocales.json');

const loadTranslatedLocales = () => {
  const custom = process.env.COMPANION_LOCALES_JSON;
  const filePath = custom && custom.trim() ? custom.trim() : DEFAULT_LOCALES_PATH;
  if (!fs.existsSync(filePath)) {
    console.warn(`[seedCompanions] no locales file at ${filePath}`);
    return {};
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const keys = parsed && typeof parsed === 'object' ? Object.keys(parsed) : [];
    console.log(`[seedCompanions] loaded locales for ${keys.length} slug(s) from ${filePath}`);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    console.warn('[seedCompanions] failed to read companionLocales.json:', error.message);
    return {};
  }
};

const seedCompanions = async () => {
  const translatedRoot = loadTranslatedLocales();
  let upserted = 0;
  for (const entry of COMPANION_SEED_ENTRIES) {
    const systemPrompt =
      typeof entry.resolvePrompt === 'function'
        ? entry.resolvePrompt()
        : String(entry.systemPrompt || '').trim();

    const translatedByLanguage =
      translatedRoot[entry.slug] && typeof translatedRoot[entry.slug] === 'object'
        ? translatedRoot[entry.slug]
        : null;

    if (entry.type === 'character') {
      const localeCount = translatedByLanguage ? Object.keys(translatedByLanguage).length : 0;
      console.log(
        `[seedCompanions] ${entry.slug}: ${localeCount} translated locale(s)${
          translatedByLanguage?.Indonesian?.description
            ? ` · ID="${String(translatedByLanguage.Indonesian.description).slice(0, 40)}"`
            : ''
        }`,
      );
    }

    const locales = buildCompanionLocalesMap({
      description: entry.description || '',
      bondProfileStory: entry.bondProfileStory || '',
      introMessage: entry.introMessage || '',
      systemPrompt,
      translatedByLanguage,
    });

    // Character profile stories + opening chat intros: always prefer the long
    // English source-of-truth so stale companionLocales.json cannot keep short copy.
    if (entry.type === 'character') {
      if (entry.bondProfileStory) {
        const story = String(entry.bondProfileStory).trim();
        Object.keys(locales).forEach(lang => {
          locales[lang].bondProfileStory = story;
        });
      }
      if (entry.introMessage) {
        const intro = String(entry.introMessage).trim();
        Object.keys(locales).forEach(lang => {
          locales[lang].introMessage = intro;
        });
      }
    }

    const english = locales.English || {};
    const update = {
      slug: entry.slug,
      type: entry.type,
      name: entry.name,
      nativeName: entry.nativeName || '',
      description: english.description || entry.description || '',
      bondProfileStory: english.bondProfileStory || entry.bondProfileStory || '',
      introMessage: entry.introMessage || english.introMessage || '',
      systemPrompt: english.systemPrompt || systemPrompt,
      locales,
      image: entry.image || '',
      iconName: entry.iconName || 'account-star-outline',
      teacherCategories: Array.isArray(entry.teacherCategories) ? entry.teacherCategories : [],
      voiceVariant: entry.voiceVariant || '',
      voiceSpeed: Number.isFinite(entry.voiceSpeed) ? entry.voiceSpeed : 1,
      pronunciations: Array.isArray(entry.pronunciations) ? entry.pronunciations : [],
      bondIncreaseLevel: Number.isFinite(entry.bondIncreaseLevel) ? entry.bondIncreaseLevel : 5,
      bondDecreaseLevel: Number.isFinite(entry.bondDecreaseLevel) ? entry.bondDecreaseLevel : 5,
      bondDefault: Number.isFinite(entry.bondDefault) ? entry.bondDefault : 2,
      bondLockSensitivity: Boolean(entry.bondLockSensitivity),
      i18nAbilityKey: entry.i18nAbilityKey || '',
      i18nSpecializationKey: entry.i18nSpecializationKey || '',
      isSystem: true,
      active: true,
      sortOrder: Number.isFinite(entry.sortOrder) ? entry.sortOrder : 0,
    };
    await Companion.updateOne({ slug: entry.slug }, { $set: update }, { upsert: true });
    upserted += 1;
  }
  invalidateCompanionCache();
  return upserted;
};

const main = async () => {
  await connectDatabase();
  const count = await seedCompanions();
  console.log(`Seeded/updated ${count} companion(s) in MongoDB (with locales)`);
  await mongoose.connection.close();
};

main().catch(error => {
  console.error('seedCompanions failed:', error);
  process.exitCode = 1;
});
