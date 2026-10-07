/**
 * Generate per-language companion UI + prompt translations via DeepSeek.
 * Output: src/data/companionLocales.json
 *
 * Usage: node src/scripts/generateCompanionLocales.js
 * Optional: GENERATE_SLUGS=char-lin-haoyu,char-lu-chen  (limit scope)
 * Optional: GENERATE_LANGS=Indonesian,Spanish
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { getEnv } = require('../config/env');
const { COMPANION_SEED_ENTRIES } = require('../data/companionSeedData');
const { featuredLanguages } = require('../config/learningLanguage');
const { buildLocalizedSystemPrompt } = require('../utils/companionLocaleUtils');

const OUT_PATH = path.join(__dirname, '../data/companionLocales.json');
const TARGET_LANGS = featuredLanguages.filter(lang => lang !== 'English');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const parseSlugFilter = () => {
  const raw = String(process.env.GENERATE_SLUGS || '').trim();
  if (!raw) {
    return null;
  }
  return new Set(
    raw
      .split(',')
      .map(item => item.trim())
      .filter(Boolean),
  );
};

const parseLangFilter = () => {
  const raw = String(process.env.GENERATE_LANGS || '').trim();
  if (!raw) {
    return TARGET_LANGS;
  }
  return raw
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
    .filter(lang => TARGET_LANGS.includes(lang));
};

const extractJsonObject = text => {
  const raw = String(text || '').trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1].trim() : raw;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) {
    throw new Error('No JSON object in model response');
  }
  return JSON.parse(body.slice(start, end + 1));
};

const translateCharacterBundle = async ({ entry, language, apiKey, model }) => {
  const systemPrompt =
    typeof entry.resolvePrompt === 'function'
      ? entry.resolvePrompt()
      : String(entry.systemPrompt || '').trim();

  const payload = {
    description: entry.description || '',
    bondProfileStory: entry.bondProfileStory || '',
    introMessage: entry.introMessage || '',
    systemPrompt,
  };

  const instruction = `You translate Moocha AI companion character copy into ${language}.
Return ONLY valid JSON with keys: description, bondProfileStory, introMessage, systemPrompt.
Rules:
- Preserve meaning, tone, and personality.
- Keep [exp]...[/exp] markers in introMessage exactly.
- Keep names (character name, place names that are proper nouns) when natural.
- systemPrompt must stay in second-person character instructions, fully in ${language}, and remain a complete persona prompt (not a summary).
- Do not add markdown.`;

  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        { role: 'system', content: instruction },
        { role: 'user', content: JSON.stringify(payload) },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`DeepSeek ${response.status}: ${errText.slice(0, 240)}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content || '';
  const parsed = extractJsonObject(content);

  return {
    description: String(parsed.description || payload.description).trim(),
    bondProfileStory: String(parsed.bondProfileStory || payload.bondProfileStory).trim(),
    introMessage: String(parsed.introMessage || payload.introMessage).trim(),
    systemPrompt: buildLocalizedSystemPrompt(
      String(parsed.systemPrompt || payload.systemPrompt).trim(),
      language,
    ),
  };
};

const main = async () => {
  const apiKey = getEnv('DEEPSEEK_API_KEY');
  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY is required');
  }
  const model = getEnv('DEEPSEEK_MODEL', 'deepseek-v4-flash');
  const slugFilter = parseSlugFilter();
  const langs = parseLangFilter();

  const existing = fs.existsSync(OUT_PATH)
    ? JSON.parse(fs.readFileSync(OUT_PATH, 'utf8') || '{}')
    : {};

  const characters = COMPANION_SEED_ENTRIES.filter(entry => {
    if (entry.type !== 'character') {
      return false;
    }
    if (slugFilter && !slugFilter.has(entry.slug)) {
      return false;
    }
    return true;
  });

  console.log(`Generating locales for ${characters.length} character(s) × ${langs.length} language(s)`);

  for (const entry of characters) {
    if (!existing[entry.slug]) {
      existing[entry.slug] = {};
    }
    // Always keep English source snapshot
    const englishPrompt =
      typeof entry.resolvePrompt === 'function'
        ? entry.resolvePrompt()
        : String(entry.systemPrompt || '').trim();
    existing[entry.slug].English = {
      description: entry.description || '',
      bondProfileStory: entry.bondProfileStory || '',
      introMessage: entry.introMessage || '',
      systemPrompt: buildLocalizedSystemPrompt(englishPrompt, 'English'),
    };

    for (const language of langs) {
      if (existing[entry.slug]?.[language]?.systemPrompt && process.env.FORCE_REGENERATE !== '1') {
        console.log(`skip ${entry.slug} / ${language} (exists)`);
        continue;
      }
      process.stdout.write(`translate ${entry.slug} → ${language}... `);
      try {
        existing[entry.slug][language] = await translateCharacterBundle({
          entry,
          language,
          apiKey,
          model,
        });
        fs.writeFileSync(OUT_PATH, JSON.stringify(existing, null, 2), 'utf8');
        console.log('ok');
      } catch (error) {
        console.log('FAIL', error.message);
      }
      await sleep(400);
    }
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify(existing, null, 2), 'utf8');
  console.log(`Wrote ${OUT_PATH}`);

  // Apply into Mongo immediately so app language switches work without a manual seed.
  try {
    const { spawnSync } = require('child_process');
    const seed = spawnSync(process.execPath, [path.join(__dirname, 'seedCompanions.js')], {
      cwd: path.join(__dirname, '../..'),
      stdio: 'inherit',
      env: process.env,
    });
    if (seed.status !== 0) {
      console.warn('Auto-seed after locale generation exited with', seed.status);
    }
  } catch (error) {
    console.warn('Auto-seed after locale generation failed:', error.message);
  }
};

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
