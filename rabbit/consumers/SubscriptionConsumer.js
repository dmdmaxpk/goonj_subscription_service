const config = require('../../config');
const { rabbitMq } = require('../RabbitMq');
const helper = require('../../helper/helper');
const constants = require('../../configurations/constants');


class SubscriptionConsumer {

    constructor(subscriptionRepository, messageRepository, tpEpCoreRepository) {
      this.subscriptionRepository = subscriptionRepository;
      this.messageRepository = messageRepository;
      this.tpEpCoreRepository = tpEpCoreRepository;
    }

    async consume(message, acknowledged = false) {
        let messageObject = JSON.parse(message.content);

        let user = messageObject.user;
        let mPackage = messageObject.package;
        let subscription = messageObject.subscription;
        let mcDetails = messageObject.mcDetails;
        let transaction_id = messageObject.transaction_id;

        let micro_price = 0;
        let micro_charge = (mcDetails && mcDetails.micro_charge === true) ? true : false;
        if(micro_charge){
            micro_price = mcDetails.micro_price;
        }
        
        if(subscription.active){
            // billing
            if(subscription.payment_source){
                this.acknowledge(message);
                
                let subscriptLocal = await this.subscriptionRepository.getSubscription(subscription._id);
                if(subscriptLocal){
                        if(micro_charge){
                            this.tryMicroChargeAttempt(message, mPackage, user, subscription, transaction_id, micro_price);
                        } else{
                            this.tryFullChargeAttempt(message, mPackage, user, subscription, transaction_id);
                        }
                }
            }
        }
        else{
            console.log(`Subscription ${subscription._id} is not active, skipping this renewal`);
            this.acknowledge(message);
        }
    }
    
    // CHARGING ATTEMPTS
    async tryFullChargeAttempt(queueMessage, packageObj, user, subscription, transaction_id) {
        let returnObject = {};
        try {
            let response = await this.tpEpCoreRepository.assembleChargeAttempt(user.msisdn, packageObj, transaction_id, subscription);
            let api_response = response.api_response.response.data;
            let message = response.message;

            if(message === 'Success'){
                console.log("Billing - Success - ", subscription._id);
                returnObject.status = 'Success';
                returnObject.api_response = api_response;
            
                if((Number(subscription.consecutive_successive_bill_counts)+1)%7 == 0 || (packageObj._id === 'QDfG')){
                    this.sendRenewalMessage(subscription, user.msisdn, packageObj.package_name, packageObj.display_price_point, true, packageObj._id, user._id);
                }
                this.createOrUpdateSubscription(subscription._id, packageObj.price_point_pkr);
                this.sendSubscriptionResponse(queueMessage, returnObject);
            }else{
                // Unsuccess billing. Save tp billing response
                returnObject.status = 'Failed';
                returnObject.api_response = api_response;
                this.sendSubscriptionResponse(queueMessage, returnObject);
            }
        }catch(error){
            if (error && error.response && (error.response.data.errorCode === "500.007.08" || (error.response.data.errorCode === "500.007.05") &&
                    error.response.data.errorMessage === "Services of the same type cannot be processed at the same time.") ) {
                // Consider, tps exceeded, noAcknowledge will requeue this record.
                console.log('Sending back to queue:errorCode:',error.response.data.errorCode,subscription._id);
                await helper.timeout(300);
                this.tryFullChargeAttempt(queueMessage, packageObj, user, subscription, transaction_id);
            }else{
                if (error.response && error.response.data){
                    console.log('Error - Billing Failed - '+subscription._id+' - '+ error.response.data.errorMessage);
                }else {
                    console.log('Error billing failed: ', error);
                }
                returnObject.status = 'Failed';
                returnObject.api_response = error.response.data;

                this.sendSubscriptionResponse(queueMessage, returnObject);
            }
        }

        packageObj = null;
        queueMessage = null;
        returnObject = null;
        user = null;
        subscription = null;
        transaction_id =null;
    }
    
