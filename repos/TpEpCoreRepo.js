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
            // console.log("billing response", response)

            if(response && response.message === "success"){
                this.billingService.billingSuccess(user, subscriptionObj, response, packageObj, transaction_id, first_time_billing);
            }else{
                this.billingService.billingFailed(user, subscriptionObj, response, packageObj, transaction_id, first_time_billing);
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

    async assembleChargeAttempt(msisdn, packageObj, transaction_id, subscription, micro_price){
        let user = {}
        user.msisdn = msisdn;
        packageObj.price = micro_price ? micro_price : packageObj.price;
        // let response = await this.processDirectBilling(undefined, user, subscription, packageObj, false)
        // return response;


        let returnObject = {};
        try{
            let response = await this.processDirectBilling(undefined, user, subscription, packageObj, false);
            if(response.message === "Success"){
                returnObject.message = "Success";
                returnObject.api_response = response;
            }else{
                returnObject.message = "Failed";
                returnObject.api_response = response;
            }
            return returnObject;
        }catch(err){
            if(err && err.response){
                console.log('Error Micro', err.response.data);
            }
            throw err;
        }
    }
}

module.exports = TpEpCoreRepository;