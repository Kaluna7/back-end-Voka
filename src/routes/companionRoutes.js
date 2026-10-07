const express = require('express');
const { listCompanions } = require('../controllers/companionController');

const router = express.Router();

router.get('/companions', listCompanions);

module.exports = router;
