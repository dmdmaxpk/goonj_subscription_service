const config = require("../config");

const path = require('path');
const readline = require('readline');
const fs = require('fs');


class SubscriptionService {
    constructor({subscriptionRepository, userRepository, coreRepository, billingHistoryRepository, messageRepository}) {
        this.subscriptionRepository = subscriptionRepository;
        this.userRepository = userRepository;
        this.coreRepository = coreRepository;
        this.billingHistoryRepository = billingHistoryRepository;
        this.messageRepository = messageRepository;
    }

    async expireByNumber(msisdn, slug, source){
        try{
            let user  = await this.userRepository.getUserByMsisdn(msisdn);
            let subscriptionsToUnsubscribe = [];
            
            if(user){
                // let subscriber = await this.subscriberRepository.getSubscriberByUserId(user._id);
                // if(subscriber){
                    let subscriptions = await this.subscriptionRepository.getAllSubscriptions(user._id);
                    let alreadyUnsubscribed = 0;

                    if(slug && slug === "all"){
                        for (let i =0 ; i < subscriptions.length; i++) {
                            if(subscriptions[i].subscription_status === 'expired'){
                                alreadyUnsubscribed += 1;   
                            }else{
                                subscriptionsToUnsubscribe.push(subscriptions[i]);
                            }
                        }
                    }else if(slug && (slug === "live" || slug === "comedy")){
                        let paywall  = await this.coreRepository.getPaywallsBySlug(slug);
                        for (let i =0 ; i < subscriptions.length; i++) {
                            let subscription = subscriptions[i];
                            if (paywall.package_ids.indexOf(subscription.subscribed_package_id) > -1){
                                // Unsubscribe this
                                subscriptionsToUnsubscribe.push(subscription);
                            }
                        }
                    }else{
                        return "Invalid slug provided!";    
                    }

                    if(subscriptionsToUnsubscribe.length > 0){
                        let unsubscribed = 0;
                        for (let i =0 ; i < subscriptionsToUnsubscribe.length; i++) {
                            let subscription = subscriptions[i];
                            let paywall  = await this.coreRepository.getPaywallById(subscription.paywall_id);

                            let history = {};
                            history.user_id = subscriber.user_id;
                            // history.subscriber_id = subscription.subscriber_id;
                            history.subscription_id = subscription._id;
                            history.package_id = subscription.subscribed_package_id;
                            history.paywall_id = paywall._id;
                            history.billing_status = 'expired';
                            history.source = source ? source : 'ccp_api';
                            history.operator = 'telenor';
                            this.expireSubscription(subscription._id, paywall.paywall_name, user.msisdn, history);
                            unsubscribed += 1;
                        }

                        if(subscriptionsToUnsubscribe.length === unsubscribed){
                            return "Requested subscriptions has unsubscribed!";
                        }else{
                            return "Failed to unsubscribe!"
                        }
                    }else{
                        if(alreadyUnsubscribed > 0){
                            return "Dear customer, you are not a subscribed user";
                        }else{
                            return "This service is not active at your number";
                        }
                    }

                // }else{
                //     return "This service is not active at your number";    
                // }
                
            }else{
                return "This service is not active at your number"
            }
        }catch(err){
            console.log("=>", err);
            return "Error";
        }
    }

    async expire(subscription_id,source,operator_response,transaction_id){
        try {
            if (subscription_id){
                let subscription = await this.subscriptionRepository.getSubscription(subscription_id);
                let packageOfThisSubcription = await this.subscriptionRepository.getPackage({_id: subscription.subscribed_package_id});
                // let subscriber = await this.subscriberRepository.getSubscriber(subscription.subscriber_id);
                let expire = await this.subscriptionRepository.updateSubscription(subscription_id,{
                    subscription_status: 'expired', 
                    is_allowed_to_stream:false, 
                    is_billable_in_this_cycle:false, 
                    consecutive_successive_bill_counts: 0,
                    try_micro_charge_in_next_cycle: false,
                    micro_price_point: 0
                });
                let history = {};
                history.user_id = subscriber.user_id;
                // history.subscriber_id = subscription.subscriber_id;
                history.subscription_id = subscription._id;
                history.package_id = subscription.subscribed_package_id;
                history.paywall_id = packageOfThisSubcription.paywall_id;

                history.transaction_id = transaction_id;
                history.operator_response = operator_response;
                history.billing_status = 'expired';
                history.source = source;
                history.operator = 'telenor';
                await this.billingHistoryRepository.create(history);
                return expire;
            } else {
                return undefined;
            }
        } catch (error){
            throw error;
        }
    }

