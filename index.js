require('./classes/Helpers');
const io = require('socket.io-client');
const Storage = require('./classes/Storage');
const Device = require('./classes/Device');
const Commands = require('./commands');
const logger = require('node-color-log');
const _ = require('lodash');
const Gpio = require('./classes/Gpio');
const ConnectionChecker = require('./classes/ConnectionChecker');
const Printer = require('./classes/Printer');
const { v4: uuidv4 } = require('uuid');
const Crypto = require('./classes/Crypto');
const FileStorage = require('./classes/FileStorage');
require('dotenv').config();

const c = console.log;

const init = async ({console}) => {
    
    console.log('Starting hub service')

    Gpio.init();

    FileStorage.startAutoMount();

    Printer.start_discovery();

    Printer.start_get_printers();
    
    Gpio.playEffect('status_led', 'wave', 1)

    const socket = io(_.get(process.env, 'SOCKET_SERVER', 'wss://portal3.nl:7474'), { secure: (typeof process.env.SOCKET_SERVER === "undefined"), reconnection: true, rejectUnauthorized: false, query: { hub_serial: await Device.GetSerialNumber(), model: await Device.getModel() }, maxReconnectionAttempts: Infinity })

    ConnectionChecker.start({socket});

    console.log('Starting to connect to socket')

    socket.connect();

    socket.on('reconnect', (attempt) => {
        console.log(`Reconnecting to socket, attempt (${attempt})`)
    })

    socket.on('ping', () => socket.emit('pong'))

    socket.on('reconnect_error', (e) => {
        console.error(`Received socket error: ${e.message}`)
    })

    socket.on('connect_error', (e) => {
        console.error(`Received socket error: ${e.message}`)
    })

    socket.on('disconnect', () => {
        console.log('Disconnected from socket')
        Gpio.playEffect('status_led', 'wave', 1)
        setTimeout(() => {
            socket.connect();
        }, 5000)
    })

    socket.on('error', (e) => {
        console.error(`Received socket error: ${e.message}`)
    })

    socket.on('connect', () => {
        console.log('Connecting to socket')
        socket.emit('auth::secret', Storage.secret.get(null))
        Gpio.stopEffect('status_led')
    })

    socket.on('auth::secret', (secret) => { Storage.secret.set(secret) })

    socket.on('stream', async (data) => {
        
        const { path, uuid, args = {} } = await Crypto.FlowDecrypt(data)

        const executable = _.get(Commands, `${path}`, false);

        const stream_id = uuidv4();
        
        console.stream(path, args)

        let receiveData;
        
        const acceptStream = async (props) => {
            console.stream_accept(path)

            receiveData = async (data) => {
                console.stream_in(path)
                if(typeof props.in === 'function')
                    props.in(await Crypto.FlowDecrypt(data))
                else
                    logger.stream_debug(path, 'In function not defined')
            }

            socket.on(`stream.${stream_id}`, receiveData)

            socket.once(`stream.${stream_id}.kill`, async () => {
                console.stream_kill(path)
                if(typeof props.kill === 'function')
                    props.kill();

                socket.removeListener(`stream.${stream_id}`, receiveData)
                socket.emit(`stream.${stream_id}.kill`, await Crypto.FlowEncrypt(true))
            })

            socket.emit(`${uuid}.response`, await Crypto.FlowEncrypt({
                stream_id
            }))

            if(typeof props.init === 'function')
                props.init();
        }

        const rejectStream = async (error) => {
            let ret = error;
            if(typeof error.message !== "undefined")
                ret = error.message;
            console.stream_reject(path)
            socket.emit(`${uuid}.error`, await Crypto.FlowEncrypt(ret))
        }

        const out = async (data) => {
            console.stream_out(path)
            socket.emit(`stream.${stream_id}`, await Crypto.FlowEncrypt(data))
        }

        const kill = async () => {
            console.stream_kill(path)
            socket.removeListener(`stream.${stream_id}`, receiveData)
            socket.emit(`stream.${stream_id}.kill`, await Crypto.FlowEncrypt(true))
        }

        const onError = async (error) => {
            console.stream_error(path)
            socket.emit(`stream.${stream_id}.error`, await Crypto.FlowEncrypt(error))
        }

        try {
            if(!executable || typeof executable !== "function")
                throw new Error(`Can't find //${path}(${JSON.stringify(args)})`);
            
            const output = executable({out, onError, kill}, args);
            if(typeof output.then === "function")
                output.then(() => acceptStream(props)).catch(rejectStream);
            else
                acceptStream(output)
            
        } catch(e) {
            rejectStream(e)
        }

    })

    socket.on('cmd', async (data) => {
        const { path, uuid, args = {} } = await Crypto.FlowDecrypt(data)
        const executable = _.get(Commands, `${path}`, false);
        
        console.command(path, args)

        const sendResponse = async (response) => {
            console.command_success(path, args)
            socket.emit(`${uuid}.response`, await Crypto.FlowEncrypt(response))
        }

        const sendError = async (error) => {
            let ret = error;
            if(typeof error.message !== "undefined")
                ret = error.message;
            console.command_error(path, args)
            socket.emit(`${uuid}.error`, await Crypto.FlowEncrypt(ret))
        }

        try {
            if(!executable || typeof executable !== "function")
                throw new Error(`Can't find //${path}(${JSON.stringify(args)})`);
            
            const output = executable(args);
            if(typeof output.then === "function")
                output.then(sendResponse).catch(sendError);
            else
                sendResponse(output)
            
        } catch(e) {
            sendError(e)
        }

    })

    console.log('Full init service initialized')

}

