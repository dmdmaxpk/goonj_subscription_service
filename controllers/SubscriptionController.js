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
const { use } = require('../routes');

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

// new to flows
exports.subscribeNow = async(req, res) => {
	
	let gw_transaction_id = req.body.gw_transaction_id;
	let decodedResponse = await coreRepo.getDecoded(req);
	let decodedUser = decodedResponse.decoded;
	let headers = req.headers;

	console.log('-----SUBSCRIBE-----', req.body, decodedUser);

	if(decodedUser && decodedUser.msisdn){
		let {msisdn, package_id, source, payment_source, marketing_source, affiliate_unique_transaction_id, affiliate_mid} = req.body;
		source = source ? source : 'na';
		
		let user = await userRepo.getUserByMsisdn(msisdn);
		if(!user) {
			try{
				await createUser(msisdn, source);
				user = await userRepo.getUserByMsisdn(msisdn);
			}catch(e){
				res.send({code: config.codes.code_error, message: e.message, gw_transaction_id: gw_transaction_id})
				return;
			}
		}

		if(user) {
			if(user.is_black_listed === true) {
				console.log(`The user ${user.msisdn} is blacklisted`);
				res.send({code: config.codes.code_error, message: "The user is blacklisted", gw_transaction_id: gw_transaction_id});
				return;
			}

			let packageObj = await coreRepo.getPackage(package_id);
			if (packageObj) {
				let subscription = await subscriptionRepo.getSubscriptionByUserId(user._id);
				if(subscription) {
					if(subscription.is_black_listed === true) {
						console.log(`The subscription ${user.msisdn} is blacklisted`);
						res.send({code: config.codes.code_error, message: "The subscription is blacklisted", gw_transaction_id: gw_transaction_id});
						return;
					}

					if(subscription.subscription_status === 'billed' && subscription.is_allowed_to_stream === true) {
						res.send({code: config.codes.code_success, message: 'Welcome back. You are signed in successfully.', gw_transaction_id: gw_transaction_id});
						return;
					}else{

						let chargingResponse = undefined;

						if(subscription.payment_source === 'easypaisa') {
							chargingResponse = await tpEpCoreRepo.subscribeEp(req.body.otp, user.msisdn, packageObj.price_point_pkr, subscription.ep_token);
							console.log("billing response of easypaisa but not billed customer: ", user.msisdn, chargingResponse);
						}else {
							// expected responses of processDirectBilling
							// {"status":"PRE_ACTIVE","activationTime":1675484672,"expireTime":1675537200,"activationChannel":"API","serviceVariant":{"id":99144,"externalId":99144,"name":"GOONJ DAILY"},"purchasePrice":5.97,"product":{"id":67,"name":"THIRD_PARTY_GOONJ","type":"EXTERNAL"},"service":{"id":77,"name":"GOONJ","renewalWindows":[{"from":"05:00","to":"12:00"},{"from":"13:00","to":"16:00"},{"from":"17:00","to":"23:00"}]}}
							// {"status":"ACTIVE","activationTime":1675403635,"expireTime":1675450800,"activationChannel":"API","serviceVariant":{"id":99144,"externalId":99144,"name":"GOONJ DAILY"},"purchasePrice":5.97,"product":{"id":67,"name":"THIRD_PARTY_GOONJ","type":"EXTERNAL"},"service":{"id":77,"name":"GOONJ","renewalWindows":[{"from":"05:00","to":"12:00"},{"from":"13:00","to":"16:00"},{"from":"17:00","to":"23:00"}]}}
							// { "requestId":"100157-10201433-1", "errorCode": "500.072.05", "errorMessage": "Exception during Subscribe. Response: Response{status=SUBSCRIPTION_ALREADY_EXISTS, message='null', result=null}"}
							chargingResponse = await tpEpCoreRepo.subscribe(user.msisdn, packageObj.pid);
							console.log("billing response of existing but not billed customer: ", user.msisdn, chargingResponse);
						}	

						if(chargingResponse && (chargingResponse.response.status === "ACTIVE" || chargingResponse.message === 'success')){
						
							let serverDate = new Date();
							let localDate = helper.setDateWithTimezone(serverDate);
							let nextBilling = _.clone(localDate);
							nextBilling = nextBilling.setHours(nextBilling.getHours() + packageObj.package_duration);

							subscription.last_subscription_status = subscription.subscription_status;
							subscription.last_billing_timestamp = localDate;
							subscription.next_billing_timestamp = nextBilling;
							subscription.subscription_status = 'billed';
							subscription.is_allowed_to_stream = true;
							subscription.active = true;
							subscription.amount_billed_today = packageObj.price_point_pkr;

							await subscriptionRepo.updateSubscription(subscription._id, subscription);
							await coreRepo.createViewLog(user._id, subscription._id, subscription.source, subscription.payment_source, subscription.marketing_source);
							await billingHistoryRepo.assembleBillingHistoryV2(user, subscription, packageObj, chargingResponse.response);

							
							res.send({code: config.codes.code_success, message: 'User signed-in successfully', gw_transaction_id: gw_transaction_id});
						}else{
							await coreRepo.createViewLog(user._id, subscription._id, subscription.source, subscription.payment_source, subscription.marketing_source);
							await billingHistoryRepo.assembleBillingHistoryV2(user, subscription, packageObj, chargingResponse.response);

							res.send({code: config.codes.code_error, message: 'Failed to subscribe, please try again', gw_transaction_id: gw_transaction_id});
						}
					}
				}else{

					let subscriptionObj = {};
					subscriptionObj.user_id = user._id;
					subscriptionObj.paywall_id = packageObj.paywall_id;
					subscriptionObj.subscribed_package_id = package_id;
					subscriptionObj.source = req.body.source ?  req.body.source : 'unknown';
					subscriptionObj.payment_source = req.body.payment_source ? req.body.payment_source : "telenor";
					subscriptionObj.user_agent = headers['user-agent'];
					subscriptionObj.ip_address = headers['x-forwarded-for'];
					subscriptionObj.active = true;

					if(marketing_source){
						subscriptionObj.marketing_source = marketing_source;
					}else{
						subscriptionObj.marketing_source = 'na';
					}
		
					if(affiliate_unique_transaction_id || affiliate_mid){
						subscriptionObj.affiliate_unique_transaction_id = affiliate_unique_transaction_id;
						subscriptionObj.affiliate_mid = affiliate_mid;
						subscriptionObj.should_affiliation_callback_sent = true;
					}else{
						subscriptionObj.should_affiliation_callback_sent = false;
					}
					let chargingResponse = undefined;
					
					if(payment_source === 'easypaisa') {
						chargingResponse = await tpEpCoreRepo.subscribeEp(req.body.otp, user.msisdn, packageObj.price_point_pkr, undefined);
						console.log("billing response of easypaisa but not billed customer: ", user.msisdn, chargingResponse);
					}else {
						// expected responses of processDirectBilling
						// {"status":"PRE_ACTIVE","activationTime":1675484672,"expireTime":1675537200,"activationChannel":"API","serviceVariant":{"id":99144,"externalId":99144,"name":"GOONJ DAILY"},"purchasePrice":5.97,"product":{"id":67,"name":"THIRD_PARTY_GOONJ","type":"EXTERNAL"},"service":{"id":77,"name":"GOONJ","renewalWindows":[{"from":"05:00","to":"12:00"},{"from":"13:00","to":"16:00"},{"from":"17:00","to":"23:00"}]}}
						// {"status":"ACTIVE","activationTime":1675403635,"expireTime":1675450800,"activationChannel":"API","serviceVariant":{"id":99144,"externalId":99144,"name":"GOONJ DAILY"},"purchasePrice":5.97,"product":{"id":67,"name":"THIRD_PARTY_GOONJ","type":"EXTERNAL"},"service":{"id":77,"name":"GOONJ","renewalWindows":[{"from":"05:00","to":"12:00"},{"from":"13:00","to":"16:00"},{"from":"17:00","to":"23:00"}]}}
						// { "requestId":"100157-10201433-1", "errorCode": "500.072.05", "errorMessage": "Exception during Subscribe. Response: Response{status=SUBSCRIPTION_ALREADY_EXISTS, message='null', result=null}"}
						chargingResponse = await tpEpCoreRepo.subscribe(user.msisdn, packageObj.pid);
						console.log("first time billing response: ", user.msisdn, chargingResponse);
					}

					
					if(chargingResponse && (chargingResponse.response.status === "ACTIVE" || chargingResponse.message === 'success')){
						let serverDate = new Date();
						let localDate = helper.setDateWithTimezone(serverDate);
						let nextBilling = _.clone(localDate);
						nextBilling = nextBilling.setHours(nextBilling.getHours() + packageObj.package_duration);

						
						subscriptionObj.last_billing_timestamp = localDate;
						subscriptionObj.next_billing_timestamp = nextBilling;
						subscriptionObj.subscription_status = 'billed';
						subscriptionObj.is_allowed_to_stream = true;
						subscriptionObj.amount_billed_today = packageObj.price_point_pkr;

						let subscription = await subscriptionRepo.createSubscription(subscriptionObj);
						await coreRepo.createViewLog(user._id, subscription._id, subscription.source, subscription.payment_source, subscription.marketing_source);
						await billingHistoryRepo.assembleBillingHistoryV2(user, subscription, packageObj, chargingResponse.response);

						res.send({code: config.codes.code_success, message: 'User signed-in successfully.', gw_transaction_id: gw_transaction_id});
						return;

					}else if(chargingResponse && chargingResponse.response && chargingResponse.response.status === "PRE_ACTIVE") {
						let serverDate = new Date();
						let localDate = helper.setDateWithTimezone(serverDate);
						let nextBilling = _.clone(localDate);
						nextBilling = nextBilling.setHours(nextBilling.getHours() + packageObj.trial_hours);
						
						subscriptionObj.last_billing_timestamp = localDate;
						subscriptionObj.next_billing_timestamp = nextBilling;
						subscriptionObj.subscription_status = 'trial';
						subscriptionObj.is_allowed_to_stream = true;
						subscriptionObj.should_affiliation_callback_sent = false;
						subscriptionObj.amount_billed_today = 0;

						let subscription = await subscriptionRepo.createSubscription(subscriptionObj);
						await coreRepo.createViewLog(user._id, subscription._id, subscription.source, subscription.payment_source, subscription.marketing_source);
						await billingHistoryRepo.assembleBillingHistoryV2(user, subscription, packageObj, chargingResponse.response);

						res.send({code: config.codes.code_trial_activated, message: 'Trial period activated!', gw_transaction_id: gw_transaction_id});
						return;

					}else{

						setTimeout(async() => {
							let subscription = await subscriptionRepo.getSubscriptionByUserId(user._id);

							// already exist
							subscriptionObj.subscription_status = 'trial';
							subscriptionObj.is_allowed_to_stream = false;
							subscriptionObj.amount_billed_today = 0;

							subscription = await subscriptionRepo.createSubscription(subscriptionObj);
							await coreRepo.createViewLog(user._id, subscription._id, subscription.source, subscription.payment_source, subscription.marketing_source);
							await billingHistoryRepo.assembleBillingHistoryV2(user, subscription, packageObj, chargingResponse.response);

							res.send({code: config.codes.code_error, message: 'Failed to subscribe, please try again', gw_transaction_id: gw_transaction_id});
							return;
						}, 5000);
					}
				}
			}else{
				res.send({code: config.codes.code_error, message: 'Package not found', gw_transaction_id: gw_transaction_id})
				return;
			}
		}else{
			res.send({code: config.codes.code_error, message: 'Failed to create user.', gw_transaction_id: gw_transaction_id})
			return;
		}
	}else{
		res.send({code: config.codes.code_error, message: 'Decoded data not found.', gw_transaction_id: gw_transaction_id})
		return;
	}
}

