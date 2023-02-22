const config = require('../config');
const container = require('../configurations/container');

const subscriptionRepo = container.resolve("subscriptionRepository");
const coreRepo = container.resolve("coreRepository");
const messageRepo = container.resolve("messageRepository");
const userRepo = container.resolve("userRepository");
const billingHistoryRepo = container.resolve("billingHistoryRepository");
const tpEpCoreRepo = container.resolve("tpEpCoreRepository");
const path = require('path');
const readline = require('readline');

const subscriptionService = container.resolve("subscriptionService");

const constants = container.resolve("constants");
const fs = require('fs');

const helper = require('../helper/helper');
const  _ = require('lodash');

exports.getSubscriptionDetails = async(req, res) => {
	let { msisdn, transaction_id } = req.query;

	let obj = {};
	if (msisdn) {
		let user = await userRepo.getUserByMsisdn(msisdn);
		if(user) {
			let rawSubscriptions = await subscriptionRepo.getAllSubscriptions(user._id);
			let subscriptions = [];
			if(rawSubscriptions){
				for(let i = 0; i < rawSubscriptions.length; i++){
					let sub = {};
					sub.user_id = rawSubscriptions[i].user_id;
					sub.subscription_id = rawSubscriptions[i]._id;
					sub.paywall_id = rawSubscriptions[i].paywall_id;
					sub.subscribed_package_id = rawSubscriptions[i].subscribed_package_id;
					sub.subscription_status = rawSubscriptions[i].subscription_status;
					sub.source = rawSubscriptions[i].source;
					sub.added_dtm = rawSubscriptions[i].added_dtm;
					sub.is_allowed_to_stream = rawSubscriptions[i].is_allowed_to_stream;
					sub.date_on_which_user_entered_grace_period = rawSubscriptions[i].date_on_which_user_entered_grace_period;
					subscriptions.push(sub);
				}
				obj.subscriptions = subscriptions;
				let expiryArray = await getExpiry(user._id);
				obj.expiry = expiryArray;
				res.send({code: config.codes.code_success, data: obj,gw_transaction_id:transaction_id});
			}else{
				res.send({code: config.codes.code_data_not_found, message: 'No Subscription Found',gw_transaction_id:transaction_id});
			}
		}else{
			res.send({code: config.codes.code_data_not_found, message: 'User not found',gw_transaction_id:transaction_id});
		}
	} else {
		res.send({code: config.codes.code_invalid_data_provided, message: 'No msisdn provided',gw_transaction_id:transaction_id});
	}
}

getExpiry = async(user_id) => {
	let rawHistories = await billingHistoryRepo.getExpiryHistory(user_id);

	if(rawHistories.length >= 2){
		rawHistories.sort(function(a,b){
			return new Date(a.billing_dtm) - new Date(b.billing_dtm);
		});
	}

	let histories = [];
	for(let i = 0; i < rawHistories.length; i++){
		let history = {};
		history.package_id = rawHistories[i].package_id;
		history.source = rawHistories[i].source;
		history.status = rawHistories[i].billing_status;
		history.billing_dtm = rawHistories[i].billing_dtm;
		histories.push(history);
	}

	if(histories.length > 5){
		return histories.slice(0, 5);
	}
	return histories;
	
}

login = async(user_id) => {
	let rawHistories = await billingHistoryRepo.getExpiryHistory(user_id);

	if(rawHistories.length >= 2){
		rawHistories.sort(function(a,b){
			return new Date(a.billing_dtm) - new Date(b.billing_dtm);
		});
	}

	let histories = [];
	for(let i = 0; i < rawHistories.length; i++){
		let history = {};
		history.package_id = rawHistories[i].package_id;
		history.source = rawHistories[i].source;
		history.status = rawHistories[i].billing_status;
		history.billing_dtm = rawHistories[i].billing_dtm;
		histories.push(history);
	}

	if(histories.length > 5){
		return histories.slice(0, 5);
	}
	return histories;
	
}

