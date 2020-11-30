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
exports.ChannelOwner = void 0;
const events_1 = require("events");
const debugLogger_1 = require("../utils/debugLogger");
const stackTrace_1 = require("../utils/stackTrace");
class ChannelOwner extends events_1.EventEmitter {
    constructor(parent, type, guid, initializer) {
        super();
        this._objects = new Map();
        this._connection = parent instanceof ChannelOwner ? parent._connection : parent;
        this._type = type;
        this._guid = guid;
        this._parent = parent instanceof ChannelOwner ? parent : undefined;
        this._connection._objects.set(guid, this);
        if (this._parent) {
            this._parent._objects.set(guid, this);
            this._logger = this._parent._logger;
        }
        const base = new events_1.EventEmitter();
        this._channel = new Proxy(base, {
            get: (obj, prop) => {
                if (String(prop).startsWith('_'))
                    return obj[prop];
                if (prop === 'then')
                    return obj.then;
                if (prop === 'emit')
                    return obj.emit;
                if (prop === 'on')
                    return obj.on;
                if (prop === 'once')
                    return obj.once;
                if (prop === 'addEventListener')
                    return obj.addListener;
                if (prop === 'removeEventListener')
                    return obj.removeListener;
                if (prop === 'domain') // https://github.com/microsoft/playwright/issues/3848
                    return obj.domain;
                return (params) => this._connection.sendMessageToServer(this._type, guid, String(prop), params);
            },
        });
        this._channel._object = this;
        this._initializer = initializer;
    }
    _dispose() {
        // Clean up from parent and connection.
        if (this._parent)
            this._parent._objects.delete(this._guid);
        this._connection._objects.delete(this._guid);
        // Dispose all children.
        for (const object of [...this._objects.values()])
            object._dispose();
        this._objects.clear();
    }
    _debugScopeState() {
        return {
            _guid: this._guid,
            objects: Array.from(this._objects.values()).map(o => o._debugScopeState()),
        };
    }
    async _wrapApiCall(apiName, func, logger) {
        logger = logger || this._logger;
        try {
            logApiCall(logger, `=> ${apiName} started`);
            const result = await func();
            logApiCall(logger, `<= ${apiName} succeeded`);
            return result;
        }
        catch (e) {
            logApiCall(logger, `<= ${apiName} failed`);
            stackTrace_1.rewriteErrorMessage(e, `${apiName}: ` + e.message);
            throw e;
        }
    }
    toJSON() {
        // Jest's expect library tries to print objects sometimes.
        // RPC objects can contain links to lots of other objects,
        // which can cause jest to crash. Let's help it out
        // by just returning the important values.
        return {
            _type: this._type,
            _guid: this._guid,
        };
    }
}
exports.ChannelOwner = ChannelOwner;
function logApiCall(logger, message) {
    if (logger && logger.isEnabled('api', 'info'))
        logger.log('api', 'info', message, [], { color: 'cyan' });
    debugLogger_1.debugLogger.log('api', message);
}
//# sourceMappingURL=channelOwner.js.map