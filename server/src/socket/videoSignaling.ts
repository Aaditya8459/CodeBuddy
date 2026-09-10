import { Server, Socket } from 'socket.io';

/**
 * ============================================================
 * WebRTC Signaling Payloads
 * ============================================================
 */

interface VideoCallJoinPayload {
    roomId?: string;
}

interface VideoOfferPayload {
    roomId?: string;
    targetSocketId?: string;
    offer?: unknown;
}

interface VideoAnswerPayload {
    roomId?: string;
    targetSocketId?: string;
    answer?: unknown;
}

interface IceCandidatePayload {
    roomId?: string;
    targetSocketId?: string;
    candidate?: unknown;
}

interface VideoCallLeavePayload {
    roomId?: string;
}

/**
 * ============================================================
 * Socket User Data
 * ============================================================
 */

interface VideoSocketData {
    username?: string;
    roomId?: string;
}

/**
 * ============================================================
 * Production Limits
 * ============================================================
 */

const MAX_ROOM_ID_LENGTH = 100;
const MAX_SOCKET_ID_LENGTH = 100;

/**
 * ============================================================
 * String Helpers
 * ============================================================
 */

const sanitizeRoomId = (
    value: unknown
): string => {
    if (
        typeof value !== 'string'
    ) {
        return '';
    }

    return value
        .trim()
        .slice(0, MAX_ROOM_ID_LENGTH);
};

/**
 * ============================================================
 * Validation
 * ============================================================
 */

const isValidRoomId = (
    roomId: string
): boolean => {
    if (!roomId) {
        return false;
    }

    if (
        roomId.length >
        MAX_ROOM_ID_LENGTH
    ) {
        return false;
    }

    return /^[a-zA-Z0-9_-]+$/.test(
        roomId
    );
};

const isValidSocketId = (
    socketId: string
): boolean => {
    if (!socketId) {
        return false;
    }

    if (
        socketId.length >
        MAX_SOCKET_ID_LENGTH
    ) {
        return false;
    }

    return true;
};

/**
 * ============================================================
 * Connected Room Validation
 * ============================================================
 *
 * IMPORTANT:
 *
 * The server NEVER trusts an arbitrary roomId supplied
 * by the browser.
 *
 * The authoritative room is:
 *
 * socket.data.roomId
 *
 * This prevents a client connected to Room A from sending
 * WebRTC signaling messages into Room B.
 */

const getConnectedRoom = (
    socket: Socket
): string | null => {
    const socketData =
        socket.data as VideoSocketData;

    const roomId =
        socketData.roomId;

    if (
        !roomId ||
        !isValidRoomId(roomId)
    ) {
        return null;
    }

    return roomId;
};

/**
 * ============================================================
 * Target Socket Validation
 * ============================================================
 */

const getTargetSocket = (
    io: Server,
    targetSocketId: unknown
): Socket | null => {
    if (
        typeof targetSocketId !==
        'string'
    ) {
        return null;
    }

    const cleanSocketId =
        targetSocketId
            .trim()
            .slice(
                0,
                MAX_SOCKET_ID_LENGTH
            );

    if (
        !isValidSocketId(
            cleanSocketId
        )
    ) {
        return null;
    }

    const targetSocket =
        io.sockets.sockets.get(
            cleanSocketId
        );

    return targetSocket || null;
};

/**
 * ============================================================
 * Verify Target Is In Same Room
 * ============================================================
 */

const isSocketInRoom = (
    targetSocket: Socket,
    roomId: string
): boolean => {
    return targetSocket.rooms.has(
        roomId
    );
};

/**
 * ============================================================
 * Video Signaling Error
 * ============================================================
 */

const emitVideoError = (
    socket: Socket,
    message: string
) => {
    socket.emit(
        'socket-error',
        {
            type:
                'VIDEO_SIGNALING_ERROR',
            message,
        }
    );
};