// Subscribe against a package
exports.subscribe = async (req, res) => {
	let gw_transaction_id = req.body.gw_transaction_id;
	let decodedResponse = await coreRepo.getDecoded(req);
	let decodedUser = decodedResponse.decoded;
	console.log('-----SUBSCRIBE-----', req.body, decodedUser);

	if(decodedUser && decodedUser.msisdn){
		let payment_source = req.body.payment_source;
		let msisdn = decodedUser.msisdn;
		
		let user = await userRepo.getUserByMsisdn(msisdn);
	
		if(!user){
			// Means no user in DB, let's create one
			let userObj = {}, response = {};
			userObj.msisdn = msisdn;
			userObj.operator = response.operator;
			userObj.source = req.body.source ? req.body.source : "app";
	
			if(payment_source && payment_source === "easypaisa"){
				response.operator = "easypaisa";
			}else{
				try{
					response = await tpEpCoreRepo.subscriberQuery(msisdn);
					console.log("subscriber query:", response);
				}catch(err){
					console.log("subscriber query error:", err);
					response = err;
				}
			}
	
			if(response && (response.operator === "telenor") || response.operator === 'easypaisa'){
				try {
					userObj.operator = response.operator;
					user = await userRepo.createUser(userObj);
					console.log('subscribe - user created - ', response.operator, ' - ', msisdn, ' - ', user.source, ' - ', (new Date()));
					doSubscribe(req, res, user, gw_transaction_id);
				} catch(er) {
					res.send({code: config.codes.code_error, message: 'Failed to subscribe user', gw_transaction_id: gw_transaction_id})
				}
			}else{
				coreRepo.createBlockUserHistory(msisdn, req.body.affiliate_unique_transaction_id, req.body.affiliate_mid, response ? response.api_response : "no response", req.body.source);
				res.send({code: config.codes.code_error, message: "Not a valid Telenor number.", gw_transaction_id: gw_transaction_id });
			}
		}else{
			if(user.is_black_listed){
				console.log(`The user ${user.msisdn} is blacklisted`);
				res.send({code: config.codes.code_error, message: "The user is blacklisted", gw_transaction_id: gw_transaction_id});
			}else{
				let subscription = await subscriptionRepo.getOneSubscription(user._id);
				if(subscription){
					if(subscription.subscription_status === 'billed' && subscription.is_allowed_to_stream === true) {
						res.send({code: config.codes.code_success, message: 'Welcome back. You are signed in successfully.', gw_transaction_id: gw_transaction_id});
					}else{
						doSubscribe(req, res, user, gw_transaction_id);
					}
				}else{
					doSubscribe(req, res, user, gw_transaction_id);
				}
			}
		}
	}
}