createUser = async(msisdn, source) => {
	
	let userObj = {};
	userObj.msisdn = msisdn;
	userObj.source = source ? source : "app";

	try{
		let response = await tpEpCoreRepo.subscriberQuery(msisdn);
		if(response && (response.operator === "telenor") || response.operator === 'easypaisa'){
			try {
				userObj.operator = response.operator;
				await userRepo.createUser(userObj);
				return;
			} catch(er) {
				console.log(er);
				throw new Error("Something went wrong while running subsriber query");
			}
		}else{
			throw new Error("Not a valid Telenor/Easypaisa number.");
		}

	}catch(err){
		throw new Error("Subscriber query API isn't responding. Try again in few minutes.");
	}
}

subscribeAndCreateSubscription = async(user, packageObj, payment_source, marketing_source, affiliate_tid, affiliate_mid) => {
	
	let subscriptionObj = {};
	subscriptionObj.user_id = user._id;
	subscriptionObj.paywall_id = packageObj.paywall_id;
	subscriptionObj.subscribed_package_id = packageObj._id;
	subscriptionObj.source = user.source;
	subscriptionObj.payment_source = payment_source ? payment_source : "telenor";
	subscriptionObj.user_agent = headers['user-agent'];
	subscriptionObj.ip_address = headers['x-forwarded-for'];
	subscriptionObj.marketing_source = marketing_source ? marketing_source : "na";
	subscriptionObj.active = true;
	subscriptionObj.amount_billed_today = 0;

	if(affiliate_tid){
		subscriptionObj.affiliate_unique_transaction_id = affiliate_tid;
		subscriptionObj.should_affiliation_callback_sent = true;
	}

	if(affiliate_mid) {
		subscriptionObj.affiliate_mid = affiliate_mid;
		subscriptionObj.should_affiliation_callback_sent = true;
	}

	try {
		let result = await tpEpCoreRepo.processDirectBilling(undefined, user, subscriptionObj, packageObj, true, false);
		if(result && result.message === "success"){
			return;
		}else{
			throw new Error("Failed to subscribe. Possible cause: insufficient balance");
		}
	} catch(err) {
		throw new Error("Error, failed to subscribe. Try again.");
	}
	
}

