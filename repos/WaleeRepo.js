const { default: axios } = require('axios');
const mongoose = require('mongoose');
const config = require('../config');
const Waleelogs = mongoose.model('Waleelogs');
const WaleeApiLogs = mongoose.model('WaleeApiLogs');

class WaleeRepository {
    constructor() {
        this.domain = 'http://hepage.goonj.pk';
        this.referrer = 73732;
    }

    async getWaleeLatestForeignId(user_id){
        const lastRecord = await Waleelogs.find().sort({added_dtm: -1}).limit(1);
        console.log('warning', lastRecord);
        const waleeObj = {
            foreign_id: lastRecord && lastRecord.length > 0 ? Number(lastRecord[0].foreign_id) + 1 : 1001,
        };
        if (user_id) waleeObj.user_id = user_id;
        try{
            const log = new Waleelogs(waleeObj);
            let waleeLog = await log.save();
            return waleeLog.foreign_id;
        }
        catch(err){
            console.log('walee log err:', err);
        }
    }

    async checkSourceInterval(utm_source){
        let date = await this.setDateWithTimezone(new Date());
        date.setHours(0, 0, 0, 0);
        date.setDate(date.getDate() - 7);
        const check = await Waleelogs.find({utm_source: utm_source, added_dtm: { $gt: new Date(date) } });
        if(check && check.length > 0) return true;
        else return false;
    }

    async setDateWithTimezone(date){
        let newDate = date.toLocaleString("en-US", {timeZone: "Asia/Karachi"});
        newDate = new Date(newDate);
        return newDate;
    }

    async linkClick(query){
        const {utm_source} = query;
        const clickBody = {
            referrer: utm_source,
            // referrer: this.referrer,
            hookType: 'Link Click',
            foriegn_id: await this.getWaleeLatestForeignId(),
            installed_version: '1.0.0',
            type: 'wordpress',
            domain: this.domain
        }
        return await axios.post(`${config.walee_api}/api/tracking/newWordPressHook`, clickBody)
        .then(async (res) => {
            const result = res.data;
            console.log('Walee - Link Click:', result);

            await this.saveWaleeApiLog(clickBody, result, 'linkClick');
            
            return {status: 200};
        })
        .catch(err => {
            console.log('Walee - Link Click', err);
            return {status: 400};
        });
    }

    async pageview(query){
        const {utm_source} = query;
        const pageviewBody = {
            page: '/checkout',
            referrer: utm_source,
            // referrer: this.referrer,
            hookType: 'Page Views',
            foriegn_id: await this.getWaleeLatestForeignId(),
            installed_version: '1.0.0',
            type: 'wordpress',
            domain: this.domain
        }
        return await axios.post(`${config.walee_api}/api/tracking/newWordPressHook`, pageviewBody)
        .then(async (res) => {
            const result = res.data;
            console.log('Walee - Pageview Click:', result);

            await this.saveWaleeApiLog(pageviewBody, result, 'pageview');

            return {status: 200};
        })
        .catch(err => {
            console.log('Walee - Pageview Click', err);
            return {status: 400};
        });
    }

    async successfulSubscription(body){
        const {utm_source, subscription_id, userPhone, totalPrice} = body;
        
        const subscriptionBody = {
            orderId: subscription_id,
            referrer: utm_source,
            // referrer: this.referrer,
            hookType: 'Sales',
            userPhone: userPhone,
            userMail: 'na',
            comments: 'comment',
            signature: 'signature',
            totalPrice: totalPrice,
            order_status: 'completed',
            foriegn_id: await this.getWaleeLatestForeignId(),
            installed_version: '1.0.0',
            type: 'wordpress',
            domain: this.domain,
            userDetails: {}
        }
        return await axios.post(`${config.walee_api}/api/tracking/newWordPressHook`, subscriptionBody)
        .then(async(res) => {
            const result = res.data;
            console.log('Walee - Subscription Success:', result);
            
            // save api log
            await this.saveWaleeApiLog(subscriptionBody, result, 'subscription');
            
            return {status: 200};
        })
        .catch(err => {
            console.log('Walee - Subscription Success', err);
            return {status: 400};
        });
    }

    async saveWaleeApiLog(request, response, action){
        const body = {request, response, action};
        let newLog = new WaleeApiLogs(body);
        newLog = await newLog.save();
        return newLog;
    }
}

module.exports = WaleeRepository;