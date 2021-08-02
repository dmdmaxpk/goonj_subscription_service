const express = require('express');
const router = express.Router();
const subscriptionController = require('../controllers/SubscriptionController');

router.route('/details').get(
    // authMiddleWare.authenticateCcdToken, aclMiddleWare.checkRole,
    subscriptionController.getSubscriptionDetails);
    
module.exports = router;