const { getEnv } = require('../config/env');

/**
 * Verifies a Google ID token (from mobile Sign-In) against Google's tokeninfo endpoint.
 * @returns {Promise<{ sub: string, email: string, name: string } | null>}
 */
const verifyGoogleIdToken = async idToken => {
  const clientId = getEnv('GOOGLE_CLIENT_ID');
  if (!clientId || !idToken || typeof idToken !== 'string') {
    return null;
  }

  const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken.trim())}`;
  let payload;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      return null;
    }
    payload = await res.json();
  } catch {
    return null;
  }

  if (!payload || payload.aud !== clientId) {
    return null;
  }

  const emailVerified = payload.email_verified === true || payload.email_verified === 'true';
  if (!emailVerified || !payload.email) {
    return null;
  }

  return {
    sub: String(payload.sub || ''),
    email: String(payload.email).toLowerCase().trim(),
    name: String(payload.name || payload.given_name || payload.email).trim(),
  };
};

module.exports = { verifyGoogleIdToken };
