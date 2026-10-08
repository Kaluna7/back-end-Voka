const { User } = require('../models/User');
const { avatarForName } = require('../config/presetAvatars');

/** Biggest XP a single match can report — guards the board against bogus payloads. */
const MAX_XP_PER_MATCH = 500;
const LEADERBOARD_SIZE = 100;

/** ISO-8601 week in UTC, e.g. "2026-W40". Weeks start on Monday. */
const getWeekKey = (date = new Date()) => {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
};

/** Milliseconds until the next Monday 00:00 UTC (when the weekly board resets). */
const getMsUntilReset = (now = new Date()) => {
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = next.getUTCDay() || 7;
  next.setUTCDate(next.getUTCDate() + (8 - day));
  return Math.max(0, next.getTime() - now.getTime());
};

/**
 * Adds match XP atomically (no document save → no VersionError races with dashboard writes).
 * Same week → $inc; new week → reset weeklyXp to this match's XP.
 */
const addGameXp = async (userId, rawXp) => {
  const xp = Math.min(MAX_XP_PER_MATCH, Math.max(0, Math.floor(Number(rawXp) || 0)));
  const weekKey = getWeekKey();
  if (xp > 0) {
    const sameWeek = await User.updateOne(
      { _id: userId, 'gameStats.weekKey': weekKey },
      { $inc: { 'gameStats.weeklyXp': xp, 'gameStats.totalXp': xp } },
    );
    if (!sameWeek.matchedCount) {
      await User.updateOne(
        { _id: userId },
        {
          $set: { 'gameStats.weekKey': weekKey, 'gameStats.weeklyXp': xp },
          $inc: { 'gameStats.totalXp': xp },
        },
      );
    }
  }
  return xp;
};

/**
 * Seed players so the board never looks empty. Their XP grows through the week
 * (deterministic per week) and real players simply rank in between / above them.
 * Set GAME_LEADERBOARD_DUMMIES=false to turn them off once there are enough real users.
 */
const FIRST_NAMES = [
  'Alya', 'Rizky', 'Sakura', 'Daniel', 'Nadia', 'Lucas', 'Fajar', 'Mei', 'Kevin', 'Sofia', 'Bima', 'Hana',
  'Dewi', 'Omar', 'Citra', 'Minjun', 'Raka', 'Emma', 'Intan', 'Arjun', 'Salsa', 'Yuki', 'Dimas', 'Clara',
  'Putri', 'Leo', 'Gilang', 'Aisha', 'Tasya', 'Hugo', 'Kenji', 'Jisoo', 'Mateo', 'Layla', 'Reza', 'Ayu',
  'Farhan', 'Nina', 'Taro', 'Lina', 'Andre', 'Maya', 'Bayu', 'Elena', 'Haruto', 'Zahra', 'Rafi', 'Chloe',
];
const LAST_NAMES = [
  'Putri', 'Pratama', 'Tanaka', 'Kim', 'Rahma', 'Silva', 'Nugroho', 'Lin', 'Wijaya', 'Rossi', 'Saputra',
  'Yoshida', 'Lestari', 'Haddad', 'Park', 'Aditya', 'Muller', 'Permata', 'Mehta', 'Sato', 'Anggara',
  'Dupont', 'Santos', 'Ramadhan', 'Rahman', 'Martin', 'Watanabe', 'Lee', 'Garcia', 'Hakim', 'Kurniawan',
];
const HANDLE_STYLES = [
  first => `${first.toLowerCase()}.learns`,
  first => `${first}Study`,
  first => `${first.toLowerCase()}_${String(first.length * 7).padStart(2, '0')}`,
  first => `its${first}`,
  first => `${first}Speaks`,
];

/** ~130 stable, natural-looking names: full names plus some gamer-style handles. */
const DUMMY_NAMES = (() => {
  const names = new Set();
  FIRST_NAMES.forEach((first, i) => {
    names.add(`${first} ${LAST_NAMES[i % LAST_NAMES.length]}`);
    names.add(`${first} ${LAST_NAMES[(i * 7 + 3) % LAST_NAMES.length]}`);
    if (i % 2 === 0) {
      names.add(HANDLE_STYLES[i % HANDLE_STYLES.length](first));
    }
  });
  return [...names].slice(0, 130);
})();

