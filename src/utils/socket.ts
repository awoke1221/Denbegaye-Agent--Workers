import { Server } from "socket.io";

declare global {
  var io: Server | undefined;
}

export const emitSocketEvent = (event: string, data: any) => {
  if (typeof globalThis.io !== "undefined") {
    try {
      globalThis.io.emit(event, data);
    } catch (error) {
      console.error(`Failed to emit socket event ${event}:`, error);
    }
  }
};
