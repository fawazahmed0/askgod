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
exports.ConsoleAPI = void 0;
const selectorParser_1 = require("../../server/common/selectorParser");
class ConsoleAPI {
    constructor(injectedScript) {
        this._injectedScript = injectedScript;
        window.playwright = {
            $: (selector) => this._querySelector(selector),
            $$: (selector) => this._querySelectorAll(selector),
            inspect: (selector) => this._inspect(selector),
        };
    }
    _checkSelector(parsed) {
        for (const { name } of parsed.parts) {
            if (!this._injectedScript.engines.has(name))
                throw new Error(`Unknown engine "${name}"`);
        }
    }
    _querySelector(selector) {
        if (typeof selector !== 'string')
            throw new Error(`Usage: playwright.query('Playwright >> selector').`);
        const parsed = selectorParser_1.parseSelector(selector);
        this._checkSelector(parsed);
        const elements = this._injectedScript.querySelectorAll(parsed, document);
        return elements[0];
    }
    _querySelectorAll(selector) {
        if (typeof selector !== 'string')
            throw new Error(`Usage: playwright.$$('Playwright >> selector').`);
        const parsed = selectorParser_1.parseSelector(selector);
        this._checkSelector(parsed);
        const elements = this._injectedScript.querySelectorAll(parsed, document);
        return elements;
    }
    _inspect(selector) {
        if (typeof window.inspect !== 'function')
            return;
        if (typeof selector !== 'string')
            throw new Error(`Usage: playwright.inspect('Playwright >> selector').`);
        window.inspect(this._querySelector(selector));
    }
}
exports.ConsoleAPI = ConsoleAPI;
//# sourceMappingURL=consoleApi.js.map