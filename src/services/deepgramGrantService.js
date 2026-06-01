const { getEnv } = require('../config/env');

const DEEPGRAM_GRANT_URL = 'https://api.deepgram.com/v1/auth/grant';

const createDeepgramSttGrant = async ({ ttlSeconds = 300 } = {}) => {
  const apiKey = getEnv('DEEPGRAM_API_KEY');
  if (!apiKey) {
    const error = new Error('Deepgram is not configured.');
    error.code = 'DEEPGRAM_NOT_CONFIGURED';
    throw error;
  }

  const ttl = Math.min(Math.max(Number(ttlSeconds) || 300, 60), 3600);
  const response = await fetch(DEEPGRAM_GRANT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Token ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      scopes: ['usage:write'],
      ttl_seconds: ttl,
    }),
  });

  if (!response.ok) {
    const error = new Error(`Deepgram grant failed with status ${response.status}`);
    error.code = 'DEEPGRAM_GRANT_FAILED';
    throw error;
  }

  const data = await response.json();
  const accessToken = typeof data?.access_token === 'string' ? data.access_token : '';
  if (!accessToken) {
    const error = new Error('Deepgram grant returned no access token.');
    error.code = 'DEEPGRAM_GRANT_FAILED';
    throw error;
  }

  return {
    accessToken,
    expiresIn: Number(data?.expires_in) || ttl,
  };
};

module.exports = {
  createDeepgramSttGrant,
};
