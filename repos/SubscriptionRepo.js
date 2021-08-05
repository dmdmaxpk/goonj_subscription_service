const mongoose = require('mongoose');
const Subscription = mongoose.model('Subscription');
const moment = require("moment");
const container = require('../configurations/container');
const billingHistoryRepo = container.resolve('billingHistoryRepository')
class SubscriptionRepository {

    async createSubscription (postData)  {
        console.log('creating subscription', postData);
        let result = await this.getSubscriptionByPaywallId(postData.user_id, postData.paywall_id);
        if(result){
            let data = "Already exist subscription record with user id "+ postData.user_id +" having package id "+ postData.subscribed_package_id;
            console.log(data);
            throw Error(data);
        }else{
            if(!postData.source || postData.source === 'null') postData.source = 'app';
            if(!postData.payment_source || postData.payment_source === 'null') postData.payment_source = 'telenor';

            let subscription = new Subscription(postData);
            result = await subscription.save();
            return result;
        }
    }

    async getSubscription (subscription_id)  {
        let result = await Subscription.findOne({_id: subscription_id});
        return result;
    }

    async getSubscriptionHavingPaymentSourceEP (user_id)  {
        let result = await Subscription.findOne({user_id: user_id, payment_source: 'easypaisa', 'ep_token':{$exists:true}});
        return result;
    }
    
    async getAllSubscriptions(user_id)  {
        let result = await Subscription.find({user_id: user_id});
        return result;
    }

    async getAllActiveSubscriptions(user_id)  {
        let result = await Subscription.find({user_id: user_id, $or: [{subscription_status: "trial"}, {subscription_status: "billed"}, {subscription_status: "graced"}]});
        return result;
    }

    async getQueuedCount(user_id)  {
        let result = await Subscription.countDocuments({queued:true});
        return result;
    }

    async getAllSubscriptionsByDate(from, to)  {
        console.log("=> Subs from ", from, "to", to);
        let result = await Subscription.aggregate([
            {
                $match:{
                    $and: [
                                    {added_dtm:{$gte:new Date(from)}},
                                    {added_dtm:{$lte:new Date(to)}}
                           ]
                    }
            },{
                    $group: {
                                _id: {"day": {"$dayOfMonth" : "$added_dtm"}, "month": { "$month" : "$added_dtm" }, "year":{ $year: "$added_dtm" }},
                        count: {$sum: 1}
                            }
            },{ 
                                 $project: { 
                                _id: 0,
                                date: {"$dateFromParts": { year: "$_id.year","month":"$_id.month","day":"$_id.day" }},
                        count: "$count"
                                 } 
                        },
                        { $sort: { date: 1} }
            ]);
        return result;
    }

    async getSubscriptionByPackageId(user_id, package_id)  {
        let result = await Subscription.findOne({user_id: user_id, subscribed_package_id: package_id});
        return result;
    }

    async getSubscriptionByPaywallId(user_id, paywall_id)  {
        let result = await Subscription.findOne({user_id: user_id, paywall_id: paywall_id});
        return result;
    }

    async getSubscriptionBySubscriberId(user_id)  {
        let result = await Subscription.findOne({user_id: user_id});
        return result;
    }
    
    async getRenewableSubscriptions  ()  {
        let results = await Subscription.aggregate([
            {
                $match:{
                    is_billable_in_this_cycle: true, 
                    active: true, 
                    queued:false
                }
            },{
                $limit: 18000
            }
        ]);
        return results;
    }
    
    async getBilledSubscriptions ()  {
        let results = await Subscription.find(
            {$or:[{subscription_status:'billed'}], 
            next_billing_timestamp: {$lte: new Date()}, active: true});
        return results;
    }
    
    async updateSubscription (subscription_id, postData)  {
        const query = { _id: subscription_id };
        postData.last_modified = new Date();
    
        try {
            const result = await Subscription.updateOne(query, postData);
            if (result.nModified === 0) {
                return undefined;
            } else {
                let subscription = await this.getSubscription(subscription_id);
                return subscription;
            }
        } catch(error) {
            console.log(error);
            return error;
        }
    }

    async updateAllSubscriptions (subscriptionArray, postData)  {
        postData.last_modified = new Date();
        try {
            const result = await Subscription.updateMany(
                {_id: {$in: subscriptionArray}},
                { $set: postData  }
            )
            console.log("updated subs result", result);
        } catch(error) {
            console.log(error);
            return error;
        }
    }