const useDummies = () => String(process.env.GAME_LEADERBOARD_DUMMIES ?? 'true').toLowerCase() !== 'false';

/** Small deterministic PRNG value in [0, 1) from a string seed. */
const seeded = seed => {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 13;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};

const WEEK_MS = 7 * 86400000;

const DAY_MS = 86400000;

/**
 * Seeded players that look active: each one has a weekly XP target (a long tail from ~3,000
 * at the top to ~100 around #100, reshuffled every week) and a daily rhythm (most days they
 * play, some days they rest). XP only ever goes up as the week goes on.
 */
const getDummyPlayers = (weekKey, now = new Date()) => {
  // Days elapsed since Monday 00:00 UTC (0..7).
  const elapsedDays = Math.min(7, Math.max(0, 7 - getMsUntilReset(now) / DAY_MS));
  const fullDays = Math.floor(elapsedDays);
  const todayFraction = elapsedDays - fullDays;
  const order = DUMMY_NAMES.map((name, index) => ({ name, index, key: seeded(`${weekKey}:order:${name}`) }))
    .sort((a, b) => a.key - b.key);

  return order
    .map(({ name, index }, position) => {
      const id = `seed-${index + 1}`;
      const target = 3000 * Math.pow(0.965, position) * (0.85 + seeded(`${weekKey}:${id}:t`) * 0.3);
      // Daily shares: ~25% rest days (0), otherwise a random amount of play.
      const shares = Array.from({ length: 7 }, (_, day) => {
        const roll = seeded(`${weekKey}:${id}:d${day}`);
        return roll < 0.25 ? 0 : 0.3 + roll;
      });
      const total = shares.reduce((sum, share) => sum + share, 0) || 1;
      const played =
        shares.slice(0, fullDays).reduce((sum, share) => sum + share, 0) +
        (shares[fullDays] || 0) * todayFraction;
      const xp = Math.floor((target * played) / total);
      // About two thirds have an avatar; the rest show initials like real users.
      const avatarUrl = seeded(`avatar:${name}`) < 0.65 ? avatarForName(name) : '';
      return { id, name, avatarUrl, xp, isSeed: true };
    })
    .filter(player => player.xp > 0);
};

const toRow = (user, rank) => ({
  id: String(user._id),
  name: user.name || 'Player',
  avatarUrl: user.avatarUrl || '',
  xp: Number(user.gameStats?.weeklyXp || 0),
  rank,
});

/** This week's top players plus the requesting user's own rank and XP. */
const getWeeklyLeaderboard = async userId => {
  const weekKey = getWeekKey();
  const filter = { 'gameStats.weekKey': weekKey, 'gameStats.weeklyXp': { $gt: 0 } };
  const top = await User.find(filter)
    .sort({ 'gameStats.weeklyXp': -1, updatedAt: 1 })
    .limit(LEADERBOARD_SIZE)
    .select('name avatarUrl gameStats')
    .lean();

  const me = userId ? await User.findById(userId).select('name avatarUrl gameStats').lean() : null;
  const myXp = me && me.gameStats?.weekKey === weekKey ? Number(me.gameStats.weeklyXp || 0) : 0;
  const dummies = useDummies() ? getDummyPlayers(weekKey) : [];
  const merged = [...top.map(user => toRow(user, 0)), ...dummies]
    .sort((a, b) => b.xp - a.xp)
    .slice(0, LEADERBOARD_SIZE)
    .map((row, index) => ({ id: row.id, name: row.name, avatarUrl: row.avatarUrl, xp: row.xp, rank: index + 1 }));

  let you = null;
  if (me) {
    const realAhead = myXp > 0 ? await User.countDocuments({ ...filter, 'gameStats.weeklyXp': { $gt: myXp } }) : null;
    const ahead = realAhead == null ? null : realAhead + dummies.filter(d => d.xp > myXp).length;
    you = {
      id: String(me._id),
      name: me.name || 'Player',
      avatarUrl: me.avatarUrl || '',
      xp: myXp,
      rank: ahead == null ? null : ahead + 1,
    };
  }

  return {
    weekKey,
    resetsInMs: getMsUntilReset(),
    totalPlayers: (await User.countDocuments(filter)) + dummies.length,
    players: merged,
    you,
  };
};

module.exports = { addGameXp, getWeeklyLeaderboard, getWeekKey };
