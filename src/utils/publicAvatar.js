const crypto = require('crypto');

/**
 * Avatar URL that is safe to show to other players. Uploaded photos are stored as
 * data URLs (up to a few MB), so they are referenced through the public avatar route
 * instead of being embedded in leaderboards and game messages. `v` changes with the
 * photo, so clients re-download it only after it is replaced.
 */
const publicAvatarUrl = user => {
  const raw = typeof user?.avatarUrl === 'string' ? user.avatarUrl.trim() : '';
  if (!raw) {
    return '';
  }
  if (raw.startsWith('data:')) {
    const id = String(user._id || user.id || '');
    if (!id) {
      return '';
    }
    const version = crypto.createHash('sha1').update(raw).digest('hex').slice(0, 10);
    return `/api/public/avatars/${id}?v=${version}`;
  }
  return raw;
};

const DATA_URL = /^data:(image\/(?:png|jpeg|jpg|webp|gif));base64,([A-Za-z0-9+/=\s]+)$/;

/** GET /api/public/avatars/:userId — the user's uploaded profile photo as an image. */
const servePublicAvatar = async (req, res) => {
  const userId = String(req.params.userId || '');
  if (!/^[a-f0-9]{24}$/i.test(userId)) {
    return res.status(404).end();
  }
  const { User } = require('../models/User');
  const user = await User.findById(userId).select('avatarUrl').lean().catch(() => null);
  const match = DATA_URL.exec(String(user?.avatarUrl || ''));
  if (!match) {
    return res.status(404).end();
  }
  res.setHeader('Content-Type', match[1] === 'image/jpg' ? 'image/jpeg' : match[1]);
  res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
  return res.send(Buffer.from(match[2], 'base64'));
};

module.exports = { publicAvatarUrl, servePublicAvatar };