    async updateMany(user_ids)  {
        let data = await Subscription.updateMany({"user_id": {$in:user_ids }},{$set:{should_remove: true}});
        return data;
    }
    
    async deleteSubscription  (subscription_id)  {
        const result = await Subscription.deleteOne({_id: subscription_id});
        return result;
    }
    
    async deleteAllSubscriptions (user_id)  {
        const result = await Subscription.deleteMany({user_id: user_id});
        return result;
    }
    
    async resetAmountBilledToday ()  {
        const result = await Subscription.updateMany({},{$set: { amount_billed_today : 0}});
        return result;
    }
    
    async markSubscriptionInactive (subscription_id)  {
        if (subscription_id) { 
            const query = { _id: subscription_id };
            const result = await Subscription.updateOne(query, { $set: { active: false } });
            if (result.nModified === 0) {
                return undefined;
            }else{
                let subscription = await this.getSubscription(subscription_id);
                return subscription;
            }
        } else {
             return undefined;
        }
    }
    
    async unsubscribe (subscription_id)  {
        if (subscription_id) { 
            const query = { _id: subscription_id };
            const result = await Subscription.updateOne(query, { $set: { auto_renewal: false, subscription_status: 'expired' } });
            if (result.nModified === 0) {
                return undefined;
            }else{
                let subscription = await this.getSubscription(subscription_id);
                return subscription;
            }
        } else {
             return undefined;
        }
    }

    async insertMany(subscriptions)  {
        return new Promise( async (resolve,reject) => {
            if (subscriptions.length > 0) {
                try {
                    let result = await Subscription.insertMany(subscriptions,{ordered:false});
                    resolve(result);
                } catch(err) {
                    console.log("[SubscriptionRepository][insertManyFunction][error]");
                    console.log("WritErrors",err.writeErrors.length);
                    if (err.writeErrors.some(error => error.code != 11000 )){
                            reject(err);
                    } else {
                        resolve("done")
                    }   
                }
            } else {
                 return undefined;
            }
        });
    }
    
    // async removeNumberAndHistory (msisdn)  {
    
    //     let user = await this.userRepo.getUserByMsisdn(msisdn);
    //     if (user) { 
    //         let userId = user._id;
    //         await this.userRepo.deleteUser(userId);
    //         let subscriber = subscriberRepo.getSubscriber(userId);
    //         await deleteSubscriber(userId);
    //         await deleteAllSubscriptions(subscriber._id);
    //         await this.historyRepo.deleteMany(userId);
    
    //         console.log(`The MSISDN ${msisdn} records deleted successfully`);
    //     } else {
    //         console.log(`The MSISDN ${msisdn} failed to delete records`);
    //     }
    // }

    async getSubscriptionsToMark()  {
        let now = moment();
        let endOfDay = now.endOf('day').tz("Asia/Karachi");
    
        let results = await Subscription.find(
            {$or:[{subscription_status:'billed'},
            {subscription_status:'graced'},
            {subscription_status:'trial'}], 
            next_billing_timestamp: {$lte: endOfDay}, 
            active: true, is_billable_in_this_cycle:false}).select('_id');
        
            let subscription_ids = results.map(subscription => {
            return subscription._id;
        });
        return subscription_ids;
    }
    
    async getSubscriptionsToMarkWithLimitAndOffset(limit, lastId, operator)  {
        let now = moment();
        let endOfDay = now.endOf('day').tz("Asia/Karachi");
    
        let whereClause = "";

        if(lastId){
            whereClause = {
                _id: {$gt: lastId},
                $or:[
                    {subscription_status:'billed'},
                    {subscription_status:'graced'},
                    {subscription_status:'trial'}
                ], 
                payment_source: operator,
                next_billing_timestamp: {$lte: endOfDay}, 
                active: true, 
                is_billable_in_this_cycle:false
            }
        }else{
            whereClause = {
                $or:[
                    {subscription_status:'billed'},
                    {subscription_status:'graced'},
                    {subscription_status:'trial'}
                ], 
                payment_source: operator,
                next_billing_timestamp: {$lte: endOfDay}, 
                active: true, 
                is_billable_in_this_cycle:false
            }
        }

        let results = await Subscription.find(whereClause).limit(limit).select('_id');
        let subscription_ids = results.map(subscription => {
            return subscription._id;
        });
        return subscription_ids;
    }

