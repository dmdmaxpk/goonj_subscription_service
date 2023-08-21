const mongoose = require('mongoose');
const Campaign = mongoose.model('Campaign');

class CampaignRepository {
    async create (postData)  {
        
        let campaign = new Campaign(postData);
        let localDate = this.setDateWithTimezone(new Date());
        campaign.added_dtm = localDate;

        return await campaign.save();
    }

    setDateWithTimezone(date){
        return new Date(date.toLocaleString("en-US", {timeZone: "Asia/Karachi"}));
    }
}

module.exports = CampaignRepository;