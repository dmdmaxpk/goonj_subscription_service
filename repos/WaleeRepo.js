class WaleeRepository {
    constructor() {
        this.domain = 'http://hepage.goonj.pk';
        this.referrer = 73732;
    }

    async getWaleeLatestForeignId(user_id){
        return;
    }

    async checkSourceInterval(utm_source){
        return;
    }

    async setDateWithTimezone(date){
        return;
    }

    async linkClick(query){
        return {status: 200};
    }

    async pageview(query){
        return {status: 200};
    }

    async successfulSubscription(body){
        return {status: 200};
    }

    async saveWaleeApiLog(request, response, action){
        return;
    }
}

module.exports = WaleeRepository;