"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.emitSocketEvent = void 0;
exports.getBufferedSocketEvents = getBufferedSocketEvents;
const EVENT_BUFFER_LIMIT = 200;
const socketEventBuffer = new Map();
function addSocketEventToBuffer(event, data, room) {
    const buffer = socketEventBuffer.get(room) ?? [];
    buffer.push({ event, data });
    if (buffer.length > EVENT_BUFFER_LIMIT) {
        buffer.shift();
    }
    socketEventBuffer.set(room, buffer);
}
function getBufferedSocketEvents(room) {
    return socketEventBuffer.get(room) ?? [];
}
const emitSocketEvent = (event, data, room) => {
    if (typeof globalThis.io !== "undefined") {
        try {
            if (room) {
                addSocketEventToBuffer(event, data, room);
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
