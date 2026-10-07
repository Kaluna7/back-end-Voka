const express = require('express');
const {
  signup,
  googleAuth,
  login,
  requestSignupCode,
  requestPasswordReset,
  resetPassword,
} = require('../controllers/authController');

const { rateLimit, emailKey } = require('../middleware/security');

const router = express.Router();

const MINUTE = 60 * 1000;
// Per IP + email: stops guessing one account's password or codes.
const loginPerAccount = rateLimit({ name: 'login-acct', windowMs: 15 * MINUTE, max: 8, keyFn: emailKey });
// Per IP: stops trying many accounts from one device.
const loginPerIp = rateLimit({ name: 'login-ip', windowMs: 15 * MINUTE, max: 40 });
const codeRequests = rateLimit({ name: 'code-req', windowMs: 15 * MINUTE, max: 5, keyFn: emailKey });
const codeRequestsPerIp = rateLimit({ name: 'code-req-ip', windowMs: 60 * MINUTE, max: 20 });
const codeChecks = rateLimit({ name: 'code-check', windowMs: 15 * MINUTE, max: 10, keyFn: emailKey });
const googleLimit = rateLimit({ name: 'google', windowMs: 15 * MINUTE, max: 30 });

router.post('/signup/request-code', codeRequestsPerIp, codeRequests, requestSignupCode);
router.post('/signup', codeChecks, signup);
router.post('/google', googleLimit, googleAuth);
router.post('/login', loginPerIp, loginPerAccount, login);
router.post('/password/forgot', codeRequestsPerIp, codeRequests, requestPasswordReset);
router.post('/password/reset', codeChecks, resetPassword);

module.exports = router;
