const Axios = require('axios');
const config = require('../config');

class MessageRepository{
    async sendMessageToQueue(message, msisdn){
        return await Axios.post(`${config.servicesUrls.message_service}/message/send-to-queue`, {message, msisdn})
        .then(res =>{ 
            let result = res.data;
            console.log("warning ", "message queue", result, "message", message, "msisdn", msisdn)
            return result
        })
        .catch(err =>{
            return err
        })
    }

    async sendMessageDirectly(message, msisdn){
        return await Axios.post(`${config.servicesUrls.message_service}/message/send-directly`, {message, msisdn})
        .then(res =>{ 
            let result = res.data;
            return result
        })
        .catch(err =>{
            return err
        })
    }

    async sendEmail(subject, text, email){
        return await Axios.post(`${config.servicesUrls.message_service}/message/email`, {subject, text, email})
        .then(res =>{ 
            let result = res.data;
            return result
        })
        .catch(err =>{
            return err
        })
    }

    // subscription consumer functions
    sendMicroChargeMessage (msisdn, fullPrice, price, packageName)  {
        console.log("Sending %age discount message to "+msisdn);
        let percentage = ((price / fullPrice)*100);
        percentage = (100 - percentage);
    
        //Send acknowldement to user
        let message = "You've got "+percentage+"% discount on "+packageName+".  Numainday se baat k liye 727200 milayein.";
        this.sendMessageToQueue(message, msisdn);
    }

    // SHOOT EMAIL
    async shootExcessiveBillingEmail(subscription_id)  {
        try {
            let emailSubject = `User Billing Exceeded`;
            let emailText = `Subscription id ${subscription_id} has exceeded its billing limit. Please check on priority.`;
            let emailToSend = `paywall@dmdmax.com.pk`;
            this.sendEmail(emailSubject,emailText,emailToSend);
            console.log('Excessive billing email initiated for subscription id ',subscription_id);
        } catch(err){
            console.error(err);
        }   
    }
}

module.exports = MessageRepository;