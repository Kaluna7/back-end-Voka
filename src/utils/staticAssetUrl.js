const CHARACTER_STATIC_PREFIX = '/static/characters';

const companionCharacterImagePath = filename => {
  const safe = String(filename || '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '');
  if (!safe) {
    return '';
  }
  return `${CHARACTER_STATIC_PREFIX}/${safe}`;
};

module.exports = {
  CHARACTER_STATIC_PREFIX,
  companionCharacterImagePath,
};