doSubscribe = async(req, res, user, gw_transaction_id) => {
	let headers = req.headers;

	if(user && user.active === true && user.is_black_listed === false){
		
		let newPackageId = req.body.package_id;
		let packageObj = await coreRepo.getPackage(newPackageId);
		if (packageObj) {
			let isExist = await subscriptionRepo.getSubscriptionByPaywallId(user._id, packageObj.paywall_id);
			if(!isExist){
				
				// No subscription available, let's create one
				let subscriptionObj = {};
				subscriptionObj.user_id = user._id;
				subscriptionObj.paywall_id = packageObj.paywall_id;
				subscriptionObj.subscribed_package_id = newPackageId;
				subscriptionObj.source = req.body.source ?  req.body.source : 'na';
				subscriptionObj.payment_source = req.body.payment_source ? req.body.payment_source : "telenor";
				subscriptionObj.user_agent = headers['user-agent'];
				subscriptionObj.ip_address = headers['x-forwarded-for'];

				// First check, if there is any other subscription of the same subscriber having payment source easypaisa and having ep token
				let alreadyEpSubscriptionsAvailable = await subscriptionRepo.getSubscriptionHavingPaymentSourceEP(user._id);
				if(alreadyEpSubscriptionsAvailable){
					// already ep subscription available, let's use the same token
					// No subscription available, let's create one
					subscriptionObj.ep_token = alreadyEpSubscriptionsAvailable.ep_token;
				}

				if(req.body.marketing_source){
					subscriptionObj.marketing_source = req.body.marketing_source;
				}else{
					subscriptionObj.marketing_source = 'na';
				}
	
				if(req.body.affiliate_unique_transaction_id || req.body.affiliate_mid){
					subscriptionObj.affiliate_unique_transaction_id = req.body.affiliate_unique_transaction_id;
					subscriptionObj.affiliate_mid = req.body.affiliate_mid;
					subscriptionObj.should_affiliation_callback_sent = true;
				}
				
				subscriptionObj.active = true;
				subscriptionObj.amount_billed_today = 0;


				// expected responses of processDirectBilling
				// {"status":"PRE_ACTIVE","activationTime":1675484672,"expireTime":1675537200,"activationChannel":"API","serviceVariant":{"id":99144,"externalId":99144,"name":"GOONJ DAILY"},"purchasePrice":5.97,"product":{"id":67,"name":"THIRD_PARTY_GOONJ","type":"EXTERNAL"},"service":{"id":77,"name":"GOONJ","renewalWindows":[{"from":"05:00","to":"12:00"},{"from":"13:00","to":"16:00"},{"from":"17:00","to":"23:00"}]}}
				// {"status":"ACTIVE","activationTime":1675403635,"expireTime":1675450800,"activationChannel":"API","serviceVariant":{"id":99144,"externalId":99144,"name":"GOONJ DAILY"},"purchasePrice":5.97,"product":{"id":67,"name":"THIRD_PARTY_GOONJ","type":"EXTERNAL"},"service":{"id":77,"name":"GOONJ","renewalWindows":[{"from":"05:00","to":"12:00"},{"from":"13:00","to":"16:00"},{"from":"17:00","to":"23:00"}]}}
				// { "requestId":"100157-10201433-1", "errorCode": "500.072.05", "errorMessage": "Exception during Subscribe. Response: Response{status=SUBSCRIPTION_ALREADY_EXISTS, message='null', result=null}"}
				try {
					let result = undefined;
					if(subscriptionObj.payment_source === 'telenor') {
						result = await tpEpCoreRepo.subscribe(user.msisdn, packageObj.pid);
					}else{
						result = await tpEpCoreRepo.processDirectBilling(req.body.otp? req.body.otp : undefined, user, subscriptionObj, packageObj,true);
					}
					console.log(result);
					
					if(result && (result.respose.status === "ACTIVE" || result.message === "success")){
						subscriptionObj.subscription_status = 'billed';
						subscriptionObj.is_allowed_to_stream = true;
						subscription.last_billing_timestamp = helper.setDateWithTimezone(new Date());

						let subscription = await subscriptionRepo.createSubscription(subscriptionObj);
						await coreRepo.createViewLog(user._id, subscription._id, subscription.source, subscription.payment_source, subscription.marketing_source);
						await billingHistoryRepo.assembleBillingHistory(user, subscription, packageObj, result.response);
						
						res.send({code: config.codes.code_success, message: 'User Successfully Subscribed!', gw_transaction_id: gw_transaction_id});
					}else if(result && (result.respose.status === "PRE_ACTIVE" || result.message === "failed")){
						
						subscriptionObj.subscription_status = 'trial';
						subscriptionObj.is_allowed_to_stream = true;
						subscriptionObj.should_affiliation_callback_sent = false;
						subscription.last_billing_timestamp = helper.setDateWithTimezone(new Date());

						let subscription = await subscriptionRepo.createSubscription(subscriptionObj);
						await coreRepo.createViewLog(user._id, subscription._id, subscription.source, subscription.payment_source, subscription.marketing_source);
						await billingHistoryRepo.assembleBillingHistory(user, subscription, packageObj, result.response);
						
						res.send({code: config.codes.code_trial_activated, message: 'Trial period activated!', gw_transaction_id: gw_transaction_id});
					}else {
						console.log("First time billing failed: ",result, user.msisdn);
						res.send({code: config.codes.code_error, message: 'Failed to subscribe package, please try again', gw_transaction_id: gw_transaction_id});
					}
				} catch(err){
					console.log("Error while direct billing first time: ",err.message, user.msisdn);
					res.send({code: config.codes.code_error, message: 'Failed to subscribe package, please try again', gw_transaction_id: gw_transaction_id});
				}
			}else {
				if(isExist.active === true){
					await coreRepo.createViewLog(user._id, isExist._id, isExist.source, isExist.payment_source, isExist.marketing_source);
					res.send({code: config.codes.code_already_subscribed, message: 'Subscriber already exists', gw_transaction_id: gw_transaction_id});
				}else{
					res.send({code: config.codes.code_error, message: 'The susbcriber is not active.', gw_transaction_id: gw_transaction_id});
				}
			}
		} else {
			res.send({code: config.codes.code_error, message: 'Package does not exist', gw_transaction_id: gw_transaction_id});
		}	
	} else {
		res.send({code: config.codes.code_error, message: 'Blocked user', gw_transaction_id: gw_transaction_id});
	}
}

