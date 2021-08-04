const express = require('express');
const router = express.Router();

// Service Label
router.get('/', (req, res) => res.send("Subscription Microservice"));

// Payment routes
router.use('/subscription',    require('./subscriptionRoute'));

router.use('/ccd',    require('./ccd'));

module.exports = router;