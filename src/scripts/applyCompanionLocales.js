require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { connectDatabase } = require('../config/database');
const { Companion } = require('../models/Companion');
const { COMPANION_SEED_ENTRIES } = require('../data/companionSeedData');
const { buildCompanionLocalesMap } = require('../utils/companionLocaleUtils');
const { invalidateCompanionCache } = require('../services/companionCatalogService');

const localesPath = path.join(__dirname, '../data/companionLocales.json');

const main = async () => {
  await connectDatabase();
  const translatedRoot = JSON.parse(fs.readFileSync(localesPath, 'utf8'));
  let updated = 0;
  for (const entry of COMPANION_SEED_ENTRIES) {
    if (entry.type !== 'character') continue;
    const pack = translatedRoot[entry.slug];
    if (!pack || !pack.Indonesian) continue;
    const systemPrompt =
      typeof entry.resolvePrompt === 'function'
        ? entry.resolvePrompt()
        : String(entry.systemPrompt || '').trim();
    const locales = buildCompanionLocalesMap({
      description: entry.description || '',
      bondProfileStory: entry.bondProfileStory || '',
      introMessage: entry.introMessage || '',
      systemPrompt,
      translatedByLanguage: pack,
    });
    await Companion.updateOne(
      { slug: entry.slug },
      {
        $set: {
          locales,
          description: locales.English?.description || entry.description || '',
          bondProfileStory: locales.English?.bondProfileStory || entry.bondProfileStory || '',
          introMessage: locales.English?.introMessage || entry.introMessage || '',
          systemPrompt: locales.English?.systemPrompt || systemPrompt,
        },
      },
    );
    updated += 1;
    console.log(
      'updated',
      entry.slug,
      'ID desc =',
      locales.Indonesian.description.slice(0, 60),
    );
  }
  invalidateCompanionCache();
  const check = await Companion.findOne({ slug: 'char-kael' }).lean();
  console.log('verify kael ID:', check?.locales?.Indonesian?.description);
  console.log('updated count', updated);
  await mongoose.connection.close();
};

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
