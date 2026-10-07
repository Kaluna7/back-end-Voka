const express = require('express');
const { getEnv } = require('../config/env');
const { handleRealtimeNotification } = require('../services/googlePlayBillingService');

const router = express.Router();

/**
 * Google Play RTDN via Pub/Sub push subscription.
 * Push endpoint: https://<api-host>/api/billing/google/rtdn?token=<GOOGLE_PLAY_RTDN_TOKEN>
 * Always answer 2xx once handled so Pub/Sub doesn't retry forever.
 */
router.post('/google/rtdn', async (req, res) => {
  const expected = getEnv('GOOGLE_PLAY_RTDN_TOKEN');
  if (expected && req.query?.token !== expected) {
    return res.status(401).json({ message: 'Invalid token.' });
  }
  try {
    const result = await handleRealtimeNotification(req.body);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error('[google-play] RTDN failed', error?.message || error);
    // 500 → Pub/Sub retries later (e.g. Google API hiccup).
    return res.status(500).json({ message: 'RTDN processing failed.' });
  }
});

module.exports = router;
