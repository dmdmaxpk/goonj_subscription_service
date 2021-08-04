const Axios = require('axios');
const config = require('../config');

class BillingHistoryRepository {
    async createBlockUserHistory(msisdn, affiliate_unique_transaction_id, affiliate_mid, response, source){
        return await Axios.post(`${config.billing_service}/block`, {msisdn, affiliate_unique_transaction_id, affiliate_mid, response, source})
        .then(res =>{ 
            let result = res.data;
            return result
        })
        .catch(err =>{
            return err
        })
    }

    async processDirectBilling(otp, user, subscriptionObj, packageObj, bool){
        return await Axios.post(`${config.billing_service}/process_direct_billing`, {otp, user, subscriptionObj, packageObj, bool})
        .then(res =>{ 
            let result = res.data;
            return result
        })
        .catch(err =>{
            return err
        })
    }


    async createBillingHistory(historyObj){
        return await Axios.post(`${config.billing_service}/create_billing_history`, historyObj)
        .then(res =>{ 
            let result = res.data;
            return result
        })
        .catch(err =>{
            return err
        })
    }

    async deleteHistoryForSubscriber(user_id){
        return await Axios.post(`${config.billing_service}/delete_history_for_subscriber`, {user_id})
        .then(res =>{ 
            let result = res.data;
            return result
        })
        .catch(err =>{
            return err
        })
    }

    async getExpiryHistory(user_id){
        return await Axios.get(`${config.billing_service}/get_expire_history?user_id=${user_id}`)
        .then(res =>{ 
            let result = res.data;
            return result
        })
        .catch(err =>{
            return err
        })
    }
}

module.exports = BillingHistoryRepository;