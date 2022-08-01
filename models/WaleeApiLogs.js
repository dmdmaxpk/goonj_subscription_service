const mongoose = require('mongoose');
const ShortId = require('mongoose-shortid-nodeps');
const {Schema} = mongoose;

const waleeApiLogs = new Schema({
    _id: { type: ShortId, len: 12, retries: 4},
    request: {type: {}},
    response: { type: {} },
    action: { type: String },
    added_dtm: { type: Date, default: Date.now, index: true }
}, { strict: true });


module.exports = mongoose.model('WaleeApiLogs', waleeApiLogs);