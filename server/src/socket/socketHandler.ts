import { Server, Socket } from 'socket.io';
import mongoose from 'mongoose';
import { Room } from '../models/Room';
import { User } from '../models/User';
import { Message } from '../models/Message';

/**
 * Interfaces to ensure type safety
 */
interface JoinRoomPayload {
    roomId: string;
    username: string;
}

interface MessagePayload {
    roomId: string;
    message: string;
    username: string;
}

interface SocketUserData {
    username?: string;
    roomId?: string;
    lastMessageAt?: number;
    databaseRoomId?: string;
    databaseUserId?: string;
}

interface ReceiveMessagePayload {
    id: string;
    roomId: string;
    message: string;
    username: string;
    timestamp: string;
}

/**
 * Production limits
 */
const MAX_USERNAME_LENGTH = 50;
const MAX_ROOM_ID_LENGTH = 100;
const MAX_MESSAGE_LENGTH = 2000;

/**
 * Number of previous messages sent to a client
 * when they join a room.
 *
 * This prevents loading an unlimited amount of
 * chat history into the browser.
 */
const CHAT_HISTORY_LIMIT = 50;

/**
 * Basic per-socket message rate limit.
 *
 * A user can send one message every 250ms.
 * This prevents accidental message flooding while
 * still allowing normal real-time chat.
 */
const MESSAGE_COOLDOWN_MS = 250;

/**
 * Helper to safely clean user input.
 */
const sanitizeString = (
    value: unknown,
    maxLength: number
): string => {
    if (typeof value !== 'string') {
        return '';
    }

    return value
        .trim()
        .replace(/\s+/g, ' ')
        .slice(0, maxLength);
};

/**
 * Validate room ID.
 */
const isValidRoomId = (roomId: string): boolean => {
    if (!roomId) {
        return false;
    }

    if (roomId.length > MAX_ROOM_ID_LENGTH) {
        return false;
    }

    return /^[a-zA-Z0-9_-]+$/.test(roomId);
};

/**
 * Validate username.
 */
const isValidUsername = (username: string): boolean => {
    if (!username) {
        return false;
    }

    if (username.length > MAX_USERNAME_LENGTH) {
        return false;
    }

    return true;
};

/**
 * Validate message.
 */
const isValidMessage = (message: string): boolean => {
    if (!message) {
        return false;
    }

    if (message.length > MAX_MESSAGE_LENGTH) {
        return false;
    }

    return true;
};

/**
 * Generate a unique message ID.
 *
 * This ID is used by Socket.IO and is also stored
 * in MongoDB as socketMessageId.
 */
const generateMessageId = (): string => {
    return `${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 10)}`;
};

/**
 * Emit the current number of connected clients
 * inside a specific room.
 */
const emitRoomUserCount = (
    io: Server,
    roomId: string
): number => {
    const room = io.sockets.adapter.rooms.get(roomId);

    const count = room ? room.size : 0;

    io.to(roomId).emit('user-count', count);

    return count;
};

/**
 * Find the MongoDB Room document.
 *
 * The Socket.IO room ID may be:
 *
 * 1. Room.roomCode
 * 2. MongoDB Room._id
 *
 * Supporting both makes the socket layer compatible
 * with the current frontend architecture.
 */
const findDatabaseRoom = async (
    roomId: string
) => {
    /**
     * First try roomCode because the frontend
     * commonly uses the generated room code.
     */
    const roomByCode = await Room.findOne({
        roomCode: roomId.toUpperCase(),
    });

    if (roomByCode) {
        return roomByCode;
    }

    /**
     * If roomCode was not found, check whether
     * the supplied roomId is a valid MongoDB ObjectId.
     */
    if (mongoose.Types.ObjectId.isValid(roomId)) {
        const roomById = await Room.findById(roomId);

        if (roomById) {
            return roomById;
        }
    }

    return null;
};

