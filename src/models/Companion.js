const mongoose = require('mongoose');
const { pickCompanionLocaleFields } = require('../utils/companionLocaleUtils');

const pronunciationSchema = new mongoose.Schema(
  {
    word: { type: String, required: true, trim: true },
    pronounce: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const companionSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, trim: true, index: true },
    type: { type: String, enum: ['teacher', 'character'], required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    nativeName: { type: String, default: '', trim: true, maxlength: 40 },
    description: { type: String, default: '', maxlength: 600 },
    bondProfileStory: { type: String, default: '', maxlength: 8000 },
    introMessage: { type: String, default: '', maxlength: 8000 },
    systemPrompt: { type: String, default: '', maxlength: 16000 },
    locales: { type: mongoose.Schema.Types.Mixed, default: {} },
    image: { type: String, default: '' },
    iconName: { type: String, default: 'account-star-outline' },
    teacherCategories: { type: [String], default: [] },
    voiceVariant: {
      type: String,
      enum: ['masculine', 'feminine', 'interviewer', ''],
      default: '',
    },
    voiceSpeed: { type: Number, default: 1, min: 0.5, max: 1.5 },
    pronunciations: { type: [pronunciationSchema], default: [] },
    bondIncreaseLevel: { type: Number, default: 5, min: 1, max: 10 },
    bondDecreaseLevel: { type: Number, default: 5, min: 1, max: 10 },
    bondDefault: { type: Number, default: 2, min: 0, max: 5 },
    bondLockSensitivity: { type: Boolean, default: false },
    i18nAbilityKey: { type: String, default: '' },
    i18nSpecializationKey: { type: String, default: '' },
    isSystem: { type: Boolean, default: true, index: true },
    active: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

/** Public catalog shape — no systemPrompt. Language picks localized UI fields from locales. */
const sanitizeCompanionCatalog = (doc, language = 'English') => {
  const localized = pickCompanionLocaleFields(doc, language);
  return {
    id: doc.slug,
    slug: doc.slug,
    type: doc.type,
    name: doc.name,
    nativeName: doc.nativeName || '',
    description: localized.description || doc.description || '',
    bondProfileStory: localized.bondProfileStory || doc.bondProfileStory || '',
    introMessage: localized.introMessage || doc.introMessage || '',
    image: doc.image || '',
    iconName: doc.iconName || 'account-star-outline',
    teacherCategories: Array.isArray(doc.teacherCategories) ? doc.teacherCategories : [],
    voiceVariant: doc.voiceVariant || '',
    voiceSpeed: Number.isFinite(doc.voiceSpeed) ? doc.voiceSpeed : 1,
    pronunciations: Array.isArray(doc.pronunciations) ? doc.pronunciations : [],
    bondIncreaseLevel: Number.isFinite(doc.bondIncreaseLevel) ? doc.bondIncreaseLevel : 5,
    bondDecreaseLevel: Number.isFinite(doc.bondDecreaseLevel) ? doc.bondDecreaseLevel : 5,
    bondDefault: Number.isFinite(doc.bondDefault) ? doc.bondDefault : 2,
    bondLockSensitivity: Boolean(doc.bondLockSensitivity),
    i18nAbilityKey: doc.i18nAbilityKey || '',
    i18nSpecializationKey: doc.i18nSpecializationKey || '',
    isSystem: Boolean(doc.isSystem),
    sortOrder: Number.isFinite(doc.sortOrder) ? doc.sortOrder : 0,
    locale: localized.language,
  };
};

const Companion = mongoose.models.Companion || mongoose.model('Companion', companionSchema);

module.exports = {
  Companion,
  sanitizeCompanionCatalog,
};
