import { io, Socket } from "socket.io-client";

/**
 * We initialize the socket connection here. 
 * By using 'autoConnect: false', we prevent the socket from connecting 
 * automatically when the app loads. We will trigger the connection 
 * manually in your components (like the Header) when the user joins a room.
 */
const SOCKET_URL = "http://localhost:5000";

export const socket: Socket = io(SOCKET_URL, {
    autoConnect: false, 
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
});