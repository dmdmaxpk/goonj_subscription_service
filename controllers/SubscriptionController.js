const config = require('../config');
const container = require('../configurations/container');

const subscriptionRepo = container.resolve("subscriptionRepository");

exports.getSubscriptionDetails = async (req, res) => {
	let { msisdn,transaction_id } = req.query;

	let obj = {};
	if (msisdn) {
		let user = await subscriptionRepo.getUserByMsisdn(msisdn);
		if(user) {
			let subscriber = await subscriptionRepo.getSubscriberByUserId(user._id);
			if(subscriber){
				let rawSubscriptions = await subscriptionRepo.getAllSubscriptions(subscriber._id);
				let subscriptions = [];
				if(rawSubscriptions){
					for(let i = 0; i < rawSubscriptions.length; i++){
						let sub = {};
						//sub.user_id = user._id;
						//sub.subscriber_id = rawSubscriptions[i].subscriber_id;
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
				res.send({code: config.codes.code_data_not_found, message: 'Subscriber not found',gw_transaction_id:transaction_id});
			}
		}else{
			res.send({code: config.codes.code_data_not_found, message: 'User not found',gw_transaction_id:transaction_id});
		}
	} else {
		res.send({code: config.codes.code_invalid_data_provided, message: 'No msisdn provided',gw_transaction_id:transaction_id});
	}
}

getExpiry = async(user_id) => {
	let rawHistories = await subscriptionRepo.getExpiryHistory(user_id);

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
	let rawHistories = await subscriptionRepo.getExpiryHistory(user_id);

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