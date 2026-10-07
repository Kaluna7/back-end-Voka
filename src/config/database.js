const mongoose = require('mongoose');
const { getEnv } = require('./env');

const resolveMongoUri = () =>
  getEnv('MONGODB_URI') || getEnv('MONGO_URI') || 'mongodb://127.0.0.1:27017/Moocha';

const connectDatabase = async () => {
  const uri = resolveMongoUri();
  await mongoose.connect(uri);
  return uri;
};

module.exports = {
  connectDatabase,
  resolveMongoUri,
};
