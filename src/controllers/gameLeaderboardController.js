const mongoose = require('mongoose');
const { addGameXp, getWeeklyLeaderboard } = require('../services/gameLeaderboardService');

const isValidUserId = userId => mongoose.Types.ObjectId.isValid(String(userId || ''));

const reportGameXp = async (req, res) => {
  const { userId } = req.params;
  if (!isValidUserId(userId)) {
    return res.status(400).json({ message: 'User tidak valid.' });
  }
  try {
    const added = await addGameXp(userId, req.body?.xp);
    const leaderboard = await getWeeklyLeaderboard(userId);
    return res.status(200).json({ success: true, added, ...leaderboard });
  } catch (error) {
    return res.status(500).json({ message: error?.message || 'Gagal menyimpan XP.' });
  }
};

const getGameLeaderboard = async (req, res) => {
  const { userId } = req.params;
  if (!isValidUserId(userId)) {
    return res.status(400).json({ message: 'User tidak valid.' });
  }
  try {
    const leaderboard = await getWeeklyLeaderboard(userId);
    return res.status(200).json({ success: true, ...leaderboard });
  } catch (error) {
    return res.status(500).json({ message: error?.message || 'Gagal memuat leaderboard.' });
  }
};

module.exports = { reportGameXp, getGameLeaderboard };