    async getCountOfSubscriptionToMark(operator){
        let now = moment();
        let endOfDay = now.endOf('day').tz("Asia/Karachi");
    
        let count = await Subscription.count(
            {$or:[{subscription_status:'billed'},
            {subscription_status:'graced'},
            {subscription_status:'trial'}],
            payment_source: operator, 
            next_billing_timestamp: {$lte: endOfDay}, 
            active: true, is_billable_in_this_cycle:false
        });

        return count;
    }

    async getBillableInCycleCount(){
        let count = await Subscription.count({is_billable_in_this_cycle: true});
        return count;
    }
    
    async setAsBillableInNextCycle (subscription_ids)  {
        await Promise.all([
            Subscription.updateMany({_id: {$in :subscription_ids}, try_micro_charge_in_next_cycle: true},{$set:{is_billable_in_this_cycle: true}}),
            Subscription.updateMany({_id: {$in :subscription_ids}, try_micro_charge_in_next_cycle: false},{$set:{is_billable_in_this_cycle: true, priority: 1}})
        ]);
    }

    async getGrayListSubscriptions(){
        let results = await Subscription.find({merketing_source: {$ne: 'none'}, subscription_status: 'expired',
                     is_gray_listed: true});
        return results;
    }

    async getSubscriptionsForAffiliateMids(mids, from, to){
        let results = await Subscription.aggregate([
            {
                $match:{
                $or:mids,
                $and:[
                    {added_dtm:{$gt: new Date(from)}}, 
                    {added_dtm:{$lt: new Date(to)}}
                ]
                }
            },{
                $group: {
                    _id: "$affiliate_mid",
                    user_ids: {$addToSet: "$user_id"}
                }
            }
            ]);
        return results;
    }

    async subscriptionToExpireNonUsage(){
        let results = await Subscription.aggregate([
            {
             $match: {
               subscription_status: {$in: ["billed"]}
             }
            }, 
            {
             $lookup: {
               from: 'viewlogs',
               let: {subscription_id: "$_id" },
               pipeline: [
                       { $match:
                          { $expr:  
                                 { $eq: [ "$subscription_id","$$subscription_id" ] }
                          }
                       }, 
                       { $sort:
                          { added_dtm: -1
                          }
                       },
                       { $limit: 1
                       }
                    ],
               as: 'logs'
             }
            },{
            $project: {
              latest_log: {"$arrayElemAt": ["$logs",0]},
              subscription_status: "$subscription_status",
              user_id: "$user_id"
            }
            },
         {
            $project: {
              last_seen_date: "$latest_log.added_dtm",
              subscription_status: "$subscription_status",
              user_id: "$user_id",
              current_date: new Date()
            }
         },{
            $project: {
               user_id: "$user_id",
               timeSinceLastSeen: {
               "$divide": [
                 { "$subtract": ["$current_date","$last_seen_date"] },
                 60 * 1000 * 60
               ]
             }
            }
         },
         {
            $match: {
               timeSinceLastSeen: {$gte: 1440}
            }
         }]);
        return results;
    }

    async getPackagesOfSubscriber(user_id){
        if (user_id) {
            try {
                let package_ids = await Subscription.find({user_id: user_id }).select('subscribed_package_id');
                return package_ids;
            } catch (err) {
                throw err;
            }
        } else {
            return null;
        }
    }
    
