const sharp = require('sharp');

const MAX_EDGE = 1024;
const WEBP_QUALITY = 82;
const MAX_DATA_URL_LENGTH = 2_800_000;
/** Reject decompression bombs before sharp fully decodes huge bitmaps. */
const MAX_INPUT_PIXELS = 4096 * 4096;

const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
  'image/avif',
]);

const parseDataUrl = (value) => {
  const match = value.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/);
  if (!match) {
    return null;
  }
  return { mimeType: match[1].toLowerCase(), base64: match[2].replace(/\s/g, '') };
};

const assertAllowedMimeType = (mimeType) => {
  if (!ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) {
    throw new Error('MIME type not allowed');
  }
};

const decodeBase64Payload = (base64, maxBytes) => {
  if (!base64 || base64.length > maxBytes * 1.4) {
    throw new Error('Payload too large');
  }
  const buffer = Buffer.from(base64, 'base64');
  if (!buffer.length) {
    throw new Error('Empty image payload');
  }
  if (buffer.length > maxBytes) {
    throw new Error('Payload too large');
  }
  return buffer;
};

const encodeBufferToWebpDataUrl = async (buffer) => {
  const metadata = await sharp(buffer, {
    failOn: 'error',
    limitInputPixels: MAX_INPUT_PIXELS,
  }).metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error('Invalid image dimensions');
  }

  const webpBuffer = await sharp(buffer, {
    failOn: 'error',
    limitInputPixels: MAX_INPUT_PIXELS,
  })
    .rotate()
    .resize(MAX_EDGE, MAX_EDGE, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();

  let encoded = `data:image/webp;base64,${webpBuffer.toString('base64')}`;
  if (encoded.length > MAX_DATA_URL_LENGTH) {
    const smaller = await sharp(buffer, {
      failOn: 'error',
      limitInputPixels: MAX_INPUT_PIXELS,
    })
      .rotate()
      .resize(768, 768, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 72 })
      .toBuffer();
    encoded = `data:image/webp;base64,${smaller.toString('base64')}`;
  }
  return encoded;
};

const normalizeUploadedImageDataUrl = async (dataUrl, maxBytes) => {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) {
    throw new Error('Invalid data URL');
  }
  assertAllowedMimeType(parsed.mimeType);
  const buffer = decodeBase64Payload(parsed.base64, maxBytes);
  return encodeBufferToWebpDataUrl(buffer);
};

module.exports = {
  ALLOWED_IMAGE_MIME_TYPES,
  MAX_DATA_URL_LENGTH,
  MAX_EDGE,
  decodeBase64Payload,
  encodeBufferToWebpDataUrl,
  normalizeUploadedImageDataUrl,
  parseDataUrl,
};
