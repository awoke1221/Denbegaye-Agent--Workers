"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.emitSocketEvent = void 0;
const emitSocketEvent = (event, data) => {
    if (typeof globalThis.io !== "undefined") {
        try {
            globalThis.io.emit(event, data);
        }
        catch (error) {
            console.error(`Failed to emit socket event ${event}:`, error);
        }
    }
};
exports.emitSocketEvent = emitSocketEvent;
