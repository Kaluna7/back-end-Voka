/**
 * Makes sure every game has reviewed AI questions in every learning language, so a match
 * never has to fall back to the English built-in questions.
 *
 *   node scripts/prepareGamePuzzles.js            generate missing / small sets
 *   node scripts/prepareGamePuzzles.js --review   also re-check sets generated before the
 *                                                 review step existed (drops broken items,
 *                                                 adds missing correct answers)
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { GamePuzzleSet } = require('../src/models/GamePuzzleSet');
const { featuredLanguages } = require('../src/config/learningLanguage');
const { getGamePuzzles, reviewItems, usesAiPuzzles } = require('../src/services/aiGamePuzzleService');

const GAMES = [
  'sudoword',
  'synoword',
  'antoword',
  'wordDetective',
  'wordsense',
  'contextMaster',
  'sentenceBuilder',
  'storyRush',
];
const MIN_ITEMS = 12;
const REVIEW_CHUNK = 40;
const reviewExisting = process.argv.includes('--review');

const reviewStoredSet = async (gameKey, language) => {
  const stored = await GamePuzzleSet.findOne({ gameKey, language }).lean();
  if (!stored?.items?.length || stored.reviewedAt) {
    return null;
  }
  const kept = [];
  for (let i = 0; i < stored.items.length; i += REVIEW_CHUNK) {
    kept.push(...(await reviewItems(gameKey, language, stored.items.slice(i, i + REVIEW_CHUNK))));
  }
  // Keep the old set when the review would leave too little to play with.
  const items = kept.length >= MIN_ITEMS ? kept : stored.items;
  await GamePuzzleSet.updateOne(
    { gameKey, language },
    { $set: { items, reviewedAt: new Date() } },
    { strict: false },
  );
  return { before: stored.items.length, after: items.length };
};

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL);
  const languages = (featuredLanguages || []).filter(language => language !== 'English');
  for (const language of languages) {
    const line = [];
    for (const gameKey of GAMES) {
      if (!usesAiPuzzles(gameKey, language)) {
        line.push(`${gameKey}:built-in`);
        continue;
      }
      if (reviewExisting) {
        const result = await reviewStoredSet(gameKey, language).catch(() => null);
        if (result) {
          line.push(`${gameKey}:reviewed ${result.before}->${result.after}`);
        }
      }
      // Generates (and reviews) when the set is missing or too small; retry once.
      let items = await getGamePuzzles(gameKey, language).catch(() => null);
      if (!items || items.length < MIN_ITEMS) {
        items = await getGamePuzzles(gameKey, language).catch(() => null);
      }
      line.push(`${gameKey}:${items ? items.length : 'FAILED'}`);
    }
    console.log(`${language}: ${line.join('  ')}`);
  }
  await mongoose.disconnect();
};

run().catch(error => {
  console.error(error);
  process.exit(1);
});