/**
 * ============================================================
 * Register WebRTC Signaling
 * ============================================================
 *
 * This function is called from:
 *
 * server/src/socket/socketHandler.ts
 *
 * inside the existing Socket.IO connection handler.
 *
 * Example:
 *
 * registerVideoSignaling(
 *     io,
 *     socket
 * );
 *
 * The server does NOT handle:
 *
 * - camera streams
 * - microphone streams
 * - video encoding
 * - audio encoding
 * - media forwarding
 *
 * The server only forwards WebRTC signaling information.
 *
 * Signaling flow:
 *
 * User A
 *   │
 *   │ video-call-join
 *   ▼
 * Server
 *   │
 *   │ video-call-join
 *   ▼
 * User B
 *
 * User A
 *   │
 *   │ video-offer
 *   ▼
 * Server
 *   │
 *   │ video-offer
 *   ▼
 * User B
 *
 * User B
 *   │
 *   │ video-answer
 *   ▼
 * Server
 *   │
 *   │ video-answer
 *   ▼
 * User A
 *
 * Both peers:
 *
 * ice-candidate
 *       │
 *       ▼
 *    Server
 *       │
 *       ▼
 * Other peer
 */

export const registerVideoSignaling = (
    io: Server,
    socket: Socket
): void => {
    /**
     * ========================================================
     * 1. VIDEO CALL JOIN
     * ========================================================
     *
     * A client sends this event when opening VideoCall.
     *
     * The server finds the other connected users in the
     * same Socket.IO room and notifies them.
     */

    socket.on(
        'video-call-join',
        (
            payload: VideoCallJoinPayload = {}
        ) => {
            try {
                const roomId =
                    getConnectedRoom(
                        socket
                    );

                if (!roomId) {
                    emitVideoError(
                        socket,
                        'You are not connected to a room.'
                    );

                    return;
                }

                /**
                 * The roomId from the payload is optional.
                 *
                 * If provided, it must match the authenticated
                 * Socket.IO room.
                 */
                if (
                    payload.roomId
                ) {
                    const requestedRoomId =
                        sanitizeRoomId(
                            payload.roomId
                        );

                    if (
                        requestedRoomId !==
                        roomId
                    ) {
                        emitVideoError(
                            socket,
                            'You cannot join video signaling for another room.'
                        );

                        return;
                    }
                }

                /**
                 * Get every socket currently connected
                 * to this room.
                 */
                const room =
                    io.sockets.adapter.rooms.get(
                        roomId
                    );

                if (!room) {
                    return;
                }

                /**
                 * Notify every other participant that this
                 * socket wants to establish a video connection.
                 */
                for (
                    const participantSocketId of room
                ) {
                    if (
                        participantSocketId ===
                        socket.id
                    ) {
                        continue;
                    }

                    const participantSocket =
                        io.sockets.sockets.get(
                            participantSocketId
                        );

                    if (
                        !participantSocket
                    ) {
                        continue;
                    }

                    participantSocket.emit(
                        'video-call-join',
                        {
                            roomId,
                            socketId:
                                socket.id,
                        }
                    );
                }

                console.log(
                    `[Video] ${socket.id} joined video signaling in room ${roomId}`
                );
            } catch (
                error
            ) {
                console.error(
                    `[Video] video-call-join error for ${socket.id}:`,
                    error
                );

                emitVideoError(
                    socket,
                    'Unable to join video call.'
                );
            }
        }
    );

    /**
     * ========================================================
     * 2. VIDEO OFFER
     * ========================================================
     *
     * The caller creates an RTCPeerConnection offer and
     * sends it to the server.
     *
     * The server forwards the offer directly to the
     * requested peer.
     */

    socket.on(
        'video-offer',
        (
            payload: VideoOfferPayload
        ) => {
            try {
                const roomId =
                    getConnectedRoom(
                        socket
                    );

                if (!roomId) {
                    emitVideoError(
                        socket,
                        'You are not connected to a room.'
                    );

                    return;
                }

                if (
                    !payload ||
                    typeof payload !==
                        'object'
                ) {
                    emitVideoError(
                        socket,
                        'Invalid video offer payload.'
                    );

                    return;
                }

                const targetSocket =
                    getTargetSocket(
                        io,
                        payload.targetSocketId
                    );

                if (
                    !targetSocket
                ) {
                    emitVideoError(
                        socket,
                        'Target video peer is not connected.'
                    );

                    return;
                }

                /**
                 * Never allow signaling across rooms.
                 */
                if (
                    !isSocketInRoom(
                        targetSocket,
                        roomId
                    )
                ) {
                    emitVideoError(
                        socket,
                        'Target peer is not in your room.'
                    );

                    return;
                }

                if (
                    targetSocket.id ===
                    socket.id
                ) {
                    emitVideoError(
                        socket,
                        'You cannot send a video offer to yourself.'
                    );

                    return;
                }

                if (
                    payload.offer ===
                    undefined ||
                    payload.offer ===
                    null
                ) {
                    emitVideoError(
                        socket,
                        'Video offer is missing.'
                    );

                    return;
                }

                /**
                 * Forward the SDP offer.
                 *
                 * senderSocketId is included so the receiving
                 * client knows exactly which socket sent it.
                 */
                targetSocket.emit(
                    'video-offer',
                    {
                        roomId,
                        offer:
                            payload.offer,
                        senderSocketId:
                            socket.id,
                    }
                );

                console.log(
                    `[Video] Offer forwarded ${socket.id} -> ${targetSocket.id} in room ${roomId}`
                );
            } catch (
                error
            ) {
                console.error(
                    `[Video] video-offer error for ${socket.id}:`,
                    error
                );

                emitVideoError(
                    socket,
                    'Unable to forward video offer.'
                );
            }
        }
    );

    /**
     * ========================================================
     * 3. VIDEO ANSWER
     * ========================================================
     *
     * The receiving peer creates an SDP answer and sends
     * it back to the original caller.
     */

    socket.on(
        'video-answer',
        (
            payload: VideoAnswerPayload
        ) => {
            try {
                const roomId =
                    getConnectedRoom(
                        socket
                    );

                if (!roomId) {
                    emitVideoError(
                        socket,
                        'You are not connected to a room.'
                    );

                    return;
                }

                if (
                    !payload ||
                    typeof payload !==
                        'object'
                ) {
                    emitVideoError(
                        socket,
                        'Invalid video answer payload.'
                    );

                    return;
                }

                const targetSocket =
                    getTargetSocket(
                        io,
                        payload.targetSocketId
                    );

                if (
                    !targetSocket
                ) {
                    emitVideoError(
                        socket,
                        'Target video peer is not connected.'
                    );

                    return;
                }

                /**
                 * Never allow signaling across rooms.
                 */
                if (
                    !isSocketInRoom(
                        targetSocket,
                        roomId
                    )
                ) {
                    emitVideoError(
                        socket,
                        'Target peer is not in your room.'
                    );

                    return;
                }

                if (
                    targetSocket.id ===
                    socket.id
                ) {
                    emitVideoError(
                        socket,
                        'You cannot send a video answer to yourself.'
                    );

                    return;
                }

                if (
                    payload.answer ===
                    undefined ||
                    payload.answer ===
                    null
                ) {
                    emitVideoError(
                        socket,
                        'Video answer is missing.'
                    );

                    return;
                }

                /**
                 * Forward the SDP answer to the caller.
                 */
                targetSocket.emit(
                    'video-answer',
                    {
                        roomId,
                        answer:
                            payload.answer,
                        senderSocketId:
                            socket.id,
                    }
                );

                console.log(
                    `[Video] Answer forwarded ${socket.id} -> ${targetSocket.id} in room ${roomId}`
                );
            } catch (
                error
            ) {
                console.error(
                    `[Video] video-answer error for ${socket.id}:`,
                    error
                );

                emitVideoError(
                    socket,
                    'Unable to forward video answer.'
                );
            }
        }
    );

    /**
     * ========================================================
     * 4. ICE CANDIDATE
     * ========================================================
     *
     * ICE candidates are generated by both peers.
     *
     * The server simply forwards them to the other peer.
     */

    socket.on(
        'ice-candidate',
        (
            payload: IceCandidatePayload
        ) => {
            try {
                const roomId =
                    getConnectedRoom(
                        socket
                    );

                if (!roomId) {
                    emitVideoError(
                        socket,
                        'You are not connected to a room.'
                    );

                    return;
                }

                if (
                    !payload ||
                    typeof payload !==
                        'object'
                ) {
                    emitVideoError(
                        socket,
                        'Invalid ICE candidate payload.'
                    );

                    return;
                }

                const targetSocket =
                    getTargetSocket(
                        io,
                        payload.targetSocketId
                    );

                if (
                    !targetSocket
                ) {
                    emitVideoError(
                        socket,
                        'Target video peer is not connected.'
                    );

                    return;
                }

                /**
                 * Never allow ICE candidates to cross rooms.
                 */
                if (
                    !isSocketInRoom(
                        targetSocket,
                        roomId
                    )
                ) {
                    emitVideoError(
                        socket,
                        'Target peer is not in your room.'
                    );

                    return;
                }

                if (
                    targetSocket.id ===
                    socket.id
                ) {
                    emitVideoError(
                        socket,
                        'You cannot send an ICE candidate to yourself.'
                    );

                    return;
                }

                if (
                    payload.candidate ===
                    undefined ||
                    payload.candidate ===
                    null
                ) {
                    emitVideoError(
                        socket,
                        'ICE candidate is missing.'
                    );

                    return;
                }

                /**
                 * Forward ICE candidate.
                 */
                targetSocket.emit(
                    'ice-candidate',
                    {
                        roomId,
                        candidate:
                            payload.candidate,
                        senderSocketId:
                            socket.id,
                    }
                );
            } catch (
                error
            ) {
                console.error(
                    `[Video] ice-candidate error for ${socket.id}:`,
                    error
                );

                emitVideoError(
                    socket,
                    'Unable to forward ICE candidate.'
                );
            }
        }
    );

    /**
     * ========================================================
     * 5. VIDEO CALL LEAVE
     * ========================================================
     *
     * Notify the other participants that this peer has
     * left the video call.
     */

    socket.on(
        'video-call-leave',
        (
            payload: VideoCallLeavePayload = {}
        ) => {
            try {
                const roomId =
                    getConnectedRoom(
                        socket
                    );

                if (!roomId) {
                    return;
                }

                /**
                 * If the client supplied a room ID,
                 * it must match the connected room.
                 */
                if (
                    payload.roomId
                ) {
                    const requestedRoomId =
                        sanitizeRoomId(
                            payload.roomId
                        );

                    if (
                        requestedRoomId !==
                        roomId
                    ) {
                        emitVideoError(
                            socket,
                            'Invalid video room.'
                        );

                        return;
                    }
                }

                /**
                 * Notify all other clients in the room.
                 */
                socket.to(
                    roomId
                ).emit(
                    'video-call-leave',
                    {
                        roomId,
                        socketId:
                            socket.id,
                    }
                );

                console.log(
                    `[Video] ${socket.id} left video signaling in room ${roomId}`
                );
            } catch (
                error
            ) {
                console.error(
                    `[Video] video-call-leave error for ${socket.id}:`,
                    error
                );
            }
        }
    );
    /**
     * ========================================================
     * Registration Complete
     * ========================================================
     */

    console.log(
        `[Video] WebRTC signaling registered for socket ${socket.id}`
    );
};