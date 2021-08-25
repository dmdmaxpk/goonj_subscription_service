const Axios = require('axios');
const config = require('../config');

class UserRepository {
    async getUserBySubscriptionId(subscription_id){
        let user = this.getUserById(subscription_id.user_id);
        if(user){
            return user;
        }
        return undefined;
    }

    async getUserByMsisdn(msisdn){
        return await Axios.get(`${config.servicesUrls.user_service}/user/get_user_by_msisdn?msisdn=${msisdn}`)
        .then(res =>{
            let result = res.data;
            return result;
        })
        .catch(err =>{
            return err
        })
    }

    async getUserById(user_id){
        return await Axios.get(`${config.servicesUrls.user_service}/user/get_user_by_id?id=${user_id}`)
        .then(res =>{
            let result = res.data;
            return result;
        })
        .catch(err =>{
            return err
        })
    }

    async createUser(userObj){
        return await Axios.post(`${config.servicesUrls.user_service}/user/create_user`, userObj)
        .then(res =>{ 
            let result = res.data;
            return result
        })
        .catch(err =>{
            return err
        })
    }

    async updateUser(msisdn, is_gray_listed){
        return await Axios.post(`${config.servicesUrls.user_service}/user/update_user`, {msisdn, is_gray_listed})
        .then(res =>{ 
            let result = res.data;
            return result
        })
        .catch(err =>{
            return err
        })
    }
}


module.exports = UserRepository;