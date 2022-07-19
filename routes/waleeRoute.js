const express = require('express');
const router = express.Router();
const controller = require('../controllers/WaleeController');

router.route('/link-click').get(controller.linkClick);
router.route('/pageview').get(controller.pageview);
router.route('/subscription-success').post(controller.subscription);

module.exports = router;