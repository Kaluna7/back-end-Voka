const requiredVars = ['MONGODB_URI'];

const getEnv = (key, fallback = undefined) => {
  const value = process.env[key];
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }
  return fallback;
};

const validateEnv = () => {
  const missing = requiredVars.filter(key => !getEnv(key));
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
};

module.exports = {
  getEnv,
  validateEnv,
};
