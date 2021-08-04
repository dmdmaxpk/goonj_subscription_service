const Axios = require('axios');
const config = require('../config');

class MessageRepository{
    async sendMessageToQueue(message, msisdn){
        return await Axios.post(`${config.message_service}/message/send-to-queue`, {message, msisdn})
        .then(res =>{ 
            let result = res.data;
            return result
        })
        .catch(err =>{
            return err
        })
    }

    async sendEmail(subject, text, email){
        return await Axios.post(`${config.message_service}/message/email`, {subject, text, email})
        .then(res =>{ 
            let result = res.data;
            return result
        })
        .catch(err =>{
            return err
        })
    }
}

module.exports = MessageRepository;