const Axios = require('axios');
const { nanoid } = require('nanoid');
const config = require('../config');

class TpEpCoreRepository{
    constructor({billingService}){
        this.billingService = billingService;
    }
    
    async processDirectBilling(otp, user, subscriptionObj, packageObj, first_time_billing, micro){
        let transaction_id = subscriptionObj.payment_source == 'easypaisa' ? user.msisdn + '_' + nanoid(8) : user.msisdn + '_' + user._id + '_' + nanoid(10);
        let ep_token = subscriptionObj.ep_token ? subscriptionObj.ep_token : undefined;
        console.log("warning", "attempting charging packageObj", packageObj.price_point_pkr)

        return await Axios.post(`${config.servicesUrls.tp_ep_core_service}/core/charge`, {otp, msisdn: user.msisdn, payment_source: user.operator, amount: packageObj.price_point_pkr, transaction_id, partner_id: packageObj.partner_id, ep_token})
        .then(async(res) =>{ 
            let response = res.data;

            console.log("warning", "resonpse obj", response)
            if(response.message === "success"){
                await this.billingService.billingSuccess(user, subscriptionObj, response, packageObj, transaction_id, first_time_billing, response.response_time, micro);
            }else if(response.message === 'failed'){
                await this.billingService.billingFailed(user, subscriptionObj, response, packageObj, transaction_id, first_time_billing, response.response_time, micro);
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