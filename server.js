require('dotenv').config();

const http = require('http');
const app = require('./src/app');
const { connectDatabase } = require('./src/config/database');
const { validateEnv } = require('./src/config/env');
const { registerAllRealtimeSockets } = require('./src/realtime/registerRealtimeSockets');

const PORT = Number(process.env.PORT || 5000);

const startServer = async () => {
  try {
    validateEnv();
    await connectDatabase();
    console.log('Connected to MongoDB: Voka');
    const server = http.createServer(app);
    registerAllRealtimeSockets(server);
    server.listen(PORT, () => {
      console.log(`Voka backend running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
};

startServer();
