const sharp = require('sharp');

const MAX_EDGE = 1024;
const WEBP_QUALITY = 82;
const MAX_DATA_URL_LENGTH = 2_800_000;

const isHttpUrl = (value) => /^https?:\/\//i.test(value);

const parseDataUrl = (value) => {
  const match = value.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) {
    return null;
  }
  return { mimeType: match[1], base64: match[2] };
};

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

  let buffer;
  const dataUrl = parseDataUrl(trimmed);
  if (dataUrl) {
    buffer = Buffer.from(dataUrl.base64, 'base64');
  } else if (/^[A-Za-z0-9+/=\s]+$/.test(trimmed) && trimmed.length > 64) {
    buffer = Buffer.from(trimmed.replace(/\s/g, ''), 'base64');
  } else {
    return trimmed;
  }

  if (!buffer.length) {
    return '';
  }

  const webpBuffer = await sharp(buffer)
    .rotate()
    .resize(MAX_EDGE, MAX_EDGE, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();

  const encoded = `data:image/webp;base64,${webpBuffer.toString('base64')}`;
  if (encoded.length > MAX_DATA_URL_LENGTH) {
    const smaller = await sharp(buffer)
      .rotate()
      .resize(768, 768, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 72 })
      .toBuffer();
    return `data:image/webp;base64,${smaller.toString('base64')}`;
  }
  return encoded;
};

module.exports = {
  normalizeCharacterImageToWebp,
};
