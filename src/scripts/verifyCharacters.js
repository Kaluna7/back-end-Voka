/**
 * Quick e2e check (lokal): 2 user A/B
 *  - signup A & B (provider email)
 *  - A buat character private + public
 *  - cek B hanya melihat character public + system, bukan private milik A
 *  - save / unsave / list saved
 *
 * Jalankan:
 *   node src/scripts/verifyCharacters.js
 */
require('dotenv').config();

const mongoose = require('mongoose');
const { connectDatabase } = require('../config/database');
const { User, buildOwnerId } = require('../models/User');
const { Character } = require('../models/Character');
const characterCtl = require('../controllers/characterController');

const TEST_PREFIX = 'voka_e2e_';

const fakeRes = () => {
  const ctx = {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  return ctx;
};

const expect = (cond, msg) => {
  if (!cond) {
    throw new Error(`ASSERT FAILED: ${msg}`);
  }
  console.log(`  ok - ${msg}`);
};

const ensureUser = async ({ email, name }) => {
  let user = await User.findOne({ email });
  if (!user) {
    user = await User.create({
      name,
      email,
      password: 'pwd-temp',
      provider: 'email',
      ownerId: buildOwnerId({ provider: 'email', email }),
    });
  }
  return user;
};

const cleanup = async () => {
  await Character.deleteMany({ ownerId: { $regex: `^email:${TEST_PREFIX}` } });
  await User.deleteMany({ email: { $regex: `^${TEST_PREFIX}` } });
};

const main = async () => {
  await connectDatabase();
  console.log('Connected. Running scenario...');

  await cleanup();

  const userA = await ensureUser({ email: `${TEST_PREFIX}a@voka.test`, name: 'User A' });
  const userB = await ensureUser({ email: `${TEST_PREFIX}b@voka.test`, name: 'User B' });
  expect(userA.ownerId !== userB.ownerId, 'ownerId user A != user B');

  // A creates one private + one public character
  const resCreatePriv = fakeRes();
  await characterCtl.createCharacter(
    {
      params: { userId: String(userA._id) },
      body: {
        name: 'A Private',
        description: 'private char A',
        visibility: 'private',
      },
    },
    resCreatePriv,
  );
  expect(resCreatePriv.statusCode === 201, 'A creates private character');
  const aPrivateId = resCreatePriv.body.character.id;

  const resCreatePub = fakeRes();
  await characterCtl.createCharacter(
    {
      params: { userId: String(userA._id) },
      body: {
        name: 'A Public',
        description: 'public char A',
        visibility: 'public',
      },
    },
    resCreatePub,
  );
  expect(resCreatePub.statusCode === 201, 'A creates public character');
  const aPublicId = resCreatePub.body.character.id;

  // List for B must include A Public + system characters; never A Private
  const resListB = fakeRes();
  await characterCtl.listCharactersForUser(
    {
      params: { userId: String(userB._id) },
      query: {},
    },
    resListB,
  );
  expect(resListB.statusCode === 200, 'B can list characters');
  const bChars = resListB.body.characters;
  const ids = bChars.map(c => c.id);
  expect(ids.includes(aPublicId), 'B sees A public character');
  expect(!ids.includes(aPrivateId), 'B does NOT see A private character');
  const sysCount = bChars.filter(c => c.isSystem).length;
  expect(sysCount >= 2, 'system characters (Kael/Yuki) appear in list');

  // List for A must include both A's characters
  const resListA = fakeRes();
  await characterCtl.listCharactersForUser(
    { params: { userId: String(userA._id) }, query: {} },
    resListA,
  );
  const aIds = resListA.body.characters.map(c => c.id);
  expect(aIds.includes(aPrivateId), 'A sees own private');
  expect(aIds.includes(aPublicId), 'A sees own public');

  // B saves the public character
  const resSaveB = fakeRes();
  await characterCtl.saveCharacter(
    { params: { userId: String(userB._id), characterId: aPublicId } },
    resSaveB,
  );
  expect(resSaveB.statusCode === 200 && resSaveB.body.savedCharacterIds.includes(aPublicId), 'B saved A public');

  // B tries to save A's private -> should fail 403
  const resSaveBPriv = fakeRes();
  await characterCtl.saveCharacter(
    { params: { userId: String(userB._id), characterId: aPrivateId } },
    resSaveBPriv,
  );
  expect(resSaveBPriv.statusCode === 403, 'B cannot save A private (403)');

  // B lists saved -> only public from A
  const resSavedB = fakeRes();
  await characterCtl.listSavedCharacters(
    { params: { userId: String(userB._id) } },
    resSavedB,
  );
  expect(
    resSavedB.body.characters.length === 1 && resSavedB.body.characters[0].id === aPublicId,
    'B saved list contains exactly A public',
  );

  // B unsaves -> empty
  const resUnsave = fakeRes();
  await characterCtl.unsaveCharacter(
    { params: { userId: String(userB._id), characterId: aPublicId } },
    resUnsave,
  );
  expect(resUnsave.body.savedCharacterIds.length === 0, 'B unsaved successfully');

  // B tries to delete A's character -> 403
  const resDeleteFail = fakeRes();
  await characterCtl.deleteCharacter(
    { params: { userId: String(userB._id), characterId: aPublicId } },
    resDeleteFail,
  );
  expect(resDeleteFail.statusCode === 403, 'B cannot delete A character (403)');

  // A deletes own private -> 200
  const resDeleteOk = fakeRes();
  await characterCtl.deleteCharacter(
    { params: { userId: String(userA._id), characterId: aPrivateId } },
    resDeleteOk,
  );
  expect(resDeleteOk.statusCode === 200, 'A can delete own private character');

  await cleanup();
  console.log('All scenarios passed.');
  await mongoose.connection.close();
};

main().catch(async error => {
  console.error('Verification failed:', error);
  try {
    await mongoose.connection.close();
  } catch {}
  process.exit(1);
});
