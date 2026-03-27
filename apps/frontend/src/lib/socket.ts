import { io, Socket } from 'socket.io-client';

function getBackendUrl(): string {
  // In dev mode with separate servers, use env var
  if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_BACKEND_URL) {
    return process.env.NEXT_PUBLIC_BACKEND_URL;
  }
  // In production (single server), connect to same origin
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return 'http://localhost:3003';
}

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(getBackendUrl(), {
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: Infinity,
    });
  }
  return socket;
}
