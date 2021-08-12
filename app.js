const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const config = require('./config');

const app = express();

// Import database models
require('./models/Subscription');

// Connection to Database
mongoose.connect(config.mongo_connection_url, {useUnifiedTopology: true, useCreateIndex: true, useNewUrlParser: true});
mongoose.connection.on('error', err => console.error(`Error: ${err.message}`));

// Middlewares
app.use(bodyParser.json({limit: '5120kb'}));  //5MB
app.use(bodyParser.urlencoded({ extended: false }));

// Import routes
app.use('/', require('./routes/index'));

const {rabbitMq} = require('./rabbit/RabbitMq');
// const rabbitMq = new RabbitMq().getInstance();

const container = require('./configurations/container');
const subscriptionConsumer = container.resolve("subscriptionConsumer");

// Start Server
let { port } = config;
app.listen(port, () => {
    console.log(`Subscription Service Running On Port ${port}`);
    rabbitMq.initServer((error, response) => {
        if(error){
            console.error(error)
        }else{
            console.log('RabbitMq status', response);
            try{
                // consume
                rabbitMq.consumeQueue(config.queueNames.subscriptionResponseDispatcher, async(message) => {
                    await subscriptionConsumer.consume(JSON.parse(message.content))
                    rabbitMq.acknowledge(message);
                });
            }catch(error){
                console.error(error.message);
            }
        }
    });
});