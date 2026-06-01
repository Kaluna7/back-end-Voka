const { User, sanitizeUser } = require('../models/User');
const { verifyGoogleIdToken } = require('../services/googleAuthService');

const createToken = email => Buffer.from(`${email}-${Date.now()}`).toString('base64');

const signup = async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Name, email, dan password wajib diisi.' });
  }

  const existingUser = await User.findOne({ email: email.toLowerCase() });

  if (existingUser) {
    return res.status(409).json({ message: 'Email sudah terdaftar.' });
  }

  const user = await User.create({
    name: name.trim(),
    email: email.trim(),
    password,
    provider: 'email',
    dashboard: {
      remainingTokens: 10,
      selectedPlan: 'starter',
      isPremium: false,
    },
  });

  return res.status(201).json({
    message: 'Signup berhasil.',
    token: createToken(user.email),
    user: sanitizeUser(user),
  });
};

const googleAuth = async (req, res) => {
  const { idToken } = req.body;

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
  const existing = await User.findOne({ email });

  if (existing && existing.provider === 'email') {
    return res.status(409).json({
      message: 'Email ini sudah terdaftar dengan password. Silakan login dengan email/password.',
    });
  }

  let user = existing;
  if (!user) {
    user = await User.create({
      name: profile.name || email,
      email,
      password: null,
      provider: 'google',
      dashboard: {
        remainingTokens: 10,
        selectedPlan: 'starter',
        isPremium: false,
      },
    });
  }

  return res.status(200).json({
    message: 'Login Google berhasil.',
    token: createToken(user.email),
    user: sanitizeUser(user),
  });
};

const login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email dan password wajib diisi.' });
  }

  const user = await User.findOne({
    email: email.toLowerCase(),
    provider: 'email',
  });

  if (!user || user.password !== password) {
    return res.status(401).json({ message: 'Email atau password salah.' });
  }

  return res.status(200).json({
    message: 'Login berhasil.',
    token: createToken(user.email),
    user: sanitizeUser(user),
  });
};

module.exports = {
  signup,
  googleAuth,
  login,
};
