import { Server } from "socket.io";

declare global {
  var io: Server | undefined;
}

type BufferedSocketEvent = {
  event: string;
  data: any;
};

const EVENT_BUFFER_LIMIT = 200;
const socketEventBuffer = new Map<string, BufferedSocketEvent[]>();

function addSocketEventToBuffer(event: string, data: any, room: string) {
  const buffer = socketEventBuffer.get(room) ?? [];
  buffer.push({ event, data });
  if (buffer.length > EVENT_BUFFER_LIMIT) {
    buffer.shift();
  }
  socketEventBuffer.set(room, buffer);
}

export function getBufferedSocketEvents(room: string): BufferedSocketEvent[] {
  return socketEventBuffer.get(room) ?? [];
}

export const emitSocketEvent = (event: string, data: any, room?: string) => {
  if (typeof globalThis.io !== "undefined") {
    try {
      if (room) {
        addSocketEventToBuffer(event, data, room);
        globalThis.io.to(room).emit(event, data);
      } else {
        globalThis.io.emit(event, data);
      }
    } catch (error) {
      console.error(`Failed to emit socket event ${event}:`, error);
    }
  }
};
