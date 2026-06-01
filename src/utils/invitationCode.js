const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

const generateInvitationCode = () => {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
};

const normalizeInvitationCode = raw =>
  typeof raw === 'string' ? raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '') : '';

const ensureInvitationCodeForUser = async user => {
  if (user.invitationCode) {
    return user.invitationCode;
  }

  const { User } = require('../models/User');

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const candidate = generateInvitationCode();
    const taken = await User.findOne({ invitationCode: candidate }).select('_id').lean();
    if (!taken) {
      user.invitationCode = candidate;
      await user.save();
      return candidate;
    }
  }

  const error = new Error('Gagal membuat kode undangan.');
  error.statusCode = 500;
  throw error;
};

module.exports = {
  generateInvitationCode,
  normalizeInvitationCode,
  ensureInvitationCodeForUser,
};
