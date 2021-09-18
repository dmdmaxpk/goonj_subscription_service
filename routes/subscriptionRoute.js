const express = require('express');
const router = express.Router();
const controller = require('../controllers/SubscriptionController');

router.route('/affiliate-subscriptions-count').get(controller.count_affiliate_subscriptions);
router.route('/subscribe').post(controller.subscribe);
router.route('/unsubscribe').post(controller.unsubscribe);
router.route('/sms-unsub').post(controller.unsubscribe);
router.route('/ccd-unsubscribe').post(controller.ccd_unsubscribe);
router.route('/status').post(controller.status);
router.route('/getAllSubs').get(controller.getAllSubscriptions);
router.route('/recharge').post(controller.recharge);
router.route('/get-subscription-by-package-id').get(controller.getSubscriptionByPackageId)
router.route('/get-packages-of-subscriber').get(controller.getPackagesOfSubscriber)
router.route('/mark-double-charged-as-active').get(controller.markDoubleChargedAsActive)

module.exports = router;
