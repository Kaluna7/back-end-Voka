const supportedAppLanguages = [
  'English',
  'Spanish',
  'French',
  'German',
  'Japanese',
  'Korean',
  'Chinese',
  'Arabic',
  'Hindi',
  'Indonesian',
];

const normalizeAppLanguage = value => {
  if (typeof value !== 'string') {
    return '';
  }
  const clean = value.trim();
  if (!clean) {
    return '';
  }
  const match = supportedAppLanguages.find(item => item.toLowerCase() === clean.toLowerCase());
  return match || '';
};

module.exports = {
  supportedAppLanguages,
  normalizeAppLanguage,
};
