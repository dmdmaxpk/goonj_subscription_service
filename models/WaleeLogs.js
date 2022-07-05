const mongoose = require('mongoose');
const ShortId = require('mongoose-shortid-nodeps');
const {Schema} = mongoose;

const waleelogs = new Schema({
    _id: { type: ShortId, len: 12, retries: 4},
    utm_source: { type: String },
    foreign_id: { type: Number, index: true },
    user_id: { type: String },
    added_dtm: { type: Date, default: Date.now, index: true }
}, { strict: true });
waleelogs.index({user_id:1,foreign_id:1},{unique: true});


module.exports = mongoose.model('Waleelogs', waleelogs);