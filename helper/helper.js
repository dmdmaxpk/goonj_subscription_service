//Helper class - define all basic functions
class Helper {
    static getCurrentDate() {
        let now = new Date();
        let strDateTime = [
            [now.getFullYear(),
                this.addZero(now.getMonth() + 1),
                this.addZero(now.getDate())].join("-"),
            [this.addZero(now.getHours()),
                this.addZero(now.getMinutes())].join(":")];
        return strDateTime;
    }

    static addZero(num) {
        return (num >= 0 && num < 10) ? "0" + num : num + "";
    }

    static timeout(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    static setDateWithTimezone(date){
        let newDate = date.toLocaleString("en-US", {timeZone: "Asia/Karachi"});
        newDate = new Date(newDate);
        return newDate;
    }
}

module.exports = Helper;