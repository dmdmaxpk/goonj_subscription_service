const Axios = require('axios');
const config = require('../config');

class CoreRepository{
    async createViewLog(user_id, subscription_id){
        return await Axios.post(`${config.core_service}/create_view_log`, {user_id, subscription_id})
        .then(res =>{ 
            let result = res.data;
            return result
        })
        .catch(err =>{
            return err
        })
    }
    
    async getPackage(_id){
        return await Axios.get(`${config.core_service}/package?id=${_id}`)
        .then(res =>{ 
            let result = res.data;
            return result
        })
        .catch(err =>{
            return err
        })
    }

    async getPaywallsBySlug(slug){
        return await Axios.get(`${config.core_service}/paywall?slug=${slug}`)
        .then(res =>{ 
            let result = res.data;
            return result
        })
        .catch(err =>{
            return err
        })
    }

    async getPaywallById(paywall_id){
        return await Axios.get(`${config.core_service}/paywall?id=${paywall_id}`)
        .then(res =>{ 
            let result = res.data;
            return result
        })
        .catch(err =>{
            return err
        })
    }


    // tp-ep core
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

module.exports = CoreRepository;