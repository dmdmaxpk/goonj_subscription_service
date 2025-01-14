const env = process.env.NODE_ENV || 'production';

const codes = {
    code_error: -1,
    code_success: 0,
    code_record_added: 1,
    code_record_updated: 2,
    code_record_deleted: 3,

    code_invalid_data_provided: 4,
    code_record_already_added: 5,
    code_data_not_found: 6,

    code_otp_validated: 7,
    code_otp_not_validated: 8,
    code_already_subscribed: 9,
    code_in_billing_queue: 10,
    code_trial_activated: 11,
    code_user_gralisted: 12,
    code_user_blacklisted: 13,
    code_auth_failed: 14,
    code_auth_token_not_supplied: 15,
    code_already_in_queue: 16,
    code_otp_not_found: 17,
    code_subscribed_but_unstreamable: 18
}

const servicesUrls = {
    user_service: 'http://localhost:3007',
    tp_ep_core_service: 'http://localhost:3001',
    billing_history_service: 'http://10.0.1.88:3008',
    sync_retrieval_service: 'http://10.0.1.88:3009',
    report_service: 'http://10.0.1.88:3011',
    core_service: 'http://localhost:3000',
    message_service: 'http://localhost:3003'
}

const rabbitMqConnectionString = 'amqp://127.0.0.1';
const billingHistoryRabbitMqConnectionString = 'amqp://10.0.1.88';
const db_name = 'goonjpaywall';
const is_triggers_enabled = true;

const queueNames = {
    subscriptionResponseDispatcher: 'subscriptionResponseDispatcher',
    billingHistoryDispatcher: 'billingHistoryDispatcher',
    syncCollectionDispatcher: 'syncCollectionDispatcher'
}

// variables
const time_between_billing_attempts_hours = 4;

//Ideation Url
const Ideation_call_back_url = 'http://bpd.o18.click/';
const Ideation_call_back_url_2 = 'http://210.56.13.190/goonj_callback.php/';
const Ideation_call_back_url_3 = `https://postback.level23.nl/?currency=USD&handler=10821&hash=c4e51373f0d516d0d4fdbd7f0e544c61&tracker=`;
const Ideation_Affpro_callback = `http://ad.propellerads.com/conversion.php?aid=3541543&pid=&tid=108058&visitor_id=`;
const walee_api = 'https://app.walee.pk';
const affmob_callback = 'http://m.mobplus.net/c/p/b274c82fe4f14e13965640b589973fed';

let config = {
    development: {
        port: 3004,
        mongo_connection_url: `mongodb://localhost:27017/${db_name}`,
        queueNames: queueNames,
        codes: codes,
        servicesUrls: servicesUrls,
        rabbitMqConnectionString: rabbitMqConnectionString,
        time_between_billing_attempts_hours: time_between_billing_attempts_hours,
        ideation_callback_url: Ideation_call_back_url,
        ideation_callback_url2: Ideation_call_back_url_2,
        ideation_callback_url3: Ideation_call_back_url_3,
        ideation_Affpro_callback: Ideation_Affpro_callback,
        billingHistoryRabbitMqConnectionString: billingHistoryRabbitMqConnectionString,
        is_triggers_enabled: is_triggers_enabled,
        walee_api: walee_api,
        affmob_callback: affmob_callback
    },
    staging: {
        port: 3004,
        mongo_connection_url: `mongodb://localhost:27017/${db_name}`,
        queueNames: queueNames,
        codes: codes,
        servicesUrls: servicesUrls,
        rabbitMqConnectionString: rabbitMqConnectionString,
        time_between_billing_attempts_hours: time_between_billing_attempts_hours,
        ideation_callback_url: Ideation_call_back_url,
        ideation_callback_url2: Ideation_call_back_url_2,
        ideation_callback_url3: Ideation_call_back_url_3,
        ideation_Affpro_callback: Ideation_Affpro_callback,
        billingHistoryRabbitMqConnectionString: billingHistoryRabbitMqConnectionString,
        is_triggers_enabled: is_triggers_enabled,
        walee_api: walee_api,
        affmob_callback: affmob_callback
    },
    production: {
        port: 3004,
        mongo_connection_url: `mongodb://localhost:27017/${db_name}`,
        queueNames: queueNames,
        codes: codes,
        servicesUrls: servicesUrls,
        rabbitMqConnectionString: rabbitMqConnectionString,
        time_between_billing_attempts_hours: time_between_billing_attempts_hours,
        ideation_callback_url: Ideation_call_back_url,
        ideation_callback_url2: Ideation_call_back_url_2,
        ideation_callback_url3: Ideation_call_back_url_3,
        ideation_Affpro_callback: Ideation_Affpro_callback,
        billingHistoryRabbitMqConnectionString: billingHistoryRabbitMqConnectionString,
        is_triggers_enabled: is_triggers_enabled,
        walee_api: walee_api,
        affmob_callback: affmob_callback
    }
};

console.log("---", env);

if (env === 'development') config = config.development;
if (env === 'staging') config = config.staging;
if (env === 'production') config = config.production;

module.exports = config;
