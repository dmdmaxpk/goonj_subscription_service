const express = require('express');
const logger = require('morgan');
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
app.use(logger('dev'));

// Import routes
app.use('/', require('./routes/index'));

const RabbitMq = require('./rabbit/RabbitMq');
const rabbitMq = new RabbitMq().getInstance();

const BillingHistoryRabbitMq = require('./rabbit/BillingHistoryRabbitMq');
const billingHistoryRabbitMq = new BillingHistoryRabbitMq().getInstance();

// Start Server
let { port } = config;
app.listen(port, () => {
    console.log(`Subscription Service Running On Port ${port}`);
    rabbitMq.initServer((error, response) => {
        if(error){
            console.error(error)
        }else{
            console.log('Local RabbitMq status', response);
            billingHistoryRabbitMq.initServer((err, res) => {
                if(err){
                    console.log('Error BillingHistoryRabbitMq', err);
                }else{
                    console.log('BillingHistory RabbitMq status', res);
                }
            });
        }
    });
});