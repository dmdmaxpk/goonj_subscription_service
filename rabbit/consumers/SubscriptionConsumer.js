const config = require('../../config');
const moment = require('moment');
const helper = require('../../helper/helper');
const  _ = require('lodash');
const Singleton = require('../RabbitMq');
// const RabbitMq = require('../RabbitMq');
// const Singleton = new RabbitMq().getInstance();
class SubscriptionConsumer {

    constructor({subscriptionRepository,billingHistoryRepository,messageRepository,billingService,constants}) {
        this.subscriptionRepository = subscriptionRepository;
        this.billingHistoryRepository = billingHistoryRepository;
        this.messageRepository = messageRepository;
        this.billingService = billingService;
        this.constants = constants;
    }

    async consume(message) {
        // let messageObject = JSON.parse(message.content);
        let messageObject = message;
        console.log("warning", "response dispatcher", messageObject);
        let user = messageObject.user;
        let mPackage = messageObject.package;

        
        let subscription = await this.subscriptionRepository.getSubscription(messageObject.subscription_id);
        let microStatus = messageObject.micro_charge;
        let amount = messageObject.amount;
        let transaction_id = messageObject.transaction_id;
        let returnObject = messageObject.api_response;
        let paymentSource = messageObject.payment_source;


        if(returnObject){
            let returnStatus = returnObject.status; // TODO: check if Success comes as a Status in API respnse
            let response_time = 0;
            if (messageObject.hasOwnProperty('api_response_time')){
                response_time = messageObject.api_response_time;
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
                subscriptionObj.amount_billed_today = subscription.amount_billed_today + (microStatus && amount) ? amount : mPackage.price_point_pkr;
                subscriptionObj.total_successive_bill_counts = ((subscription.total_successive_bill_counts ? subscription.total_successive_bill_counts : 0) + 1);
                subscriptionObj.consecutive_successive_bill_counts = ((subscription.consecutive_successive_bill_counts ? subscription.consecutive_successive_bill_counts : 0) + 1);
                subscriptionObj.queued = false;
                
                // Fields for micro charging
                subscriptionObj.try_micro_charge_in_next_cycle = false;
                subscriptionObj.micro_price_point = 0;
                // subscriptionObj.priority = 0;
                await this.subscriptionRepository.updateSubscription(subscription._id, subscriptionObj);
                Singleton.acknowledge(message);

                // Check for the affiliation callback
                if(subscription.affiliate_unique_transaction_id && subscription.affiliate_mid &&
                    subscription.is_affiliation_callback_executed === false &&
                    subscription.should_affiliation_callback_sent === true){
                    if((subscription.source === "HE" || subscription.source === "affiliate_web") && subscription.affiliate_mid != "1") {
                        this.billingService.sendAffiliationCallback(subscription.affiliate_unique_transaction_id, subscription.affiliate_mid, user._id, subscription._id, mPackage._id, mPackage.paywall_id);
                    }
                }

                if(microStatus && amount){
                    console.log('Micro charge success');
                    this.sendMicroChargeMessage(user.msisdn, mPackage.display_price_point, amount, mPackage.package_name)
                    this.billingHistoryRepository.assembleBillingHistory(user, subscription, mPackage, returnObject, returnStatus, response_time, transaction_id, true, amount);
                }else{
                    console.log('Full charge success');
                    this.sendRenewalMessage(subscription, user.msisdn, mPackage.package_name, mPackage.display_price_point, true, mPackage._id, user._id)
                    this.billingHistoryRepository.assembleBillingHistory(user, subscription, mPackage, returnObject, returnStatus, response_time, transaction_id, false, mPackage.price_point_pkr);
                }
                
            }else{
                await this.assignGracePeriod(subscription, user, mPackage, false, returnObject, response_time, transaction_id);
                Singleton.acknowledge(message);
            }
        }else{
            console.log('Return object not found!');
            Singleton.acknowledge(message);
        }
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
            // subscriptionObj.priority = 0;
            
            historyStatus="graced";

        }else if(subscription.subscription_status === 'graced' && subscription.auto_renewal === true){
            // Already in grace, check if given time has been passed in grace, stop streaming
    
            let nowDate = moment();
            let timeInGrace = moment.duration(nowDate.diff(subscription.date_on_which_user_entered_grace_period));
            let hoursSpentInGracePeriod = timeInGrace.asHours();
            console.log("hoursSpentInGracePeriod",hoursSpentInGracePeriod);
    
            if (is_manual_recharge){
                let message = "You have insufficient amount for Goonj TV subscription. Please recharge your account for watching Live channels on Goonj TV. Stay Safe";
                this.messageRepository.sendMessageToQueue(message, user.msisdn);
            }
    
            if (hoursSpentInGracePeriod > packageObj.grace_hours){
                subscriptionObj.subscription_status = 'expired';
                subscriptionObj.consecutive_successive_bill_counts = 0;
                subscriptionObj.auto_renewal = false;
                subscriptionObj.is_allowed_to_stream = false;
                subscriptionObj.is_billable_in_this_cycle = false;
                subscriptionObj.try_micro_charge_in_next_cycle = false;
                subscriptionObj.micro_price_point = 0;
                // subscriptionObj.priority = 0;

                expiry_source = "system-after-grace-end";

                //Send acknowledgement to user
                let link = 'https://www.goonj.pk/goonjplus/subscribe';
                let message = 'You package to Goonj TV has expired, click below link to subscribe again.\n'+link;
                this.messageRepository.sendMessageToQueue(message, user.msisdn);
                historyStatus = "expired";

            }
            else if(packageObj.is_micro_charge_allowed === true && hoursSpentInGracePeriod > 8 && hoursSpentInGracePeriod <= 24){
                console.log("Micro Charging Activated for: ",subscription._id);
                subscriptionObj.subscription_status = 'graced';
                historyStatus = "graced";

                subscriptionObj = this.activateMicroCharging(subscription, packageObj, subscriptionObj);
                console.log("Micro Charging Activated Subscription Object Returned:",subscriptionObj);
            }
            else{
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
                // subscriptionObj.priority = 0;
            }
        }else{
            historyStatus = "payment request tried, failed due to insufficient balance.";
            subscriptionObj.auto_renewal = false;
            subscriptionObj.is_allowed_to_stream = false;
            subscriptionObj.consecutive_successive_bill_counts = 0;
            subscriptionObj.try_micro_charge_in_next_cycle = false;
            subscriptionObj.micro_price_point = 0;
            // subscriptionObj.priority = 0;
            
            //Send acknowledgement to user
            let message = 'You have insufficient balance for Goonj TV, please try again after recharge. Thanks';
            this.messageRepository.sendMessageToQueue(message, user.msisdn);
        }

