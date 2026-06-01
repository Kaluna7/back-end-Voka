const { User, sanitizeUser } = require('../models/User');
const { ensureInvitationCodeForUser } = require('../utils/invitationCode');

const getProfile = async (req, res) => {
  const { userId } = req.params;
  const user = await User.findById(userId);

  if (!user) {
    return res.status(404).json({ message: 'User tidak ditemukan.' });
  }

  try {
    await ensureInvitationCodeForUser(user);
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      message: error.message || 'Gagal memuat kode undangan.',
    });
  }

  return res.status(200).json({
    message: 'Profile ditemukan.',
    user: sanitizeUser(user),
  });
};

const updateOnboarding = async (req, res) => {
  const { userId } = req.params;
  const { interests, country, goal, language, level, confidence, dailyGoal } = req.body;

  const user = await User.findById(userId);

  if (!user) {
    return res.status(404).json({ message: 'User tidak ditemukan.' });
  }

  user.onboarding = {
    interests: Array.isArray(interests) ? interests : [],
    country: country?.trim() || '',
    goal: goal?.trim() || '',
    language: language?.trim() || '',
    level: level?.trim() || '',
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(100, confidence)) : 50,
    dailyGoal: dailyGoal?.trim() || '',
  };
  user.onboardingCompleted = true;

  await user.save();

  return res.status(200).json({
    message: 'Onboarding berhasil disimpan.',
    user: sanitizeUser(user),
  });
};

const updateProfile = async (req, res) => {
  const { userId } = req.params;
  const { name, avatarUrl, accountSettings } = req.body;

  const user = await User.findById(userId);
  if (!user) {
    return res.status(404).json({ message: 'User tidak ditemukan.' });
  }

  if (name && typeof name === 'string') {
    user.name = name.trim();
  }
  if (typeof avatarUrl === 'string') {
    user.avatarUrl = avatarUrl.trim();
  }
  if (accountSettings && typeof accountSettings === 'object') {
    user.accountSettings = {
      emailNotification:
        typeof accountSettings.emailNotification === 'boolean'
          ? accountSettings.emailNotification
          : user.accountSettings?.emailNotification ?? true,
      dailyReminder:
        typeof accountSettings.dailyReminder === 'boolean'
          ? accountSettings.dailyReminder
          : user.accountSettings?.dailyReminder ?? true,
      privateProfile:
        typeof accountSettings.privateProfile === 'boolean'
          ? accountSettings.privateProfile
          : user.accountSettings?.privateProfile ?? false,
    };
  }

  await user.save();

  return res.status(200).json({
    message: 'Profile berhasil diperbarui.',
    user: sanitizeUser(user),
  });
};

module.exports = {
  getProfile,
  updateOnboarding,
  updateProfile,
};
