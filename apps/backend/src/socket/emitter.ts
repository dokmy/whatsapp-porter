import type { Server } from 'socket.io';

let io: Server | null = null;

export function setSocketServer(server: Server) {
  io = server;
}

export function getSocketServer(): Server {
  if (!io) throw new Error('Socket.io server not initialized');
  return io;
}

export function emit(event: string, data: unknown) {
  if (io) {
    io.emit(event, data);
  }
}
