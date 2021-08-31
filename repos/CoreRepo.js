const Axios = require('axios');
const config = require('../config');

class CoreRepository{
    async createViewLog(user_id, subscription_id, source, operator){
        return await Axios.post(`${config.servicesUrls.core_service}/viewlogs/create_view_log`, {user_id, subscription_id, source, operator})
        .then(res =>{ 
            let result = res.data;
            return result
        })
        .catch(err =>{
            return err
        })
    }
    
    async getPackage(_id){
        // need to remove the slug check and add a proper way for it
        return await Axios.get(`${config.servicesUrls.core_service}/package?id=${_id}`)
        .then(res =>{ 
            let result = res.data;
            return result
        })
        .catch(err =>{
            return err
        })
    }

    async getPaywallsBySlug(slug){
        return await Axios.get(`${config.servicesUrls.core_service}/paywall?slug=${slug}`)
        .then(res =>{ 
            let result = res.data;
            return result
        })
        .catch(err =>{
            return err
        })
    }

    async getPaywallById(paywall_id){
        return await Axios.get(`${config.servicesUrls.core_service}/paywall?id=${paywall_id}`)
        .then(res =>{ 
            let result = res.data;
            return result
        })
        .catch(err =>{
            return err
        })
    }

    async getDecoded(req){
        return await Axios.post(`${config.servicesUrls.core_service}/auth/authenticate`, {body: req.body, headers: req.headers})
        .then(res =>{ 
            let result = res.data;
            console.log("decoded", result);
            return result
        })
        .catch(err =>{
            return err
        })
    }

    async createBlockUserHistory(msisdn, affiliate_unique_transaction_id, affiliate_mid, response, source){
        return await Axios.post(`${config.servicesUrls.core_service}/block_user`, {msisdn, affiliate_unique_transaction_id, affiliate_mid, response, source})
        .then(res =>{ 
            let result = res.data;
            return result
        })
        .catch(err =>{
            return err
        })
    }
}

module.exports = CoreRepository;