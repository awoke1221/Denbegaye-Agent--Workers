import { Server } from "socket.io";

declare global {
  var io: Server | undefined;
}

export const emitSocketEvent = (event: string, data: any, room?: string) => {
  if (typeof globalThis.io !== "undefined") {
    try {
      if (room) {
        globalThis.io.to(room).emit(event, data);
      } else {
        globalThis.io.emit(event, data);
      }
    } catch (error) {
      console.error(`Failed to emit socket event ${event}:`, error);
    }
  }
};