reSubscribe = async(subscription, history) => {
	let dataToUpdate = {};
	dataToUpdate.auto_renewal = true;
	dataToUpdate.subscription_status = subscription.last_subscription_status;
	dataToUpdate.is_allowed_to_stream = true;

	let update = await subscriptionRepo.updateSubscription(subscription._id, dataToUpdate);
	if(update){
		history.billing_status = "subscription-request-received-for-the-same-package-after-unsub";
		await billingHistoryRepo.createBillingHistory(history);
	}
}

exports.recharge = async (req, res) => {
	let gw_transaction_id = req.body.gw_transaction_id;

	let user_id = req.body.uid;
	let msisdn = req.body.msisdn;
	let package_id = req.body.package_id;
	let source = req.body.source;

	if(!package_id){
		package_id = config.default_package_id;
	}
	
	let user;
	if(user_id){
		user = await userRepo.getUserById(user_id);
	}else if(msisdn){
		user = await userRepo.getUserByMsisdn(msisdn);
	}

	if(user){
		let subscription = await subscriptionRepo.getSubscriptionByPackageId(user._id, package_id);
		console.log("Subscription",subscription);
		if(subscription && subscription.subscription_status === 'graced'){
			if(subscription.is_billable_in_this_cycle === true){
				res.send({code: config.codes.code_in_billing_queue, message: 'Already in billing process!', gw_transaction_id: gw_transaction_id});
			}else{
				// try charge attempt
				let packageObj = await coreRepo.getPackage(package_id);
				if(packageObj){
					await subscriptionRepo.updateSubscription(subscription._id, {consecutive_successive_bill_counts: 0, is_manual_recharge: true});
					let result = await tpEpCoreRepo.processDirectBilling(undefined, user, subscription, packageObj, true);
					console.log('returned response 0:', result);
					if(result.message === "success"){
						res.send({code: config.codes.code_success, message: 'Recharged successfully', gw_transaction_id: gw_transaction_id});
					}else {
						res.send({code: config.codes.code_error, message: 'Failed to recharge', gw_transaction_id: gw_transaction_id});
					
				}
			}
		}
		}else{
			res.send({code: config.codes.code_error, message: 'Invalid data provided.', gw_transaction_id: gw_transaction_id});
		}
	}
}

// Check status
exports.status = async (req, res) => {
	let gw_transaction_id = req.body.gw_transaction_id;
	let user = undefined;

	let msisdn = req.body.msisdn;
	let package_id = req.body.package_id;
	let user_id = req.body.user_id;
	let marketing_source = req.body.marketing_source ? req.body.marketing_source : 'na';

	if(!package_id){
		package_id = config.default_package_id;
	}
	
	if (user_id){
		user = await userRepo.getUserById(user_id);
	} else {
		user = await userRepo.getUserByMsisdn(msisdn);
	}
	//console.log("user", user);
	if(user){
			let result;
			if(package_id){
				result = await subscriptionRepo.getSubscriptionByUserId(user._id);
			}
			
			if(result){
				await coreRepo.createViewLog(user._id, result._id, result.source, result.payment_source, marketing_source);
				res.send({code: config.codes.code_success, 
					subscribed_package_id: result.subscribed_package_id, 
					data: {
						subscription_status: result.subscription_status,
						user_id: result.user_id,
						auto_renewal: result.auto_renewal,
						is_gray_listed: result.is_gray_listed,
						is_black_listed: result.is_black_listed,
						queued: result.queued,
						is_billable_in_this_cycle: false,
						is_allowed_to_stream: result.is_allowed_to_stream,
						active: result.active,
						next_billing_timestamp: result.next_billing_timestamp
					}, 
					gw_transaction_id: gw_transaction_id});	
			}else{
				res.send({code: config.codes.code_error, data: 'No subscriptions was found', gw_transaction_id: gw_transaction_id});	
			}
	}else{
		res.send({code: config.codes.code_error, message: 'Invalid msisdn provided.', gw_transaction_id: gw_transaction_id});
	}
}

