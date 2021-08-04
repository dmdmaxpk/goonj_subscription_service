const Axios = require('axios');
const config = require('../config');

class TpEpCoreRepository{
    
    async processDirectBilling(otp, user, subscriptionObj, packageObj, bool){
        return await Axios.post(`${config.tp_ep_core_service}/process_direct_billing`, {otp, user, subscriptionObj, packageObj, bool})
        .then(res =>{ 
            let result = res.data;
            return result
        })
        .catch(err =>{
            return err
        })
    }

    async subscriberQuery(msisdn){
        return await Axios.get(`${config.tp_ep_core_service}/subscriber_query?msisdn=${msisdn}`)
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