"use strict";
/**
 * Copyright 2017 Google Inc. All rights reserved.
 * Modifications copyright (c) Microsoft Corporation.
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
exports.Clank = void 0;
const browserType_1 = require("../browserType");
const browserContext_1 = require("../browserContext");
const crBrowser_1 = require("../chromium/crBrowser");
const android_1 = require("./android");
const backendAdb_1 = require("./backendAdb");
class Clank extends browserType_1.BrowserType {
    async _innerLaunch(progress, options, persistent, userDataDir) {
        options.proxy = options.proxy ? browserContext_1.normalizeProxySettings(options.proxy) : undefined;
        if (options.__testHookBeforeCreateBrowser)
            await options.__testHookBeforeCreateBrowser();
        // const client = new AndroidClient(new UsbBackend());
        const client = new android_1.AndroidClient(new backendAdb_1.AdbBackend());
        const device = (await client.devices())[0];
        await device.init();
        const adbBrowser = await device.launchBrowser(options.executablePath || 'com.android.chrome'); // com.chrome.canary
        const transport = adbBrowser;
        const browserOptions = {
            name: 'clank',
            slowMo: options.slowMo,
            persistent,
            headful: !options.headless,
            downloadsPath: undefined,
            browserProcess: new ClankBrowserProcess(device, adbBrowser),
            proxy: options.proxy,
        };
        if (persistent)
            browserContext_1.validateBrowserContextOptions(persistent, browserOptions);
        const browser = await this._connectToTransport(transport, browserOptions);
        // We assume no control when using custom arguments, and do not prepare the default context in that case.
        if (persistent && !options.ignoreAllDefaultArgs)
            await browser._defaultContext._loadDefaultContext(progress);
        return browser;
    }
    _defaultArgs(options, isPersistent, userDataDir) {
        return [];
    }
    _connectToTransport(transport, options) {
        return crBrowser_1.CRBrowser.connect(transport, options);
    }
    _amendEnvironment(env, userDataDir, executable, browserArguments) {
        return env;
    }
    _rewriteStartupError(error) {
        return error;
    }
    _attemptToGracefullyCloseBrowser(transport) {
    }
}
exports.Clank = Clank;
class ClankBrowserProcess {
    constructor(device, browser) {
        this._device = device;
        this._browser = browser;
    }
    async kill() {
    }
    async close() {
        await this._browser.close();
        await this._device.close();
    }
}
//# sourceMappingURL=clank.js.map