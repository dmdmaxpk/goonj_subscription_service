const Axios = require('axios');
const Helper = require('../helper/helper');
const config = require('../config');

const RabbitMq = require('../rabbit/BillingHistoryRabbitMq');
const rabbitMq = new RabbitMq().getInstance();

const LocalRabbitMq = require('../rabbit/RabbitMq');
const localRabbitMq = new LocalRabbitMq().getInstance();

var ObjectID = require('mongodb').ObjectID;

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
        var objectId = new ObjectID();
        
        history._id = objectId;
        history.billing_dtm = Helper.setDateWithTimezone(new Date())
        
        console.log('$$:',JSON.stringify(history),':$$');
        await rabbitMq.addInQueue(config.queueNames.billingHistoryDispatcher, history);
        await localRabbitMq.addInQueue(config.queueNames.billingHistoryDispatcher, history);
    }

    async getExpiryHistory(user_id){
        return await Axios.get(`${config.servicesUrls.report_service}/history/get_expire_history?user_id=${user_id}`)
        .then(res =>{ 
            let result = res.data;
            return result
        })
        .catch(err =>{
            return err
        })
    }

    async assembleBillingHistoryV2(user, subscription, packageObj, response) {
        let history = {};

        history.user_id = user._id;
        history.msisdn = user.msisdn;
        history.subscription_id = subscription._id;
        history.paywall_id = packageObj.paywall_id;
        history.package_id = subscription.subscribed_package_id;
        history.operator_response = response;
        history.billing_status = response.status === 'ACTIVE' ? 'Success' : (response.status === 'PRE_ACTIVE' ? 'trial' : 'Failed');
        history.source = subscription.source;
        history.operator = subscription.payment_source?subscription.payment_source:'telenor';
        history.price = packageObj.price_point_pkr;
        this.createBillingHistory(history);
    }


}

module.exports = BillingHistoryRepository;