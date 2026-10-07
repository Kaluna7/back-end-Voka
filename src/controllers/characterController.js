const mongoose = require('mongoose');
const { Character, sanitizeCharacter, VISIBILITIES } = require('../models/Character');
const { User, buildOwnerId } = require('../models/User');
const { normalizeCharacterImageToWebp } = require('../utils/characterImage');

/**
 * Pastikan user ada dan kembalikan { user, ownerId } yang siap dipakai sebagai
 * pemilik query/mutation. ownerId diambil dari user (atau dihitung ulang jika kosong).
 */
const resolveUserContext = async userId => {
  if (!userId || !mongoose.isValidObjectId(userId)) {
    return { error: { status: 400, message: 'userId tidak valid.' } };
  }
  const user = await User.findById(userId);
  if (!user) {
    return { error: { status: 404, message: 'User tidak ditemukan.' } };
  }
  const ownerId =
    user.ownerId ||
    buildOwnerId({
      provider: user.provider,
      email: user.email,
      providerUid: user.providerUid,
    });
  if (user.ownerId !== ownerId && ownerId) {
    user.ownerId = ownerId;
    await user.save();
  }
  return { user, ownerId };
};

const sanitizeIncomingTags = tags => {
  if (!Array.isArray(tags)) {
    return [];
  }
  const cleaned = tags
    .map(value => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean)
    .slice(0, 20);
  return Array.from(new Set(cleaned));
};

const clampBondLevel = (value, fallback) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(1, Math.min(10, Math.round(numeric)));
};

/** System characters (Kael/Yuki/Yue Lian) live in the companion catalog, not this list. */
const userCreatedCharacterFilter = { isSystem: { $ne: true } };

/**
 * GET /api/users/:userId/characters
 * Query:
 *   visibility=public|private|all (default 'all')
 *   mine=1 to include only owned characters
 */
const listCharactersForUser = async (req, res) => {
  const { userId } = req.params;
  const { visibility = 'all', mine } = req.query || {};

  const ctx = await resolveUserContext(userId);
  if (ctx.error) {
    return res.status(ctx.error.status).json({ message: ctx.error.message });
  }
  const { user, ownerId } = ctx;

  const filters = [];
  if (mine === '1' || mine === 'true') {
    filters.push({ ownerId });
  } else {
    filters.push({ visibility: 'public' });
    if (ownerId) {
      filters.push({ ownerId, visibility: 'private' });
    }
  }

  if (visibility === 'public') {
    const filtered = filters.filter(f => f.visibility !== 'private');
    if (!filtered.length) {
      filtered.push({ visibility: 'public' });
    }
    const docs = await Character.find({ $or: filtered, ...userCreatedCharacterFilter })
      .sort({ updatedAt: -1 })
      .lean();
    return respondCharacters(res, docs, user);
  }
  if (visibility === 'private') {
    const docs = await Character.find({ ownerId, visibility: 'private', ...userCreatedCharacterFilter })
      .sort({ updatedAt: -1 })
      .lean();
    return respondCharacters(res, docs, user);
  }

  const docs = await Character.find({
    $or: filters,
    ...userCreatedCharacterFilter,
  })
    .sort({ updatedAt: -1 })
    .lean();
  return respondCharacters(res, docs, user);
};

const respondCharacters = (res, docs, user) => {
  const savedIds = Array.isArray(user.dashboard?.savedCharacterIds)
    ? user.dashboard.savedCharacterIds
    : [];
  const characters = docs.map(doc => sanitizeCharacter(doc, { savedCharacterIds: savedIds }));
  return res.status(200).json({
    message: 'Character list ditemukan.',
    characters,
  });
};

/** GET /api/users/:userId/characters/:characterId */
const getCharacter = async (req, res) => {
  const { userId, characterId } = req.params;
  const ctx = await resolveUserContext(userId);
  if (ctx.error) {
    return res.status(ctx.error.status).json({ message: ctx.error.message });
  }
  if (!mongoose.isValidObjectId(characterId)) {
    return res.status(400).json({ message: 'Character ID tidak valid.' });
  }
  const doc = await Character.findById(characterId).lean();
  if (!doc) {
    return res.status(404).json({ message: 'Character tidak ditemukan.' });
  }
  if (doc.visibility === 'private' && doc.ownerId !== ctx.ownerId && !doc.isSystem) {
    return res.status(403).json({ message: 'Character ini private.' });
  }
  return res.status(200).json({
    message: 'Character ditemukan.',
    character: sanitizeCharacter(doc, {
      savedCharacterIds: ctx.user.dashboard?.savedCharacterIds || [],
    }),
  });
};