        if(subscriptionObj.try_micro_charge_in_next_cycle === false) {
            subscriptionObj.is_billable_in_this_cycle = false;
        }

        subscriptionObj.queued = false;
        if(historyStatus && historyStatus === 'expired'){
            subscriptionObj.amount_billed_today = 0;
        }
        
        await this.subscriptionRepository.updateSubscription(subscription._id, subscriptionObj);
        if(historyStatus){
            // let history = {};
            // history.billing_status = historyStatus;
            // history.user_id = user._id;
            // history.subscription_id = subscription._id;
            // history.paywall_id = packageObj.paywall_id;
            // history.package_id = subscription.subscribed_package_id;
            // history.micro_charge = subscription.try_micro_charge_in_next_cycle;
            // history.price = (subscription.try_micro_charge_in_next_cycle)?subscription.micro_price_point:0;
            // history.transaction_id = transaction_id;
            // history.operator = 'telenor';
            // history.response_time = response_time;
            // history.operator_response = error;

            if(expiry_source !== undefined){
                subscription.source = expiry_source;
            }

            await this.billingHistoryRepository.assembleBillingHistory(user, subscription, packageObj, error, historyStatus, response_time, transaction_id, subscription.try_micro_charge_in_next_cycle, subscription.try_micro_charge_in_next_cycle ? subscription.micro_price_point : 0)
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
                // tempSubObj.priority = 2;
            }else if(index === -1){
                tempSubObj.try_micro_charge_in_next_cycle = true;
                tempSubObj.micro_price_point = micro_price_points[micro_price_points.length - 1];
                // tempSubObj.priority = 2;
            }else{
                tempSubObj.try_micro_charge_in_next_cycle = false;
                tempSubObj.micro_price_point = 0;
                tempSubObj.is_billable_in_this_cycle = false;
                // tempSubObj.priority = 0;
            }
        }else{
            // It means micro tying first micro charge attempt
            tempSubObj.try_micro_charge_in_next_cycle = true;
            tempSubObj.micro_price_point = micro_price_points[micro_price_points.length - 1];
            // tempSubObj.priority = 2;
        }

        return tempSubObj;
    }
    
    sendRenewalMessage(subscription, msisdn, packageName, price, is_manual_recharge,package_id,user_id) {
        if(subscription.consecutive_successive_bill_counts === 1){
            // For the first time or every week of consecutive billing
    
            //Send acknowldement to user
            let message = this.constants.message_after_first_successful_charge[package_id];
            message = message.replace("%user_id%", user_id)
            message = message.replace("%pkg_id%", package_id)
            this.messageRepository.sendMessageToQueue(message, msisdn);
        }else if((subscription.consecutive_successive_bill_counts + 1) % 7 === 0 || (package_id === 'QDfG')){
                        // Every week
            //Send acknowledgement to user            
            let message = this.constants.message_after_repeated_succes_charge[package_id];
            message = message.replace("%user_id%", user_id)
            message = message.replace("%pkg_id%", package_id)
            // message = message.replace("%price%",price);
        }
    }
    
    sendMicroChargeMessage (msisdn, fullPrice, price, packageName)  {
        console.log("Sending %age discount message to "+msisdn);
        let percentage = ((price / fullPrice)*100);
        percentage = (100 - percentage);
    
        //Send acknowldement to user
        let message = "You've got "+percentage+"% discount on "+packageName+".  Numainday se baat k liye 727200 milayein.";
        this.messageRepository.sendMessageToQueue(message, msisdn);
    }
}

module.exports = SubscriptionConsumer;