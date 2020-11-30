"use strict";
/**
 * Copyright Microsoft Corporation. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdbBackend = void 0;
const assert = require("assert");
const debug = require("debug");
const net = require("net");
const ws_1 = require("ws");
class AdbBackend {
    async devices() {
        const result = await runCommand('host:devices');
        const lines = result.toString().trim().split('\n');
        const serials = lines.map(line => line.split('\t')[0]);
        return serials.map(serial => new AdbDevice(serial));
    }
}
exports.AdbBackend = AdbBackend;
class AdbDevice {
    constructor(serial) {
        this.serial = serial;
    }
    async init() {
    }
    async close() {
    }
    runCommand(command) {
        return runCommand(command, this.serial);
    }
    async open(command) {
        const result = await open(command, this.serial);
        result.becomeSocket();
        return result;
    }
}
async function runCommand(command, serial) {
    debug('pw:adb:runCommand')(command, serial);
    const socket = new BufferedSocketWrapper(net.createConnection({ port: 5037 }));
    if (serial) {
        await socket.write(encodeMessage(`host:transport:${serial}`));
        const status = await socket.read(4);
        assert(status.toString() === 'OKAY', status.toString());
    }
    await socket.write(encodeMessage(command));
    const status = await socket.read(4);
    assert(status.toString() === 'OKAY', status.toString());
    if (!command.startsWith('shell:')) {
        const remainingLength = parseInt((await socket.read(4)).toString(), 16);
        return (await socket.read(remainingLength)).toString();
    }
    return (await socket.readAll()).toString();
}
async function open(command, serial) {
    const socket = new BufferedSocketWrapper(net.createConnection({ port: 5037 }));
    if (serial) {
        await socket.write(encodeMessage(`host:transport:${serial}`));
        const status = await socket.read(4);
        assert(status.toString() === 'OKAY', status.toString());
    }
    await socket.write(encodeMessage(command));
    const status = await socket.read(4);
    assert(status.toString() === 'OKAY', status.toString());
    return socket;
}
function encodeMessage(message) {
    let lenHex = (message.length).toString(16);
    lenHex = '0'.repeat(4 - lenHex.length) + lenHex;
    return Buffer.from(lenHex + message);
}
class BufferedSocketWrapper extends ws_1.EventEmitter {
    constructor(socket) {
        super();
        this._buffer = Buffer.from([]);
        this._isSocket = false;
        this._isClosed = false;
        this._socket = socket;
        this._connectPromise = new Promise(f => this._socket.on('connect', f));
        this._socket.on('data', data => {
            debug('pw:android:adb:data')(data.toString());
            if (this._isSocket) {
                this.emit('data', data);
                return;
            }
            this._buffer = Buffer.concat([this._buffer, data]);
            if (this._notifyReader)
                this._notifyReader();
        });
        this._socket.on('close', () => {
            this._isClosed = true;
            if (this._notifyReader)
                this._notifyReader();
            this.emit('close');
        });
        this._socket.on('error', error => this.emit('error', error));
    }
    async write(data) {
        debug('pw:android:adb:send')(data.toString());
        await this._connectPromise;
        await new Promise(f => this._socket.write(data, f));
    }
    async close() {
        debug('pw:android:adb')('Close');
        this._socket.destroy();
    }
    async read(length) {
        await this._connectPromise;
        assert(!this._isSocket, 'Can not read by length in socket mode');
        while (this._buffer.length < length)
            await new Promise(f => this._notifyReader = f);
        const result = this._buffer.slice(0, length);
        this._buffer = this._buffer.slice(length);
        debug('pw:android:adb:recv')(result.toString());
        return result;
    }
    async readAll() {
        while (!this._isClosed)
            await new Promise(f => this._notifyReader = f);
        return this._buffer;
    }
    becomeSocket() {
        assert(!this._buffer.length);
        this._isSocket = true;
    }
}
//# sourceMappingURL=backendAdb.js.map