/** POST /api/users/:userId/characters */
const createCharacter = async (req, res) => {
  const { userId } = req.params;
  const ctx = await resolveUserContext(userId);
  if (ctx.error) {
    return res.status(ctx.error.status).json({ message: ctx.error.message });
  }
  const { user, ownerId } = ctx;
  const {
    name,
    description = '',
    bondProfileStory = '',
    image = '',
    tags = [],
    visibility = 'private',
    bondIncreaseLevel = 5,
    bondDecreaseLevel = 5,
    iconName = 'account-star-outline',
    systemPrompt = '',
  } = req.body || {};

  if (!ownerId) {
    return res.status(400).json({ message: 'OwnerId tidak tersedia untuk user ini.' });
  }
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ message: 'Nama character wajib diisi.' });
  }
  if (!VISIBILITIES.includes(visibility)) {
    return res.status(400).json({ message: 'Visibility tidak valid.' });
  }

  let normalizedImage = '';
  try {
    normalizedImage = await normalizeCharacterImageToWebp(image);
  } catch (error) {
    console.error('character image webp conversion failed:', error);
    return res.status(400).json({ message: 'Gambar character tidak valid atau gagal dikonversi.' });
  }

  const doc = await Character.create({
    ownerId,
    name: name.trim(),
    description: typeof description === 'string' ? description.trim() : '',
    bondProfileStory: typeof bondProfileStory === 'string' ? bondProfileStory.trim() : '',
    image: normalizedImage,
    tags: sanitizeIncomingTags(tags),
    visibility,
    isSystem: false,
    systemPrompt: typeof systemPrompt === 'string' ? systemPrompt.trim() : '',
    bondIncreaseLevel: clampBondLevel(bondIncreaseLevel, 5),
    bondDecreaseLevel: clampBondLevel(bondDecreaseLevel, 5),
    iconName: typeof iconName === 'string' && iconName.trim() ? iconName.trim() : 'account-star-outline',
  });

  // Auto-save ke daftar character user (mirip behavior lokal saat ini).
  const characterId = String(doc._id);
  user.dashboard = user.dashboard || {};
  const savedIds = Array.isArray(user.dashboard.savedCharacterIds)
    ? user.dashboard.savedCharacterIds.slice()
    : [];
  if (!savedIds.includes(characterId)) {
    savedIds.push(characterId);
    user.dashboard.savedCharacterIds = savedIds;
    await user.save();
  }

  return res.status(201).json({
    message: 'Character berhasil dibuat.',
    character: sanitizeCharacter(doc, { savedCharacterIds: savedIds }),
  });
};

/** PATCH /api/users/:userId/characters/:characterId */
const updateCharacter = async (req, res) => {
  const { userId, characterId } = req.params;
  const ctx = await resolveUserContext(userId);
  if (ctx.error) {
    return res.status(ctx.error.status).json({ message: ctx.error.message });
  }
  if (!mongoose.isValidObjectId(characterId)) {
    return res.status(400).json({ message: 'Character ID tidak valid.' });
  }
  const doc = await Character.findById(characterId);
  if (!doc) {
    return res.status(404).json({ message: 'Character tidak ditemukan.' });
  }
  if (doc.isSystem) {
    return res.status(403).json({ message: 'Character bawaan tidak bisa diubah.' });
  }
  if (doc.ownerId !== ctx.ownerId) {
    return res.status(403).json({ message: 'Hanya owner yang bisa mengubah character.' });
  }

  const updatable = ['name', 'description', 'bondProfileStory', 'systemPrompt', 'iconName'];
  updatable.forEach(field => {
    if (typeof req.body?.[field] === 'string') {
      doc[field] = req.body[field].trim();
    }
  });
  if (typeof req.body?.image === 'string') {
    try {
      doc.image = await normalizeCharacterImageToWebp(req.body.image);
    } catch (error) {
      console.error('character image webp conversion failed:', error);
      return res.status(400).json({ message: 'Gambar character tidak valid atau gagal dikonversi.' });
    }
  }
  if (req.body?.tags !== undefined) {
    doc.tags = sanitizeIncomingTags(req.body.tags);
  }
  if (typeof req.body?.visibility === 'string' && VISIBILITIES.includes(req.body.visibility)) {
    doc.visibility = req.body.visibility;
  }
  if (req.body?.bondIncreaseLevel !== undefined) {
    doc.bondIncreaseLevel = clampBondLevel(req.body.bondIncreaseLevel, doc.bondIncreaseLevel);
  }
  if (req.body?.bondDecreaseLevel !== undefined) {
    doc.bondDecreaseLevel = clampBondLevel(req.body.bondDecreaseLevel, doc.bondDecreaseLevel);
  }

  await doc.save();
  return res.status(200).json({
    message: 'Character berhasil diperbarui.',
    character: sanitizeCharacter(doc.toObject(), {
      savedCharacterIds: ctx.user.dashboard?.savedCharacterIds || [],
    }),
  });
};

