'use client';

import { useEffect, useRef } from 'react';
import type { Socket } from 'socket.io-client';
import { getSocket } from '@/lib/socket';

export function useSocket(): Socket {
  const socketRef = useRef<Socket>(getSocket());

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket.connected) {
      socket.connect();
    }
    return () => {
      // Don't disconnect on unmount — keep connection alive across pages
    };
  }, []);

  return socketRef.current;
}
