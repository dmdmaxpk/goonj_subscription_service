const Axios = require('axios');
const { nanoid } = require('nanoid');
const config = require('../config');

class TpEpCoreRepository{
    constructor({billingService}){
        this.billingService = billingService;
    }
    
    async processDirectBilling(otp, user, subscriptionObj, packageObj, first_time_billing){
        let transaction_id = subscriptionObj.payment_source == 'easypaisa' ? user.msisdn + '_' + nanoid(8) : user.msisdn + '_' + user._id + '_' + nanoid(10);
        let ep_token = subscriptionObj.ep_token ? subscriptionObj.ep_token : undefined;
        return await Axios.post(`${config.servicesUrls.tp_ep_core_service}/core/charge`, {otp, msisdn: user.msisdn, payment_source: user.operator, amount: packageObj.price_point_pkr, transaction_id, partner_id: packageObj.partner_id, ep_token})
        .then(res =>{ 
            let response = res.data;

            console.log("warning", "billing response", response)

            if(response && response.message === "success"){
                this.billingService.billingSuccess(user, subscriptionObj, response, packageObj, transaction_id, first_time_billing, response.response_time);
            }else{
                this.billingService.billingFailed(user, subscriptionObj, response, packageObj, transaction_id, first_time_billing, response.response_time);
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