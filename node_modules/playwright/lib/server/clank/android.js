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
exports.AndroidBrowser = exports.AndroidDevice = exports.AndroidClient = void 0;
const debug = require("debug");
const events_1 = require("events");
const ws = require("ws");
const utils_1 = require("../../utils/utils");
class AndroidClient {
    constructor(backend) {
        this.backend = backend;
    }
    async devices() {
        const devices = await this.backend.devices();
        return devices.map(b => new AndroidDevice(b));
    }
}
exports.AndroidClient = AndroidClient;
class AndroidDevice {
    constructor(backend) {
        this.backend = backend;
    }
    async init() {
        await this.backend.init();
        this._model = await this.backend.runCommand('shell:getprop ro.product.model');
    }
    async close() {
        await this.backend.close();
    }
    async launchBrowser(packageName) {
        debug('pw:android')('Force-stopping', packageName);
        await this.backend.runCommand(`shell:am force-stop ${packageName}`);
        const socketName = utils_1.createGuid();
        const commandLine = `_ --disable-fre --no-default-browser-check --no-first-run --remote-debugging-socket-name=${socketName}`;
        debug('pw:android')('Starting', packageName, commandLine);
        await this.backend.runCommand(`shell:echo "${commandLine}" > /data/local/tmp/chrome-command-line`);
        await this.backend.runCommand(`shell:am start -n ${packageName}/com.google.android.apps.chrome.Main about:blank`);
        debug('pw:android')('Polling for socket', socketName);
        while (true) {
            const net = await this.backend.runCommand(`shell:cat /proc/net/unix | grep ${socketName}$`);
            if (net)
                break;
            await new Promise(f => setTimeout(f, 100));
        }
        debug('pw:android')('Got the socket, connecting');
        const browser = new AndroidBrowser(this, packageName, socketName);
        await browser._open();
        return browser;
    }
    model() {
        return this._model;
    }
}
exports.AndroidDevice = AndroidDevice;
class AndroidBrowser extends events_1.EventEmitter {
    constructor(device, packageName, socketName) {
        super();
        this._waitForNextTask = utils_1.makeWaitForNextTask();
        this._packageName = packageName;
        this.device = device;
        this.socketName = socketName;
        this._receiver = new ws.Receiver();
        this._receiver.on('message', message => {
            this._waitForNextTask(() => {
                if (this.onmessage)
                    this.onmessage(JSON.parse(message));
            });
        });
    }
    async _open() {
        this._socket = await this.device.backend.open(`localabstract:${this.socketName}`);
        this._socket.on('close', () => {
            this._waitForNextTask(() => {
                if (this.onclose)
                    this.onclose();
            });
        });
        await this._socket.write(Buffer.from(`GET /devtools/browser HTTP/1.1\r
Upgrade: WebSocket\r
Connection: Upgrade\r
Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r
Sec-WebSocket-Version: 13\r
\r
`));
        // HTTP Upgrade response.
        await new Promise(f => this._socket.once('data', f));
        // Start sending web frame to receiver.
        this._socket.on('data', data => this._receiver._write(data, 'binary', () => { }));
    }
    async send(s) {
        await this._socket.write(encodeWebFrame(JSON.stringify(s)));
    }
    async close() {
        await this._socket.close();
        await this.device.backend.runCommand(`shell:am force-stop ${this._packageName}`);
    }
}
exports.AndroidBrowser = AndroidBrowser;
function encodeWebFrame(data) {
    return ws.Sender.frame(Buffer.from(data), {
        opcode: 1,
        mask: true,
        fin: true,
        readOnly: true
    })[0];
}
//# sourceMappingURL=android.js.map