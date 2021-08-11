const Helper = require('../helper/helper');
const  _ = require('lodash');
const config = require('../config');
const { default: axios } = require('axios');

class BillingService{
    constructor({subscriptionRepository, billingHistoryRepository}){
        this.subscriptionRepository = subscriptionRepository;
        this.billingHistoryRepository = billingHistoryRepository;
    }

    // billing functions
    async billingSuccess(user, subscription, response, packageObj, transaction_id, first_time_billing){

        let serverDate = new Date();
        let localDate = Helper.setDateWithTimezone(serverDate);
        let nextBilling = _.clone(localDate);
        nextBilling = nextBilling.setHours(nextBilling.getHours() + packageObj.package_duration);

        let updatedSubscription = undefined;
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
            
            await this.subscriptionRepository.updateSubscription(subscription._id, subscriptionObj);
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
                if((updatedSubscription.source === "HE" || updatedSubscription.source === "affiliate_web") && updatedSubscription.affiliate_mid != "1") {
                    // Send affiliation callback
                    this.sendAffiliationCallback(
                        updatedSubscription.affiliate_unique_transaction_id, 
                        updatedSubscription.affiliate_mid,
                        user._id,
                        updatedSubscription._id,
                        updatedSubscription.subscriber_id,
                        packageObj._id,
                        packageObj.paywall_id
                        );
                }
            }

        }
        // subscriptionRepo.createSubscription(subscription);
        // Add history record
        let history = {};
        history.micro_charge = (updatedSubscription  && updatedSubscription.try_micro_charge_in_next_cycle) ? updatedSubscription.try_micro_charge_in_next_cycle : false;
        history.user_id = user._id;
        history.subscription_id =  updatedSubscription ? updatedSubscription._id : subscription._id ;
        history.subscriber_id = subscription.subscriber_id;
        history.paywall_id = packageObj.paywall_id;
        history.package_id = packageObj._id;
        history.transaction_id = transaction_id;
        history.operator_response = response;
        history.price = packageObj.price_point_pkr;
        history.billing_status = "Success";
        history.source = subscription.source;
        history.operator = subscription.payment_source;
        await this.billingHistoryRepository.createBillingHistory(history);
    }

    async billingFailed(user, subscription, response, packageObj, transaction_id, first_time_billing){
        console.log("billing failed: subscription obj", subscription._id, 'first_time_billing', first_time_billing);

        let checkSubscription = await this.subscriptionRepository.getSubscriptionByPackageId(user._id, packageObj._id);
        if(checkSubscription === null){
            subscription.subscription_status = 'none';
            subscription.is_allowed_to_stream = false;

            // creating subscription with None status in case of New user Failed Billing
            checkSubscription = await this.subscriptionRepository.createSubscription(subscription);
        }
        // Add history record
        let history = {};
        history.user_id = user._id;
        history.source = subscription.source ? subscription.source : checkSubscription.source;
        history.subscription_id = checkSubscription._id;
        history.paywall_id = packageObj.paywall_id;
        history.package_id = packageObj._id;
        history.transaction_id = transaction_id;
        history.operator_response = response;
        history.billing_status = first_time_billing ? "direct-billing-tried-but-failed" : "switch-package-request-tried-but-failed";
        history.operator = subscription.payment_source;
        await this.billingHistoryRepository.createBillingHistory(history);
    }

    async sendAffiliationCallback(tid, mid, user_id, subscription_id, subscriber_id, package_id, paywall_id) {
        let combinedId = tid + "*" +mid;

        let history = {};
        history.user_id = user_id;
        history.paywall_id = paywall_id;
        history.subscription_id = subscription_id;
        history.subscriber_id = subscriber_id;
        history.package_id = package_id;
        history.transaction_id = combinedId;
        history.operator = 'telenor';

        console.log(`Sending Affiliate Marketing Callback Having TID - ${tid} - MID ${mid}`);
        this.sendCallBackToIdeation(mid, tid).then(async (fulfilled) => {
            let updated = await this.subscriptionRepo.updateSubscription(subscription_id, {is_affiliation_callback_executed: true});
            if(updated){
                console.log(`Successfully Sent Affiliate Marketing Callback Having TID - ${tid} - MID ${mid} - Ideation Response - ${fulfilled}`);
                history.operator_response = fulfilled;
                history.billing_status = "Affiliate callback sent";
                // await  addHistory(history);
            }
        })
        .catch(async  (error) => {
            console.log(`Affiliate - Marketing - Callback - Error - Having TID - ${tid} - MID ${mid}`, error);
            history.operator_response = error.response.data;
            history.billing_status = "Affiliate callback error";
            // await  addHistory(history);
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
        } else if (mid === "1" || mid === "gdn" ){
            return new Promise((resolve,reject) => { reject(null)})
        }
        console.log("url",url)
        return new Promise(function(resolve, reject) {
            axios({
                method: 'post',
                url: url,
                headers: {'Content-Type': 'application/x-www-form-urlencoded' }
            }).then(function(response){
                resolve(response.data);
            }).catch(function(err){
                reject(err);
            });
        });
    }
}
module.exports = BillingService;