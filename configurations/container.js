const awilix = require('awilix');
const container = awilix.createContainer({
    injectionMode: awilix.InjectionMode.PROXY
});
// Queue Consumers
const SubscriberQueryConsumer = require("../rabbit/consumers/SubscriptionConsumer");
// Repositories
const SubscriptionRepository = require('../repos/SubscriptionRepo');
const BillingHistoryRepo = require('../repos/BillingHistoryRepo');
const CoreRepo = require('../repos/CoreRepo');
const MessageRepo = require('../repos/MessageRepo');
const UserRepo = require('../repos/UserRepo');
const TpEpCoreRepo = require('../repos/TpEpCoreRepo');

// Services
const SubscriptionService = require('../services/SubscriptionService');
const BillingService = require('../services/billingService');

const Constants = require('./constants');
//scripts

container.register({
    // Here we are telling Awilix how to resolve 
    // Consumers 
    subscriptionConsumer: awilix.asClass(SubscriberQueryConsumer).singleton(),
    // Repositories 
    subscriptionRepository: awilix.asClass(SubscriptionRepository).singleton(),
    billingHistoryRepository: awilix.asClass(BillingHistoryRepo).singleton(),
    coreRepository: awilix.asClass(CoreRepo).singleton(),
    messageRepository: awilix.asClass(MessageRepo).singleton(),
    userRepository: awilix.asClass(UserRepo).singleton(),
    tpEpCoreRepository: awilix.asClass(TpEpCoreRepo).singleton(),

    //SErvices
    subscriptionService : awilix.asClass(SubscriptionService).singleton(),
    billingService : awilix.asClass(BillingService).singleton(),
    // constants:
    constants: awilix.asClass(Constants).singleton()
  });

module.exports = container;  