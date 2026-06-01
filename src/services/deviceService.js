const crypto = require('crypto');

const hashValue = value =>
  crypto.createHash('sha256').update(String(value || '')).digest('hex').slice(0, 24);

const getClientIp = req => {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || '';
};

const getDeviceContext = req => {
  const ip = getClientIp(req);
  const userAgent = typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : '';
  const deviceId =
    (typeof req.headers['x-device-id'] === 'string' && req.headers['x-device-id']) ||
    (typeof req.headers['x-installation-id'] === 'string' && req.headers['x-installation-id']) ||
    '';

  return {
    ip,
    ipHash: ip ? hashValue(ip) : '',
    userAgent,
    userAgentHash: userAgent ? hashValue(userAgent) : '',
    deviceId,
    deviceHash: deviceId ? hashValue(deviceId) : '',
  };
};

module.exports = {
  getDeviceContext,
  hashValue,
};
