const express = require('express');
const { signup, googleAuth, login } = require('../controllers/authController');

const router = express.Router();

router.post('/signup', signup);
router.post('/google', googleAuth);
router.post('/login', login);

module.exports = router;
