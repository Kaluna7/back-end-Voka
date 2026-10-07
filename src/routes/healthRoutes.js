const express = require('express');
const mongoose = require('mongoose');

const router = express.Router();

router.get('/health', (_, res) => {
  res.json({
    status: 'ok',
    message: 'Moocha backend is running',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    databaseName: mongoose.connection.name || '',
  });
});

module.exports = router;
