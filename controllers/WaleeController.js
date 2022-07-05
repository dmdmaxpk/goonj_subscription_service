const config = require('../config');
const container = require('../configurations/container');
const waleeRepo = container.resolve("waleeRepository");

exports.linkClick = async(req, res) => {
    const result = await waleeRepo.linkClick(req.query);
    return result;
}

exports.pageview = async(req, res) => {
    const result = await waleeRepo.pageview(req.query);
    return result;
}

exports.subscription = async(req, res) => {
    const result = await waleeRepo.successfulSubscription(req.body);
    return result;
}