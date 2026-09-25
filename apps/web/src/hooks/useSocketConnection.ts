import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './useAuth';
import { API_BASE } from '../lib/api';

export function useSocketConnection() {
  const socketRef = useRef<Socket | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const { token } = useAuth();

  useEffect(() => {
    if (!token) return;

    const newSocket = io(API_BASE, {
      ...(token !== '__cookie__' ? { auth: { token } } : {}),
      withCredentials: true,
    });

    socketRef.current = newSocket;
    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
      socketRef.current = null;
      setSocket(null);
    };
  }, [token]);

  return { socket, socketRef };
}
