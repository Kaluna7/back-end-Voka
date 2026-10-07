const {
  encodeBufferToWebpDataUrl,
  parseDataUrl,
} = require('./imageUploadSecurity');

const isHttpUrl = (value) => /^https?:\/\//i.test(value);

/**
 * Normalize character image to a compact WebP data URL for MongoDB storage.
 * Remote http(s) URLs are kept as-is (e.g. Dicebear fallbacks).
 */
const normalizeCharacterImageToWebp = async (imageInput) => {
  if (typeof imageInput !== 'string') {
    return '';
  }
  const trimmed = imageInput.trim();
  if (!trimmed) {
    return '';
  }
  if (isHttpUrl(trimmed) || trimmed.startsWith('file://')) {
    return trimmed;
  }

  const dataUrl = parseDataUrl(trimmed);
  if (!dataUrl) {
    return trimmed;
  }

  const buffer = Buffer.from(dataUrl.base64, 'base64');
  if (!buffer.length) {
    return '';
  }

  return encodeBufferToWebpDataUrl(buffer);
};

module.exports = {
  normalizeCharacterImageToWebp,
};
