const { User, sanitizeUser } = require('../models/User');
const { verifyGoogleIdToken } = require('../services/googleAuthService');
const { normalizeAppLanguage } = require('../config/appLanguage');
const {
  issueVerificationCode,
  consumeVerificationCode,
  normalizeEmail,
} = require('../services/verificationCodeService');

const { hashPassword, verifyPassword } = require('../security/passwords');
const { createAccessToken } = require('../security/accessTokens');
const {
  isValidEmail,
  isValidName,
  isStrongPassword,
  isValidCode,
  MAX_PASSWORD_LENGTH,
} = require('../security/validators');

const createToken = user => createAccessToken(user._id, user.authVersion);

/** Auth responses never need dashboard chats — exclude them so login stays fast. */
const AUTH_USER_SELECT =
  'name email +password authVersion provider avatarUrl accountSettings onboardingCompleted onboarding appLanguage invitationCode invitationRedeemedAt referredByUserId invitationRewardStatus invitationRewardUnlockAt';

const resolveGoogleAvatarUrl = (profile, bodyAvatarUrl) => {
  const fromToken = typeof profile?.picture === 'string' ? profile.picture.trim() : '';
  const fromClient = typeof bodyAvatarUrl === 'string' ? bodyAvatarUrl.trim() : '';
  return fromToken || fromClient || '';
};

const applyGoogleProfileToUser = (user, profile, avatarUrl) => {
  if (profile?.name && typeof profile.name === 'string') {
    const trimmedName = profile.name.trim();
    if (trimmedName && (!user.name || user.name === user.email)) {
      user.name = trimmedName;
    }
  }
  if (avatarUrl && !user.avatarUrl?.trim()) {
    user.avatarUrl = avatarUrl;
  }
};


/** Maps verification-code service errors to a JSON response the app understands. */
const sendCodeError = (res, error) => {
  if (error?.status) {
    return res.status(error.status).json({
      message: error.message,
      code: error.code,
      ...(error.retryAfterSeconds ? { retryAfterSeconds: error.retryAfterSeconds } : {}),
      ...(typeof error.attemptsLeft === 'number' ? { attemptsLeft: error.attemptsLeft } : {}),
    });
  }
  console.error('[auth] verification error:', error);
  return res.status(500).json({ message: 'Terjadi kesalahan. Coba lagi.' });
};

const PASSWORD_RULE_MESSAGE = 'Password minimal 8 karakter dan berisi huruf serta angka.';

const validateSignupFields = ({ name, email, password }) => {
  if (!name || !email || !password) {
    return 'Name, email, dan password wajib diisi.';
  }
  if (!isValidName(name)) {
    return 'Nama hanya boleh berisi huruf, spasi, titik, tanda petik, atau tanda hubung (2 sampai 50 karakter).';
  }
  if (!isValidEmail(email)) {
    return 'Format email tidak valid.';
  }
  if (!isStrongPassword(password)) {
    return PASSWORD_RULE_MESSAGE;
  }
  return null;
};

/** Step 1 of email signup: check the details, then email a 6-digit code. */
const requestSignupCode = async (req, res) => {
  const { name, email, password, appLanguage } = req.body || {};
  const invalid = validateSignupFields({ name, email, password });
  if (invalid) {
    return res.status(400).json({ message: invalid });
  }
  const normalized = normalizeEmail(email);
  const existingUser = await User.findOne({ email: normalized }).select('_id').lean();
  if (existingUser) {
    return res.status(409).json({ message: 'Email sudah terdaftar.' });
  }
  try {
    const result = await issueVerificationCode({
      email: normalized,
      purpose: 'signup',
      displayName: String(name).trim(),
      language: normalizeAppLanguage(appLanguage),
    });
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return sendCodeError(res, error);
  }
};

/** Step 2 of email signup: verify the code, then create the account. */
const signup = async (req, res) => {
  const { name, email, password, appLanguage, code } = req.body || {};

  const invalid = validateSignupFields({ name, email, password });
  if (invalid) {
    return res.status(400).json({ message: invalid });
  }
  if (!code) {
    return res.status(400).json({ message: 'Kode verifikasi wajib diisi.', code: 'CODE_REQUIRED' });
  }
  if (!isValidCode(code)) {
    return res.status(400).json({ message: 'Kode verifikasi harus 6 angka.', code: 'CODE_INVALID' });
  }

  const existingUser = await User.findOne({ email: normalizeEmail(email) })
    .select('_id')
    .lean();

  if (existingUser) {
    return res.status(409).json({ message: 'Email sudah terdaftar.' });
  }

  try {
    await consumeVerificationCode({ email: normalizeEmail(email), purpose: 'signup', code: String(code).trim() });
  } catch (error) {
    return sendCodeError(res, error);
  }

  const user = await User.create({
    name: String(name).trim(),
    email: normalizeEmail(email),
    password: await hashPassword(password),
    provider: 'email',
    appLanguage: normalizeAppLanguage(appLanguage),
    dashboard: {
      remainingTokens: 10,
      selectedPlan: 'starter',
      isPremium: false,
    },
  });

  return res.status(201).json({
    message: 'Signup berhasil.',
    token: createToken(user),
    user: sanitizeUser(user),
  });
};

