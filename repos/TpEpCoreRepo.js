const Axios = require('axios');
const config = require('../config');
const billingService = require('../services/billingService');

class TpEpCoreRepository{
    
    async processDirectBilling(otp, user, subscriptionObj, packageObj, first_time_billing){
        var uuid = Math.random().toString(36).slice(-10);
        let transaction_id = user.msisdn + '_' + user._id + uuid;
        let ep_token = subscriptionObj.ep_token ? subscriptionObj.ep_token : undefined;
        // console.log("direct billing api call", otp, user, subscriptionObj, packageObj, transaction_id);
        return await Axios.post(`${config.servicesUrls.tp_ep_core_service}/core/charge`, {otp, msisdn: user.msisdn, payment_source: user.operator, amount: packageObj.price_point_pkr, transaction_id, partner_id: packageObj.partner_id, ep_token})
        .then(res =>{ 
            let response = res.data;
            console.log("billing response", response)

            if(response && response.message === "success"){
                await billingService.billingSuccess(user, subscription, response, packageObj, transaction_id, first_time_billing);
            }else{
                await billingService.billingFailed(user, subscription, response, packageObj, transaction_id, first_time_billing);
            }
            return response
        })
        .catch(err =>{
            return err
        })
    }

    async subscriberQuery(msisdn){
        return await Axios.get(`${config.servicesUrls.tp_ep_core_service}/core/subscriber_query?msisdn=${msisdn}`)
        .then(res =>{
            let result = res.data;
            return result;
        })
        .catch(err =>{
            return err
        })
    }
}

module.exports = TpEpCoreRepository;