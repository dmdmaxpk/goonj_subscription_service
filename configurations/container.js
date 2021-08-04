const awilix = require('awilix');
const container = awilix.createContainer({
    injectionMode: awilix.InjectionMode.PROXY
});
// Queue Consumers
const SubscriberQueryConsumer = require("../rabbit/consumers/SubscriptionConsumer");
// Repositories
const SubscriptionRepository = require('../repos/SubscriptionRepo');

// Services
const SubscriptionService = require('../services/SubscriptionService');

const Constants = require('./constants');
//scripts

container.register({
    // Here we are telling Awilix how to resolve 
    // Consumers 
    subscriptionConsumer: awilix.asClass(SubscriberQueryConsumer).singleton(),
    // Repositories 
    subscriptionRepository: awilix.asClass(SubscriptionRepository).singleton(),

    //SErvices
    subscriptionService : awilix.asClass(SubscriptionService).singleton(),
    // constants:
    constants: awilix.asClass(Constants).singleton()
  });

module.exports = container;  