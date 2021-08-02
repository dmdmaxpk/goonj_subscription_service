const   config = require('../../config');
const amqp = require('amqplib/callback_api');

var rabbitMq;

class RabbitMq {
    constructor() {
        this.connection = null;
        this.channel = null;
    }

    createConnection(callback){
        amqp.connect(config.rabbitMq, (error, connection) => {
            if (error) {
                console.log('connection error: ', error);
                callback(error);
            }else{
                callback(null, connection);
                this.connection = connection;
            }
          });
    }

    createChannel(connection, callback){
        connection.createChannel(function(error, channel) {
            if (error) {
              callback(error);
            }
            callback(null, channel);
        });
    }

    initializeMessageServer(callback) {
        this.createConnection((err,connection) => {
            if (err) {
                console.log('connection error: ', err);
                callback(err);
            } else {
                this.createChannel(connection, (error, channel) => {
                    if (error) {
                        console.log('error', error);
                        callback(error);
                    } else {
                        this.conection = connection;
                        this.channel = channel;
                        callback(null, channel);
                    }
                });
            }
        });
    }

    createQueue(name, durable = true){
        this.channel.assertQueue(name, {durable: durable});
    }

    consumeQueue(queue, callback){
        this.channel.consume(queue, async (msg) =>  {

            //console.log('consumeQueue -> msg: ', msg);
            callback(msg);
          }, {
            //It's time to turn manual acnkowledgments on using the {noAck: false} option and send a 
            // proper acknowledgment from the worker, once we're done with a task.
            noAck: false
        });
    }

    acknowledge(message){
        this.channel.ack(message);
    }

    noAcknowledge(message){
        this.channel.nack(message);
    }

    addInQueue(queue, message){
        let buffer = Buffer.from(JSON.stringify(message));
        this.channel.sendToQueue(queue, buffer, {persistent:true});
    }
}    
  
if(!rabbitMq){
    rabbitMq = new RabbitMq();
}

module.exports = {
    rabbitMq: rabbitMq
};