    async expireByMsisdn(msisdn,paywall_slug,source,operator_response,transaction_id){
        return new Promise(async (resolve,reject) => {
            try {
                if (msisdn && paywall_slug){
                   let user  = await this.userRepository.getUserByMsisdn(msisdn);
                   let paywall  = await this.coreRepository.getPaywallsBySlug(paywall_slug);
                   if (user && paywall ) {
                        // let subscriber = await this.subscriberRepository.getSubscriberByUserId(user._id);
                        // if (subscriber) {
                            let subscriptions = await this.subscriptionRepository.getAllSubscriptions(user._id);
                            if (subscriptions.length > 0) {
                                let temp = 0;
                                for (let i =0 ; i < subscriptions.length; i++) {
                                    let subscription = subscriptions[i];
                                    if (paywall.package_ids.indexOf(subscription.subscribed_package_id) > -1){
                                        let history = {};
                                        history.user_id = subscriber.user_id;
                                        // history.subscriber_id = subscription.subscriber_id;
                                        history.subscription_id = subscription._id;
                                        history.package_id = subscription.subscribed_package_id;
                                        history.paywall_id = paywall._id;
                                        history.transaction_id = transaction_id?transaction_id:"";
                                        history.operator_response = operator_response?operator_response:"";
                                        history.billing_status = 'expired';
                                        history.source = source;
                                        history.operator = 'telenor';
                                        let response = await this.expireSubscription(subscription._id,paywall.paywall_name,
                                                        user.msisdn,history);
                                    } else {
                                        temp++;
                                    }
                                }
                                if (temp === subscriptions.length) {
                                    resolve("Could not find subscription of user for this paywall.")
                                } else {
                                    resolve("Subscription Unsubscribed")
                                }
                            } else {
                                resolve("User has not been subscribed");
                            }
                        // } else {
                        //     resolve("User has not been subscribed");    
                        // }
                    } else {
                        resolve("User or Paywall doesn't exist");
                    }
                } else {
                    resolve("No msisdn or paywall name provided");
                }
            } catch (error){
                reject(error);
            }
        });
    }

    async expireSubscription(subscription_id,paywall_name,msisdn,history){
        return new Promise(async (resolve,reject) => {
            try {
                if (subscription_id) {
                    let expire = await this.subscriptionRepository.updateSubscription(subscription_id,{
                        subscription_status: 'expired', 
                        is_allowed_to_stream:false, 
                        is_billable_in_this_cycle:false, 
                        consecutive_successive_bill_counts: 0,
                        try_micro_charge_in_next_cycle: false,
                        micro_price_point: 0
                    });
                    // add to history
                    
                    await this.billingHistoryRepository.createBillingHistory(history);
        
                    // send sms to user
                    let text = `Apki Goonj TV per Live TV Weekly ki subscription khatm kr di gai ha. Phr se subscribe krne k lye link par click karen https://www.goonj.pk/ `;
                    this.messageRepository.sendMessageDirectly(text,msisdn);
                    resolve("Succesfully unsubscribed");
                } else {
                    resolve("Subscription id not found");
                }
            } catch (err) {
                console.error(err);
                reject(err);
            }
            
        });
    }


    async readFileSync(jsonPath) {
        return new Promise((resolve, reject) => {
            try{
                const readInterface = readline.createInterface({
                    input: fs.createReadStream(jsonPath)
                });
                let inputData = [];
                let counter = 0;
                readInterface.on('line', function(line) {
                    console.log(line)
                    if(line.startsWith("92")){
                        line = line.replace('92', '0');
                    }else if(line.startsWith("3")){
                        line = "0" + line;
                    }
    
                    inputData.push(line);
                    counter += 1;
                    console.log("### read", counter);
                });
        
                readInterface.on('close', function(line) {
                    resolve(inputData);
                });
            }catch(e){
                reject(e);
            }
        });
    }

    async report(){
        console.log("=> unsub msisdns list");
        let finalResult = [];

        try{
            var jsonPath = path.join(__dirname, '..', 'msisdn.txt');
            let inputData = await this.readFileSync(jsonPath);    
            console.log("### Input Data Length: ", inputData.length);

            for(let i = 0; i < inputData.length; i++){
                if(inputData[i] && inputData[i].length === 11){
                    console.log('msisdn', inputData[i]);

                    let user = await this.userRepository.getUserByMsisdn(inputData[i]);
                    console.log(user);

                    if(user){
                        let subscription = await this.subscriptionRepository.getOneSubscription(user._id);
                        let expireSub = await this.subscriptionRepository.updateSubscription(subscription._id, {subscription_status: 'expired'});
                        console.log(expireSub);
                    }

                        // finalResult.push(singObject);
                        console.log("### Done ", i);
                }else{
                    console.log("### Invalid number or number length");
                }
            }

        }catch(e){
            console.log("### error - ", e);
        }
    }
    
}

module.exports = SubscriptionService;