    async dailyTrialToBilledUsers (from ,to)  {    
        let result = await Subscription.aggregate([
        {
            $match:{
                $and:[
                    {added_dtm:{$gt: new Date(from)}}, 
                    {added_dtm:{$lt: new Date(to)}}
                ]
            }
        },{
            $project:{
                _id: 0,
                user_id: 1,
            }
        },{
            $lookup:{
                from: "billinghistories",
                let: {user_id: "$user_id"},
                pipeline:[
                                    {
                                        $match: {
                                                $expr: {
                                $and:[
                                                        {$eq: ["$user_id", "$$user_id"]},
                                                        {$eq: ["$billing_status", "trial"]}
                                ]
                                                }
                                        }
                                    }
                        ],
                as: "history"
            }
        },{
            $unwind: "$history"
        },{
            $project:{
                _id: 0,
                "package_id": "$history.package_id",
                "user_id": "$history.user_id",
                "history.billing_dtm": 1
            }
        },{
            $project:{
                "package_id": "$package_id",
                "user_id": "$user_id",
                "trial_dt": "$history.billing_dtm"
            }
        },{
            $project:{
                "package_id": "$package_id",
                "user_id": "$user_id",
                "trial_date": {"$dayOfMonth" : "$trial_dt"}
            }
        },{
            $lookup:{
                from: "billinghistories",
                let: {user_id: "$user_id", trial_date: "$trial_date"},
                pipeline:[
                                    {
                                        $match: {
                                                $expr: {
                                $and:[
                                                    {$eq: ["$user_id","$$user_id"]},
                                                    {$eq: ["$billing_status","Success"]},
                                {$eq: [{"$dayOfMonth":"$billing_dtm"}, {$add:["$$trial_date",1]}]}
                                ]
                                                }
                                        }
                                    }
                        ],
                as: "history"
            }
        },{
            $project:{
                    package_id: "$package_id",
                historySize: {$size: "$history"}	
            }
        },{
            $match:{
                "historySize": {$gt: 0}	
            }
        },{
            $group:{
                _id: "$package_id",
                count: {$sum: 1}	
            }
        }]);
        return result;
    }

    async getExpiredFromSystem(){
        console.log('=> getExpiredFromSystem');
        try{
            let result = await Subscription.aggregate([
                {             
                    $match:{ 
                        "subscription_status" : "expired"
                    }
                },{
                    $project:{
                        "_id": 0,
                        "user_id": 1	
                    }
                },{
                    $lookup:{
                        from: "subscribers",
                        let: {user_id: "$user_id" },
                                pipeline:[{$match: {$expr: {$eq: ["$_id", "$$user_id"]}}}],
                        as: "subs"
                    }
                },{
                    $unwind: "$subs"
                },{
                    $project:{
                        "_id": 0,
                        "subs.user_id": 1		
                    }
                },{
                    $lookup:{
                        from: "users",
                        let: {user_id: "$subs.user_id"},
                        pipeline:[{$match:{$expr:{$eq:["$_id", "$$user_id"]}}}],
                        as: "userDetails"
                    }
                },{
                    $unwind: "$userDetails"
                },{
                    $project:{
                        "userDetails.msisdn": 1		
                    }
                }
            ]);
            return result;
        }catch(e){
            console.log('=> error', e);
        }
    }

    async getComedyWeeklySubscriptions(){
        let subscriptions = await Subscription.find({subscribed_package_id: "QDfI", active: true, $or: [{subscription_status: "billed"}, {subscription_status: "graced"}]});
        return subscriptions;
    }

    async getComedyDailySubscriptions(){
        let subscriptions = await Subscription.find({subscribed_package_id: "QDfH", active: true, $or: [{subscription_status: "billed"}, {subscription_status: "graced"}]});
        return subscriptions;
    }

