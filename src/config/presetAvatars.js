const fs = require('fs');
const path = require('path');

/**
 * Built-in illustrated avatars (public/avatars, DiceBear Lorelei/Notionists, CC0).
 * Bots and seeded leaderboard players get one of these, always the same one per name.
 */
const loadAvatarIds = () => {
  try {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../../public/avatars/manifest.json'), 'utf8'),
    );
    return Array.isArray(manifest.avatars) ? manifest.avatars : [];
  } catch {
    return [];
  }
};

const AVATAR_IDS = loadAvatarIds();

/** FNV-1a: spreads similar names across different avatars. */
const hashName = name => {
  let h = 2166136261;
  for (const char of String(name || '')) {
    h ^= char.codePointAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
};

/** Stable avatar path for a display name, e.g. "/static/avatars/lorelei-aria.webp". */
const avatarForName = name =>
  AVATAR_IDS.length ? `/static/avatars/${AVATAR_IDS[hashName(name) % AVATAR_IDS.length]}.webp` : '';

module.exports = { avatarForName };
