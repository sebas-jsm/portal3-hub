const _ = require('lodash');
const Device = require('./Device');

const vendorBlackList = [
    7531,
    8457
];

const getDevices = async () => {
    const devices = await Device.exec('lsusb');
    console.log(devices.split('\n'))
    console.log('done')
    return true;
}

module.exports = {
    getDevices
}