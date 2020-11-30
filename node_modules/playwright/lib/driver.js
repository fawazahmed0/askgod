"use strict";
/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.runServer = exports.apiJson = exports.installWithProgressBar = exports.copyPrintDeps = void 0;
const fs = require("fs");
const util = require("util");
const debugController_1 = require("./debug/debugController");
const dispatcher_1 = require("./dispatchers/dispatcher");
const playwrightDispatcher_1 = require("./dispatchers/playwrightDispatcher");
const installer_1 = require("./install/installer");
const transport_1 = require("./protocol/transport");
const electron_1 = require("./server/electron/electron");
const playwright_1 = require("./server/playwright");
const processLauncher_1 = require("./server/processLauncher");
const harTracer_1 = require("./trace/harTracer");
const tracer_1 = require("./trace/tracer");
const readFileAsync = util.promisify(fs.readFile);
const writeFileAsync = util.promisify(fs.writeFile);
async function copyPrintDeps(destination) {
    const content = await readFileAsync(require.resolve('../bin/PrintDeps.exe'));
    await writeFileAsync(destination, content);
}
exports.copyPrintDeps = copyPrintDeps;
async function installWithProgressBar(location) {
    await installer_1.installBrowsersWithProgressBar(location);
}
exports.installWithProgressBar = installWithProgressBar;
async function apiJson() {
    return (await readFileAsync(require.resolve('../docs/api.json'))).toString();
}
exports.apiJson = apiJson;
function runServer() {
    debugController_1.installDebugController();
    tracer_1.installTracer();
    harTracer_1.installHarTracer();
    const dispatcherConnection = new dispatcher_1.DispatcherConnection();
    const transport = new transport_1.Transport(process.stdout, process.stdin);
    transport.onclose = async () => {
        // Force exit after 30 seconds.
        setTimeout(() => process.exit(0), 30000);
        // Meanwhile, try to gracefully close all browsers.
        await processLauncher_1.gracefullyCloseAll();
        process.exit(0);
    };
    transport.onmessage = message => dispatcherConnection.dispatch(JSON.parse(message));
    dispatcherConnection.onmessage = message => transport.send(JSON.stringify(message));
    const playwright = new playwright_1.Playwright(__dirname, require('../browsers.json')['browsers']);
    playwright.electron = new electron_1.Electron();
    new playwrightDispatcher_1.PlaywrightDispatcher(dispatcherConnection.rootDispatcher(), playwright);
}
exports.runServer = runServer;
if (process.argv[2] === 'serve')
    runServer();
//# sourceMappingURL=driver.js.map