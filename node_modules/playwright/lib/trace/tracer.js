"use strict";
/**
 * Copyright (c) Microsoft Corporation.
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
exports.installTracer = void 0;
const browserContext_1 = require("../server/browserContext");
const path = require("path");
const util = require("util");
const fs = require("fs");
const utils_1 = require("../utils/utils");
const page_1 = require("../server/page");
const snapshotter_1 = require("./snapshotter");
const helper_1 = require("../server/helper");
const timeoutSettings_1 = require("../utils/timeoutSettings");
const fsWriteFileAsync = util.promisify(fs.writeFile.bind(fs));
const fsAppendFileAsync = util.promisify(fs.appendFile.bind(fs));
const fsAccessAsync = util.promisify(fs.access.bind(fs));
function installTracer() {
    browserContext_1.contextListeners.add(new Tracer());
}
exports.installTracer = installTracer;
class Tracer {
    constructor() {
        this._contextTracers = new Map();
    }
    async onContextCreated(context) {
        if (!context._options._tracePath)
            return;
        const traceStorageDir = context._options._traceResourcesPath || path.join(path.dirname(context._options._tracePath), 'trace-resources');
        const contextTracer = new ContextTracer(context, traceStorageDir, context._options._tracePath);
        this._contextTracers.set(context, contextTracer);
    }
    async onContextWillDestroy(context) { }
    async onContextDidDestroy(context) {
        const contextTracer = this._contextTracers.get(context);
        if (contextTracer) {
            await contextTracer.dispose().catch(e => { });
            this._contextTracers.delete(context);
        }
    }
}
class ContextTracer {
    constructor(context, traceStorageDir, traceFile) {
        this._disposed = false;
        this._pageToId = new Map();
        this._context = context;
        this._contextId = 'context@' + utils_1.createGuid();
        this._traceStoragePromise = utils_1.mkdirIfNeeded(path.join(traceStorageDir, 'sha1')).then(() => traceStorageDir);
        this._appendEventChain = utils_1.mkdirIfNeeded(traceFile).then(() => traceFile);
        this._writeArtifactChain = Promise.resolve();
        const event = {
            type: 'context-created',
            browserName: context._browser._options.name,
            contextId: this._contextId,
            isMobile: !!context._options.isMobile,
            deviceScaleFactor: context._options.deviceScaleFactor || 1,
            viewportSize: context._options.viewport || undefined,
        };
        this._appendTraceEvent(event);
        this._snapshotter = new snapshotter_1.Snapshotter(context, this);
        this._eventListeners = [
            helper_1.helper.addEventListener(context, browserContext_1.BrowserContext.Events.Page, this._onPage.bind(this)),
        ];
        this._context._actionListeners.add(this);
    }
    onBlob(blob) {
        this._writeArtifact(blob.sha1, blob.buffer);
    }
    onResource(resource) {
        const event = {
            type: 'resource',
            contextId: this._contextId,
            pageId: resource.pageId,
            frameId: resource.frameId,
            url: resource.url,
            contentType: resource.contentType,
            responseHeaders: resource.responseHeaders,
            sha1: resource.sha1,
        };
        this._appendTraceEvent(event);
    }
    pageId(page) {
        return this._pageToId.get(page);
    }
    async onAfterAction(result, metadata) {
        try {
            const snapshot = await this._takeSnapshot(metadata.page, typeof metadata.target === 'string' ? undefined : metadata.target);
            const event = {
                type: 'action',
                contextId: this._contextId,
                pageId: this._pageToId.get(metadata.page),
                action: metadata.type,
                selector: typeof metadata.target === 'string' ? metadata.target : undefined,
                value: metadata.value,
                snapshot,
                startTime: result.startTime,
                endTime: result.endTime,
                stack: metadata.stack,
                logs: result.logs.slice(),
                error: result.error ? result.error.stack : undefined,
            };
            this._appendTraceEvent(event);
        }
        catch (e) {
        }
    }
    _onPage(page) {
        const pageId = 'page@' + utils_1.createGuid();
        this._pageToId.set(page, pageId);
        const event = {
            type: 'page-created',
            contextId: this._contextId,
            pageId,
        };
        this._appendTraceEvent(event);
        page.on(page_1.Page.Events.VideoStarted, (video) => {
            if (this._disposed)
                return;
            const event = {
                type: 'page-video',
                contextId: this._contextId,
                pageId,
                fileName: path.basename(video._path),
            };
            this._appendTraceEvent(event);
        });
        page.once(page_1.Page.Events.Close, () => {
            this._pageToId.delete(page);
            if (this._disposed)
                return;
            const event = {
                type: 'page-destroyed',
                contextId: this._contextId,
                pageId,
            };
            this._appendTraceEvent(event);
        });
    }
    async _takeSnapshot(page, target, timeout = 0) {
        if (!timeout) {
            // Never use zero timeout to avoid stalling because of snapshot.
            // Use 20% of the default timeout.
            timeout = (page._timeoutSettings.timeout({}) || timeoutSettings_1.DEFAULT_TIMEOUT) / 5;
        }
        const startTime = utils_1.monotonicTime();
        const snapshot = await this._snapshotter.takeSnapshot(page, target, timeout);
        if (!snapshot)
            return;
        const buffer = Buffer.from(JSON.stringify(snapshot));
        const sha1 = utils_1.calculateSha1(buffer);
        this._writeArtifact(sha1, buffer);
        return { sha1, duration: utils_1.monotonicTime() - startTime };
    }
    async dispose() {
        this._disposed = true;
        this._context._actionListeners.delete(this);
        helper_1.helper.removeEventListeners(this._eventListeners);
        this._pageToId.clear();
        this._snapshotter.dispose();
        const event = {
            type: 'context-destroyed',
            contextId: this._contextId,
        };
        this._appendTraceEvent(event);
        // Ensure all writes are finished.
        await this._appendEventChain;
        await this._writeArtifactChain;
    }
    _writeArtifact(sha1, buffer) {
        // Save all write promises to wait for them in dispose.
        const promise = this._innerWriteArtifact(sha1, buffer);
        this._writeArtifactChain = this._writeArtifactChain.then(() => promise);
    }
    async _innerWriteArtifact(sha1, buffer) {
        const traceDirectory = await this._traceStoragePromise;
        const filePath = path.join(traceDirectory, sha1);
        try {
            await fsAccessAsync(filePath);
        }
        catch (e) {
            // File does not exist - write it.
            await fsWriteFileAsync(filePath, buffer);
        }
    }
    _appendTraceEvent(event) {
        // Serialize all writes to the trace file.
        const timestamp = utils_1.monotonicTime();
        this._appendEventChain = this._appendEventChain.then(async (traceFile) => {
            await fsAppendFileAsync(traceFile, JSON.stringify({ ...event, timestamp }) + '\n');
            return traceFile;
        });
    }
}
//# sourceMappingURL=tracer.js.map