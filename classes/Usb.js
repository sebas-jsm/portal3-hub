const usb = require('usb');
const _ = require('lodash');

const vendorBlackList = [
    7531,
    8457
];

/**
 * 
 * @param {*} devices 
 * @returns {usb.Device[]}
 */
const doBlacklist = (devices) => devices.filter(device => !(vendorBlackList.includes(_.get(device, 'deviceDescriptor.idVendor', 0))));

const getDevices = async () => {
    const devices = doBlacklist(usb.getDeviceList());
    const test_device = devices[0];
    test_device.open()
    await new Promise(() => {
        test_device.getCapabilities(console.log)
    });
    console.log(devices)
    return true;
};

module.exports = {
    getDevices
}