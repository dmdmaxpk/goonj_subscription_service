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

    static easypaisaPrivateKey()
    {
        return 'MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC3K4dyfMn54MXEFNlFfUhEr2Foj/GilACCG7A/wA+KLHgBFOXcShMGgitwcPxLwn9sabd2STRLy4JvsmJeJ/H5x+Z438Jv5tTPEXx0eQ338KKIad+Ps3uGYq7m+7uRQHzyGIw8B+HyVtO3JMt7vAHV3VQyOdcRhRk6L+xhUT5AhbJzef2fkIvDTCwg5FtAT0k19UeMxTEDXZLDXVYerIHs+Bn5aM6cGMzDd3GQl2qVvdWG/c/aNpOwH0fNLClztfbI3ldSicr61LA/Aa7sGGXOPkU6MwV91rjfBz96YyFWStUC3Qt9P6xcH52CAY3GRPm03xsSeI2RyXfI+hml6Y5ZAgMBAAECggEBAIQ13yY7/G1oWFcX1Vva+fbZwC2A+KCow1UmNylMr+rD/jqJowBGV0UzX7dhVjo4wVC3Xbz7ScwLsLJ+x5G+s2Hfb/N/TxEGRETSEkrftb1o62gbQ0qt+lMdl7ERsmk9avIz1cTey6/oDBj9bgJ5yblccBFwvlPfBj6BqNT1l0FqBmAzXn9QOGNAPBFCH49+9j1Mo3nTvmHe3bF2UqyRbdA7/WDZ5TSxOS5spTJWU+NDTSz/CthMFR2X7dpC5YutEKq5ThkBSEuTKqSP0d7pSszTvgzq5wbedsIeeX8FyQXTCUbiTbsHtomucq7KhudBfngjzPM38yGin0kU58/eXKECgYEA4omc+xMnsbf4r3CtnFygsy7ehIDWnKYvmNcJXn56B0Uxu1g6Cy0JGoxnwQ4fEb9KGmJjI+IU3iYGHT86ayoo8BTp4A25f25j0bTkK8jiTWmBEG8rFNZGOa2/v8CGl6RqHaS1+BUQjmUaA2YXNjsCYv8CZx81dppQFr1qZjbOtOcCgYEAzv4Hcg94AaPORhYCRLQnFjMPe/cno/aABYY3zbN7+u2DMInDqdq+Oj+D9XCdHRUwqmLs44UEf9hkAO/JIlk1l1nOJVfd1tgDpabvoO5U6WLMeTzu+ype2dkPab75XykAiuTdlIaBBYoQ6+g8qDwzy1j7t63KkSKQczVymirh+r8CgYBGueod5TwWWza0J3y8fZradn6YZdUbMTNZB4HwU5JrpKnDMOdmR9g4xq858du3Yb6UADWtpU8YkEyGYxAtFwuS8SSXhBFu/JsDhPNbzCsDOjZGWD7eEYv5RArCpiwfOgC7YopBeuohWuVFPGFw1/mFyNIKOg8qCUGJ5/dJFEFy7wKBgD3/DeHWyj3LfyO0wdcsEizu/CtH+oJ8eRmuepZMtMySSOHH0WfVUXaGwZJIuXYVe6781DDNDWzxNfql1xtHluqPBlRe/d20c1sxJcKQv7PrWIzTeEyYAzLCdYBZp70dvcDcDZXHt2seUDUoKMrGxUiZjUMVdX+E17j6ACo2v9pnAoGAaLpAn9gPGakZPm8lf3hXprNbGW6AreBWRI8AltzDMPRPbSsNvbcw8kFvtN8l+WsSBSAt2yl7wrroFoneF97uxdMsAFBitV/1dYc2j0j2viic/txId/NLPaQ9VrRp+mBCJZOZ8NcWweh/+6Lh/atxOpkt12uHBQWweLLbXxwzT6M=';
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