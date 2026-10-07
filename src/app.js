const path = require('path');
const express = require('express');
const cors = require('cors');
const healthRoutes = require('./routes/healthRoutes');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const billingRoutes = require('./routes/billingRoutes');
const characterRoutes = require('./routes/characterRoutes');
const companionRoutes = require('./routes/companionRoutes');
const voiceAgentRoutes = require('./routes/voiceAgentRoutes');
const {
  securityHeaders,
  sanitizeErrorResponses,
  rejectInjection,
  rateLimit,
  requireUserAuth,
} = require('./middleware/security');

const app = express();

app.disable('x-powered-by');
// Only trust X-Forwarded-For when explicitly running behind a proxy (otherwise clients could
// spoof their IP and dodge rate limits). e.g. TRUST_PROXY=1 behind one load balancer.
if (process.env.TRUST_PROXY) {
  app.set('trust proxy', /^\d+$/.test(process.env.TRUST_PROXY) ? Number(process.env.TRUST_PROXY) : process.env.TRUST_PROXY);
}

app.use(securityHeaders);
app.use(sanitizeErrorResponses);

// The mobile app sends no Origin header. Browsers are only allowed from CORS_ORIGINS.
const allowedOrigins = String(process.env.CORS_ORIGINS || '')
  .split(',')
  .map(item => item.trim())
  .filter(Boolean);
app.use(
  cors({
    origin: (origin, callback) => callback(null, !origin || allowedOrigins.includes(origin)),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 600,
  }),
);

// Small bodies for auth; uploads (avatars, audio) need more room on user routes.
app.use('/api/auth', express.json({ limit: '20kb' }));
app.use(express.json({ limit: '25mb' }));
app.use(rejectInjection);

app.use('/static', express.static(path.join(__dirname, '../public'), { dotfiles: 'deny', index: false }));

// Broad per-IP ceiling for everything under /api.
app.use('/api', rateLimit({ name: 'api', windowMs: 60 * 1000, max: 600 }));

app.use('/api', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api', companionRoutes);
// Every user-scoped route requires a token issued to that same user.
app.use('/api/users/:userId', requireUserAuth);
app.use('/api/users', userRoutes);
app.use('/api/users', dashboardRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/users', characterRoutes);
app.use('/api/internal/voice-agent', voiceAgentRoutes);

app.use((_req, res) => {
  res.status(404).json({ message: 'Tidak ditemukan.', code: 'NOT_FOUND' });
});

app.use((error, _req, res, _next) => {
  if (error?.type === 'entity.too.large') {
    return res.status(413).json({ message: 'Data terlalu besar.', code: 'PAYLOAD_TOO_LARGE' });
  }
  if (error?.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'Format data tidak valid.', code: 'INVALID_JSON' });
  }
  // Never leak stack traces or internal messages to clients.
  console.error(error);
  return res.status(500).json({ message: 'Terjadi kesalahan di server.' });
});

module.exports = app;
