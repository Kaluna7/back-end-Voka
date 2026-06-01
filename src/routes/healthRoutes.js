const express = require('express');
const mongoose = require('mongoose');

const router = express.Router();

router.get('/health', (_, res) => {
  res.json({
    status: 'ok',
    message: 'Voka backend is running',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
  });
});

module.exports = router;
