const Axios = require('axios');
const config = require('../config');

const RabbitMq = require('../rabbit/BillingHistoryRabbitMq');
const rabbitMq = new RabbitMq().getInstance();

class BillingHistoryRepository {
    async assembleBillingHistory(user, subscription, packageObj, response, billingStatus, response_time, transaction_id, micro_charge, price) {
        let history = {};
        history.user_id = user._id;
        history.msisdn = user.msisdn;
        history.subscription_id = subscription._id;
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
        this.createBillingHistory(history);
    }


    async createBillingHistory(history){
        console.log('$$:',JSON.stringify(history),':$$');
        await rabbitMq.addInQueue(config.queueNames.billingHistoryDispatcher, history);
    }

    async getExpiryHistory(user_id){
        console.log('### Sending request', user_id);
        return await Axios.get(`${config.servicesUrls.report_service}/history/get_expire_history?user_id=${user_id}`)
        .then(res =>{ 
            let result = res.data;
            console.log('### Expiry response', result);
            return result
        })
        .catch(err =>{
            console.log('### Expiry err', err);
            return err
        })
    }
}

module.exports = BillingHistoryRepository;