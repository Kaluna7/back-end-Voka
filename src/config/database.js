const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/Voka';

const connectDatabase = async () => {
  await mongoose.connect(MONGO_URI);
};

module.exports = {
  connectDatabase,
  MONGO_URI,
};
