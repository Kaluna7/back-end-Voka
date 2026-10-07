const { normalizeUploadedImageDataUrl } = require('./imageUploadSecurity');

const MAX_AVATAR_UPLOAD_BYTES = 5 * 1024 * 1024;

const TRUSTED_AVATAR_HOST_SUFFIXES = [
  'googleusercontent.com',
  'ggpht.com',
  'gstatic.com',
];

const DANGEROUS_URL_PREFIXES = ['javascript:', 'data:', 'file:', 'blob:', 'vbscript:'];

const isHttpsUrl = (value) => /^https:\/\//i.test(value);

const getHostname = (url) => {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
};

const isTrustedAvatarHost = (url) => {
  const hostname = getHostname(url);
  if (!hostname) {
    return false;
  }
  return TRUSTED_AVATAR_HOST_SUFFIXES.some(
    suffix => hostname === suffix || hostname.endsWith(`.${suffix}`),
  );
};

const assertSafeExternalAvatarUrl = (url) => {
  const trimmed = url.trim();
  if (!trimmed) {
    return '';
  }
  const lower = trimmed.toLowerCase();
  if (DANGEROUS_URL_PREFIXES.some(prefix => lower.startsWith(prefix))) {
    throw new Error('Unsafe avatar URL scheme');
  }
  if (!isHttpsUrl(trimmed)) {
    throw new Error('Avatar URL must use HTTPS');
  }
  if (!isTrustedAvatarHost(trimmed)) {
    throw new Error('Avatar URL host not allowed');
  }
  return trimmed;
};

/**
 * Sanitize profile avatar before persisting.
 * - Uploads must be image data URLs (re-encoded to WebP).
 * - External URLs are only kept when trusted (Google OAuth) or unchanged from the current value.
 */
const sanitizeProfileAvatarForStorage = async (avatarInput, { existingAvatarUrl = '' } = {}) => {
  if (typeof avatarInput !== 'string') {
    return '';
  }
  const trimmed = avatarInput.trim();
  if (!trimmed) {
    return '';
  }

  if (trimmed.startsWith('data:')) {
    return normalizeUploadedImageDataUrl(trimmed, MAX_AVATAR_UPLOAD_BYTES);
  }

  const existing = typeof existingAvatarUrl === 'string' ? existingAvatarUrl.trim() : '';
  if (existing && trimmed === existing) {
    return existing;
  }

  return assertSafeExternalAvatarUrl(trimmed);
};

module.exports = {
  MAX_AVATAR_UPLOAD_BYTES,
  sanitizeProfileAvatarForStorage,
};
