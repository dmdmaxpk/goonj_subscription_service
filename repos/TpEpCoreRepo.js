const Axios = require('axios');
const config = require('../config');

class TpEpCoreRepository{
    
    async processDirectBilling(otp, user, subscriptionObj, packageObj, bool){
        var uuid = Math.random().toString(36).slice(-10);
        let transaction_id = user.msisdn + '_' + user._id + uuid;
        let ep_token = subscriptionObj.ep_token ? subscriptionObj.ep_token : undefined;
        console.log("easypaisa params", user.operator, "otp", otp, "ep_token", ep_token);
        // console.log("direct billing api call", otp, user, subscriptionObj, packageObj, transaction_id);
        return await Axios.post(`${config.servicesUrls.tp_ep_core_service}/core/charge`, {otp, msisdn: user.msisdn, payment_source: user.operator, amount: packageObj.price_point_pkr, transaction_id, partner_id: packageObj.partner_id, ep_token})
        .then(res =>{ 
            let result = res.data;
            console.log("billing response", result)
            return result
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