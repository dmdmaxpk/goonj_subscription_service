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
    code_otp_not_found: 17
}

const servicesUrls = {
    user_service: 'http://localhost:3007',
    tp_ep_core_service: 'http://localhost:3001',
    billing_history_service: 'http://localhost:3008',
    core_service: 'http://localhost:3000',
    message_service: 'http://localhost:3003'
}

const rabbitMqConnectionString = 'amqp://127.0.0.1';
const billingHistoryRabbitMqConnectionString = 'amqp://10.0.1.88';
const db_name = 'goonjpaywall';

const queueNames = {
    subscriptionResponseDispatcher: 'subscriptionResponseDispatcher',
    billingHistoryDispatcher: 'billingHistoryDispatcher'
}

// variables
const time_between_billing_attempts_hours = 4;

//Ideation Url
const Ideation_call_back_url = 'http://bpd.o18.click/';
const Ideation_call_back_url_2 = 'http://210.56.13.190/goonj_callback.php/';
const Ideation_call_back_url_3 = `https://postback.level23.nl/?currency=USD&handler=10821&hash=c4e51373f0d516d0d4fdbd7f0e544c61&tracker=`;


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
        billingHistoryRabbitMqConnectionString: billingHistoryRabbitMqConnectionString
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
        billingHistoryRabbitMqConnectionString: billingHistoryRabbitMqConnectionString
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
        billingHistoryRabbitMqConnectionString: billingHistoryRabbitMqConnectionString
    }
};

console.log("---", env);

if (env === 'development') config = config.development;
if (env === 'staging') config = config.staging;
if (env === 'production') config = config.production;

module.exports = config;
