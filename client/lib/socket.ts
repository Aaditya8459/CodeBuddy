// client/lib/socket.ts

import { io, Socket } from "socket.io-client";

/**
 * Socket.IO backend URL.
 *
 * Development:
 * NEXT_PUBLIC_SOCKET_URL=http://localhost:5000
 *
 * Production:
 * NEXT_PUBLIC_SOCKET_URL=https://your-backend-domain.com
 */
const SOCKET_URL =
  process.env.NEXT_PUBLIC_SOCKET_URL ||
  "http://localhost:5000";

/**
 * Create the Socket.IO client.
 *
 * autoConnect is disabled so the connection is
 * established when the user actually enters a room.
 */
export const socket: Socket = io(SOCKET_URL, {
  autoConnect: false,

  /**
   * Automatically attempt to reconnect if the
   * connection is temporarily lost.
   */
  reconnection: true,

  /**
   * Number of reconnection attempts.
   */
  reconnectionAttempts: 5,

  /**
   * Delay between reconnection attempts.
   */
  reconnectionDelay: 1000,

  /**
   * Use WebSocket when possible while still allowing
   * Socket.IO's fallback transport.
   */
  transports: ["websocket", "polling"],
});