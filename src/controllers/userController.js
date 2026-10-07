const { User, sanitizeUser } = require('../models/User');
const { ensureInvitationCodeForUser } = require('../utils/invitationCode');
const { sanitizeProfileAvatarForStorage } = require('../utils/avatarImage');
const { normalizeAppLanguage } = require('../config/appLanguage');

/** Free accounts may only learn these; other languages need a subscription (same list as the app). */
const FREE_LEARNING_LANGUAGES = new Set(['English']);

/** Trimmed string or '' — never trusts the client to send the right type. */
const cleanString = (value, max = 80) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

const PROFILE_USER_SELECT =
  'name email provider avatarUrl accountSettings onboardingCompleted onboarding appLanguage invitationCode invitationRedeemedAt referredByUserId invitationRewardStatus invitationRewardUnlockAt';

const getProfile = async (req, res) => {
  const { userId } = req.params;
  const user = await User.findById(userId).select(PROFILE_USER_SELECT);

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
  const { interests, country, goal, language, level, confidence, dailyGoal, appLanguage, gender } =
    req.body;

  const user = await User.findById(userId);

  if (!user) {
    return res.status(404).json({ message: 'User tidak ditemukan.' });
  }

  const nextLanguage = cleanString(language, 40);
  const currentLanguage = user.onboarding?.language || '';
  // Free accounts can keep the language they already had, but only switch to a free one.
  if (
    nextLanguage &&
    nextLanguage !== currentLanguage &&
    !user.dashboard?.isPremium &&
    !FREE_LEARNING_LANGUAGES.has(nextLanguage)
  ) {
    return res.status(403).json({
      message: 'Bahasa ini tersedia untuk pelanggan. Berlangganan untuk membuka semua bahasa.',
      code: 'LANGUAGE_REQUIRES_SUBSCRIPTION',
    });
  }

  // Profile edits don't send gender — keep the stored one unless a valid value arrives.
  const nextGender = ['male', 'female', 'other'].includes(gender) ? gender : user.onboarding?.gender || '';
  user.onboarding = {
    gender: nextGender,
    interests: Array.isArray(interests)
      ? interests.filter(item => typeof item === 'string').map(item => item.trim().slice(0, 60)).slice(0, 30)
      : [],
    country: cleanString(country),
    goal: cleanString(goal, 200),
    language: nextLanguage,
    level: cleanString(level, 60),
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(100, confidence)) : 50,
    dailyGoal: cleanString(dailyGoal, 60),
  };
  user.onboardingCompleted = true;
  const nextAppLanguage = normalizeAppLanguage(appLanguage);
  if (nextAppLanguage) {
    user.appLanguage = nextAppLanguage;
  }

  await user.save();

  return res.status(200).json({
    message: 'Onboarding berhasil disimpan.',
    user: sanitizeUser(user),
  });
};

const updateProfile = async (req, res) => {
  const { userId } = req.params;
  const { name, avatarUrl, accountSettings, appLanguage } = req.body;

  const user = await User.findById(userId);
  if (!user) {
    return res.status(404).json({ message: 'User tidak ditemukan.' });
  }

  if (name && typeof name === 'string') {
    user.name = name.trim();
  }
  const nextAppLanguage = normalizeAppLanguage(appLanguage);
  if (nextAppLanguage) {
    user.appLanguage = nextAppLanguage;
  }
  if (typeof avatarUrl === 'string') {
    try {
      user.avatarUrl = await sanitizeProfileAvatarForStorage(avatarUrl, {
        existingAvatarUrl: user.avatarUrl || '',
      });
    } catch (error) {
      console.error('avatar sanitize failed:', error);
      const message =
        error instanceof Error && error.message === 'Payload too large'
          ? 'Ukuran gambar maksimal 5 MB.'
          : error instanceof Error && error.message === 'Avatar URL host not allowed'
            ? 'URL avatar eksternal tidak diizinkan. Upload foto dari perangkat.'
            : 'Gambar avatar tidak valid atau gagal dikonversi.';
      return res.status(400).json({ message });
    }
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
