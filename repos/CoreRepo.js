const Axios = require('axios');
const config = require('../config');

class CoreRepository{
    async createViewLog(user_id, subscription_id){
        return await Axios.post(`${config.servicesUrls.core_service}/create_view_log`, {user_id, subscription_id})
        .then(res =>{ 
            let result = res.data;
            return result
        })
        .catch(err =>{
            return err
        })
    }
    
    async getPackage(_id){
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
}

module.exports = CoreRepository;