    async getOnlySubscriberIds(source, from, to){
        let data = await Subscription.aggregate([
        {
            $match:{
                source: source,
                $and:[
                    {added_dtm:{$gte: new Date(from)}}, 
                    {added_dtm:{$lt: new Date(to)}},
                ]
            }
        },{
            $project: {
                _id:0,
                user_id: 1
            }
        }
    ]);
    
    console.log("=> data fetched", data.length);
    
    return data;
}

async getPreRenwalSubscriptions(){
    var date = new Date();
    let datDate = new Date();
    // add a day
    date = date.setDate(date.getDate() + 1);
    datDate = datDate.setDate(datDate.getDate() + 2)
    
    let subs = await Subscription.aggregate([
        { $match: {  next_billing_timestamp: { $gte: new Date(date), $lte: new Date(datDate) }, subscription_status: {$in: ['billed'] }, auto_renewal: true, subscribed_package_id: { $in: ['QDfG'] } } }
    ]);
    return subs;
}

// Subscription Consumer functions
async unQueue (subscription_id) {
    await this.subscriptionRepo.updateSubscription(subscription_id, {queued: false, is_billable_in_this_cycle:false, priority: 0});
}

// billing functions
async billingSuccess(user, subscription, packageObj){

            let serverDate = new Date();
            let localDate = helper.setDateWithTimezone(serverDate);
            let nextBilling = _.clone(localDate);
            nextBilling = nextBilling.setHours(nextBilling.getHours() + packageObj.package_duration);

            let updatedSubscription = undefined;
            // if (!first_time_billing) {
            //     // Update subscription

            //     let subscriptionObj = {};
            //     subscriptionObj.subscription_status = 'billed';
            //     subscriptionObj.auto_renewal = true;
            //     subscriptionObj.is_billable_in_this_cycle = false;
            //     subscriptionObj.is_allowed_to_stream = true;
            //     subscriptionObj.last_billing_timestamp = localDate;
            //     subscriptionObj.next_billing_timestamp = nextBilling;
            //     subscriptionObj.amount_billed_today =  (subscription.amount_billed_today + packageObj.price_point_pkr);
            //     subscriptionObj.total_successive_bill_counts = ((subscription.total_successive_bill_counts ? subscription.total_successive_bill_counts : 0) + 1);
            //     subscriptionObj.consecutive_successive_bill_counts = ((subscription.consecutive_successive_bill_counts ? subscription.consecutive_successive_bill_counts : 0) + 1);
            //     subscriptionObj.subscribed_package_id = packageObj._id;
            //     subscriptionObj.queued = false;
            //     subscriptionObj.payment_source = subscription.payment_source;
            //     if(subscription.ep_token){
            //         subscriptionObj.ep_token = subscription.ep_token;
            //     }
                
            //     await this.updateSubscription(subscription._id, subscriptionObj);
            // } else {
                subscription.subscription_status = 'billed';
                subscription.auto_renewal = true;
                subscription.is_billable_in_this_cycle = false;
                subscription.is_allowed_to_stream = true;
                subscription.last_billing_timestamp = localDate;
                subscription.next_billing_timestamp = nextBilling;
                subscription.amount_billed_today =  (subscription.amount_billed_today + packageObj.price_point_pkr);
                subscription.total_successive_bill_counts = ((subscription.total_successive_bill_counts ? subscription.total_successive_bill_counts : 0) + 1);
                subscription.consecutive_successive_bill_counts = ((subscription.consecutive_successive_bill_counts ? subscription.consecutive_successive_bill_counts : 0) + 1);
                subscription.subscribed_package_id = packageObj._id;
                subscription.queued = false;

                if(subscription.affiliate_unique_transaction_id && subscription.affiliate_mid){
                    subscription.should_affiliation_callback_sent = true;
                }else{
                    subscription.should_affiliation_callback_sent = false;
                }
                
                let updatedSubscription = await this.createSubscription(subscription);

                // Check for the affiliation callback
                if( updatedSubscription.affiliate_unique_transaction_id && 
                    updatedSubscription.affiliate_mid && 
                    updatedSubscription.is_affiliation_callback_executed === false &&
                    updatedSubscription.should_affiliation_callback_sent === true){
                    if((updatedSubscription.source === "HE" || updatedSubscription.source === "affiliate_web") && updatedSubscription.affiliate_mid != "1") {
                        // Send affiliation callback
                        this.sendAffiliationCallback(
                            updatedSubscription.affiliate_unique_transaction_id, 
                            updatedSubscription.affiliate_mid,
                            user._id,
                            updatedSubscription._id,
                            updatedSubscription.subscriber_id,
                            packageObj._id,
                            packageObj.paywall_id
                            );
                    }
                }

            // }
            this.createSubscription(subscription);
            // Add history record
            let history = {};
            history.micro_charge = (updatedSubscription  && updatedSubscription.try_micro_charge_in_next_cycle) ? updatedSubscription.try_micro_charge_in_next_cycle : false;
            history.user_id = user._id;
            history.subscription_id =  updatedSubscription ? updatedSubscription._id : subscription._id ;
            history.subscriber_id = subscription.subscriber_id;
            history.paywall_id = packageObj.paywall_id;
            history.package_id = packageObj._id;
            history.transaction_id = transaction_id;
            history.operator_response = response;
            history.price = packageObj.price_point_pkr;
            history.billing_status = "Success";
            history.source = subscription.source;
            history.operator = subscription.payment_source;
            await billingHistoryRepo.createBillingHistory(history);
}
}

module.exports = SubscriptionRepository;