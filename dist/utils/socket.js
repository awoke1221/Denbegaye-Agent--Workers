"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.emitSocketEvent = void 0;
const emitSocketEvent = (event, data, room) => {
    if (typeof globalThis.io !== "undefined") {
        try {
            if (room) {
                globalThis.io.to(room).emit(event, data);
            }
            else {
                globalThis.io.emit(event, data);
            }
        }
        catch (error) {
            console.error(`Failed to emit socket event ${event}:`, error);
        }
    }
};
exports.emitSocketEvent = emitSocketEvent;
