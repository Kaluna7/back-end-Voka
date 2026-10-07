/**
 * Seed & migrasi data:
 *  - Backfill `ownerId` untuk user lama yang dibuat sebelum field ini ditambahkan.
 *  - Pastikan character bawaan Kael, Yuki, Yue Lian & Shen Yichen ada sebagai entri `isSystem` + `public`.
 *
 * Jalankan:
 *   node src/scripts/seed.js
 */
require('dotenv').config();

const mongoose = require('mongoose');
const { connectDatabase } = require('../config/database');
const { User, buildOwnerId } = require('../models/User');
const { Character } = require('../models/Character');

const {
  KAEL_BOND_PROFILE_STORY,
  YUKI_BOND_PROFILE_STORY,
  YUE_LIAN_BOND_PROFILE_STORY,
  SHEN_YICHEN_BOND_PROFILE_STORY,
} = require('../data/characterProfileStories');

const SYSTEM_CHARACTERS = [
  {
    key: 'kael',
    name: 'Kael',
    description: 'Cold exterior, quiet loyalty within',
    bondProfileStory: KAEL_BOND_PROFILE_STORY,
    image: '/static/characters/kael.webp',
    tags: ['Cold', 'Mystery', 'Guarded'],
    iconName: 'shield-moon-outline',
    bondIncreaseLevel: 8,
    bondDecreaseLevel: 3,
    systemPrompt:
      'You are Kael, an original Moocha character with a cold, calm, and reserved personality.',
  },
  {
    key: 'yuki',
    name: 'Yuki',
    description: 'Your warm, gentle partner',
    bondProfileStory: YUKI_BOND_PROFILE_STORY,
    image: '/static/characters/yuki.webp',
    tags: ['Romance', 'Warm', 'Supportive'],
    iconName: 'heart',
    bondIncreaseLevel: 1,
    bondDecreaseLevel: 8,
    systemPrompt:
      'You are Yuki, an original Moocha character with a warm, playful, and gently romantic personality.',
  },
  {
    key: 'yue_lian',
    name: 'Yue Lian',
    description: 'Calm, elegant, and deeply empathetic',
    bondProfileStory: YUE_LIAN_BOND_PROFILE_STORY,
    image: '/static/characters/yue_lian.webp',
    tags: ['Elegant', 'Empathetic', 'Warm'],
    iconName: 'flower-tulip-outline',
    bondIncreaseLevel: 2,
    bondDecreaseLevel: 6,
    systemPrompt:
      'You are Yue Lian, a 23-year-old Chinese woman with a calm, elegant, and intelligent personality.',
  },
  {
    key: 'shen_yichen',
    name: 'Shen Yichen',
    description: 'Quiet confidence and gentle strength',
    bondProfileStory: SHEN_YICHEN_BOND_PROFILE_STORY,
    image: '/static/characters/shen_yichen.webp',
    tags: ['Calm', 'Dependable', 'Warm'],
    iconName: 'star-shooting-outline',
    bondIncreaseLevel: 4,
    bondDecreaseLevel: 7,
    systemPrompt:
      'You are Shen Yichen, a calm, intelligent, emotionally mature, and dependable 25-year-old Chinese man.',
  },
];

const backfillUsers = async () => {
  const cursor = User.find({
    $or: [{ ownerId: { $exists: false } }, { ownerId: null }, { ownerId: '' }],
  }).cursor();
  let updated = 0;
  for (let user = await cursor.next(); user; user = await cursor.next()) {
    const ownerId = buildOwnerId({
      provider: user.provider,
      email: user.email,
      providerUid: user.providerUid,
    });
    if (!ownerId) {
      continue;
    }
    user.ownerId = ownerId;
    await user.save();
    updated += 1;
  }
  return updated;
};

const seedSystemCharacters = async () => {
  let createdOrUpdated = 0;
  for (const item of SYSTEM_CHARACTERS) {
    const filter = { isSystem: true, name: item.name };
    const update = {
      ownerId: null,
      name: item.name,
      description: item.description,
      bondProfileStory: item.bondProfileStory,
      image: item.image,
      tags: item.tags,
      visibility: 'public',
      isSystem: true,
      systemPrompt: item.systemPrompt,
      bondIncreaseLevel: item.bondIncreaseLevel,
      bondDecreaseLevel: item.bondDecreaseLevel,
      iconName: item.iconName,
    };
    await Character.updateOne(filter, { $set: update }, { upsert: true });
    createdOrUpdated += 1;
  }
  return createdOrUpdated;
};

const main = async () => {
  await connectDatabase();
  console.log('Connected to MongoDB');
  const usersUpdated = await backfillUsers();
  console.log(`Backfilled ownerId on ${usersUpdated} user(s)`);
  const charsUpdated = await seedSystemCharacters();
  console.log(`Seeded/updated ${charsUpdated} system character(s)`);
  await mongoose.connection.close();
  console.log('Done');
};

main().catch(error => {
  console.error('Seed failed:', error);
  process.exitCode = 1;
});
