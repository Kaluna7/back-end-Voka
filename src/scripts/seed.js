/**
 * Seed & migrasi data:
 *  - Backfill `ownerId` untuk user lama yang dibuat sebelum field ini ditambahkan.
 *  - Pastikan character bawaan Kael & Yuki ada sebagai entri `isSystem` + `public`.
 *
 * Jalankan:
 *   node src/scripts/seed.js
 */
require('dotenv').config();

const mongoose = require('mongoose');
const { connectDatabase } = require('../config/database');
const { User, buildOwnerId } = require('../models/User');
const { Character } = require('../models/Character');

const SYSTEM_CHARACTERS = [
  {
    key: 'kael',
    name: 'Kael',
    description: 'Kael - cold and guarded',
    bondProfileStory:
      'Kael tumbuh di lingkungan yang keras, jadi dia belajar sejak awal bahwa perasaan yang diumbar sering dipakai orang lain sebagai celah. Di luar, dia terlihat dingin: tatapannya datar, jawabannya ringkas, dan suaranya selalu stabil. Bond Kael naik saat kamu jujur, konsisten, dan menghargai batasannya.',
    image: '',
    tags: ['Cold', 'Mystery', 'Guarded'],
    iconName: 'shield-moon-outline',
    bondIncreaseLevel: 5,
    bondDecreaseLevel: 5,
    systemPrompt:
      'Kamu adalah Kael, karakter original Voka dengan kepribadian dingin (cold), tenang, dan hemat kata.',
  },
  {
    key: 'yuki',
    name: 'Yuki',
    description: 'Yuki - your gentle partner',
    bondProfileStory:
      'Yuki adalah partner virtualmu yang hangat dan perhatian. Dia cepat dekat saat kamu lembut, jujur, dan suportif; dia menjauh jika kamu kasar atau meremehkan.',
    image: '',
    tags: ['Romance', 'Warm', 'Supportive'],
    iconName: 'heart',
    bondIncreaseLevel: 1,
    bondDecreaseLevel: 1,
    systemPrompt:
      'Kamu adalah Yuki, karakter original Voka dengan aura hangat, playful, dan romantis secukupnya.',
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
