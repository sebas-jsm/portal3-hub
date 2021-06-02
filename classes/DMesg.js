const { spawn } = require('child_process');
const _ = require('lodash');

const DMESG_DEVICE_TYPE = Object.freeze({
    printer: 'printer',
    storage: 'storage',
    scanner: 'scanner'
})

const DMESG_EVENT_TYPE = Object.freeze({
    connect: 'connect',
    disconnect: 'disconnect'
})

let USB_DEVICES = {

}

const process = (data) => {
    console.log(data)
}

const startFollow = () => {
    
    let current_identifier = null;
    let stack = {};

    const process = spawn(`dmesg`, [`-wH`]);
    process.stdout.on(`data`, data => {
        const lines = data.toString().split('\n')
        for(let i = 0; i < lines.length; i++) {
            const message = lines[i].replace(lines[i].split('] ')[0], '');
            const id_message = message.split(': ');
            const identifier = id_message[0].replace(`] `, ``).trim();
            const message = message.replace(`${id_message[0]}: `, ``).trim();
            
            
            if(identifier.length === 0 && message.length === 0) {
                if(!current_identifier || typeof stack[current_identifier] === "undefined") {
                    console.error(`Cant process ${current_identifier}.`)
                } else {
                    process(stack[current_identifier]);
                    delete stack[current_identifier];
                    current_identifier = null;
                }
            } else {
                if(typeof stack[identifier] === "undefined")
                    stack[identifier] = [
                        message
                    ]
                else
                    stack[identifier].push(message)
            }
        }
    })
}

module.exports = {
    startFollow
}