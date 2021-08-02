const express = require('express');
const bodyParser = require('body-parser');
const mongoSanitize = require('express-mongo-sanitize');
const mongoose = require('mongoose');

// Import database models
require('./models/Subscription');

const config = require('./config');


// Connection to Database
mongoose.connect(config.mongoDB, {useUnifiedTopology: true, useCreateIndex: true, useNewUrlParser: true});
mongoose.connection.on('error', err => console.error(`Error: ${err.message}`));


const app = express();

// Middlewares
app.use(bodyParser.json({limit: '5120kb'}));  //5MB
app.use(bodyParser.urlencoded({ extended: false }));
app.use(mongoSanitize());

// Import routes
app.use('/', require('./routes/index'));

// Start Server
let { port } = config;
app.listen(port, () => {
    console.log(`APP running on port ${port}`);
});