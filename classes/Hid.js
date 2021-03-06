const HID = require('node-hid');
const Gpio = require('./Gpio');

const getDevices = () => HID.devices().filter(device => device.usage === 6);

const hidMap = {
	4: 'a',
	5: 'b',
	6: 'c',
	7: 'd',
	8: 'e',
	9: 'f',
	10: 'g',
	11: 'h',
	12: 'i',
	13: 'j',
	14: 'k',
	15: 'l',
	16: 'm',
	17: 'n',
	18: 'o',
	19: 'p',
	20: 'q',
	21: 'r',
	22: 's',
	23: 't',
	24: 'u',
	25: 'v',
	26: 'w',
	27: 'x',
	28: 'y',
	29: 'z',
	30: '1',
	31: '2',
	32: '3',
	33: '4',
	34: '5',
	35: '6',
	36: '7',
	37: '8',
	38: '9',
	39: '0',
	40: 'enter',
	43: '\t',
	44: ' ',
	45: '-',
	46: '=',
	47: '[',
	48: ']',
	49: '\\',
	51: ';',
	52: '\'',
	53: '`',
	54: ',',
	55: '.',
	56: '/',
	85: '*',
	87: '+'
};

const hidMapShift = {
	4: 'A',
	5: 'B',
	6: 'C',
	7: 'D',
	8: 'E',
	9: 'F',
	10: 'G',
	11: 'H',
	12: 'I',
	13: 'J',
	14: 'K',
	15: 'L',
	16: 'M',
	17: 'N',
	18: 'O',
	19: 'P',
	20: 'Q',
	21: 'R',
	22: 'S',
	23: 'T',
	24: 'U',
	25: 'V',
	26: 'W',
	27: 'X',
	28: 'Y',
	29: 'Z',
	30: '!',
	31: '@',
	32: '#',
	33: '$',
	34: '%',
	35: '^',
	36: '&',
	37: '*',
	38: '(',
	39: ')',
	45: '_',
	46: '+',
	47: '{',
	48: '}',
	49: '|',
	51: ':',
	52: '"',
	53: '~',
	54: '<',
	55: '>',
	56: '?'
};

const sendCharacters = [40, 0];

const streamDevice = ({out, onError}, {device}) => {
    const dev = new HID.HID(device);

    let scanResult = [];

    const doSend = () => {
        out(scanResult.join(''));
        scanResult = [];
    }

    const deviceData = (data) => {
        if(scanResult.length === 0)
            Gpio.playEffectOnce('status_led', 'blink_once')
        const modifierValue = data[0];
        const characterValue = data[2];
        if (modifierValue === 2 || modifierValue === 20)
            scanResult.push(hidMapShift[characterValue]);
        else if (!sendCharacters.includes(characterValue))
            scanResult.push(hidMap[characterValue]);
        else {
            const length = scanResult.length;
            setTimeout(() => {
                if(scanResult.length === length)
                    doSend();
            }, 50)
        }
    }

    dev.on('data', deviceData)
    dev.on('error', onError)

    return {
        init: () => {},
        kill: () => {
            dev.removeAllListeners('data');
            dev.removeAllListeners('error');
        }
    }
}

module.exports = {
    getDevices,
    streamDevice
}