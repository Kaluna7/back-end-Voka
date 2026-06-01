const express = require('express');
const cors = require('cors');
const healthRoutes = require('./routes/healthRoutes');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');

const app = express();

app.use(cors());
app.use(express.json({ limit: '25mb' }));

app.use('/api', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/users', dashboardRoutes);

app.use((error, _, res, __) => {
  console.error(error);
  res.status(500).json({ message: 'Terjadi kesalahan di server.' });
});

module.exports = app;
