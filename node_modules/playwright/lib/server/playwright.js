"use strict";
/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
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
exports.Playwright = void 0;
const chromium_1 = require("./chromium/chromium");
const clank_1 = require("./clank/clank");
const webkit_1 = require("./webkit/webkit");
const firefox_1 = require("./firefox/firefox");
const selectors_1 = require("./selectors");
class Playwright {
    constructor(packagePath, browsers) {
        this.selectors = selectors_1.serverSelectors;
        const chromium = browsers.find(browser => browser.name === 'chromium');
        this.chromium = new chromium_1.Chromium(packagePath, chromium);
        const firefox = browsers.find(browser => browser.name === 'firefox');
        this.firefox = new firefox_1.Firefox(packagePath, firefox);
        const webkit = browsers.find(browser => browser.name === 'webkit');
        this.webkit = new webkit_1.WebKit(packagePath, webkit);
        this.clank = new clank_1.Clank(packagePath, {
            name: 'clank',
            revision: '0',
            download: false
        });
    }
}
exports.Playwright = Playwright;
//# sourceMappingURL=playwright.js.map