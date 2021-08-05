const Axios = require('axios');
const config = require('../config');

class BillingHistoryRepository {
    async assembleBillingHistory(user, subscription, packageObj, response, billingStatus, response_time, transaction_id, micro_charge, price) {
        let history = {};
        history.user_id = user._id;
        history.subscription_id = subscription._id;
        history.subscriber_id = subscription.subscriber_id;
        history.paywall_id = packageObj.paywall_id;
        history.package_id = subscription.subscribed_package_id;
        history.transaction_id = transaction_id;
        history.operator_response = response;
        history.billing_status = billingStatus;
        history.response_time = response_time;
        history.source = subscription.source;

        history.operator = subscription.payment_source?subscription.payment_source:'telenor';
    
        if(micro_charge === true){
            history.price = price;
            history.micro_charge = true;
            history.discount = false;
        }else{
            history.micro_charge = false;
            history.discount = false;
            history.price = price;
        }
        console.log("assembled billing history", history);
        this.createBillingHistory(history);
    }


    async createBillingHistory(history){
        console.log("warning", "Pushing history log to queue!")
        rabbitMq.addInQueue(config.queueNames.billingHistoryDispather, history);
    }
    
    
    async createBlockUserHistory(msisdn, affiliate_unique_transaction_id, affiliate_mid, response, source){
        return await Axios.post(`${config.servicesUrls.billing_history_service}/block`, {msisdn, affiliate_unique_transaction_id, affiliate_mid, response, source})
        .then(res =>{ 
            let result = res.data;
            return result
        })
        .catch(err =>{
            return err
        })
    }

    async deleteHistoryForSubscriber(user_id){
        return await Axios.post(`${config.servicesUrls.billing_history_service}/delete_history_for_subscriber`, {user_id})
        .then(res =>{ 
            let result = res.data;
            return result
        })
        .catch(err =>{
            return err
        })
    }

    async getExpiryHistory(user_id){
        return await Axios.get(`${config.servicesUrls.billing_history_service}/get_expire_history?user_id=${user_id}`)
        .then(res =>{ 
            let result = res.data;
            return result
        })
        .catch(err =>{
            return err
        })
    }
}

module.exports = BillingHistoryRepository;