export const handleSocketEvents = (io: Server) => {
    io.on('connection', (socket: Socket) => {
        console.log(
            `[Socket] New connection: ${socket.id}`
        );

        /**
         * Initialize socket-specific data.
         */
        socket.data = {
            ...(socket.data as SocketUserData),
        };

        // 1. Handle joining a room
        socket.on(
            'join-room',
            async ({
                roomId,
                username,
            }: JoinRoomPayload) => {
                try {
                    const cleanRoomId = sanitizeString(
                        roomId,
                        MAX_ROOM_ID_LENGTH
                    );

                    const cleanUsername = sanitizeString(
                        username,
                        MAX_USERNAME_LENGTH
                    );

                    /**
                     * Validate room.
                     */
                    if (!isValidRoomId(cleanRoomId)) {
                        socket.emit('socket-error', {
                            type: 'JOIN_ROOM_ERROR',
                            message: 'Invalid room ID.',
                        });

                        return;
                    }

                    /**
                     * Validate username.
                     */
                    if (!isValidUsername(cleanUsername)) {
                        socket.emit('socket-error', {
                            type: 'JOIN_ROOM_ERROR',
                            message: 'Invalid username.',
                        });

                        return;
                    }

                    /**
                     * Find the persistent MongoDB room.
                     */
                    const databaseRoom =
                        await findDatabaseRoom(
                            cleanRoomId
                        );

                    /**
                     * A Socket.IO room should correspond
                     * to a real application room.
                     */
                    if (!databaseRoom) {
                        socket.emit('socket-error', {
                            type: 'JOIN_ROOM_ERROR',
                            message:
                                'Room does not exist.',
                        });

                        return;
                    }

                    /**
                     * Prevent duplicate joining of the same room.
                     */
                    if (
                        socket.data.roomId ===
                        cleanRoomId
                    ) {
                        socket.data.username =
                            cleanUsername;

                        /**
                         * Find the existing User document.
                         *
                         * This keeps the socket connected to
                         * the persistent user record.
                         */
                        const existingUser =
                            await User.findOne({
                                roomId:
                                    databaseRoom._id,
                                name: cleanUsername,
                            });

                        if (existingUser) {
                            existingUser.socketId =
                                socket.id;

                            await existingUser.save();

                            socket.data.databaseUserId =
                                existingUser._id.toString();
                        }

                        socket.data.databaseRoomId =
                            databaseRoom._id.toString();

                        const count =
                            emitRoomUserCount(
                                io,
                                cleanRoomId
                            );

                        /**
                         * Send previous chat history even
                         * if the client joins the same room again.
                         */
                        const history =
                            await Message.find({
                                roomId:
                                    databaseRoom._id,
                            })
                                .sort({
                                    createdAt: -1,
                                })
                                .limit(
                                    CHAT_HISTORY_LIMIT
                                )
                                .lean();

                        const orderedHistory =
                            history.reverse();

                        socket.emit(
                            'chat-history',
                            orderedHistory.map(
                                (item) => ({
                                    id:
                                        item.socketMessageId,
                                    roomId:
                                        cleanRoomId,
                                    message:
                                        item.message,
                                    username:
                                        item.username,
                                    timestamp:
                                        item.createdAt.toISOString(),
                                })
                            )
                        );

                        socket.emit('room-joined', {
                            roomId: cleanRoomId,
                            username: cleanUsername,
                            count,
                        });

                        return;
                    }

                    /**
                     * If the socket is already inside another room,
                     * remove it from that room before joining the
                     * new one.
                     */
                    const previousRoom =
                        socket.data.roomId;

                    const previousUsername =
                        socket.data.username;

                    if (previousRoom) {
                        socket.leave(previousRoom);

                        const previousCount =
                            emitRoomUserCount(
                                io,
                                previousRoom
                            );

                        io.to(previousRoom).emit(
                            'user-left',
                            {
                                username:
                                    previousUsername ||
                                    cleanUsername,
                                count: previousCount,
                            }
                        );

                        console.log(
                            `[Socket] User ${
                                previousUsername ||
                                cleanUsername
                            } left room: ${previousRoom}. Remaining: ${previousCount}`
                        );
                    }

                    /**
                     * Find or create the persistent User document.
                     *
                     * The unique index in User.ts prevents
                     * duplicate users with the same name
                     * inside the same room.
                     */
                    let databaseUser =
                        await User.findOne({
                            roomId:
                                databaseRoom._id,
                            name: cleanUsername,
                        });

                    if (databaseUser) {
                        /**
                         * Update the current Socket.IO connection.
                         */
                        databaseUser.socketId =
                            socket.id;

                        await databaseUser.save();
                    } else {
                        /**
                         * Create the persistent user record.
                         */
                        try {
                            databaseUser =
                                await User.create({
                                    name: cleanUsername,
                                    socketId:
                                        socket.id,
                                    roomId:
                                        databaseRoom._id,
                                });
                        } catch (userError: any) {
                            /**
                             * If another request created the
                             * same user at exactly the same
                             * time, retrieve that existing user.
                             */
                            if (
                                userError?.code === 11000
                            ) {
                                databaseUser =
                                    await User.findOne({
                                        roomId:
                                            databaseRoom._id,
                                        name: cleanUsername,
                                    });

                                if (databaseUser) {
                                    databaseUser.socketId =
                                        socket.id;

                                    await databaseUser.save();
                                } else {
                                    throw userError;
                                }
                            } else {
                                throw userError;
                            }
                        }
                    }

                    /**
                     * Join the requested Socket.IO room.
                     */
                    socket.join(cleanRoomId);

                    /**
                     * Store trusted user information
                     * on the socket.
                     *
                     * This is important because future events
                     * should use socket.data instead of trusting
                     * arbitrary room/user values from the client.
                     */
                    socket.data.username =
                        cleanUsername;

                    socket.data.roomId =
                        cleanRoomId;

                    socket.data.databaseRoomId =
                        databaseRoom._id.toString();

                    socket.data.databaseUserId =
                        databaseUser?._id?.toString();

                    socket.data.lastMessageAt = 0;

                    /**
                     * Get the current room size.
                     */
                    const room =
                        io.sockets.adapter.rooms.get(
                            cleanRoomId
                        );

                    const count = room
                        ? room.size
                        : 0;

                    /**
                     * Load the latest chat history.
                     *
                     * MongoDB stores newest messages first
                     * for this query.
                     */
                    const history =
                        await Message.find({
                            roomId:
                                databaseRoom._id,
                        })
                            .sort({
                                createdAt: -1,
                            })
                            .limit(
                                CHAT_HISTORY_LIMIT
                            )
                            .lean();

                    /**
                     * Reverse the messages so the frontend
                     * receives them from oldest → newest.
                     */
                    const orderedHistory =
                        history.reverse();

                    /**
                     * Send chat history ONLY to the
                     * newly connected client.
                     *
                     * We use socket.emit instead of io.to()
                     * because existing users do not need
                     * their history re-sent.
                     */
                    socket.emit(
                        'chat-history',
                        orderedHistory.map(
                            (item) => ({
                                id:
                                    item.socketMessageId,
                                roomId:
                                    cleanRoomId,
                                message:
                                    item.message,
                                username:
                                    item.username,
                                timestamp:
                                    item.createdAt.toISOString(),
                            })
                        )
                    );

                    /**
                     * Confirm successful room join
                     * to the current client.
                     */
                    socket.emit('room-joined', {
                        roomId: cleanRoomId,
                        username: cleanUsername,
                        count,
                    });

                    /**
                     * Tell all other clients that a new
                     * user joined the room.
                     */
                    socket.to(cleanRoomId).emit(
                        'user-joined',
                        {
                            username: cleanUsername,
                            count,
                        }
                    );

                    /**
                     * Broadcast updated count to everyone.
                     */
                    io.to(cleanRoomId).emit(
                        'user-count',
                        count
                    );

                    console.log(
                        `[Socket] User ${cleanUsername} joined room: ${cleanRoomId}. Current count: ${count}`
                    );
                } catch (error) {
                    console.error(
                        `[Socket] Join room error for ${socket.id}:`,
                        error
                    );

                    socket.emit('socket-error', {
                        type: 'JOIN_ROOM_ERROR',
                        message:
                            'Unable to join the room.',
                    });
                }
            }
        );

        // 2. Handle Messages
        socket.on(
            'send-message',
            async ({
                roomId,
                message,
                username,
            }: MessagePayload) => {
                try {
                    /**
                     * Make sure the socket has actually
                     * joined a room.
                     */
                    const connectedRoom =
                        socket.data.roomId;

                    if (!connectedRoom) {
                        socket.emit('socket-error', {
                            type: 'MESSAGE_ERROR',
                            message:
                                'You are not connected to a room.',
                        });

                        return;
                    }

                    /**
                     * Never trust the room ID sent by
                     * the client.
                     *
                     * The room is taken from socket.data.
                     */
                    if (
                        roomId !== connectedRoom
                    ) {
                        socket.emit('socket-error', {
                            type: 'MESSAGE_ERROR',
                            message:
                                'You cannot send messages to another room.',
                        });

                        return;
                    }

                    /**
                     * Use the username stored on the
                     * authenticated socket.
                     *
                     * This prevents a client from pretending
                     * to be another user.
                     */
                    const connectedUsername =
                        socket.data.username;

                    if (!connectedUsername) {
                        socket.emit('socket-error', {
                            type: 'MESSAGE_ERROR',
                            message:
                                'User information is missing.',
                        });

                        return;
                    }

                    /**
                     * Make sure we have a MongoDB room ID.
                     */
                    const databaseRoomId =
                        socket.data.databaseRoomId;

                    if (!databaseRoomId) {
                        socket.emit('socket-error', {
                            type: 'MESSAGE_ERROR',
                            message:
                                'Database room information is missing.',
                        });

                        return;
                    }

                    /**
                     * Sanitize the message.
                     */
                    const cleanMessage =
                        sanitizeString(
                            message,
                            MAX_MESSAGE_LENGTH
                        );

                    /**
                     * Validate message.
                     */
                    if (
                        !isValidMessage(
                            cleanMessage
                        )
                    ) {
                        socket.emit('socket-error', {
                            type: 'MESSAGE_ERROR',
                            message:
                                'Message cannot be empty or too long.',
                        });

                        return;
                    }

                    /**
                     * Basic rate limiting.
                     */
                    const now = Date.now();

                    const lastMessageAt =
                        socket.data
                            .lastMessageAt || 0;

                    if (
                        now - lastMessageAt <
                        MESSAGE_COOLDOWN_MS
                    ) {
                        socket.emit('socket-error', {
                            type: 'RATE_LIMIT',
                            message:
                                'Please wait before sending another message.',
                        });

                        return;
                    }

                    socket.data.lastMessageAt =
                        now;

                    /**
                     * Generate the message ID
                     * on the server.
                     */
                    const messageId =
                        generateMessageId();

                    /**
                     * Use the database creation time
                     * as the authoritative timestamp.
                     */
                    const timestamp =
                        new Date();

                    /**
                     * Find the persistent User record.
                     */
                    let databaseUserId:
                        | mongoose.Types.ObjectId
                        | undefined;

                    if (
                        socket.data
                            .databaseUserId &&
                        mongoose.Types.ObjectId.isValid(
                            socket.data
                                .databaseUserId
                        )
                    ) {
                        databaseUserId =
                            new mongoose.Types.ObjectId(
                                socket.data
                                    .databaseUserId
                            );
                    }

                    /**
                     * IMPORTANT:
                     *
                     * Save the message to MongoDB BEFORE
                     * broadcasting it to the clients.
                     *
                     * This prevents a message from appearing
                     * as successfully delivered when the
                     * database save actually failed.
                     */
                    const savedMessage =
                        await Message.create({
                            roomId:
                                new mongoose.Types.ObjectId(
                                    databaseRoomId
                                ),
                            userId:
                                databaseUserId,
                            username:
                                connectedUsername,
                            message:
                                cleanMessage,
                            socketMessageId:
                                messageId,
                        });

                    /**
                     * Build the payload expected
                     * by the frontend.
                     */
                    const payload: ReceiveMessagePayload =
                        {
                            id: messageId,
                            roomId:
                                connectedRoom,
                            message:
                                savedMessage.message,
                            username:
                                savedMessage.username,
                            timestamp:
                                savedMessage.createdAt.toISOString(),
                        };

                    /**
                     * Broadcast to everyone in the room
                     * including the sender.
                     */
                    io.to(connectedRoom).emit(
                        'receive-message',
                        payload
                    );

                    console.log(
                        `[Socket] Message saved and broadcast in ${connectedRoom} from ${connectedUsername}: ${cleanMessage}`
                    );
                } catch (error) {
                    console.error(
                        `[Socket] Message error for ${socket.id}:`,
                        error
                    );

                    socket.emit('socket-error', {
                        type: 'MESSAGE_ERROR',
                        message:
                            'Unable to save or send message.',
                    });
                }
            }
        );

        // 3. Handle Explicit Leaving
        socket.on(
            'leave-room',
            async () => {
                try {
                    const roomId =
                        socket.data.roomId;

                    const username =
                        socket.data.username;

                    const databaseUserId =
                        socket.data
                            .databaseUserId;

                    if (!roomId) {
                        return;
                    }

                    /**
                     * Remove socket from room.
                     */
                    socket.leave(roomId);

                    /**
                     * Clear socket room information.
                     */
                    socket.data.roomId =
                        undefined;

                    socket.data.lastMessageAt =
                        0;

                    socket.data.databaseRoomId =
                        undefined;

                    socket.data.databaseUserId =
                        undefined;

                    /**
                     * Mark the persistent User as
                     * disconnected.
                     *
                     * We keep the User document because
                     * it represents persistent room membership.
                     */
                    if (
                        databaseUserId &&
                        mongoose.Types.ObjectId.isValid(
                            databaseUserId
                        )
                    ) {
                        await User.findByIdAndUpdate(
                            databaseUserId,
                            {
                                socketId:
                                    'placeholder',
                            }
                        );
                    }

                    /**
                     * Calculate remaining clients.
                     */
                    const count =
                        emitRoomUserCount(
                            io,
                            roomId
                        );

                    /**
                     * Notify remaining users.
                     */
                    io.to(roomId).emit(
                        'user-left',
                        {
                            username:
                                username ||
                                'User',
                            count,
                        }
                    );

                    console.log(
                        `[Socket] User ${
                            username || 'Unknown'
                        } left room: ${roomId}. Remaining: ${count}`
                    );
                } catch (error) {
                    console.error(
                        `[Socket] Leave room error for ${socket.id}:`,
                        error
                    );
                }
            }
        );

        // 4. Handle Disconnection
        socket.on('disconnect', async (reason) => {
            try {
                const roomId =
                    socket.data.roomId;

                const username =
                    socket.data.username;

                const databaseUserId =
                    socket.data
                        .databaseUserId;

                /**
                 * Socket.IO automatically removes the
                 * socket from its rooms before the
                 * disconnect event is completed.
                 *
                 * Therefore the room size here represents
                 * the remaining connected clients.
                 */
                if (roomId) {
                    const room =
                        io.sockets.adapter.rooms.get(
                            roomId
                        );

                    const count = room
                        ? room.size
                        : 0;

                    /**
                     * Notify remaining clients.
                     */
                    io.to(roomId).emit(
                        'user-count',
                        count
                    );

                    io.to(roomId).emit(
                        'user-left',
                        {
                            username:
                                username ||
                                'User',
                            count,
                        }
                    );

                    console.log(
                        `[Socket] User ${
                            username || 'Unknown'
                        } disconnected from ${roomId}. Remaining: ${count}. Reason: ${reason}`
                    );
                } else {
                    console.log(
                        `[Socket] Client ${socket.id} disconnected. Reason: ${reason}`
                    );
                }

                /**
                 * Mark persistent user as offline.
                 *
                 * We do NOT delete the User document because
                 * the user may have persistent room information.
                 */
                if (
                    databaseUserId &&
                    mongoose.Types.ObjectId.isValid(
                        databaseUserId
                    )
                ) {
                    try {
                        await User.findByIdAndUpdate(
                            databaseUserId,
                            {
                                socketId:
                                    'placeholder',
                            }
                        );
                    } catch (userError) {
                        console.error(
                            `[Socket] Failed to update user after disconnect:`,
                            userError
                        );
                    }
                }

                /**
                 * Clear socket data.
                 */
                socket.data.roomId =
                    undefined;

                socket.data.username =
                    undefined;

                socket.data.lastMessageAt =
                    undefined;

                socket.data.databaseRoomId =
                    undefined;

                socket.data.databaseUserId =
                    undefined;
            } catch (error) {
                console.error(
                    `[Socket] Disconnect error for ${socket.id}:`,
                    error
                );
            }
        });

        // 5. Error Handling
        socket.on('error', (err) => {
            console.error(
                `[Socket Error] ${socket.id}:`,
                err
            );
        });
    });
};