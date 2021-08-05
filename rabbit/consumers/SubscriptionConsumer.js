const config = require('../../config');
const moment = require('moment');
const axios = require("axios");
const { response } = require('express');
const helper = require('../../helper/helper');
const  _ = require('lodash');

class SubscriptionConsumer {

    constructor({ subscriptionRepository, billingHistoryRepository, messageRepository }) {
        this.subscriptionRepo = subscriptionRepository;
        this.billingHistoryRepo = billingHistoryRepository;
        this.messageRepo = messageRepository;
    }

    async consume(messageObject) {
        let user = messageObject.user;
        let mPackage = messageObject.package;
        let subscription = messageObject.subscription;
        let mcDetails = messageObject.mcDetails;
        let transaction_id = messageObject.transaction_id;
        let returnObject = messageObject.returnObject;


        if(returnObject){
            let returnStatus = returnObject.status;
            let response_time = 0;
            if (returnObject.hasOwnProperty('api_response_time')){
                response_time = returnObject.api_response_time;
            }

            if(returnStatus === 'Success'){
                
                // Success billing
                let serverDate = new Date();
                let localDate = helper.setDateWithTimezone(serverDate);
                let nextBilling = _.clone(localDate);
                nextBilling = nextBilling.setHours(nextBilling.getHours() + mPackage.package_duration);

                // Update subscription
                let subscriptionObj = {};
                subscriptionObj.subscription_status = 'billed';
                subscriptionObj.auto_renewal = true;
                subscriptionObj.is_billable_in_this_cycle = false;
                subscriptionObj.is_allowed_to_stream = true;
                subscriptionObj.last_billing_timestamp = localDate;
                subscriptionObj.next_billing_timestamp = nextBilling;
                subscriptionObj.amount_billed_today = subscription.amount_billed_today + (mcDetails && mcDetails.micro_charge) ? mcDetails.micro_price : mPackage.price_point_pkr;
                subscriptionObj.total_successive_bill_counts = ((subscription.total_successive_bill_counts ? subscription.total_successive_bill_counts : 0) + 1);
                subscriptionObj.consecutive_successive_bill_counts = ((subscription.consecutive_successive_bill_counts ? subscription.consecutive_successive_bill_counts : 0) + 1);
                subscriptionObj.queued = false;
                
                // Fields for micro charging
                subscriptionObj.try_micro_charge_in_next_cycle = false;
                subscriptionObj.micro_price_point = 0;
                subscriptionObj.priority = 0;
                await this.subscriptionRepo.updateSubscription(subscription._id, subscriptionObj);
                rabbitMq.acknowledge(message);

                // Check for the affiliation callback
                // if(subscription.affiliate_unique_transaction_id && subscription.affiliate_mid &&
                //     subscription.is_affiliation_callback_executed === false &&
                //     subscription.should_affiliation_callback_sent === true){
                //     if((subscription.source === "HE" || subscription.source === "affiliate_web") && subscription.affiliate_mid != "1") {
                //         this.sendAffiliationCallback(subscription.affiliate_unique_transaction_id, subscription.affiliate_mid, user._id, subscription._id, subscription.subscriber_id, mPackage._id, mPackage.paywall_id);
                //     }
                // }

                if(mcDetails && mcDetails.micro_charge){
                    console.log('Micro charge success');
                    this.billingHistoryRepo.assembleBillingHistory(user, subscription, mPackage, returnObject.api_response, returnStatus, response_time, transaction_id, true, mcDetails.micro_price);
                }else{
                    console.log('Full charge success');
                    this.billingHistoryRepo.assembleBillingHistory(user, subscription, mPackage, returnObject.api_response, returnStatus, response_time, transaction_id, false, mPackage.price_point_pkr);
                }
                
            }else if(returnStatus === 'ExcessiveBilling'){
                // excessive billings
                rabbitMq.acknowledge(message);
                this.logExcessiveBilling(mPackage, user, subscription, response_time);
            }else if(returnStatus === 'ExcessiveMicroBilling'){
                // excessive micro billings
                rabbitMq.acknowledge(message);
                this.logExcessiveMicroBilling(mPackage, user, subscription, mcDetails.micro_price, transaction_id, response_time);
            }else{
                await this.assignGracePeriod(subscription, user, mPackage, false, returnObject.api_response, response_time, transaction_id);
                rabbitMq.acknowledge(message);
            }
        }else{
            console.log('Return object not found!');
            rabbitMq.acknowledge(message);
        }
    }

    async logExcessiveBilling(packageObj, user, subscription, response_time){
        
        // await this.subscriptionRepo.markSubscriptionInactive(subscription._id);
        await this.subscriptionRepo.unQueue(subscription._id);
        // this.messageRepo.shootExcessiveBillingEmail(subscription._id);

        // Assembling history
        let history = {};
        history.user_id = user._id;
        history.package_id = packageObj._id;
        history.paywall_id = packageObj.paywall_id;
        history.subscription_id = subscription._id;
        history.subscriber_id = subscription.subscriber_id;
        history.transaction_id = subscription.transaction_id;

        history.operator_response = {"message": `Subscription ${subscription._id} has exceeded their billing limit. Email sent.`};
        history.billing_status = "billing_exceeded";
        history.response_time = response_time;

        // pushing to Billing History queue
        this.billingHistoryRepo.createBillingHistory(history);
    }
    
