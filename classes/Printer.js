const Printer = require('@thiagoelg/node-printer');
const Device = require('./Device');
const _ = require('lodash');

let allDevices = [];

const start_discovery = () => {
    const run = async () => {
        let list = await Device.spawn('lpinfo', ['-l', '-v'])
        list = list.split('Device: ').filter(i => i.length !== 0)
        let devices = [];
        for(let i = 0; i < list.length; i++) {
            const info_rules = list[i].match(/(\w+) = ([^\s]+)/g);
            let info = {
                uri: null,
                class: null,
                info: null,
                model: null,
                id: null
            }
            for(let i = 0; i < info_rules.length; i++) {
                const rule = info_rules[i].split(' = ');
                if(rule.length === 2)
                    if(typeof info[rule[0]] !== "undefined")
                        info[rule[0]] = rule[1];
            }
            if(info.id && info.class !== 'file')
                devices.push(info)
        }
        allDevices = devices;
        setTimeout(run, 5000)
    }
    run();
}

const getPrinterDevice = (uri) => {
    const setup_device = getSetupPrinters().find(i => i.options['device-uri'] === uri);
    const connected_device = allDevices.find(i => i.uri === uri);
    let ret = {
        ...connected_device,
        setup: setup_device ? true : false,
        setup_device: setup_device ? setup_device : null
    }
    return ret;
}

const getSetupPrinters = () => Printer.getPrinters()
const getPrinters = () => getSetupPrinters().map(i => getPrinterDevice(i.options['device-uri']))
const getCommands = () => Printer.getSupportedJobCommands()
const getDevices = () => allDevices.filter(i => !getSetupPrinters().map(i => i.options['device-uri']).includes(i.uri)).map(i => getPrinterDevice(i.uri))
const getByUsb = (usb_device) => {
    if(usb_device.device_info.class !== 'printer')
        return null;
    const usb_printers = allDevices.filter(i => i.class === 'direct');
    if(usb_device.serial_number && usb_device.serial_number.length !== 0)
        for(let i = 0; i < usb_printers.length; i++)
            if(usb_printers[i].id.includes(usb_device.serial_number))
                return getPrinterDevice(usb_printers[i].uri);
    
    for(let i = 0; i < usb_printers.length; i++)
        if(usb_printers[i].id.includes(usb_device.name))
            return getPrinterDevice(usb_printers[i].uri);
    return null;
}
const getDrivers = async (id) => {
    try {
        let list = await Device.exec(`lpinfo --device-id "${id}" -m`)
        console.log(list)
    } catch(e) {
        console.log('drivers not found')
    }
}

module.exports = {
    start_discovery,
    getPrinters,
    getCommands,
    getDrivers,
    getDevices,
    getByUsb
}