exports.checkStatus = async (req, res) => {
	let {msisdn, gw_transaction_id} = req.body;
	let user = await userRepo.getUserByMsisdn(msisdn);
	if(!user) res.send({code: config.codes.code_error, message: 'No user found!', gw_transaction_id: gw_transaction_id});

	let result = await subscriptionRepo.getSubscriptionByUserId(user._id);
	if(!result) res.send({code: config.codes.code_error, data: 'No subscription found!', gw_transaction_id: gw_transaction_id});

	res.send({code: config.codes.code_success, 
		data: {
			subscribed_package_id: result.subscribed_package_id,
			subscription_status: result.subscription_status,
			user_id: result.user_id,
			auto_renewal: result.auto_renewal,
			is_allowed_to_stream: result.is_allowed_to_stream,
			active: result.active
		}, 
		gw_transaction_id: gw_transaction_id});
}


exports.getAllSubscriptions = async (req, res) => {
	let gw_transaction_id = req.query.gw_transaction_id;
	let msisdn = req.query.msisdn;
	let user = await userRepo.getUserByMsisdn(msisdn);
	if(user){
			let result = await subscriptionRepo.getAllActiveSubscriptions(user._id);
			if(result && result.length > 0){
				let subscriptions = [];
				for(let i = 0; i < result.length; i++){
					let sub = {};
					sub.subscription_status = result[i].subscription_status,
					sub.subscribed_package_id = result[i].subscribed_package_id,
					sub.user_id = user._id,
					sub.auto_renewal = result[i].auto_renewal,
					sub.is_gray_listed = result[i].is_gray_listed,
					sub.is_black_listed = result[i].is_black_listed,
					sub.queued = result[i].queued,
					sub.is_allowed_to_stream = result[i].is_allowed_to_stream,
					sub.active = result[i].active,
					sub.next_billing_timestamp = result[i].next_billing_timestamp
					subscriptions.push(sub);
				}

				res.send({code: config.codes.code_success, 
					data: subscriptions,
					gw_transaction_id: gw_transaction_id});	
			}else{
				res.send({code: config.codes.code_error, data: 'No active subscription found', gw_transaction_id: gw_transaction_id});	
			}
	}else{
		res.send({code: config.codes.code_error, message: 'Invalid msisdn provided.', gw_transaction_id: gw_transaction_id});
	}
}

