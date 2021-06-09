const Printer = require('@thiagoelg/node-printer');
const Device = require('./Device');
const _ = require('lodash');
const { v4: uuidv4 } = require('uuid');
const { downloadFile, removeFile } = require('./FileStorage');
const IppPrinter = require('ipp-printer');

let allDevices = [];

const start_discovery = () => {
    const run = async () => {
        try {
            let list = await Device.spawn('lpinfo', ['-l', '-v'])
            list = list.split('Device: ').filter(i => i.length !== 0)
            let devices = [];
            for(let i = 0; i < list.length; i++) {
                const info_rules = list[i].match(/(\w+) = ([^\s]+[ ]?)+/g);
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
                        if(typeof info[rule[0]] !== "undefined") {
                            let val = rule[1];
                            if(val.slice(-1) === '')
                                val = val.substr(0, -1);
                            info[rule[0]] = val;
                        }
                }
                if(info.id && info.class !== 'file')
                    devices.push(info)
            }
            allDevices = devices;
            checkIpp(devices)
            setTimeout(run, 5000)
        } catch(e) {
            setTimeout(run, 100)
        }
    }
    run();
}

let ipp_running = false

const start_ipp_broadcast = () => {
    if(ipp_running)
        return;
    const performCheck = async () => {
        if(!ipp_running)
            return;

        const printers = await getPrinters();
        console.log(printers)

        if(ipp_running)
            setTimeout(() => performCheck(), 5000)
    }
    ipp_running = true;
    performCheck();
}

const getPrinterType = async (name) => {
    try {
        const options = await Device.exec(`lpoptions -p ${name} -l`);
        if(options.includes('w288h167'))
            return 'verzendlabels';
        if(options.includes('w102h252'))
            return 'productlabels';
        return 'a4';
    } catch(e) {
        return 'a4';
    }
}

const getPrinterDevice = async (uri) => {
    const setup_device = getSetupPrinters().find(i => i.options['device-uri'] === uri);
    const connected_device = allDevices.find(i => i.uri === uri);
    let ret = {
        ...connected_device,
        setup: setup_device ? true : false,
        setup_device: setup_device ? {
            ...setup_device,
            printer_type: await getPrinterType(setup_device.name)
        } : null
    }
    return ret;
}

const removePrinter = (printer) => Device.exec(`lpadmin -x ${printer}`)
const printFromUrl = async (printer, url) => {
    const fileName = uuidv4();
    await downloadFile(url, fileName)
    await printFromFile(printer, fileName, '/portal3/tmp')
    removeFile(`/portal3/tmp/${fileName}`)
    return true;
}
const printFromFile = (printer, filename, path) => Device.exec(`cd ${path} && lp -d ${printer} ${filename}`)
const printText = (text, printer) => Device.exec(`echo "${text}" | lp -d ${printer}`)
const addPrinter = (name, uri, driver) => Device.exec(`lpadmin -p "${name}" -E -v ${uri} -m ${driver}`)
const getSetupPrinters = () => Printer.getPrinters()
const getPrinters = async () => {
    let printers = getSetupPrinters()
    let list = [];
    for(let i = 0; i < printers.length; i++) {
        const device_info = await getPrinterDevice(printers[i].options['device-uri']);
        if(device_info.setup && typeof device_info.setup_device.name === "string" && device_info.setup_device.name.length !== 0)
            list.push(device_info)
    }
    return list.filter(i => (typeof i.uri !== "undefined"))
}
const getCommands = () => Printer.getSupportedJobCommands()
const getDevices = async () => {
    let devices = allDevices.filter(i => !getSetupPrinters().map(i => i.options['device-uri']).includes(i.uri))
    let list = [];
    for(let i = 0; i < devices.length; i++)
        list.push(await getPrinterDevice(devices[i].uri))
    return list;
}
const getByUsb = async (usb_device) => {
    if(usb_device.device_info.class !== 'printer')
        return null;
    const usb_printers = allDevices.filter(i => i.class === 'direct');
    if(usb_device.serial_number && usb_device.serial_number.length !== 0)
        for(let i = 0; i < usb_printers.length; i++)
            if(usb_printers[i].id.includes(usb_device.serial_number))
                return await getPrinterDevice(usb_printers[i].uri);
    
    for(let i = 0; i < usb_printers.length; i++)
        if(usb_printers[i].id.includes(usb_device.name))
            return await getPrinterDevice(usb_printers[i].uri);
    return null;
}
const getDrivers = async (printer) => {
    try {
        let list = await Device.exec(`lpinfo --device-id "${printer.id}" -m`);
        list = list
            .split('\n')
            .filter(i => (i.length !== 0 && i.includes(':')))
            .map(item => {
                const split_for_maker = item.split(':')[0].split('-');
                const split_for_path = item.split(' ');
                return {
                    maker: split_for_maker[0],
                    uri: split_for_path[0],
                    name: item.replace(`${split_for_path[0]} `, '')
                }
            })
        if(list.length === 0) {
            list = await Device.exec(`lpinfo --make-and-model "${printer.model}" -m`);
            list = list
                .split('\n')
                .filter(i => (i.length !== 0 && i.includes(':')))
                .map(item => {
                    const split_for_maker = item.split(':')[0].split('-');
                    const split_for_path = item.split(' ');
                    return {
                        maker: split_for_maker[0],
                        uri: split_for_path[0],
                        name: item.replace(`${split_for_path[0]} `, '')
                    }
                })
        }
        if(list.length === 0) {
            const split = printer.model.split(' ');
            let make_model = split[0];
            if(split.length !== 1)
                make_model += ` ${split[1]}`;
            list = await Device.exec(`lpinfo --make-and-model "${make_model}" -m`);
            list = list
                .split('\n')
                .filter(i => (i.length !== 0 && i.includes(':')))
                .map(item => {
                    const split_for_maker = item.split(':')[0].split('-');
                    const split_for_path = item.split(' ');
                    return {
                        maker: split_for_maker[0],
                        uri: split_for_path[0],
                        name: item.replace(`${split_for_path[0]} `, '')
                    }
                })
        }
        return list;
    } catch(e) {
        return [];
    }
}

module.exports = {
    start_discovery,
    start_ipp_broadcast,
    getPrinters,
    getCommands,
    getDrivers,
    getDevices,
    getByUsb,
    addPrinter,
    printText,
    removePrinter,
    printFromFile,
    printFromUrl
}