const { getEnv } = require('./env');

const REGION_HOSTS = {
  us: 'api.deepgram.com',
  eu: 'api.eu.deepgram.com',
};

/** Sticky region after a successful request (avoids 10s+ failover each TTS call). */
let preferredRegion = null;

const resolveRegion = () => {
  if (preferredRegion === 'us' || preferredRegion === 'eu') {
    return preferredRegion;
  }
  const raw = String(getEnv('DEEPGRAM_REGION', 'us') || 'us').toLowerCase();
  return raw === 'eu' ? 'eu' : 'us';
};

const rememberWorkingRegion = region => {
  if (region === 'us' || region === 'eu') {
    preferredRegion = region;
  }
};

const regionFromHost = host => {
  if (host === REGION_HOSTS.eu || String(host || '').includes('.eu.')) {
    return 'eu';
  }
  if (host === REGION_HOSTS.us || String(host || '').endsWith('.deepgram.com')) {
    return 'us';
  }
  return null;
};

const getDeepgramHost = (region = resolveRegion()) => REGION_HOSTS[region] || REGION_HOSTS.us;

const getAlternateRegion = region => (region === 'eu' ? 'us' : 'eu');

const buildHttpsUrl = (path, region = resolveRegion()) => `https://${getDeepgramHost(region)}${path}`;

const buildWssUrl = (path, region = resolveRegion()) => `wss://${getDeepgramHost(region)}${path}`;

const swapUrlRegion = (urlString, toRegion) => {
  const url = new URL(urlString);
  url.host = getDeepgramHost(toRegion);
  return url.toString();
};

const isDeepgramHost = host =>
  host === REGION_HOSTS.us || host === REGION_HOSTS.eu || host.endsWith('.deepgram.com');

const isRetryableNetworkError = error => {
  const code = String(error?.cause?.code || error?.code || '').toUpperCase();
  const message = String(error?.cause?.message || error?.message || '').toLowerCase();
  if (
    [
      'ENOTFOUND',
      'ENETUNREACH',
      'ETIMEDOUT',
      'ECONNRESET',
      'ECONNREFUSED',
      'EAI_AGAIN',
      'UND_ERR_CONNECT_TIMEOUT',
      'UND_ERR_HEADERS_TIMEOUT',
      'UND_ERR_BODY_TIMEOUT',
      'UND_ERR_SOCKET',
      'ABORTERROR',
    ].includes(code)
  ) {
    return true;
  }
  if (
    message.includes('abort') ||
    message.includes('timed out') ||
    message.includes('timeout') ||
    message.includes('network') ||
    message.includes('fetch failed')
  ) {
    return true;
  }
  return false;
};

const ttsSupportsSpeed = (region = resolveRegion()) => getDeepgramHost(region) !== REGION_HOSTS.eu;

const getListenRestUrl = (region = resolveRegion()) => buildHttpsUrl('/v1/listen', region);

const getListenFluxWsUrl = (region = resolveRegion()) => buildWssUrl('/v2/listen', region);

const getListenLiveWsUrl = (region = resolveRegion()) => {
  const override = getEnv('DEEPGRAM_LIVE_WS_URL');
  if (override) {
    return override;
  }
  return buildWssUrl('/v1/listen', region);
};

const getSpeakUrl = (region = resolveRegion()) => buildHttpsUrl('/v1/speak', region);

const getSpeakWsUrl = (region = resolveRegion()) => buildWssUrl('/v1/speak', region);

const getGrantUrl = () => buildHttpsUrl('/v1/auth/grant', 'us');

/** Deepgram Voice Agent (STT + think + TTS orchestration). */
const getVoiceAgentWsUrl = (region = resolveRegion()) => {
  const override = getEnv('DEEPGRAM_VOICE_AGENT_WS_URL');
  if (override) {
    return override;
  }
  // Prefer regional API host — agent.deepgram.com is often unreachable on some networks.
  return `wss://${getDeepgramHost(region)}/v1/agent/converse`;
};

const getVoiceAgentWsUrlCandidates = () => {
  const override = getEnv('DEEPGRAM_VOICE_AGENT_WS_URL');
  if (override) {
    return [override];
  }
  // Prefer sticky region after a successful call. Otherwise try US first:
  // api.eu.deepgram.com often stalls on SEA networks (agent + TTS WS timeouts).
  const sticky = preferredRegion === 'eu' || preferredRegion === 'us' ? preferredRegion : null;
  const ordered = sticky === 'eu' ? ['eu', 'us'] : ['us', 'eu'];
  const urls = ordered.map(region => `wss://${getDeepgramHost(region)}/v1/agent/converse`);
  // Legacy global agent host last — may timeout on some ISPs/hotspots.
  urls.push('wss://agent.deepgram.com/v1/agent/converse');
  return [...new Set(urls)];
};

/** True after a successful Deepgram call locked the process sticky region. */
const hasStickyRegion = () => preferredRegion === 'us' || preferredRegion === 'eu';

module.exports = {
  REGION_HOSTS,
  resolveRegion,
  rememberWorkingRegion,
  regionFromHost,
  getDeepgramHost,
  getAlternateRegion,
  buildHttpsUrl,
  buildWssUrl,
  swapUrlRegion,
  isDeepgramHost,
  isRetryableNetworkError,
  ttsSupportsSpeed,
  getListenRestUrl,
  getListenFluxWsUrl,
  getListenLiveWsUrl,
  getSpeakUrl,
  getSpeakWsUrl,
  getGrantUrl,
  getVoiceAgentWsUrl,
  getVoiceAgentWsUrlCandidates,
  hasStickyRegion,
};
