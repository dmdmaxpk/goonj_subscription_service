const mongoose = require('mongoose');
const Campaign = mongoose.model('Campaign');

class CampaignRepository {
    async create (postData)  {

        try{
            let query = {msisdn: postData.msisdn};
            postData.added_dtm = this.setDateWithTimezone(new Date());
            await Campaign.findOneAndUpdate(query, postData, {upsert: true});
            return true;
        }catch(err){
            console.log(err);
            return false;
        }
    }

    async updateRecord (msisdn, record) {
        await Campaign.findOneAndUpdate({msisdn: msisdn}, record, {new: true, useFindAndModify: false});
    }

    setDateWithTimezone(date){
        return new Date(date.toLocaleString("en-US", {timeZone: "Asia/Karachi"}));
    }
}

module.exports = CampaignRepository;