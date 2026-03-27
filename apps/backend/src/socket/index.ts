import { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { SOCKET_EVENTS } from '@whatsapp-porter/shared';
import { config } from '../config';
import { setSocketServer } from './emitter';
import { getConnectionStatus } from '../whatsapp/connection';

export function initSocketServer(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: {
      origin: config.frontendUrl,
      methods: ['GET', 'POST'],
    },
  });

  setSocketServer(io);

  io.on('connection', (socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);

    socket.on(SOCKET_EVENTS.CONNECTION_REQUEST_STATUS, () => {
      socket.emit(SOCKET_EVENTS.CONNECTION_STATUS, getConnectionStatus());
    });

    socket.on('disconnect', () => {
      console.log(`[Socket] Client disconnected: ${socket.id}`);
    });
  });

  return io;
}