// UnSubscribe
exports.unsubscribe = async (req, res) => {
	let gw_transaction_id = req.body.gw_transaction_id;
	
	let user;
	let msisdn = req.body.msisdn;
	let user_id = req.body.user_id;
	let source = req.body.source;

	if (user_id) {
		user = await userRepo.getUserById(user_id);
	}else if(msisdn){
		user = await userRepo.getUserByMsisdn(msisdn);
	}
	if(user){
		let packageObj = await coreRepo.getPackage(subscription.subscribed_package_id);
		let subscription = await subscriptionRepo.getSubscriptionByUserId(user._id);
		if(subscription) {
			//{"code":0,"response_time":"600","response":{"requestId": "74803-26204131-1", "message": "SUCCESS"}}
			//{"code":0,"response_time":"600","response":{"requestId":"7244-22712370-1","errorCode":"500.072.05","errorMessage":"Exception during Unsubscribe. Response: Response{status=SUBSCRIPTION_IS_ALREADY_INACTIVE, message='null', result=null}"}}
			if(subscription.subscription_status === 'expired') {
				res.send({code: config.codes.code_success, message: 'Already unsubscribed', gw_transaction_id: gw_transaction_id});
				return;
			}
			
			let tpResponse = await tpEpCoreRepo.unsubscribe(user.msisdn, packageObj.pid);
			if(tpResponse.response.message === "SUCCESS") {
				await subscriptionRepo.updateSubscription(subscription._id, 
				{
					auto_renewal: false, 
					consecutive_successive_bill_counts: 0,
					is_allowed_to_stream: false,
					is_billable_in_this_cycle: false,
					queued: false,
					try_micro_charge_in_next_cycle: false,
					micro_price_point: 0,
					last_subscription_status: subscription.subscription_status,
					subscription_status: "expired",
					priority: 0,
					amount_billed_today: 0
				});
				
				let history = {};
				history.user_id = user._id;
				history.msisdn = user.msisdn;
				history.package_id = subscription.subscribed_package_id;
				history.subscription_id = subscription._id;
				history.billing_status = 'unsubscribe-request-received-and-expired';
				history.source = source ? source : subscription.source;
				history.operator = user.operator;
				history.operator_response = tpResponse;
				await billingHistoryRepo.createBillingHistory(history);
				res.send({code: config.codes.code_success, message: 'Successfully unsubscribed', gw_transaction_id: gw_transaction_id});
			}else{
				res.send({code: config.codes.code_error, message: 'Failed to unsubscribe', gw_transaction_id: gw_transaction_id});	
			}
			
 		}else{
			res.send({code: config.codes.code_error, message: 'No subscription found!', gw_transaction_id: gw_transaction_id});	
		}
	}else{
		res.send({code: config.codes.code_error, message: 'Invalid user/msisdn provided.', gw_transaction_id: gw_transaction_id});
	}
}

exports.ccd_unsubscribe = async(req, res) => {
	try{
		let {gw_transaction_id, msisdn, slug, source} = req.body;

		if(slug === undefined){
			slug = 'all';
		}

		let user  = await userRepo.getUserByMsisdn(msisdn);
		
		let subscriptionsToUnsubscribe = [];
		
		if(user){
			let subscriptions = await subscriptionRepo.getAllSubscriptions(user._id);
			let alreadyUnsubscribed = 0;

			if(slug && (slug === "all" || slug === "live")){
				for (let i =0 ; i < subscriptions.length; i++) {
					if(subscriptions[i].subscription_status === 'expired'){
						alreadyUnsubscribed += 1;   
					}else{
						subscriptionsToUnsubscribe.push(subscriptions[i]);
					}
				}

				if(subscriptionsToUnsubscribe.length > 0){
					let unsubscribed = 0;
					for (let i =0 ; i < subscriptionsToUnsubscribe.length; i++) {
						let subscription = subscriptions[i];
	
						let packageObj = await coreRepo.getPackage(subscription.subscribed_package_id);
	
						let history = {};
						history.user_id = subscription.user_id;
						history.subscription_id = subscription._id;
						history.package_id = subscription.subscribed_package_id;
						history.paywall_id = packageObj.paywall_id;
						history.billing_status = 'expired';
						history.source = source ? source : 'ccp_api';
						history.operator = 'telenor';
	
						unsubscribed += 1;
	
						expire_ccd_subscription(subscription, user.msisdn, history);
					}
	
					if(subscriptionsToUnsubscribe.length === unsubscribed){
						res.send({message: "Requested subscriptions has unsubscribed!", gw_transaction_id: gw_transaction_id});
					}else{
						res.send({message: "Failed to unsubscribe!", gw_transaction_id: gw_transaction_id});
					}
				}else{
					if(alreadyUnsubscribed > 0){
						res.send({message: "Dear customer, you are not a subscribed user", gw_transaction_id: gw_transaction_id});
					}else{
						res.send({message: "This service is not active at your number", gw_transaction_id: gw_transaction_id});
					}
				}


			}else{
				res.send({message: "Invalid slug provided!", gw_transaction_id: gw_transaction_id});
			}	
		}else{
			res.send({message: "This service is not active at your number", gw_transaction_id: gw_transaction_id});
		}
	}catch(err){
		console.log("=>", err);
		res.send({message: "Error occured", gw_transaction_id: gw_transaction_id});
	}
}

