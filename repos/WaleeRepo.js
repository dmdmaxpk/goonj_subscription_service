const { default: axios } = require('axios');
const mongoose = require('mongoose');
const config = require('../config');
const Waleelogs = mongoose.model('Waleelogs');

class WaleeRepository {
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
            // referrer: utm_source,
            referrer: 8522,
            hookType: 'Link Click',
            foriegn_id: await this.getWaleeLatestForeignId(),
            installed_version: '1.0.0',
            type: 'Wordpress',
            domain: 'https://goonj.pk'
        }
        return await axios.post(`${config.walee_api}/api/tracking/newWordPressHook`, clickBody)
        .then(res => {
            const result = res.data;
            console.log('Link Click:', result);
            return {status: 200};
        })
        .catch(err => {
            console.log('Walee Link Click', err);
            return {status: 400};
        });
    }

    async pageview(query){
        const {utm_source} = query;
        const pageviewBody = {
            page: '/checkout',
            // referrer: utm_source,
            referrer: 8522,
            hookType: 'Page Views',
            foriegn_id: await this.getWaleeLatestForeignId(),
            installed_version: '1.0.0',
            type: 'Wordpress',
            domain: 'https://goonj.pk'
        }
        return await axios.post(`${config.walee_api}/api/tracking/newWordPressHook`, pageviewBody)
        .then(res => {
            const result = res.data;
            console.log('Pageview Click:', result)
            return {status: 200};
        })
        .catch(err => {
            console.log('Pageview Click', err);
            return {status: 400};
        });
    }

    async successfulSubscription(body){
        const {utm_source, subscription_id, userPhone, totalPrice} = body;
        const check = await this.checkSourceInterval(utm_source);
        if(check === true){
            const subscriptionBody = {
                orderId: subscription_id,
                // referrer: utm_source,
                referrer: 8522,
                hookType: 'Sales',
                userPhone: userPhone,
                userMail: 'na',
                comments: 'comment',
                signature: 'signature',
                totalPrice: totalPrice,
                order_status: 'completed',
                foriegn_id: await this.getWaleeLatestForeignId(),
                installed_version: '1.0.0',
                type: 'Wordpress',
                domain: 'https://goonj.pk',
                userDetails: {}
            }
            return await axios.post(`${config.walee_api}/api/tracking/newWordPressHook`, subscriptionBody)
            .then(res => {
                const result = res.data;
                console.log('Subscription Success:', result)
                return {status: 200};
            })
            .catch(err => {
                console.log('Walee Subscription Success', err);
                return {status: 400};
            });
        }
        else return 'Utm Source expired';
    }
}

module.exports = WaleeRepository;