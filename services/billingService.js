const Helper = require('../helper/helper');
const  _ = require('lodash');
const config = require('../config');
const { default: axios } = require('axios');
const moment = require('moment');

class BillingService{
    constructor({subscriptionRepository, billingHistoryRepository, waleeRepository}){
        this.subscriptionRepository = subscriptionRepository;
        this.billingHistoryRepository = billingHistoryRepository;
        this.waleeRepository = waleeRepository;
    }

    // billing functions
    async billingSuccess(user, subscription, response, packageObj, transaction_id, first_time_billing, response_time, micro){

        let serverDate = new Date();
        let localDate = Helper.setDateWithTimezone(serverDate);
        let nextBilling = _.clone(localDate);
        nextBilling = nextBilling.setHours(nextBilling.getHours() + packageObj.package_duration);

        let updatedSubscription = undefined;

        console.log("warning", "first time billing", first_time_billing)
        if (!first_time_billing) {
            // Update subscription
            let subscriptionObj = {};
            subscriptionObj.subscription_status = 'billed';
            subscriptionObj.auto_renewal = true;
            subscriptionObj.is_billable_in_this_cycle = false;
            subscriptionObj.is_allowed_to_stream = true;
            subscriptionObj.last_billing_timestamp = localDate;
            subscriptionObj.next_billing_timestamp = nextBilling;
            subscriptionObj.amount_billed_today =  (subscription.amount_billed_today + packageObj.price_point_pkr);
            subscriptionObj.total_successive_bill_counts = ((subscription.total_successive_bill_counts ? subscription.total_successive_bill_counts : 0) + 1);
            subscriptionObj.consecutive_successive_bill_counts = ((subscription.consecutive_successive_bill_counts ? subscription.consecutive_successive_bill_counts : 0) + 1);
            subscriptionObj.subscribed_package_id = packageObj._id;
            subscriptionObj.queued = false;
            subscriptionObj.payment_source = subscription.payment_source;
            if(subscription.ep_token){
                subscriptionObj.ep_token = subscription.ep_token;
            }
            
            updatedSubscription = await this.subscriptionRepository.updateSubscription(subscription._id, subscriptionObj);
        } else {
            subscription.subscription_status = 'billed';
            subscription.auto_renewal = true;
            subscription.is_billable_in_this_cycle = false;
            subscription.is_allowed_to_stream = true;
            subscription.last_billing_timestamp = localDate;
            subscription.next_billing_timestamp = nextBilling;
            subscription.amount_billed_today =  (subscription.amount_billed_today + packageObj.price_point_pkr);
            subscription.total_successive_bill_counts = ((subscription.total_successive_bill_counts ? subscription.total_successive_bill_counts : 0) + 1);
            subscription.consecutive_successive_bill_counts = ((subscription.consecutive_successive_bill_counts ? subscription.consecutive_successive_bill_counts : 0) + 1);
            subscription.subscribed_package_id = packageObj._id;
            subscription.queued = false;

            if(subscription.affiliate_unique_transaction_id && subscription.affiliate_mid){
                subscription.should_affiliation_callback_sent = true;
            }else{
                subscription.should_affiliation_callback_sent = false;
            }
            
            updatedSubscription = await this.subscriptionRepository.createSubscription(subscription);

            // Check for the affiliation callback
            if( updatedSubscription.affiliate_unique_transaction_id && 
                updatedSubscription.affiliate_mid && 
                updatedSubscription.is_affiliation_callback_executed === false &&
                updatedSubscription.should_affiliation_callback_sent === true){
                if(updatedSubscription.affiliate_mid == 'walee' || ((updatedSubscription.source === "HE" || updatedSubscription.source === "affiliate_web") && updatedSubscription.affiliate_mid != "1")) {
                    // Send affiliation callback
                    this.sendAffiliationCallback(
                        updatedSubscription.affiliate_unique_transaction_id, 
                        updatedSubscription.affiliate_mid,
                        user,
                        updatedSubscription._id,
                        packageObj._id,
                        packageObj.paywall_id,
                        packageObj.price_point_pkr,
                        updatedSubscription.source
                        );
                }
            }

            // send walee subscription hook - only first time / difference of joining and charging is less than 7 days
            let today = moment().tz("Asia/Karachi");
            let joiningDate = moment(updatedSubscription.added_dtm);
            console.log('Walee - ', today, ' - ', joiningDate);

            // diff should be of 7 days which is 168 hours.
            let diff = today.diff(joiningDate, 'hours');
            console.log('Walee - Diff', diff, JSON.stringify(updatedSubscription));

            if(updatedSubscription.affiliate_mid === 'walee'){
                console.log('Walee - Triggered Subscription API')
                await this.waleeRepository.successfulSubscription({
                    subscription_id: updatedSubscription._id,
                    utm_source: user.source,
                    userPhone: user.msisdn,
                    totalPrice: packageObj.price_point_pkr
                });
            }
        }
        
        let history = {};
        history.micro_charge = (updatedSubscription  && updatedSubscription.try_micro_charge_in_next_cycle) ? updatedSubscription.try_micro_charge_in_next_cycle : false;
        history.user_id = user._id;
        history.msisdn = user.msisdn;
        history.subscription_id =  updatedSubscription ? updatedSubscription._id : subscription._id ;
        history.subscriber_id = subscription.subscriber_id;
        history.paywall_id = packageObj.paywall_id;
        history.package_id = packageObj._id;
        history.transaction_id = transaction_id;
        history.operator_response = response.full_api_response;
        history.response_time = response_time;
        history.price = packageObj.price_point_pkr;
        history.billing_status = "Success";
        history.source = subscription.source;
        history.operator = subscription.payment_source;
        await this.billingHistoryRepository.createBillingHistory(history);
    }