const googleAuth = async (req, res) => {
  const { idToken, avatarUrl: clientAvatarUrl } = req.body;

  if (!idToken || typeof idToken !== 'string') {
    return res.status(400).json({ message: 'ID token Google wajib dikirim.' });
  }

  const profile = await verifyGoogleIdToken(idToken);
  if (!profile?.email) {
    return res.status(401).json({
      message: 'Token Google tidak valid atau GOOGLE_CLIENT_ID backend belum sesuai.',
    });
  }

  const email = profile.email;
  const existing = await User.findOne({ email }).select(AUTH_USER_SELECT);

  if (existing && existing.provider === 'email') {
    return res.status(409).json({
      message: 'Email ini sudah terdaftar dengan password. Silakan login dengan email/password.',
    });
  }

  const googleAvatarUrl = resolveGoogleAvatarUrl(profile, clientAvatarUrl);
  const incomingAppLanguage = normalizeAppLanguage(req.body?.appLanguage);

  let user = existing;
  if (!user) {
    user = await User.create({
      name: profile.name || email,
      email,
      password: null,
      provider: 'google',
      avatarUrl: googleAvatarUrl,
      appLanguage: incomingAppLanguage,
      dashboard: {
        remainingTokens: 10,
        selectedPlan: 'starter',
        isPremium: false,
      },
    });
  } else {
    applyGoogleProfileToUser(user, profile, googleAvatarUrl);
    const patch = {};
    if (user.isModified('name')) {
      patch.name = user.name;
    }
    if (user.isModified('avatarUrl')) {
      patch.avatarUrl = user.avatarUrl;
    }
    if (!normalizeAppLanguage(user.appLanguage) && incomingAppLanguage) {
      patch.appLanguage = incomingAppLanguage;
      user.appLanguage = incomingAppLanguage;
    }
    if (Object.keys(patch).length > 0) {
      // Only patch changed profile fields — never rewrite omitted dashboard paths.
      await User.updateOne({ _id: user._id }, { $set: patch });
    }
  }

  return res.status(200).json({
    message: 'Login Google berhasil.',
    token: createToken(user),
    user: sanitizeUser(user),
  });
};

// Hash of a random string: lets login spend the same scrypt time for unknown emails,
// so response timing doesn't reveal which emails are registered.
let decoyHashPromise = null;
const decoyHash = () => {
  if (!decoyHashPromise) {
    decoyHashPromise = hashPassword(require('crypto').randomBytes(16).toString('hex'));
  }
  return decoyHashPromise;
};

const login = async (req, res) => {
  const { email, password } = req.body || {};

  if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
    return res.status(400).json({ message: 'Email dan password wajib diisi.' });
  }
  if (!isValidEmail(email) || password.length > MAX_PASSWORD_LENGTH) {
    return res.status(401).json({ message: 'Email atau password salah.' });
  }

  const user = await User.findOne({
    email: normalizeEmail(email),
    provider: 'email',
  }).select(AUTH_USER_SELECT);

  const check = await verifyPassword(password, user?.password || (await decoyHash()));
  if (!user || !check.ok) {
    return res.status(401).json({ message: 'Email atau password salah.' });
  }
  if (check.needsRehash) {
    // Legacy plain-text (or weaker) password: upgrade it now that we know it.
    await User.updateOne({ _id: user._id }, { $set: { password: await hashPassword(password) } });
  }

  return res.status(200).json({
    message: 'Login berhasil.',
    token: createToken(user),
    user: sanitizeUser(user),
  });
};

/** Forgot password step 1: email a reset code to an email/password account. */
const requestPasswordReset = async (req, res) => {
  const { email, appLanguage } = req.body || {};
  const normalized = normalizeEmail(email);
  if (!isValidEmail(normalized)) {
    return res.status(400).json({ message: 'Format email tidak valid.' });
  }
  const user = await User.findOne({ email: normalized }).select('name provider appLanguage').lean();
  if (!user) {
    return res.status(404).json({ message: 'Email belum terdaftar.', code: 'EMAIL_NOT_FOUND' });
  }
  if (user.provider !== 'email') {
    return res.status(400).json({
      message: 'Akun ini masuk dengan Google, jadi tidak memakai password. Silakan login dengan Google.',
      code: 'GOOGLE_ACCOUNT',
    });
  }
  try {
    const result = await issueVerificationCode({
      email: normalized,
      purpose: 'reset_password',
      displayName: user.name,
      language: normalizeAppLanguage(appLanguage) || user.appLanguage,
    });
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return sendCodeError(res, error);
  }
};

/** Forgot password step 2: verify the code and set the new password. */
const resetPassword = async (req, res) => {
  const { email, code, newPassword } = req.body || {};
  const normalized = normalizeEmail(email);
  if (!normalized || !code || !newPassword) {
    return res.status(400).json({ message: 'Email, kode, dan password baru wajib diisi.' });
  }
  if (!isValidEmail(normalized)) {
    return res.status(400).json({ message: 'Format email tidak valid.' });
  }
  if (!isValidCode(code)) {
    return res.status(400).json({ message: 'Kode verifikasi harus 6 angka.', code: 'CODE_INVALID' });
  }
  if (!isStrongPassword(newPassword)) {
    return res.status(400).json({ message: PASSWORD_RULE_MESSAGE, code: 'WEAK_PASSWORD' });
  }
  const user = await User.findOne({ email: normalized, provider: 'email' }).select('_id').lean();
  if (!user) {
    return res.status(404).json({ message: 'Email belum terdaftar.', code: 'EMAIL_NOT_FOUND' });
  }
  try {
    await consumeVerificationCode({ email: normalized, purpose: 'reset_password', code: String(code).trim() });
  } catch (error) {
    return sendCodeError(res, error);
  }
  // New hash + bump authVersion: every device signed in with the old password is logged out.
  await User.updateOne(
    { _id: user._id },
    { $set: { password: await hashPassword(newPassword) }, $inc: { authVersion: 1 } },
  );
  return res.status(200).json({ success: true, message: 'Password berhasil diganti.' });
};

module.exports = {
  requestSignupCode,
  requestPasswordReset,
  resetPassword,
  signup,
  googleAuth,
  login,
};
