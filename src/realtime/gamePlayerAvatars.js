const User = require('../models/User');
const { publicAvatarUrl } = require('../utils/publicAvatar');

/** Each game socket's own profile avatar, looked up from the signed-in account (not trusted from the client). */
const avatarsBySocket = new WeakMap();

const rememberSocketAvatar = (socket, request) => {
  const userId = request?.authUserId;
  if (!userId) {
    return;
  }
  User.findById(userId)
    .select('avatarUrl')
    .lean()
    .then(user => {
      if (user) {
        avatarsBySocket.set(socket, publicAvatarUrl(user));
      }
    })
    .catch(() => {});
};

const socketAvatar = socket => (socket && avatarsBySocket.get(socket)) || '';

module.exports = { rememberSocketAvatar, socketAvatar };
