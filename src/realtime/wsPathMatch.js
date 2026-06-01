/**
 * True when requestUrl targets this WebSocket path exactly (not a longer path prefix).
 * e.g. /ws/story-rush-stt must NOT match /ws/story-rush
 */
const matchesWsPath = (requestUrl, path) => {
  const base = String(requestUrl || '').split('?')[0];
  if (base === path) {
    return true;
  }
  if (!base.startsWith(path)) {
    return false;
  }
  const next = base[path.length];
  return next === '/';
};

module.exports = { matchesWsPath };
