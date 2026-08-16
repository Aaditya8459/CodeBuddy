"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleSocketEvents = void 0;
const handleSocketEvents = (io) => {
    io.on('connection', (socket) => {
        console.log(`[Socket] New connection: ${socket.id}`);
        // 1. Handle joining a room
        socket.on('join-room', ({ roomId, username }) => {
            socket.join(roomId);
            socket.data.username = username;
            socket.data.roomId = roomId;
            const room = io.sockets.adapter.rooms.get(roomId);
            const count = room ? room.size : 0;
            io.to(roomId).emit('user-count', count);
            console.log(`[Socket] User ${username} joined room: ${roomId}. Current count: ${count}`);
        });
        // 2. Handle Messages
        socket.on('send-message', ({ roomId, message, username }) => {
            const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            // Broadcast to everyone in the room (including the sender)
            io.to(roomId).emit('receive-message', {
                message,
                username,
                timestamp
            });
            console.log(`[Socket] Message in ${roomId} from ${username}: ${message}`);
        });
        // 3. Handle Disconnection
        socket.on('disconnect', () => {
            const { roomId, username } = socket.data;
            if (roomId) {
                const room = io.sockets.adapter.rooms.get(roomId);
                const count = room ? room.size : 0;
                io.to(roomId).emit('user-count', count);
                console.log(`[Socket] User ${username} disconnected from ${roomId}. Remaining: ${count}`);
            }
        });
        // 4. Error Handling
        socket.on('error', (err) => {
            console.error(`[Socket Error] ${socket.id}:`, err);
        });
    });
};
exports.handleSocketEvents = handleSocketEvents;
//# sourceMappingURL=socketHandler.js.map