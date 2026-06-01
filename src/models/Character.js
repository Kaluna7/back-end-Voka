const mongoose = require('mongoose');

const VISIBILITIES = ['public', 'private'];

const characterSchema = new mongoose.Schema(
  {
    /**
     * `ownerId` mengikuti aturan owner di User model:
     *   provider 'google' -> Google OAuth `sub`
     *   provider 'email'  -> `email:<email-lowercase>`
     * `null` hanya boleh untuk character `isSystem` (mis. Kael/Yuki seed).
     */
    ownerId: { type: String, default: null, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, default: '', maxlength: 600 },
    bondProfileStory: { type: String, default: '', maxlength: 4000 },
    /** URL gambar (HTTP/HTTPS) atau data URI hasil pick gallery. Frontend yang format. */
    image: { type: String, default: '' },
    tags: { type: [String], default: [] },
    visibility: { type: String, enum: VISIBILITIES, default: 'private', index: true },
    /** Karakter bawaan platform (Kael/Yuki); selalu publik dan tidak terhapus user. */
    isSystem: { type: Boolean, default: false, index: true },
    /** Optional system prompt; kalau kosong, frontend akan generate default. */
    systemPrompt: { type: String, default: '' },
    bondIncreaseLevel: { type: Number, default: 5, min: 1, max: 10 },
    bondDecreaseLevel: { type: Number, default: 5, min: 1, max: 10 },
    iconName: { type: String, default: 'account-star-outline' },
  },
  { timestamps: true },
);

characterSchema.index({ ownerId: 1, createdAt: -1 });
characterSchema.index({ visibility: 1, updatedAt: -1 });

const sanitizeCharacter = (doc, { savedCharacterIds = [] } = {}) => {
  const id = String(doc._id);
  return {
    id,
    ownerId: doc.ownerId || null,
    name: doc.name,
    description: doc.description || '',
    bondProfileStory: doc.bondProfileStory || '',
    image: doc.image || '',
    tags: Array.isArray(doc.tags) ? doc.tags : [],
    visibility: doc.visibility || 'private',
    isSystem: Boolean(doc.isSystem),
    systemPrompt: doc.systemPrompt || '',
    bondIncreaseLevel: Number.isFinite(doc.bondIncreaseLevel) ? doc.bondIncreaseLevel : 5,
    bondDecreaseLevel: Number.isFinite(doc.bondDecreaseLevel) ? doc.bondDecreaseLevel : 5,
    iconName: doc.iconName || 'account-star-outline',
    saved: Array.isArray(savedCharacterIds) ? savedCharacterIds.includes(id) : false,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
};

const Character = mongoose.model('Character', characterSchema);

module.exports = {
  Character,
  sanitizeCharacter,
  VISIBILITIES,
};
