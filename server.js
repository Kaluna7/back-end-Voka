// override: true → nilai dari .env (PORT=5000) SELALU menang,
// tidak bisa ditimpa oleh PORT yang ter-inject dari environment terminal/IDE.
require('dotenv').config({ override: true });

const http = require('http');
const app = require('./src/app');
const { connectDatabase } = require('./src/config/database');
const { getRedisClient } = require('./src/config/redis');
const { validateEnv } = require('./src/config/env');
const { ensureVoiceAgentPublicUrl } = require('./src/config/ensureVoiceAgentPublicUrl');
const { registerAllRealtimeSockets } = require('./src/realtime/registerRealtimeSockets');
const { loadCompanionCache } = require('./src/services/companionCatalogService');

// Selalu 5000 (lihat .env). Fallback 5000 jika baris PORT di .env terhapus.
const PORT = Number(process.env.PORT || 5000);

const startServer = async () => {
  try {
    validateEnv();
    const tunnel = await ensureVoiceAgentPublicUrl(PORT);
    if (tunnel?.ok && tunnel.url) {
      console.log(`Voice Agent think base: ${tunnel.url} (source=${tunnel.source})`);
    }
    const mongoUri = await connectDatabase();
    const dbName = (() => {
      try {
        return new URL(mongoUri.replace('mongodb://', 'http://')).pathname.replace(/^\//, '') || 'Moocha';
      } catch {
        const tail = mongoUri.split('/').pop() || '';
        return tail.split('?')[0] || 'Moocha';
      }
    })();
    console.log(`Connected to MongoDB: ${dbName}`);
    await getRedisClient();
    await loadCompanionCache({ force: true });
    console.log('Companion catalog cache ready');
    const server = http.createServer(app);
    registerAllRealtimeSockets(server);
    server.on('error', error => {
      if (error.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use. Stop the old Moocha backend instance, then start again.`);
        process.exit(1);
      }
      throw error;
    });
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`Moocha backend running on http://0.0.0.0:${PORT}`);
      if (process.env.VOICE_AGENT_PUBLIC_BASE_URL) {
        console.log(
          `Deepgram Voice Agent LLM gateway: ${process.env.VOICE_AGENT_PUBLIC_BASE_URL}/api/internal/voice-agent/chat/completions`,
        );
      }
    });
  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
};

startServer();
