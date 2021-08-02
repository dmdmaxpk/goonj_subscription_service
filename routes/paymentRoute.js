const express = require('express');
const router = express.Router();
const controller = require('../controllers/paymentController');

router.route('/sources')
    .get(controller.paymentSources);

router.route('/subscribe')
    .post(controller.subscribe);

router.route('/unsubscribe')
    .post(controller.unsubscribe);

router.route('/sms-unsub').post(controller.unsubscribe);

router.route('/ccd-unsubscribe')
    .post(controller.unsubscribe);

router.route('/status').post(controller.status);

router.route('/getAllSubs')
    .get(controller.getAllSubscriptions);

router.route('/recharge')
    .post(controller.recharge);

router.route('/delete')
    .get(controller.delete);

module.exports = router;
