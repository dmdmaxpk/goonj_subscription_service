const container = require('../configurations/container');
const Helper = require('../helper/helper');
const subscriptionRepo = container.resolve("subscriptionRepository");
const billingHistoryRepo = container.resolve("billingHistoryRepository");

// billing functions
billingSuccess = async(user, subscription, packageObj) => {

    let serverDate = new Date();
    let localDate = Helper.setDateWithTimezone(serverDate);
    let nextBilling = _.clone(localDate);
    nextBilling = nextBilling.setHours(nextBilling.getHours() + packageObj.package_duration);

    let updatedSubscription = undefined;
    // if (!first_time_billing) {
    //     // Update subscription

    //     let subscriptionObj = {};
    //     subscriptionObj.subscription_status = 'billed';
    //     subscriptionObj.auto_renewal = true;
    //     subscriptionObj.is_billable_in_this_cycle = false;
    //     subscriptionObj.is_allowed_to_stream = true;
    //     subscriptionObj.last_billing_timestamp = localDate;
    //     subscriptionObj.next_billing_timestamp = nextBilling;
    //     subscriptionObj.amount_billed_today =  (subscription.amount_billed_today + packageObj.price_point_pkr);
    //     subscriptionObj.total_successive_bill_counts = ((subscription.total_successive_bill_counts ? subscription.total_successive_bill_counts : 0) + 1);
    //     subscriptionObj.consecutive_successive_bill_counts = ((subscription.consecutive_successive_bill_counts ? subscription.consecutive_successive_bill_counts : 0) + 1);
    //     subscriptionObj.subscribed_package_id = packageObj._id;
    //     subscriptionObj.queued = false;
    //     subscriptionObj.payment_source = subscription.payment_source;
    //     if(subscription.ep_token){
    //         subscriptionObj.ep_token = subscription.ep_token;
    //     }
        
    //     await this.updateSubscription(subscription._id, subscriptionObj);
    // } else {
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
        
        updatedSubscription = await subscriptionRepo.createSubscription(subscription);

        // Check for the affiliation callback
        if( updatedSubscription.affiliate_unique_transaction_id && 
            updatedSubscription.affiliate_mid && 
            updatedSubscription.is_affiliation_callback_executed === false &&
            updatedSubscription.should_affiliation_callback_sent === true){
            if((updatedSubscription.source === "HE" || updatedSubscription.source === "affiliate_web") && updatedSubscription.affiliate_mid != "1") {
                // Send affiliation callback
                subscriptionRepo.sendAffiliationCallback(
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

    // }
    subscriptionRepo.createSubscription(subscription);
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
    await billingHistoryRepo.createBillingHistory(history);
}

module.exports = {
    billingSuccess: billingSuccess
}