    async logExcessiveMicroBilling(packageObj, user, subscription, micro_price, transaction_id, response_time){
        // let emailSubject ="Excessive MicroCharing Email";
        // let emailToSend = "paywall@dmdmax.com.pk";
        // let emailText = `Subscription id ${subscription._id} is trying to micro charge on a price greater than package price. Package price is ${packageObj.price_point_pkr} and system tried to charge ${micro_price}`;
        // await this.emailService.sendEmail(emailSubject,emailText,emailToSend);
        
        let billingResponse = "micro-price-point-is-greater-than-package-price-so-didnt-try-charging-attempt";
        this.billingHistoryRepo.assembleBillingHistory(user, subscription, packageObj, billingResponse, 'micro-charging-exceeded', response_time, transaction_id, true, 0);
        
        console.log('logExcessiveMicroBilling', subscription._id);
        await this.subscriptionRepo.updateSubscription(subscription._id, {active:false, queued:false, is_billable_in_this_cycle: false});
    }

    // ASSIGN GRACE PERIOD
    async assignGracePeriod(subscription, user, packageObj, is_manual_recharge, error, response_time, transaction_id) {
        let expiry_source = undefined;

        let subscriptionObj = {};
        subscriptionObj.queued = false;
        let historyStatus;
    
        if((subscription.subscription_status === 'billed' || subscription.subscription_status === 'trial') && subscription.auto_renewal === true){
            // The subscriber is eligible for grace hours, depends on the current subscribed package
            
            let nextBillingDate = new Date();
            nextBillingDate.setHours(nextBillingDate.getHours() + config.time_between_billing_attempts_hours);
            
            subscriptionObj.subscription_status = 'graced';
            subscriptionObj.is_allowed_to_stream = false;
            subscriptionObj.next_billing_timestamp = nextBillingDate;
            subscriptionObj.date_on_which_user_entered_grace_period = new Date();
            subscriptionObj.is_billable_in_this_cycle = false;
            subscriptionObj.try_micro_charge_in_next_cycle = false;
            subscriptionObj.micro_price_point = 0;
            subscriptionObj.priority = 0;
            
            historyStatus="graced";
            //Send acknowldement to user
            // let link = 'https://www.goonj.pk/goonjplus/open';
            // let message = "You've been awarded a grace period of "+packageObj.streamable_grace_hours+" hours. Click below link to open Goonj.\n"+link
            // this.messageRepo.sendMessageToQueue(message, user.msisdn);

        }else if(subscription.subscription_status === 'graced' && subscription.auto_renewal === true){
            // Already in grace, check if given time has been passed in grace, stop streaming
    
            let nowDate = moment();
            let timeInGrace = moment.duration(nowDate.diff(subscription.date_on_which_user_entered_grace_period));
            let hoursSpentInGracePeriod = timeInGrace.asHours();
            console.log("hoursSpentInGracePeriod",hoursSpentInGracePeriod);
    
            if (is_manual_recharge){
                let message = "You have insufficient amount for Goonj TV subscription. Please recharge your account for watching Live channels on Goonj TV. Stay Safe";
                this.messageRepo.sendMessageToQueue(message, user.msisdn);
            }
    
            if (hoursSpentInGracePeriod > packageObj.grace_hours){
                subscriptionObj.subscription_status = 'expired';
                subscriptionObj.consecutive_successive_bill_counts = 0;
                subscriptionObj.auto_renewal = false;
                subscriptionObj.is_allowed_to_stream = false;
                subscriptionObj.is_billable_in_this_cycle = false;
                subscriptionObj.try_micro_charge_in_next_cycle = false;
                subscriptionObj.micro_price_point = 0;
                subscriptionObj.priority = 0;

                expiry_source = "system-after-grace-end";

                //Send acknowledgement to user
                let link = 'https://www.goonj.pk/goonjplus/subscribe';
                let message = 'You package to Goonj TV has expired, click below link to subscribe again.\n'+link;
                this.messageRepo.sendMessageToQueue(message, user.msisdn);
                historyStatus = "expired";

            }else if(packageObj.is_micro_charge_allowed === true && hoursSpentInGracePeriod > 8 && hoursSpentInGracePeriod <= 24){
                console.log("Micro Charging Activated for: ",subscription._id);
                subscriptionObj.subscription_status = 'graced';
                historyStatus = "graced";

                subscriptionObj = this.activateMicroCharging(subscription, packageObj, subscriptionObj);
                console.log("Micro Charging Activated Subscription Object Returned:",subscriptionObj);
            }else{
                let nextBillingDate = new Date();
                nextBillingDate.setHours(nextBillingDate.getHours() + config.time_between_billing_attempts_hours);
                
                subscriptionObj.subscription_status = 'graced';
                subscriptionObj.next_billing_timestamp = nextBillingDate;
                historyStatus = "graced";
    
                //TODO set is_allowed_to_stream to false if 24 hours have passed in grace period
                let last_billing_timestamp = moment(subscription.last_billing_timestamp);
                var hours;
    
                if (subscription.last_billing_timestamp) {
                    let now = moment()
                    let difference = moment.duration(now.diff(last_billing_timestamp));
                    hours = difference.asHours();
                } else {
                    hours = hoursSpentInGracePeriod;
                }
                console.log("Hours since last payment", hours);
                subscriptionObj.try_micro_charge_in_next_cycle = false;
                subscriptionObj.micro_price_point = 0;
                subscriptionObj.priority = 0;
            }
        }else{
            historyStatus = "payment request tried, failed due to insufficient balance.";
            subscriptionObj.auto_renewal = false;
            subscriptionObj.is_allowed_to_stream = false;
            subscriptionObj.consecutive_successive_bill_counts = 0;
            subscriptionObj.try_micro_charge_in_next_cycle = false;
            subscriptionObj.micro_price_point = 0;
            subscriptionObj.priority = 0;
            
            //Send acknowledgement to user
            let message = 'You have insufficient balance for Goonj TV, please try again after recharge. Thanks';
            this.messageRepo.sendMessageToQueue(message, user.msisdn);
        }

        if(subscriptionObj.try_micro_charge_in_next_cycle === false) {
            subscriptionObj.is_billable_in_this_cycle = false;
        }

        subscriptionObj.queued = false;
        if(historyStatus && historyStatus === 'expired'){
            subscriptionObj.amount_billed_today = 0;
        }
        
        await this.subscriptionRepo.updateSubscription(subscription._id, subscriptionObj);
        if(historyStatus){
            let history = {};
            history.billing_status = historyStatus;
            history.user_id = user._id;
            history.subscription_id = subscription._id;
            history.subscriber_id = subscription.subscriber_id;
            history.paywall_id = packageObj.paywall_id;
            history.package_id = subscription.subscribed_package_id;
            history.micro_charge = subscription.try_micro_charge_in_next_cycle;
            history.price = (subscription.try_micro_charge_in_next_cycle)?subscription.micro_price_point:0;
            history.transaction_id = transaction_id;
            history.operator = 'telenor';
            history.response_time = response_time;

            if(expiry_source !== undefined){
                history.source = expiry_source;
            }

            history.operator_response = error;
            await this.billingHistoryRepo.createBillingHistory(history);
        }
    }

