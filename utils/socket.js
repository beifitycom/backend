import { Server } from 'socket.io';
import { setupSocketHandlers } from '../controllers/socketController.js';

export const initializeSocket = (server, corsOptions) => {
  const io = new Server(server, {
    cors: corsOptions,
    pingInterval: 10000,
    pingTimeout: 5000,
  });

  io.on('connection', (socket) => {
    setupSocketHandlers(io, socket);
  });

  return io;
};

export { getOnlineUsers } from '../controllers/socketController.js';