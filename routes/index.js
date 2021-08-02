const express = require('express');
const router = express.Router();

// Service Label
router.get('/', (req, res) => res.send("User Microservice"));

// Payment routes
router.use('/payment',    require('./paymentRoute'));

router.use('/ccd',    require('./ccd'));

module.exports = router;