    // Activate micro charging
    activateMicroCharging(subscription, packageObj, subscriptionObj){
        console.log("activateMicroCharging")
        let micro_price_points = packageObj.micro_price_points;
        let current_micro_price_point = subscription.micro_price_point;
        let tempSubObj  = JSON.parse(JSON.stringify(subscriptionObj));

        if(current_micro_price_point > 0){
            // It means micro charging attempt had already been tried and was unsuccessful, lets hit on lower price
            let index = micro_price_points.indexOf(current_micro_price_point);
            if(index > 0){
                tempSubObj.try_micro_charge_in_next_cycle = true;
                tempSubObj.micro_price_point = micro_price_points[--index];
                tempSubObj.priority = 2;
            }else if(index === -1){
                tempSubObj.try_micro_charge_in_next_cycle = true;
                tempSubObj.micro_price_point = micro_price_points[micro_price_points.length - 1];
                tempSubObj.priority = 2;
            }else{
                tempSubObj.try_micro_charge_in_next_cycle = false;
                tempSubObj.micro_price_point = 0;
                tempSubObj.is_billable_in_this_cycle = false;
                tempSubObj.priority = 0;
            }
        }else{
            // It means micro tying first micro charge attempt
            tempSubObj.try_micro_charge_in_next_cycle = true;
            tempSubObj.micro_price_point = micro_price_points[micro_price_points.length - 1];
            tempSubObj.priority = 2;
        }

        return tempSubObj;
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
                await this.billingHistoryRepo.createBillingHistory(history);
            }
        })
        .catch(async  (error) => {
            console.log(`Affiliate - Marketing - Callback - Error - Having TID - ${tid} - MID ${mid}`, error);
            history.operator_response = error.response.data;
            history.billing_status = "Affiliate callback error";
            await this.billingHistoryRepo.createBillingHistory(history);
        });
    }
    
    async sendCallBackToIdeation(mid, tid)  {
        var url; 
        if (mid === "1569") {
            url = config.ideation_callback_url + `p?mid=${mid}&tid=${tid}`;
        } else if (mid === "goonj"){
            url = config.ideation_callback_url2 + `?txid=${tid}`;
        } else if (mid === "aff3" || mid === "aff3a" ){
            url = config.ideation_callback_url3 + `${tid}`;
        }  else if (mid === "1" || mid === "gdn" ){
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

module.exports = SubscriptionConsumer;