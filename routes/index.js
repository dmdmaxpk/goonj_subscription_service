const express = require('express');
const router = express.Router();

// Service Label
router.get('/', (req, res) => res.send("Subscription Service Running"));

// Payment routes
router.use('/subscription',    require('./subscriptionRoute'));

router.use('/ccd',    require('./ccd'));

router.use('/walee',    require('./waleeRoute'));

module.exports = router;