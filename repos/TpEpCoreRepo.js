const Axios = require('axios');
const { nanoid } = require('nanoid');
const config = require('../config');

class TpEpCoreRepository{
    constructor({billingService}){
        this.billingService = billingService;
    }

    async subscribe(msisdn, serviceId){
        return await Axios.post(`${config.servicesUrls.tp_ep_core_service}/core/subscribe`, {msisdn, serviceId})
        .then(async(res) =>{ 
            return res.data;
        }).catch(err =>{
            return err
        })
    }

    async unsubscribe(msisdn, serviceId){
        return await Axios.post(`${config.servicesUrls.tp_ep_core_service}/core/unsubscribe`, {msisdn, serviceId})
        .then(async(res) =>{ 
            return res.data;
        }).catch(err =>{
            return err
        })
    }
    
    async processDirectBilling(otp, user, subscriptionObj, packageObj, first_time_billing, micro){
        let transaction_id = subscriptionObj.payment_source == 'easypaisa' ? user.msisdn + '_' + nanoid(8) : user.msisdn + '_' + user._id + '_' + nanoid(10);
        let ep_token = subscriptionObj.ep_token ? subscriptionObj.ep_token : undefined;
        let partner_id = undefined;
        let source = user.source;

        if(first_time_billing === true){
            if(source == 'app'){
                partner_id = packageObj.new_partner_id[0];
            }
            else if(source != 'app'){
                partner_id = packageObj.new_partner_id[1];
            }
        }
        else{
            if(source == 'app'){
                partner_id = packageObj.new_partner_id[2];
            }
            else if(source != 'app'){
                partner_id = packageObj.new_partner_id[3];
            }
        }

        return await Axios.post(`${config.servicesUrls.tp_ep_core_service}/core/charge`, {otp, msisdn: user.msisdn, payment_source: user.operator, amount: packageObj.price_point_pkr, transaction_id, partner_id: partner_id, ep_token})
        .then(async(res) =>{ 
            let response = res.data;

            console.log("warning", "resonpse obj", response)
            if(response.message === "success"){
                await this.billingService.billingSuccess(user, subscriptionObj, response, packageObj, transaction_id, first_time_billing, response.response_time, micro);
            }else if(response.message === 'failed'){
                if(!response.desc){
                    response.desc = 'Insufficient Balance';
                }

                await this.billingService.billingFailed(user, subscriptionObj, response, packageObj, transaction_id, first_time_billing, response.response_time, micro);
            }

            console.log('returning reponse....');
            return response
        }).catch(err =>{
            return err
        })
    }



    async subscriberQuery(msisdn){
        return await Axios.get(`${config.servicesUrls.tp_ep_core_service}/core/subscriber-query?msisdn=${msisdn}`)
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