/** DELETE /api/users/:userId/characters/:characterId */
const deleteCharacter = async (req, res) => {
  const { userId, characterId } = req.params;
  const ctx = await resolveUserContext(userId);
  if (ctx.error) {
    return res.status(ctx.error.status).json({ message: ctx.error.message });
  }
  if (!mongoose.isValidObjectId(characterId)) {
    return res.status(400).json({ message: 'Character ID tidak valid.' });
  }
  const doc = await Character.findById(characterId);
  if (!doc) {
    return res.status(404).json({ message: 'Character tidak ditemukan.' });
  }
  if (doc.isSystem) {
    return res.status(403).json({ message: 'Character bawaan tidak bisa dihapus.' });
  }
  if (doc.ownerId !== ctx.ownerId) {
    return res.status(403).json({ message: 'Hanya owner yang bisa menghapus character.' });
  }
  await Character.deleteOne({ _id: doc._id });

  // bersihkan dari savedCharacterIds milik user (kalau ada).
  if (Array.isArray(ctx.user.dashboard?.savedCharacterIds)) {
    const id = String(doc._id);
    const next = ctx.user.dashboard.savedCharacterIds.filter(item => item !== id);
    if (next.length !== ctx.user.dashboard.savedCharacterIds.length) {
      ctx.user.dashboard.savedCharacterIds = next;
      await ctx.user.save();
    }
  }

  return res.status(200).json({ message: 'Character berhasil dihapus.' });
};

/** POST /api/users/:userId/characters/:characterId/save */
const saveCharacter = async (req, res) => {
  const { userId, characterId } = req.params;
  const ctx = await resolveUserContext(userId);
  if (ctx.error) {
    return res.status(ctx.error.status).json({ message: ctx.error.message });
  }
  if (!mongoose.isValidObjectId(characterId)) {
    return res.status(400).json({ message: 'Character ID tidak valid.' });
  }
  const doc = await Character.findById(characterId).lean();
  if (!doc) {
    return res.status(404).json({ message: 'Character tidak ditemukan.' });
  }
  if (doc.visibility === 'private' && doc.ownerId !== ctx.ownerId && !doc.isSystem) {
    return res.status(403).json({ message: 'Character private milik orang lain.' });
  }
  ctx.user.dashboard = ctx.user.dashboard || {};
  const ids = Array.isArray(ctx.user.dashboard.savedCharacterIds)
    ? ctx.user.dashboard.savedCharacterIds.slice()
    : [];
  if (!ids.includes(characterId)) {
    ids.push(characterId);
    ctx.user.dashboard.savedCharacterIds = ids;
    await ctx.user.save();
  }
  return res.status(200).json({
    message: 'Character disimpan.',
    savedCharacterIds: ids,
  });
};

/** DELETE /api/users/:userId/characters/:characterId/save */
const unsaveCharacter = async (req, res) => {
  const { userId, characterId } = req.params;
  const ctx = await resolveUserContext(userId);
  if (ctx.error) {
    return res.status(ctx.error.status).json({ message: ctx.error.message });
  }
  if (!mongoose.isValidObjectId(characterId)) {
    return res.status(400).json({ message: 'Character ID tidak valid.' });
  }
  ctx.user.dashboard = ctx.user.dashboard || {};
  const ids = Array.isArray(ctx.user.dashboard.savedCharacterIds)
    ? ctx.user.dashboard.savedCharacterIds.filter(id => id !== characterId)
    : [];
  ctx.user.dashboard.savedCharacterIds = ids;
  await ctx.user.save();
  return res.status(200).json({
    message: 'Character dihapus dari daftar.',
    savedCharacterIds: ids,
  });
};

/** GET /api/users/:userId/characters/saved */
const listSavedCharacters = async (req, res) => {
  const { userId } = req.params;
  const ctx = await resolveUserContext(userId);
  if (ctx.error) {
    return res.status(ctx.error.status).json({ message: ctx.error.message });
  }
  const ids = Array.isArray(ctx.user.dashboard?.savedCharacterIds)
    ? ctx.user.dashboard.savedCharacterIds.filter(id => mongoose.isValidObjectId(id))
    : [];
  if (!ids.length) {
    return res.status(200).json({ message: 'Saved characters.', characters: [] });
  }
  const docs = await Character.find({ _id: { $in: ids } }).lean();
  // filter access (jika ada yang private milik orang lain — secara teori tidak akan tersimpan)
  const allowed = docs.filter(
    doc => doc.visibility !== 'private' || doc.ownerId === ctx.ownerId || doc.isSystem,
  );
  const characters = allowed.map(doc =>
    sanitizeCharacter(doc, {
      savedCharacterIds: ids,
    }),
  );
  return res.status(200).json({
    message: 'Saved characters.',
    characters,
  });
};

module.exports = {
  listCharactersForUser,
  getCharacter,
  createCharacter,
  updateCharacter,
  deleteCharacter,
  saveCharacter,
  unsaveCharacter,
  listSavedCharacters,
};