expire_ccd_subscription = async(subscription, msisdn, history) => {
	return new Promise(async (resolve,reject) => {
		try {
			if (subscription) {
				await subscriptionRepo.updateSubscription(subscription._id, {
					auto_renewal: false, 
					consecutive_successive_bill_counts: 0,
					is_allowed_to_stream: false,
					is_billable_in_this_cycle: false,
					queued: false,
					try_micro_charge_in_next_cycle: false,
					micro_price_point: 0,
					last_subscription_status: subscription.subscription_status,
					subscription_status: "expired",
					priority: 0,
					amount_billed_today: 0
				});
				
				await billingHistoryRepo.createBillingHistory(history);
	
				// send sms to user
				let text = `Apki Goonj TV per Live TV Weekly ki subscription khatm kr di gai ha. Phr se subscribe krne k lye link par click karen https://www.goonj.pk/ `;
				messageRepo.sendMessageDirectly(text, msisdn);

				resolve("Succesfully unsubscribed");
			} else {
				resolve("Subscription id not found");
			}
		} catch (err) {
			console.error(err);
			reject(err);
		}
	});
}

// Expire subscription
exports.expire = async (req, res) => {
	let msisdn = req.body.msisdn;
	let package_id = req.body.package_id;
	let source = req.body.source;

	if(!package_id){
		package_id = config.default_package_id;
	}

	let user = await userRepo.getUserByMsisdn(msisdn);
	if(user){
		let packageObj = await coreRepo.getPackage(package_id);
		let subscription = await subscriptionRepo.getSubscriptionByPackageId(user._id. package_id);
		await subscription.updateSubscription(subscription._id, {auto_renewal: false, subscription_status: 'expired', consecutive_successive_bill_counts: 0});
		
		
		let history = {};
		history.user_id = user._id;
		history.msisdn = user.msisdn;
		history.paywall_id = packageObj.paywall_id;
		history.package_id = packageObj._id;
		history.subscription_id = subscription._id;
		history.billing_status = 'expired';
		history.source = source ? source : "na";
		history.operator = user.operator;
		await billingHistoryRepo.createBillingHistory(history);
		
		
		
		res.send({code: config.code_success, message: 'Subscription successfully expired'});
	}else{
		res.send({code: config.codes.code_error, message: 'Invalid msisdn provided.'});
	}
}

exports.getSubscriptionByPackageId = async (req, res) => {
	let postData = req.query;
	let result = await subscriptionRepo.getSubscriptionByPackageId(postData.user_id, postData.package_id);
	res.send(result);
}

exports.getPackagesOfSubscriber = async (req, res) => {
	let postData = req.query;
	let result = await subscriptionRepo.getPackagesOfSubscriber(postData.user_id);
	res.send(result);
}

readFileSync = async (jsonPath) => {
    return new Promise((resolve, reject) => {
        try{
            const readInterface = readline.createInterface({
                input: fs.createReadStream(jsonPath)
            });
            let inputData = [];
            let counter = 0;
            readInterface.on('line', function(line) {
                inputData.push(line);
                counter += 1;
            });
    
            readInterface.on('close', function(line) {
                resolve(inputData);
            });
        }catch(e){
            reject(e);
        }
    });
}

exports.markDoubleChargedAsActive = async (req, res) => {
	var jsonPath = path.join(__dirname, '..', 'file.txt');
	let inputData = await readFileSync(jsonPath);
	console.log("Input Data Length: ", inputData.length);
	for(let i = 0; i < inputData.length; i++){
		subscriptionRepo.updateSubscription(inputData[i], {active: true});
	}
}

exports.count_affiliate_subscriptions = async(req, res) => {
	let {mid} = req.query;
	let today = new Date();
	today.setHours(0, 0, 0, 0);

	let subscriptions = await subscriptionRepo.getAffiliateSubscriptions(mid, today);
	res.status(200).send(subscriptions);

}

exports.report = async(req, res) => {
	await subscriptionService.freeStream();
	res.send({message: "executing free stream"});
}