doSubscribe = async(req, res, user, gw_transaction_id) => {
	let headers = req.headers;
	console.log("headers", headers);

	if(user && user.active === true && user.is_black_listed === false){
		
		let newPackageId = req.body.package_id;
		let packageObj = await coreRepo.getPackage(newPackageId);
		if (packageObj) {
			let subscription = await subscriptionRepo.getSubscriptionByPaywallId(user._id, packageObj.paywall_id);
			if(!subscription){
				
				// No subscription available, let's create one
				let subscriptionObj = {};
				subscriptionObj.user_id = user._id;
				subscriptionObj.paywall_id = packageObj.paywall_id;
				subscriptionObj.subscribed_package_id = newPackageId;
				subscriptionObj.source = req.body.source ?  req.body.source : 'unknown';
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

				// Check if trial is allowed by the system
				let sendTrialMessage = false;
				let sendChargingMessage = false;

				
				// TODO process billing directly and create subscription
				subscriptionObj.active = true;
				subscriptionObj.amount_billed_today = 0;


				// For affiliate/gdn users and for non-affiliate/non-gdn users
				// Logic - For affiliate/gdn: daily > micro ? trial
				// Logic - For non affiliate/non-gdn: weekly > micro ? trial
				// Logic will behave as per package is coming in request for subscription 
				// As in affiliate case package will be for daily so daily > micro > trial
				// And for non, package will be weekly, so: weekly > micro > trial
				if(packageObj.paywall_id === "ghRtjhT7"){
					try{
						// No micro charge for daily affiliate subscriptions
						if(packageObj._id === 'QDfC' && (req.body.affiliate_mid === 'gdn' || req.body.affiliate_mid === 'gdn1' || req.body.affiliate_mid === 'gdn2' || req.body.affiliate_mid === 'gdn3')){
							try {
								let result = await tpEpCoreRepo.processDirectBilling(req.body.otp? req.body.otp : undefined, user, subscriptionObj, packageObj,true);
								console.log("direct billing status 1", result.message)
								if(result && result.message === "success"){
									res.send({code: config.codes.code_success, message: 'User Successfully Subscribed!', gw_transaction_id: gw_transaction_id});
									sendChargingMessage = true;
								}else{
									let trial = await activateTrial(req.body.otp? req.body.otp : undefined, req.body.source, user, packageObj, subscriptionObj);
									if(trial === "done"){
										res.send({code: config.codes.code_trial_activated, message: 'Trial period activated!', gw_transaction_id: gw_transaction_id});
										sendTrialMessage = true;
									}
								}
							} catch(err){
								console.log("Error while direct billing first time",err.message,user.msisdn);
								res.send({code: config.codes.code_error, message: 'Failed to subscribe package, please try again', gw_transaction_id: gw_transaction_id});
							}
						}else if (req.body.affiliate_mid === '1569' || req.body.affiliate_mid === 'aff3a' || req.body.affiliate_mid === 'aff3' || req.body.affiliate_mid === 'goonj' || req.body.affiliate_mid === 'tp-gdn'){
							try {
								let result = await tpEpCoreRepo.processDirectBilling(req.body.otp? req.body.otp : undefined, user, subscriptionObj, packageObj,true);
								console.log("direct billing status 2", result.message)
								if(result && result.message === "success"){
									res.send({code: config.codes.code_success, message: 'User Successfully Subscribed!', gw_transaction_id: gw_transaction_id});
									sendChargingMessage = true;
								}else{
									let trial = await activateTrial(req.body.otp? req.body.otp : undefined, req.body.source, user, packageObj, subscriptionObj);
									if(trial === "done"){
										res.send({code: config.codes.code_trial_activated, message: 'Trial period activated!', gw_transaction_id: gw_transaction_id});
										sendTrialMessage = true;
									}
								}
							} catch(err){
								console.log("Error while direct billing first time",err.message,user.msisdn);
								res.send({code: config.codes.code_error, message: 'Failed to subscribe package, please try again', gw_transaction_id: gw_transaction_id});
							}
						}else{
							// Live paywall, subscription rules along with micro changing started
							let subsResponse = await doSubscribeUsingSubscribingRuleAlongWithMicroCharging(req.body.otp, req.body.source, user, packageObj, subscriptionObj);
							if(subsResponse && subsResponse.status === "charged"){
								res.send({code: config.codes.code_success, message: 'User Successfully Subscribed!', package_id: subsResponse.subscriptionObj.subscribed_package_id, gw_transaction_id: gw_transaction_id});
								sendChargingMessage = true;
							}else if(subsResponse && subsResponse.status === "trial"){
								res.send({code: config.codes.code_trial_activated, message: 'Trial period activated!', package_id: subsResponse.subscriptionObj.subscribed_package_id, gw_transaction_id: gw_transaction_id});
								sendTrialMessage = true;
							}else{
								res.send({code: config.codes.code_error, message: 'Failed to subscribe package' + (subsResponse.desc ? ', possible cause: '+subsResponse.desc : ''), package_id: subsResponse.subscriptionObj ? subsResponse.subscriptionObj.subscribed_package_id : '', gw_transaction_id: gw_transaction_id});
							}
							subscriptionObj = subsResponse.subscriptionObj;
							packageObj = subsResponse.subscriptionObj ? await coreRepo.getPackage(subscriptionObj.subscribed_package_id) : '';
						}
					}catch(err){
						console.log("=> ", err);
						sendTrialMessage = false;
						sendChargingMessage = false;
						res.send({code: config.codes.code_error, message: 'Failed to subscribe package, please try again', gw_transaction_id: gw_transaction_id});
					}
				}else{
					// comedy paywall
					res.send({code: config.codes.code_success, message: 'Comedy subscriptions are not allowed', gw_transaction_id: gw_transaction_id});
					/*try {
						let result = await tpEpCoreRepo.processDirectBilling(req.body.otp? req.body.otp : undefined, user, subscriptionObj, packageObj,true);
						if(result.message === "success"){
							res.send({code: config.codes.code_success, message: 'User Successfully Subscribed!', 
										gw_transaction_id: gw_transaction_id});
							sendChargingMessage = true;
						}else{
							res.send({code: config.codes.code_error, message: 'Failed to subscribe.', 
									gw_transaction_id: gw_transaction_id});
						}
					} catch(err){
						console.log("Error while direct billing first time",err.message,user.msisdn);
						res.send({code: config.codes.code_error, message: 'Failed to subscribe package, please try again', gw_transaction_id: gw_transaction_id});
					}*/
				}

				if (sendTrialMessage === true) {
					let trial_hours = packageObj.trial_hours;
					console.log("subscribed_package_id",subscriptionObj.subscribed_package_id, user.msisdn);
					console.log("source",subscriptionObj.affiliate_mid,user.msisdn);
					console.log("subscribed_package_id",constants.subscription_messages,user.msisdn);
					
					let message = constants.subscription_messages[subscriptionObj.subscribed_package_id];
					if (subscriptionObj.affiliate_mid === 'gdn'){
						message = constants.subscription_messages[subscriptionObj.affiliate_mid];
					}
					text = message;
					text = text.replace("%trial_hours%",trial_hours);
					text = text.replace("%price%",packageObj.display_price_point_numeric);
					text = text.replace("%user_id%",subscriptionObj.user_id);
					text = text.replace("%pkg_id%",packageObj._id);
					messageRepo.sendMessageDirectly(text, user.msisdn);
				} else if(sendChargingMessage === true) {
					let message = constants.subscription_messages_direct[packageObj._id];
					message= message.replace("%price%",packageObj.display_price_point)
					message= message.replace("%user_id%",subscriptionObj.user_id)
					message= message.replace("%pkg_id%",packageObj._id)
					if(subscriptionObj.affiliate_mid === 'gdn'){
						message = constants.subscription_messages[subscriptionObj.affiliate_mid];
					}
				
					messageRepo.sendMessageDirectly(message, user.msisdn);
				}
			}else {
				if(subscription.active === true){
					// Pass subscription through following checks before pushing into queue
					await coreRepo.createViewLog(user._id, subscription._id, subscription.source, subscription.payment_source, subscription.marketing_source);
					let currentPackageId = subscription.subscribed_package_id;
					let autoRenewal = subscription.auto_renewal;
					let is_allowed_to_stream = subscription.is_allowed_to_stream;

					if(subscription.queued === false){
						let history = {};
						history.user_id = user._id;
						history.msisdn = user.msisdn;
						history.subscription_id = subscription._id;

						// if both subscribed and upcoming packages are same
						if(currentPackageId === newPackageId){
							history.source = req.body.source;
							history.package_id = newPackageId;
							history.paywall_id = packageObj.paywall_id;

							if(subscription.subscription_status === 'billed' || subscription.subscription_status === 'trial'
										|| subscription.subscription_status === 'graced'){
								if(autoRenewal === true && is_allowed_to_stream === true){
									// Already subscribed, no need to subscribed package again
									history.billing_status = "subscription-request-received-for-the-same-package";
									await billingHistoryRepo.createBillingHistory(history);
									res.send({code: config.codes.code_already_subscribed, message: 'Already subscribed', gw_transaction_id: gw_transaction_id});
								}
								else if(autoRenewal === true && is_allowed_to_stream === false){
									// Already subscribed, no need to subscribed package again
									history.billing_status = "subscription-request-received-for-the-same-package";
									await billingHistoryRepo.createBillingHistory(history);
									res.send({code: config.codes.code_subscribed_but_unstreamable, message: 'Already Subscribed but not allowed to stream', gw_transaction_id: gw_transaction_id});
								}
								else{
									// Same package - just switch on auto renewal so that the user can get charge automatically.
									let updated = await subscriptionRepo.updateSubscription(subscription._id, {auto_renewal: true});
									if(updated){
										history.billing_status = "subscription-request-received-after-unsub";
										
										await billingHistoryRepo.createBillingHistory(history);
										res.send({code: config.codes.code_already_subscribed, message: 'Subscribed again after unsub', gw_transaction_id: gw_transaction_id});
									}else{
										res.send({code: config.codes.code_error, message: 'Error updating record!', gw_transaction_id: gw_transaction_id});
									}
								}
								
							}else{
								/* 
								* Not already billed
								* Let's send this item in queue and update package, auto_renewal and 
								* billing date times once user successfully billed
								*/
								let nextBillingTime = new Date(subscription.next_billing_timestamp);
								let today = new Date();

								if(subscription.subscription_status === 'expired' && (nextBillingTime > today)){
									if(subscription.last_subscription_status && subscription.last_subscription_status === "trial"){
										try {
											subscription.payment_source = req.body.payment_source;
											let result = await tpEpCoreRepo.processDirectBilling(req.body.otp? req.body.otp : undefined, user, subscription, packageObj,false);
											console.log('returned response 1', result);
											if(result.message === "success"){
												res.send({code: config.codes.code_success, message: 'Subscribed Successfully', gw_transaction_id: gw_transaction_id});
											}else{
												if(result.desc){
													if(result.desc === 'Easypaisa OTP not found'){
														res.send({code: config.codes.code_otp_not_found, message: result.desc, gw_transaction_id: gw_transaction_id});
													}else{
														res.send({code: config.codes.code_error, message: 'Failed to subscribe', gw_transaction_id: gw_transaction_id});
													}
												}
											}
										} catch(err){
											console.log(err);
											res.send({code: config.codes.code_error, message: 'Failed to subscribe, insufficient balance', gw_transaction_id: gw_transaction_id});
										}
									}else{
										await reSubscribe(subscription, history);
										let date = nextBillingTime.getDate()+"-"+(nextBillingTime.getMonth()+1)+"-"+nextBillingTime.getFullYear();
										
										let message = constants.resubscription_message.message;
										message = message.replace("%date%", date);
										message = message.replace("%user_id%",user._id)
										message = message.replace("%pkg_id%",packageObj._id)
										messageRepo.sendMessageDirectly(message, user.msisdn);
										
										res.send({code: config.codes.code_already_subscribed, message: 'You have already paid till '+date+'. Continue watching ', gw_transaction_id: gw_transaction_id});
									}
								}else{
									try {
										subscription.payment_source = req.body.payment_source;
										let result = await tpEpCoreRepo.processDirectBilling(req.body.otp? req.body.otp : undefined, user, subscription, packageObj,false);
										console.log('returned response 2: ', result);
										if(result.message === "success"){

											let message = constants.subscription_messages_direct[packageObj._id];
											message = message.replace("%price%",packageObj.display_price_point)
											message = message.replace("%user_id%",user._id)
											message = message.replace("%pkg_id%",packageObj._id)
											messageRepo.sendMessageDirectly(message, user.msisdn);

											res.send({code: config.codes.code_success, message: 'Subscribed Successfully chance', gw_transaction_id: gw_transaction_id});
										}else{
											res.send({code: config.codes.code_error, message: `Failed to subscribe, possible cause: ${result.desc ? result.desc : 'insufficient balance'}`, gw_transaction_id: gw_transaction_id});
										}
									} catch(err){
										console.log(err);
										res.send({code: config.codes.code_error, message: 'Failed to subscribe, insufficient balance', gw_transaction_id: gw_transaction_id});
									}
								}
							}
						}else{
								// request is coming for the same paywall but different package
								if (subscription.subscription_status === "billed"){
									let newPackageObj = await coreRepo.getPackage(newPackageId);
									let currentPackageObj = await coreRepo.getPackage(currentPackageId);

									if(newPackageObj.package_duration > currentPackageObj.package_duration){
										// It means switching from daily to weekly, process billing
										try {
											let result = await tpEpCoreRepo.processDirectBilling(req.body.otp? req.body.otp : undefined, user, subscription, packageObj,false);
											console.log('returned response 3:', result);
											if(result && result.message === "success"){
												res.send({code: config.codes.code_success, message: 'Package successfully switched.', gw_transaction_id: gw_transaction_id});
											}else{
												res.send({code: config.codes.code_error, message: `Failed to switch package, possible cause: ${result.desc ? result.desc : 'insufficient balance'}`, gw_transaction_id: gw_transaction_id});
											}
										} catch(graceErr){
											console.log(graceErr);
											res.send({code: config.codes.code_error, message: 'Failed to switch package, insufficient balance', gw_transaction_id: gw_transaction_id});
										}
									}else{
										// It means, package switching from weekly to daily // Weekly to daily switch message added
										let updated = await subscriptionRepo.updateSubscription(subscription._id, {auto_renewal: true, subscribed_package_id:newPackageId});
										let nextBillingDate = new Date(updated.next_billing_timestamp);
										nextBillingDate = nextBillingDate.toLocaleDateString();
										history.paywall_id = packageObj.paywall_id;
										history.package_id = newPackageId;
										history.billing_status = "package_change_upon_user_request";
										await billingHistoryRepo.createBillingHistory(history);
										let message = constants.message_on_weekly_to_daily_switch.message;
										let text = message;
										text = text.replace("%pkg_id%",packageObj._id);
										text = text.replace("%user_id%",user._id);
										text = text.replace("%current_date%", nextBillingDate);
										text = text.replace("%next_date%", nextBillingDate);
										messageRepo.sendMessageDirectly(text, user.msisdn);
										console.log("text", text);
										res.send({code: config.codes.code_success, message: 'Package successfully switched.', gw_transaction_id: gw_transaction_id});
									}
								} else if (subscription.subscription_status === "graced" || subscription.subscription_status === "expired" || subscription.subscription_status === "trial" ) {
								try {
									let result = await tpEpCoreRepo.processDirectBilling(req.body.otp? req.body.otp : undefined, user, subscription, packageObj,false);
									console.log('returned response 4:', result);
									if(result.message === "success"){
										res.send({code: config.codes.code_success, message: 'Package successfully switched.', gw_transaction_id: gw_transaction_id});
									}else{
										res.send({code: config.codes.code_error, message: `Failed to switch package, possible cause: ${result.desc ? result.desc : 'insufficient balance'}`, gw_transaction_id: gw_transaction_id});
									}
								} catch(graceErr){
									console.log(graceErr);
									res.send({code: config.codes.code_error, message: 'Failed to switch package, insufficient balance', gw_transaction_id: gw_transaction_id});
								}
							} else {
								res.send({code: config.codes.code_error, message: 'Failed to switch package,status not present', gw_transaction_id: gw_transaction_id});
							}
						}
					}else{
						res.send({code: config.codes.code_already_in_queue, message: 'The user is already in queue for processing.', gw_transaction_id: gw_transaction_id});
					}
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

activateTrial = async(otp, source, user, packageObj, subscriptionObj) => {

	console.log("warning", "trial sub obj", subscriptionObj);
	
	let trial_hours = packageObj.trial_hours;
	if (subscriptionObj.source === 'daraz'){
		trial_hours = 30;
	}

	let billingHistory = {};
	if(subscriptionObj.payment_source === "easypaisa"){
		packageObj.price_point_pkr = 1;
		let response = await tpEpCoreRepo.processDirectBilling(otp, user, subscriptionObj, packageObj, true);
		console.log('returned response5: ', result);
		if(response.success){
			billingHistory.transaction_id = response.api_response.response.orderId;
			billingHistory.operator_response = response.api_response;
		}
	}

	// Success billing


	let serverDate = new Date();
	let localDate = helper.setDateWithTimezone(serverDate);
	let nextBilling = _.clone(localDate);
	nextBilling = nextBilling.setHours(nextBilling.getHours() + trial_hours);

	subscriptionObj.last_billing_timestamp = localDate;
	subscriptionObj.next_billing_timestamp = nextBilling;
	subscriptionObj.subscription_status = 'trial';
	subscriptionObj.is_allowed_to_stream = true;
	subscriptionObj.should_affiliation_callback_sent = false;

	let checkSubscription = await subscriptionRepo.getSubscriptionByPackageId(user._id, packageObj._id);
	let subscription = undefined;

	if(checkSubscription === null){
		subscription = await subscriptionRepo.createSubscription(subscriptionObj);
	}
	else{
		subscription = await subscriptionRepo.updateSubscription(checkSubscription._id, subscriptionObj);
	}
	
	billingHistory.user_id = user._id;
	billingHistory.msisdn = user.msisdn;
	billingHistory.subscription_id = subscription._id;
	billingHistory.paywall_id = packageObj.paywall_id;
	billingHistory.package_id = packageObj._id;
	billingHistory.billing_status = 'trial';
	billingHistory.source = source;
	billingHistory.operator = subscriptionObj.payment_source;
	await billingHistoryRepo.createBillingHistory(billingHistory);
	await coreRepo.createViewLog(user._id, subscription._id, subscription.source, subscription.payment_source, subscription.marketing_source);

	return "done";
}

doSubscribeUsingSubscribingRuleAlongWithMicroCharging = async(otp, source, user, packageObj, subscriptionObj) => {
	return new Promise(async(resolve, reject) => {
		let dataToReturn = {};

		try {
			if(subscriptionObj.try_micro_charge_in_next_cycle){
				console.log("Trying micro charging for rs. ", subscriptionObj.micro_price_point);
			}else{
				console.log("Trying direct billing with mc rules for ", packageObj._id);
			}
			subscriptionObj.subscribed_package_id = packageObj._id;
			console.log("otp", otp)
			let result = await tpEpCoreRepo.processDirectBilling(otp, user, subscriptionObj, packageObj, true, subscriptionObj.try_micro_charge_in_next_cycle ? true : false);
			console.log("micro direct billing response", result);
			if(result.message === "success"){
				dataToReturn.status = "charged";
				dataToReturn.subscriptionObj = subscriptionObj;
				resolve(dataToReturn);
			}else {
				if(result.desc && result.desc !== 'Insufficient Balance'){
					dataToReturn.desc = result.desc;
					dataToReturn.status = "failed";
					dataToReturn.subscriptionObj = subscriptionObj;
					resolve(dataToReturn);
					return;
				}

				let pinLessTokenNumber = result.subscriptionObj ? result.subscriptionObj.ep_token : undefined;
				if(pinLessTokenNumber){
					subscriptionObj.ep_token = pinLessTokenNumber;
				}

				let micro_price_points = packageObj.micro_price_points;
				if(micro_price_points.length > 0){
					let currentIndex = (micro_price_points.length - 1);

					if(subscriptionObj.try_micro_charge_in_next_cycle === true){
						currentIndex = micro_price_points.findIndex(x => x === subscriptionObj.micro_price_point);
						currentIndex -= 1;
					}

					if(currentIndex >= 0){
						// hit and try for micro
						packageObj.price_point_pkr = micro_price_points[currentIndex];
						subscriptionObj.try_micro_charge_in_next_cycle = true;
						subscriptionObj.micro_price_point = micro_price_points[currentIndex];
						let response = await doSubscribeUsingSubscribingRuleAlongWithMicroCharging(otp, source, user, packageObj, subscriptionObj);
						resolve(response);
					}else{
						if(otp){
							dataToReturn.desc = "Insufficient balance, please recharge and try again.";
							dataToReturn.status = "failed";
							resolve(dataToReturn);
							return;
						}else{
							//activate trial
							console.log("activating trial after micro charging attempts are done");
							subscriptionObj.try_micro_charge_in_next_cycle = false;
							subscriptionObj.micro_price_point = 0;
							subscriptionObj.should_affiliation_callback_sent = false;
							let trial = await activateTrial(otp, source, user, packageObj, subscriptionObj);
							if(trial === "done"){
								console.log("trial activated successfully");
								dataToReturn.status = "trial";
								dataToReturn.subscriptionObj = subscriptionObj;
								resolve(dataToReturn);
							}
						}
					}
				}
			}
		} catch(err){
			console.log("Error while direct billing", err, user.msisdn);
			dataToReturn.status = "error";
			dataToReturn.subscriptionObj = subscriptionObj;
			reject(dataToReturn);
		}
	});
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
		let subscription = await subscriptionRepo.getSubscriptionByUserId(user._id);
		let packageObj = await coreRepo.getPackage(subscription.subscribed_package_id);
		if(subscription) {
			//{"code":0,"response_time":"600","response":{"requestId": "74803-26204131-1", "message": "SUCCESS"}}
			//{"code":0,"response_time":"600","response":{"requestId":"7244-22712370-1","errorCode":"500.072.05","errorMessage":"Exception during Unsubscribe. Response: Response{status=SUBSCRIPTION_IS_ALREADY_INACTIVE, message='null', result=null}"}}
			if(subscription.subscription_status === 'expired') {
				res.send({code: config.codes.code_success, message: 'Already unsubscribed', gw_transaction_id: gw_transaction_id});
				return;
			}
			
			console.log('Payload to TP Unsub: ', user.msisdn, packageObj.pid);
			let tpResponse = await tpEpCoreRepo.unsubscribe(user.msisdn, packageObj.pid);
			console.log('Unsub TP Response', tpResponse);

			//if(tpResponse.response.message === "SUCCESS") {
			if(tpResponse) {
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
				history.operator_response = tpResponse.response;
				await billingHistoryRepo.createBillingHistory(history);
				res.send({code: config.codes.code_success, message: 'Successfully unsubscribed', gw_transaction_id: gw_transaction_id});
			}else{
				let history = {};
				history.user_id = user._id;
				history.msisdn = user.msisdn;
				history.package_id = subscription.subscribed_package_id;
				history.subscription_id = subscription._id;
				history.billing_status = 'unsubscribe-request-received-and-failed';
				history.source = source ? source : subscription.source;
				history.operator = user.operator;
				history.operator_response = tpResponse.response;
				await billingHistoryRepo.createBillingHistory(history);

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