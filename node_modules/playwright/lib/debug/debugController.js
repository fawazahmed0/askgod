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
exports.installDebugController = void 0;
const browserContext_1 = require("../server/browserContext");
const page_1 = require("../server/page");
const utils_1 = require("../utils/utils");
const debugScriptSource = require("../generated/debugScriptSource");
function installDebugController() {
    browserContext_1.contextListeners.add(new DebugController());
}
exports.installDebugController = installDebugController;
class DebugController {
    async ensureInstalledInFrame(frame) {
        try {
            await frame.extendInjectedScript(debugScriptSource.source);
        }
        catch (e) {
        }
    }
    async onContextCreated(context) {
        if (!utils_1.isDebugMode())
            return;
        context.on(browserContext_1.BrowserContext.Events.Page, (page) => {
            for (const frame of page.frames())
                this.ensureInstalledInFrame(frame);
            page.on(page_1.Page.Events.FrameNavigated, frame => this.ensureInstalledInFrame(frame));
        });
    }
    async onContextWillDestroy(context) { }
    async onContextDidDestroy(context) { }
}
//# sourceMappingURL=debugController.js.map