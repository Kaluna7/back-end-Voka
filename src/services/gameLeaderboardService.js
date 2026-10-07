const { User } = require('../models/User');

/** Biggest XP a single match can report — guards the board against bogus payloads. */
const MAX_XP_PER_MATCH = 500;
const LEADERBOARD_SIZE = 50;

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
const DUMMY_NAMES = [
  'Alya Putri', 'Rizky Pratama', 'Sakura Tanaka', 'Daniel Kim', 'Nadia Rahma', 'Lucas Silva',
  'Fajar Nugroho', 'Mei Lin', 'Kevin Wijaya', 'Sofia Rossi', 'Bima Saputra', 'Hana Yoshida',
  'Dewi Lestari', 'Omar Haddad', 'Citra Ayu', 'Minjun Park', 'Raka Aditya', 'Emma Müller',
  'Intan Permata', 'Arjun Mehta', 'Salsa Nabila', 'Yuki Sato', 'Dimas Anggara', 'Clara Dupont',
  'Putri Maharani', 'Leo Santos', 'Gilang Ramadhan', 'Aisha Rahman', 'Tasya Amelia', 'Hugo Martin',
];

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

const getDummyPlayers = (weekKey, now = new Date()) => {
  // 0 → Monday 00:00 UTC, 1 → end of the week.
  const progress = Math.min(1, Math.max(0, 1 - getMsUntilReset(now) / WEEK_MS));
  return DUMMY_NAMES.map((name, index) => {
    const id = `seed-${index + 1}`;
    const pace = 80 + seeded(`${weekKey}:${id}:pace`) * 1400; // weekly XP target
    const head = seeded(`${weekKey}:${id}:head`) * 60; // some players start early
    // Bumpy growth so the order shuffles a little during the week.
    const wobble = 0.85 + seeded(`${weekKey}:${id}:${Math.floor(progress * 28)}`) * 0.3;
    const xp = Math.floor(head + pace * progress * wobble);
    return { id, name, avatarUrl: '', xp, isSeed: true };
  }).filter(player => player.xp > 0);
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