const CreateLogger = () => {
    const SendMessage = (color, tag, message) => {
        logger.color(color).log(`[${tag}]`);
        logger.joint().log(' ')
        logger.joint().color('white').log(message);
    }
    return {
        debug: (message) => SendMessage('yellow', 'DEBUG', message),
        log: (message) => SendMessage('yellow', 'LOG', message),
        error: (message) => SendMessage('red', 'ERROR', message),
        info: (message) => SendMessage('blue', 'INFO', message),
        command: (path, args) => SendMessage('yellow', 'CMD', `${path}(${JSON.stringify(args)})`),
        command_success: (path, args) => SendMessage('green', 'CMD', `${path}(${JSON.stringify(args)})\n`),
        command_error: (path, args) => SendMessage('red', 'CMD', `${path}(${JSON.stringify(args)})\n`),
        stream: (path, args) => SendMessage('yellow', 'STREAM', `${path}(${JSON.stringify(args)})`),
        stream_in: (path) => SendMessage('green', `STREAM [${path}]`, `DATA_RECEIVE`),
        stream_out: (path) => SendMessage('green', `STREAM [${path}]`, `DATA_SENT`),
        stream_error: (path) => SendMessage('red', `STREAM [${path}]`, `ERROR_SENT`),
        stream_accept: (path) => SendMessage('green', `STREAM [${path}]`, `ACCEPTED`),
        stream_reject: (path) => SendMessage('red', `STREAM [${path}]`, `REJECTED`),
        stream_kill: (path) => SendMessage('red', `STREAM [${path}]`, `KILL`),
        stream_debug: (path, message) => SendMessage('magenta', `STREAM [${path}]`, message),
    }
}

init({console: CreateLogger()});

process.on('exit', exitHandler.bind(null,{cleanup:true}));
process.on('SIGINT', exitHandler.bind(null, {exit:true}));
process.on('SIGUSR1', exitHandler.bind(null, {exit:true}));
process.on('SIGUSR2', exitHandler.bind(null, {exit:true}));
process.on('uncaughtException', e => {
    console.error(e.stack)
    exitHandler.bind(null, {exit:true})
});
function exitHandler() {
    Gpio.de_init();
    FileStorage.unmountAll()
        .then(() => process.exit())
        .catch((e) => {console.log(`Unmount failed`, e); process.exit()})
    
}