    async billingFailed(user, subscription, response, packageObj, transaction_id, first_time_billing, response_time, micro){
        console.log("success", "billing failed: package obj", packageObj.price_point_pkr);

        let checkSubscription = await this.subscriptionRepository.getSubscriptionByPackageId(user._id, packageObj._id);

        // Add history record
        let history = {};
        history.user_id = user._id;
        history.msisdn = user.msisdn;
        history.micro_charge = micro !== undefined ? micro : false;
        history.price = packageObj.price_point_pkr;
        history.source = subscription.source ? subscription.source : checkSubscription.source;
        if(checkSubscription) history.subscription_id = checkSubscription._id;
        history.paywall_id = packageObj.paywall_id;
        history.package_id = packageObj._id;
        history.transaction_id = transaction_id;
        history.operator_response = response.full_api_response;
        history.response_time = response_time;
        history.billing_status = first_time_billing ? "direct-billing-tried-but-failed" : "switch-package-request-tried-but-failed";
        history.operator = subscription.payment_source;
        await this.billingHistoryRepository.createBillingHistory(history);
    }

    async sendAffiliationCallback(tid, mid, user, subscription_id, package_id, paywall_id, price, source) {
        let combinedId = tid + "*" +mid;

        let history = {};
        history.user_id = user._id;
        history.msisdn = user.msisdn;
        history.paywall_id = paywall_id;
        history.subscription_id = subscription_id;
        history.package_id = package_id;
        history.transaction_id = combinedId;
        history.operator = 'telenor';

        console.log(`Sending Affiliate Marketing Callback Having TID - ${tid} - MID ${mid}`);
        this.sendCallBackToIdeation(mid, tid, subscription_id, user.msisdn, price, source).then(async (fulfilled) => {
            let updated = await this.subscriptionRepository.updateSubscription(subscription_id, {is_affiliation_callback_executed: true});
            if(updated){
                console.log(`Successfully Sent Affiliate Marketing Callback Having TID - ${tid} - MID ${mid} - Ideation Response - ${fulfilled}`);
                history.operator_response = fulfilled;
                history.billing_status = "Affiliate callback sent";
                await this.billingHistoryRepository.createBillingHistory(history);
            }
        })
        .catch(async  (error) => {
            console.log(`Affiliate - Marketing - Callback - Error - Having TID - ${tid} - MID ${mid}`, error);
            history.operator_response = error.response.data;
            history.billing_status = "Affiliate callback error";
            await this.billingHistoryRepository.createBillingHistory(history);
        });
    }

    async sendCallBackToIdeation(mid, tid)  {
        var url; 
        if (mid === "1569") {
            url = config.ideation_callback_url + `p?mid=${mid}&tid=${tid}`;
        } else if (mid === "goonj"){
            url = config.ideation_callback_url2 + `?txid=${tid}`;
        } else if (mid === "aff3" || mid === "aff3a"){
            url = config.ideation_callback_url3 + `${tid}`;
        } else if (mid === "affpro"){
            url = config.ideation_Affpro_callback + `${tid}`;
        } else if (mid === "1" || mid === "gdn" ){
            return new Promise((resolve,reject) => { reject(null)})
        }

        console.log("warning - ", "affiliate url - ", "mid - ", mid, " url - ", url)
        return new Promise(function(resolve, reject) {
            axios({
                method: 'post',
                url: url,
                headers: {'Content-Type': 'application/x-www-form-urlencoded' }
            }).then(function(response){
                console.log("affpro", response.data);
                resolve(response.data);
            }).catch(function(err){
                console.log("affpro - err", err.message);
                reject(err);
            });
        });
    }
}
module.exports = BillingService;