    async tryMicroChargeAttempt(queueMessage, packageObj, user, subscription, transaction_id, micro_price) {
        let returnObject = {};
        try{
            console.log(packageObj.price_point_pkr, micro_price);
            if(micro_price < packageObj.price_point_pkr){

                let response = await this.tpEpCoreRepository.assembleChargeAttempt(user.msisdn, packageObj, transaction_id, subscription, micro_price);
                let api_response = response.api_response.api_response.data;
                let message = response.message;

                if(message === 'Success'){
                    console.log("Micro Charging success for ",subscription._id," for price ",micro_price);
                    returnObject.status = 'Success';
                    returnObject.api_response = api_response;
                    
                    // Send acknowledgement message
                    if((Number(subscription.consecutive_successive_bill_counts)+1)%7 == 0 || (packageObj._id === 'QDfG')){
                        this.sendMicroChargeMessage(user.msisdn, packageObj.price_point_pkr, micro_price, packageObj.package_name);
                    }
                    this.createOrUpdateSubscription(subscription._id, packageObj.price_point_pkr);
                    this.sendSubscriptionResponse(queueMessage, returnObject);
                }else{
                    // Unsuccess billing. Save tp billing response
                    returnObject.status = 'Failed';
                    returnObject.api_response = api_response;
                    this.sendSubscriptionResponse(queueMessage, returnObject);
                }
            }else{

                //TODO shoot an email
                let returnObject = {};
                returnObject.status = 'ExcessiveMicroBilling';
                returnObject.micro_price = micro_price;
                returnObject.package_full_price = packageObj.price_point_pkr;
                this.sendSubscriptionResponse(queueMessage, returnObject);
            }
        }catch(error){
            // Consider, tps exceeded, noAcknowledge will requeue this record.
            if ( error.response.data.errorCode === "500.007.08" || (error.response.data.errorCode === "500.007.05" &&
            error.response.data.errorMessage ==="Services of the same type cannot be processed at the same time.") ){
                console.log('Sending back to queue',error.response.data.errorCode,subscription._id);
                await helper.timeout(300);
                this.tryMicroChargeAttempt(queueMessage, packageObj, user, subscription, transaction_id, micro_price);
            }else {
                if (error.response && error.response.data){
                    console.log('Error - Micro Billing Failed - '+subscription._id+' - '+ error.response.data.errorMessage);
                }else {
                    console.log('Error micro billing failed: ', error);
                }
                // Consider, payment failed for any reason. e.g no credit, number suspended etc
                returnObject.status = 'Failed';
                returnObject.api_response = error.response.data;

                // let endTime = new Date() - startTime;
                // endTime = helper.timeTakeByChargeApi(endTime);
                // returnObject.api_response_time = endTime;

                this.sendSubscriptionResponse(queueMessage, returnObject);
            }
        }

        packageObj = null;
        queueMessage = null;
        returnObject = null;
        user = null;
        subscription = null;
        transaction_id =null;
    }

    async createOrUpdateSubscription(subscriptionId, amount_billed_today) {
        let subscription = await this.subscriptionRepository.getSubscription(subscriptionId);
        if (!subscription){
            let subscriptionObj = {};
            subscriptionObj.subscription_id = subscriptionId;
            subscriptionObj.amount_billed_today = Number(amount_billed_today);
            subscriptionObj.active = true;
            subscriptionObj.added_dtm = new Date();
            this.subscriptionRepository.createSubscription(subscriptionObj);
        }
        else{
            let newAmount = Number(subscription.amount_billed_today) + Number(amount_billed_today);
            this.subscriptionRepository.updateSubscription(subscription._id, {$set: {amount_billed_today: newAmount}});
        }
    }

    sendRenewalMessage(subscription, msisdn, packageName, price, is_manual_recharge,package_id,user_id) {
        if(subscription.consecutive_successive_bill_counts + 1 === 1){
            // For the first time or every week of consecutive billing
    
            //Send acknowldement to user
            let message = constants.message_after_first_successful_charge[package_id];
            message = message.replace("%user_id%", user_id)
            message = message.replace("%pkg_id%", package_id)
            this.messageRepository.sendToQueue(message, msisdn);
        }else if((Number(subscription.consecutive_successive_bill_counts)+1)%7 == 0 || (package_id === 'QDfG')){
            // Every week
            //Send acknowledgement to user            
            let message = constants.message_after_repeated_succes_charge[package_id];
            message = message.replace("%user_id%", user_id)
            message = message.replace("%pkg_id%", package_id)
            this.messageRepository.sendToQueue(message, msisdn);
        }
    }
    
    sendMicroChargeMessage (msisdn, fullPrice, price, packageName)  {
        console.log("Sending %age discount message to "+msisdn);
        let percentage = ((price / fullPrice)*100);
        percentage = (100 - percentage);
    
        //Send acknowldement to user
        let message = "You've got "+percentage+"% discount on "+packageName+".  Numainday se baat k liye 727200 milayein.";
        this.messageRepository.sendToQueue(message, msisdn);
    }

    acknowledge(message){
        rabbitMq.acknowledge(message);
    }

    sendSubscriptionResponse(message, returnObject){
        let messageObj = JSON.parse(message.content);
        messageObj.returnObject = returnObject;

        rabbitMq.addInQueue(config.queueNames.subscriptionResponseDispatcher, messageObj);
        console.log('Subscription response added in queue!');
    }
}

module.exports = SubscriptionConsumer;