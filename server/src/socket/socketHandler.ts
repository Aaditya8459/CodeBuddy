import { Server, Socket } from 'socket.io';
import mongoose from 'mongoose';
import { Room } from '../models/Room';
import { User } from '../models/User';
import { Message } from '../models/Message';
import { registerVideoSignaling } from './videoSignaling';

/**
 * ============================================================
 * Interfaces
 * ============================================================
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

interface FileCreatePayload {
    roomId?: string;
    fileName?: string;
    path?: string;
    language?: string;
    content?: string;
    username?: string;
}

interface FolderCreatePayload {
    roomId?: string;
    folderName?: string;
    path?: string;
    username?: string;
}

interface FileUpdatePayload {
    roomId?: string;
    fileName?: string;
    path?: string;
    language?: string;
    content?: string;
    username?: string;
}

interface FileDeletePayload {
    roomId?: string;
    fileName?: string;
    path?: string;
    username?: string;
}

interface FolderDeletePayload {
    roomId?: string;
    folderName?: string;
    path?: string;
    username?: string;
}

interface FileRenamePayload {
    roomId?: string;
    oldPath?: string;
    newPath?: string;
    username?: string;
}

interface FolderRenamePayload {
    roomId?: string;
    oldPath?: string;
    newPath?: string;
    username?: string;
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
 * ============================================================
 * Production limits
 * ============================================================
 */

const MAX_USERNAME_LENGTH = 50;
const MAX_ROOM_ID_LENGTH = 100;
const MAX_MESSAGE_LENGTH = 2000;

const MAX_FILE_NAME_LENGTH = 255;
const MAX_FILE_PATH_LENGTH = 1000;
const MAX_FILE_CONTENT_LENGTH = 10 * 1024 * 1024;
const MAX_LANGUAGE_LENGTH = 50;

const CHAT_HISTORY_LIMIT = 50;

const MESSAGE_COOLDOWN_MS = 250;

/**
 * Worker service.
 *
 * Docker access belongs to worker-service.
 */
const WORKER_SERVICE_URL =
    process.env.WORKER_SERVICE_URL ||
    'http://localhost:5001';

/**
 * ============================================================
 * String helpers
 * ============================================================
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
 * File paths must NOT collapse whitespace like normal
 * human-readable strings.
 */
const sanitizePath = (
    value: unknown
): string => {
    if (typeof value !== 'string') {
        return '';
    }

    let clean = value
        .trim()
        .replace(/\\/g, '/');

    /**
     * Always operate inside /workspace.
     */
    clean = clean.replace(/^\/+/, '');

    /**
     * Remove duplicate slashes.
     */
    clean = clean.replace(/\/+/g, '/');

    /**
     * Remove ./ prefixes.
     */
    while (clean.startsWith('./')) {
        clean = clean.slice(2);
    }

    return clean.slice(0, MAX_FILE_PATH_LENGTH);
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

    if (roomId.length > MAX_ROOM_ID_LENGTH) {
        return false;
    }

    return /^[a-zA-Z0-9_-]+$/.test(roomId);
};

const isValidUsername = (
    username: string
): boolean => {
    if (!username) {
        return false;
    }

    if (username.length > MAX_USERNAME_LENGTH) {
        return false;
    }

    return true;
};

const isValidMessage = (
    message: string
): boolean => {
    if (!message) {
        return false;
    }

    if (message.length > MAX_MESSAGE_LENGTH) {
        return false;
    }

    return true;
};

/**
 * Prevent:
 *
 * ../
 * ../../
 * /etc
 * C:\Windows
 * etc.
 */
const isSafeWorkspacePath = (
    inputPath: string
): boolean => {
    if (!inputPath) {
        return false;
    }

    const normalized = inputPath
        .replace(/\\/g, '/')
        .replace(/^\/+/, '');

    if (
        normalized.includes('\0') ||
        normalized.includes('../') ||
        normalized.startsWith('../') ||
        normalized === '..' ||
        normalized.includes('/..')
    ) {
        return false;
    }

    /**
     * Windows drive paths.
     */
    if (/^[a-zA-Z]:/.test(normalized)) {
        return false;
    }

    /**
     * Absolute Unix paths after normalization.
     */
    if (normalized.startsWith('/')) {
        return false;
    }

    return true;
};

/**
 * ============================================================
 * Message ID
 * ============================================================
 */

const generateMessageId = (): string => {
    return `${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 10)}`;
};

/**
 * ============================================================
 * Room user count
 * ============================================================
 */

const emitRoomUserCount = (
    io: Server,
    roomId: string
): number => {
    const room =
        io.sockets.adapter.rooms.get(roomId);

    const count = room ? room.size : 0;

    io.to(roomId).emit(
        'user-count',
        count
    );

    return count;
};

/**
 * ============================================================
 * MongoDB room lookup
 * ============================================================
 */

const findDatabaseRoom = async (
    roomId: string
) => {
    const roomByCode =
        await Room.findOne({
            roomCode: roomId.toUpperCase(),
        });

    if (roomByCode) {
        return roomByCode;
    }

    if (
        mongoose.Types.ObjectId.isValid(
            roomId
        )
    ) {
        const roomById =
            await Room.findById(roomId);

        if (roomById) {
            return roomById;
        }
    }

    return null;
};

/**
 * ============================================================
 * Socket authentication / room validation
 * ============================================================
 */

const getConnectedRoom = (
    socket: Socket
): string | null => {
    const roomId =
        socket.data.roomId;

    if (
        !roomId ||
        !isValidRoomId(roomId)
    ) {
        return null;
    }

    return roomId;
};

const getConnectedUsername = (
    socket: Socket
): string | null => {
    const username =
        socket.data.username;

    if (
        !username ||
        !isValidUsername(username)
    ) {
        return null;
    }

    return username;
};

/**
 * ============================================================
 * Worker request helper
 * ============================================================
 *
 * IMPORTANT:
 *
 * The server never accesses Docker directly.
 *
 * Server -> Worker -> Docker
 *
 * The worker owns RoomContainer and Docker.
 */

const workerRequest = async (
    endpoint: string,
    body: Record<string, unknown>,
    timeoutMs = 15000
) => {
    const controller =
        new AbortController();

    const timeout =
        setTimeout(
            () => controller.abort(),
            timeoutMs
        );

    try {
        const response =
            await fetch(
                `${WORKER_SERVICE_URL}${endpoint}`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type':
                            'application/json',
                    },
                    body: JSON.stringify(body),
                    signal:
                        controller.signal,
                }
            );

        const text =
            await response.text();

        let data: any = {};

        if (text) {
            try {
                data =
                    JSON.parse(text);
            } catch {
                data = {
                    message: text,
                };
            }
        }

        if (!response.ok) {
            throw new Error(
                data?.message ||
                    data?.error ||
                    `Worker request failed with status ${response.status}`
            );
        }

        return data;
    } finally {
        clearTimeout(timeout);
    }
};

/**
 * ============================================================
 * Ensure Docker room container
 * ============================================================
 */

const ensureDockerRoom = async (
    roomId: string
) => {
    if (!isValidRoomId(roomId)) {
        throw new Error(
            'Invalid room ID.'
        );
    }

    /**
     * This endpoint should call:
     *
     * containerManager.ensureRoom(...)
     *
     * inside worker-service.
     */
    return workerRequest(
        '/internal/workspace/ensure',
        {
            roomId,
        },
        15000
    );
};

/**
 * ============================================================
 * Create Docker file
 * ============================================================
 */

const createDockerFile = async (
    roomId: string,
    filePath: string,
    content: string,
    language: string
) => {
    await ensureDockerRoom(roomId);

    return workerRequest(
        '/internal/workspace/file',
        {
            roomId,
            path: filePath,
            fileName: filePath,
            content,
            language,
        }
    );
};

/**
 * ============================================================
 * Create Docker folder
 * ============================================================
 */

const createDockerFolder = async (
    roomId: string,
    folderPath: string
) => {
    await ensureDockerRoom(roomId);

    return workerRequest(
        '/internal/workspace/folder',
        {
            roomId,
            path: folderPath,
            folderName: folderPath,
        }
    );
};

/**
 * ============================================================
 * Save Docker file
 * ============================================================
 */

const saveDockerFile = async (
    roomId: string,
    filePath: string,
    content: string,
    language: string
) => {
    await ensureDockerRoom(roomId);

    return workerRequest(
        '/internal/workspace/write',
        {
            roomId,
            path: filePath,
            fileName: filePath,
            content,
            language,
        }
    );
};

/**
 * ============================================================
 * Delete Docker path
 * ============================================================
 */

const deleteDockerPath = async (
    roomId: string,
    targetPath: string
) => {
    await ensureDockerRoom(roomId);

    return workerRequest(
        '/internal/workspace/delete',
        {
            roomId,
            path: targetPath,
            fileName: targetPath,
        }
    );
};

/**
 * ============================================================
 * Rename Docker path
 * ============================================================
 */

const renameDockerPath = async (
    roomId: string,
    oldPath: string,
    newPath: string
) => {
    await ensureDockerRoom(roomId);

    return workerRequest(
        '/internal/workspace/rename',
        {
            roomId,
            oldPath,
            newPath,
        }
    );
};

/**
 * ============================================================
 * Load Docker workspace
 * ============================================================
 */

const loadDockerWorkspace = async (
    roomId: string
) => {
    await ensureDockerRoom(roomId);

    return workerRequest(
        '/internal/workspace/list',
        {
            roomId,
        }
    );
};

/**
 * ============================================================
 * Socket handlers
 * ============================================================
 */

export const handleSocketEvents = (
    io: Server
) => {
    io.on(
        'connection',
        (socket: Socket) => {
            console.log(
                `[Socket] New connection: ${socket.id}`
            );

            socket.data = {
                ...(socket.data as SocketUserData),
            };

            registerVideoSignaling(
                io,
                socket
            );
            /**
             * ========================================================
             * 1. JOIN ROOM
             * ========================================================
             */

            socket.on(
                'join-room',
                async ({
                    roomId,
                    username,
                }: JoinRoomPayload) => {
                    try {
                        const cleanRoomId =
                            sanitizeString(
                                roomId,
                                MAX_ROOM_ID_LENGTH
                            );

                        const cleanUsername =
                            sanitizeString(
                                username,
                                MAX_USERNAME_LENGTH
                            );

                        if (
                            !isValidRoomId(
                                cleanRoomId
                            )
                        ) {
                            socket.emit(
                                'socket-error',
                                {
                                    type:
                                        'JOIN_ROOM_ERROR',
                                    message:
                                        'Invalid room ID.',
                                }
                            );

                            return;
                        }

                        if (
                            !isValidUsername(
                                cleanUsername
                            )
                        ) {
                            socket.emit(
                                'socket-error',
                                {
                                    type:
                                        'JOIN_ROOM_ERROR',
                                    message:
                                        'Invalid username.',
                                }
                            );

                            return;
                        }

                        const databaseRoom =
                            await findDatabaseRoom(
                                cleanRoomId
                            );

                        if (!databaseRoom) {
                            socket.emit(
                                'socket-error',
                                {
                                    type:
                                        'JOIN_ROOM_ERROR',
                                    message:
                                        'Room does not exist.',
                                }
                            );

                            return;
                        }

                        /**
                         * IMPORTANT:
                         *
                         * Create/ensure Docker room container
                         * as soon as the user joins the room.
                         *
                         * Therefore:
                         *
                         * YL2RWK8K
                         *
                         * creates/reuses:
                         *
                         * codebuddy-room-YL2RWK8K
                         */
                        try {
                            await ensureDockerRoom(
                                cleanRoomId
                            );

                            console.log(
                                `[Docker] Room container ensured: ${cleanRoomId}`
                            );
                        } catch (
                            dockerError
                        ) {
                            console.error(
                                `[Docker] Failed to ensure room container ${cleanRoomId}:`,
                                dockerError
                            );

                            socket.emit(
                                'socket-error',
                                {
                                    type:
                                        'DOCKER_ROOM_ERROR',
                                    message:
                                        'Unable to initialize the room workspace.',
                                }
                            );

                            return;
                        }

                        /**
                         * Same-room reconnect.
                         */
                        if (
                            socket.data.roomId ===
                            cleanRoomId
                        ) {
                            socket.data.username =
                                cleanUsername;

                            const existingUser =
                                await User.findOne({
                                    roomId:
                                        databaseRoom._id,
                                    name:
                                        cleanUsername,
                                });

                            if (
                                existingUser
                            ) {
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

                            const history =
                                await Message.find({
                                    roomId:
                                        databaseRoom._id,
                                })
                                    .sort({
                                        createdAt:
                                            -1,
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

                            /**
                             * Load Docker workspace
                             * for this client.
                             */
                            try {
                                const workspace =
                                    await loadDockerWorkspace(
                                        cleanRoomId
                                    );

                                socket.emit(
                                    'workspace:loaded',
                                    {
                                        roomId:
                                            cleanRoomId,
                                        files:
                                            workspace?.files ||
                                            workspace?.data?.files ||
                                            [],
                                    }
                                );
                            } catch (
                                workspaceError
                            ) {
                                console.error(
                                    `[Docker] Workspace load error:`,
                                    workspaceError
                                );
                            }

                            socket.emit(
                                'room-joined',
                                {
                                    roomId:
                                        cleanRoomId,
                                    username:
                                        cleanUsername,
                                    count,
                                }
                            );

                            return;
                        }

                        /**
                         * Leave previous Socket.IO room.
                         */
                        const previousRoom =
                            socket.data.roomId;

                        const previousUsername =
                            socket.data.username;

                        if (
                            previousRoom
                        ) {
                            socket.leave(
                                previousRoom
                            );

                            const previousCount =
                                emitRoomUserCount(
                                    io,
                                    previousRoom
                                );

                            io.to(
                                previousRoom
                            ).emit(
                                'user-left',
                                {
                                    username:
                                        previousUsername ||
                                        cleanUsername,
                                    count:
                                        previousCount,
                                }
                            );
                        }

                        /**
                         * Persistent MongoDB user.
                         */
                        let databaseUser =
                            await User.findOne({
                                roomId:
                                    databaseRoom._id,
                                name:
                                    cleanUsername,
                            });

                        if (
                            databaseUser
                        ) {
                            databaseUser.socketId =
                                socket.id;

                            await databaseUser.save();
                        } else {
                            try {
                                databaseUser =
                                    await User.create(
                                        {
                                            name:
                                                cleanUsername,
                                            socketId:
                                                socket.id,
                                            roomId:
                                                databaseRoom._id,
                                        }
                                    );
                            } catch (
                                userError: any
                            ) {
                                if (
                                    userError?.code ===
                                    11000
                                ) {
                                    databaseUser =
                                        await User.findOne(
                                            {
                                                roomId:
                                                    databaseRoom._id,
                                                name:
                                                    cleanUsername,
                                            }
                                        );

                                    if (
                                        databaseUser
                                    ) {
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
                         * Join Socket.IO room.
                         */
                        socket.join(
                            cleanRoomId
                        );

                        socket.data.username =
                            cleanUsername;

                        socket.data.roomId =
                            cleanRoomId;

                        socket.data.databaseRoomId =
                            databaseRoom._id.toString();

                        socket.data.databaseUserId =
                            databaseUser?._id?.toString();

                        socket.data.lastMessageAt =
                            0;

                        const room =
                            io.sockets.adapter.rooms.get(
                                cleanRoomId
                            );

                        const count = room
                            ? room.size
                            : 0;

                        /**
                         * Chat history.
                         */
                        const history =
                            await Message.find({
                                roomId:
                                    databaseRoom._id,
                            })
                                .sort({
                                    createdAt:
                                        -1,
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

                        /**
                         * ==================================================
                         * Load persistent Docker workspace
                         * ==================================================
                         */
                        try {
                            const workspace =
                                await loadDockerWorkspace(
                                    cleanRoomId
                                );

                            socket.emit(
                                'workspace:loaded',
                                {
                                    roomId:
                                        cleanRoomId,
                                    files:
                                        workspace?.files ||
                                        workspace?.data?.files ||
                                        [],
                                }
                            );
                        } catch (
                            workspaceError
                        ) {
                            console.error(
                                `[Docker] Failed to load workspace for ${cleanRoomId}:`,
                                workspaceError
                            );

                            socket.emit(
                                'socket-error',
                                {
                                    type:
                                        'WORKSPACE_LOAD_ERROR',
                                    message:
                                        'Unable to load room workspace.',
                                }
                            );
                        }

                        socket.emit(
                            'room-joined',
                            {
                                roomId:
                                    cleanRoomId,
                                username:
                                    cleanUsername,
                                count,
                            }
                        );

                        socket.to(
                            cleanRoomId
                        ).emit(
                            'user-joined',
                            {
                                username:
                                    cleanUsername,
                                count,
                            }
                        );

                        io.to(
                            cleanRoomId
                        ).emit(
                            'user-count',
                            count
                        );

                        console.log(
                            `[Socket] User ${cleanUsername} joined room: ${cleanRoomId}. Current count: ${count}`
                        );
                    } catch (
                        error
                    ) {
                        console.error(
                            `[Socket] Join room error for ${socket.id}:`,
                            error
                        );

                        socket.emit(
                            'socket-error',
                            {
                                type:
                                    'JOIN_ROOM_ERROR',
                                message:
                                    'Unable to join the room.',
                            }
                        );
                    }
                }
            );

            /**
             * ========================================================
             * 2. CREATE FILE
             * ========================================================
             */

            socket.on(
                'file:create',
                async (
                    payload: FileCreatePayload
                ) => {
                    try {
                        const roomId =
                            getConnectedRoom(
                                socket
                            );

                        const username =
                            getConnectedUsername(
                                socket
                            );

                        if (
                            !roomId ||
                            !username
                        ) {
                            socket.emit(
                                'socket-error',
                                {
                                    type:
                                        'FILE_CREATE_ERROR',
                                    message:
                                        'You are not connected to a room.',
                                }
                            );

                            return;
                        }

                        const filePath =
                            sanitizePath(
                                payload.path ||
                                    payload.fileName
                            );

                        const language =
                            sanitizeString(
                                payload.language,
                                MAX_LANGUAGE_LENGTH
                            );

                        const content =
                            typeof payload.content ===
                            'string'
                                ? payload.content.slice(
                                      0,
                                      MAX_FILE_CONTENT_LENGTH
                                  )
                                : '';

                        if (
                            !isSafeWorkspacePath(
                                filePath
                            )
                        ) {
                            socket.emit(
                                'socket-error',
                                {
                                    type:
                                        'FILE_CREATE_ERROR',
                                    message:
                                        'Invalid file path.',
                                }
                            );

                            return;
                        }

                        /**
                         * Physically create file
                         * inside Docker room container.
                         */
                        await createDockerFile(
                            roomId,
                            filePath,
                            content,
                            language
                        );

                        const eventPayload = {
                            roomId,
                            path: filePath,
                            fileName: filePath,
                            language,
                            content,
                            username,
                        };

                        /**
                         * Tell EVERY connected client.
                         */
                        io.to(
                            roomId
                        ).emit(
                            'room:file-created',
                            eventPayload
                        );

                        /**
                         * Also acknowledge sender.
                         */
                        socket.emit(
                            'file:create:success',
                            eventPayload
                        );

                        console.log(
                            `[Docker] File created: ${roomId}/${filePath} by ${username}`
                        );
                    } catch (
                        error
                    ) {
                        console.error(
                            `[Docker] File creation failed:`,
                            error
                        );

                        socket.emit(
                            'socket-error',
                            {
                                type:
                                    'FILE_CREATE_ERROR',
                                message:
                                    error instanceof
                                    Error
                                        ? error.message
                                        : 'Unable to create file.',
                            }
                        );
                    }
                }
            );

            /**
             * ========================================================
             * 3. CREATE FOLDER
             * ========================================================
             */

            socket.on(
                'folder:create',
                async (
                    payload: FolderCreatePayload
                ) => {
                    try {
                        const roomId =
                            getConnectedRoom(
                                socket
                            );

                        const username =
                            getConnectedUsername(
                                socket
                            );

                        if (
                            !roomId ||
                            !username
                        ) {
                            socket.emit(
                                'socket-error',
                                {
                                    type:
                                        'FOLDER_CREATE_ERROR',
                                    message:
                                        'You are not connected to a room.',
                                }
                            );

                            return;
                        }

                        const folderPath =
                            sanitizePath(
                                payload.path ||
                                    payload.folderName
                            );

                        if (
                            !isSafeWorkspacePath(
                                folderPath
                            )
                        ) {
                            socket.emit(
                                'socket-error',
                                {
                                    type:
                                        'FOLDER_CREATE_ERROR',
                                    message:
                                        'Invalid folder path.',
                                }
                            );

                            return;
                        }

                        await createDockerFolder(
                            roomId,
                            folderPath
                        );

                        const eventPayload = {
                            roomId,
                            path: folderPath,
                            folderName:
                                folderPath,
                            username,
                        };

                        io.to(
                            roomId
                        ).emit(
                            'room:folder-created',
                            eventPayload
                        );

                        socket.emit(
                            'folder:create:success',
                            eventPayload
                        );

                        console.log(
                            `[Docker] Folder created: ${roomId}/${folderPath} by ${username}`
                        );
                    } catch (
                        error
                    ) {
                        console.error(
                            `[Docker] Folder creation failed:`,
                            error
                        );

                        socket.emit(
                            'socket-error',
                            {
                                type:
                                    'FOLDER_CREATE_ERROR',
                                message:
                                    error instanceof
                                    Error
                                        ? error.message
                                        : 'Unable to create folder.',
                            }
                        );
                    }
                }
            );

            /**
             * ========================================================
             * 4. FILE UPDATE / SAVE
             * ========================================================
             */

            socket.on(
                'file:update',
                async (
                    payload: FileUpdatePayload
                ) => {
                    try {
                        const roomId =
                            getConnectedRoom(
                                socket
                            );

                        const username =
                            getConnectedUsername(
                                socket
                            );

                        if (
                            !roomId ||
                            !username
                        ) {
                            socket.emit(
                                'socket-error',
                                {
                                    type:
                                        'FILE_UPDATE_ERROR',
                                    message:
                                        'You are not connected to a room.',
                                }
                            );

                            return;
                        }

                        const filePath =
                            sanitizePath(
                                payload.path ||
                                    payload.fileName
                            );

                        if (
                            !isSafeWorkspacePath(
                                filePath
                            )
                        ) {
                            socket.emit(
                                'socket-error',
                                {
                                    type:
                                        'FILE_UPDATE_ERROR',
                                    message:
                                        'Invalid file path.',
                                }
                            );

                            return;
                        }

                        const content =
                            typeof payload.content ===
                            'string'
                                ? payload.content.slice(
                                      0,
                                      MAX_FILE_CONTENT_LENGTH
                                  )
                                : '';

                        const language =
                            sanitizeString(
                                payload.language,
                                MAX_LANGUAGE_LENGTH
                            );

                        /**
                         * Physically save to Docker.
                         */
                        await saveDockerFile(
                            roomId,
                            filePath,
                            content,
                            language
                        );

                        const eventPayload = {
                            roomId,
                            path: filePath,
                            fileName: filePath,
                            language,
                            content,
                            username,
                        };

                        /**
                         * Do NOT send file:update
                         * back as another file:update
                         * loop.
                         *
                         * Frontend already changed its
                         * own editor state.
                         *
                         * Other clients receive
                         * room:file-updated.
                         */
                        socket
                            .to(roomId)
                            .emit(
                                'room:file-updated',
                                eventPayload
                            );

                        socket.emit(
                            'file:update:success',
                            {
                                roomId,
                                path: filePath,
                            }
                        );
                    } catch (
                        error
                    ) {
                        console.error(
                            `[Docker] File save failed:`,
                            error
                        );

                        socket.emit(
                            'socket-error',
                            {
                                type:
                                    'FILE_UPDATE_ERROR',
                                message:
                                    error instanceof
                                    Error
                                        ? error.message
                                        : 'Unable to save file.',
                            }
                        );
                    }
                }
            );

            /**
             * ========================================================
             * 5. FILE DELETE
             * ========================================================
             */

            socket.on(
                'file:delete',
                async (
                    payload: FileDeletePayload
                ) => {
                    try {
                        const roomId =
                            getConnectedRoom(
                                socket
                            );

                        const username =
                            getConnectedUsername(
                                socket
                            );

                        if (
                            !roomId ||
                            !username
                        ) {
                            socket.emit(
                                'socket-error',
                                {
                                    type:
                                        'FILE_DELETE_ERROR',
                                    message:
                                        'You are not connected to a room.',
                                }
                            );

                            return;
                        }

                        const filePath =
                            sanitizePath(
                                payload.path ||
                                    payload.fileName
                            );

                        if (
                            !isSafeWorkspacePath(
                                filePath
                            )
                        ) {
                            socket.emit(
                                'socket-error',
                                {
                                    type:
                                        'FILE_DELETE_ERROR',
                                    message:
                                        'Invalid file path.',
                                }
                            );

                            return;
                        }

                        await deleteDockerPath(
                            roomId,
                            filePath
                        );

                        const eventPayload = {
                            roomId,
                            path: filePath,
                            fileName: filePath,
                            username,
                        };

                        io.to(
                            roomId
                        ).emit(
                            'room:file-deleted',
                            eventPayload
                        );

                        socket.emit(
                            'file:delete:success',
                            eventPayload
                        );

                        console.log(
                            `[Docker] File deleted: ${roomId}/${filePath} by ${username}`
                        );
                    } catch (
                        error
                    ) {
                        console.error(
                            `[Docker] File deletion failed:`,
                            error
                        );

                        socket.emit(
                            'socket-error',
                            {
                                type:
                                    'FILE_DELETE_ERROR',
                                message:
                                    error instanceof
                                    Error
                                        ? error.message
                                        : 'Unable to delete file.',
                            }
                        );
                    }
                }
            );

            /**
             * ========================================================
             * 6. FOLDER DELETE
             * ========================================================
             */

            socket.on(
                'folder:delete',
                async (
                    payload: FolderDeletePayload
                ) => {
                    try {
                        const roomId =
                            getConnectedRoom(
                                socket
                            );

                        const username =
                            getConnectedUsername(
                                socket
                            );

                        if (
                            !roomId ||
                            !username
                        ) {
                            socket.emit(
                                'socket-error',
                                {
                                    type:
                                        'FOLDER_DELETE_ERROR',
                                    message:
                                        'You are not connected to a room.',
                                }
                            );

                            return;
                        }

                        const folderPath =
                            sanitizePath(
                                payload.path ||
                                    payload.folderName
                            );

                        if (
                            !isSafeWorkspacePath(
                                folderPath
                            )
                        ) {
                            socket.emit(
                                'socket-error',
                                {
                                    type:
                                        'FOLDER_DELETE_ERROR',
                                    message:
                                        'Invalid folder path.',
                                }
                            );

                            return;
                        }

                        await deleteDockerPath(
                            roomId,
                            folderPath
                        );

                        const eventPayload = {
                            roomId,
                            path: folderPath,
                            folderName:
                                folderPath,
                            username,
                        };

                        io.to(
                            roomId
                        ).emit(
                            'room:folder-deleted',
                            eventPayload
                        );

                        socket.emit(
                            'folder:delete:success',
                            eventPayload
                        );

                        console.log(
                            `[Docker] Folder deleted: ${roomId}/${folderPath} by ${username}`
                        );
                    } catch (
                        error
                    ) {
                        console.error(
                            `[Docker] Folder deletion failed:`,
                            error
                        );

                        socket.emit(
                            'socket-error',
                            {
                                type:
                                    'FOLDER_DELETE_ERROR',
                                message:
                                    error instanceof
                                    Error
                                        ? error.message
                                        : 'Unable to delete folder.',
                            }
                        );
                    }
                }
            );

            /**
             * ========================================================
             * 7. FILE RENAME
             * ========================================================
             */

            socket.on(
                'file:rename',
                async (
                    payload: FileRenamePayload
                ) => {
                    try {
                        const roomId =
                            getConnectedRoom(
                                socket
                            );

                        const username =
                            getConnectedUsername(
                                socket
                            );

                        if (
                            !roomId ||
                            !username
                        ) {
                            return;
                        }

                        const oldPath =
                            sanitizePath(
                                payload.oldPath
                            );

                        const newPath =
                            sanitizePath(
                                payload.newPath
                            );

                        if (
                            !isSafeWorkspacePath(
                                oldPath
                            ) ||
                            !isSafeWorkspacePath(
                                newPath
                            )
                        ) {
                            socket.emit(
                                'socket-error',
                                {
                                    type:
                                        'FILE_RENAME_ERROR',
                                    message:
                                        'Invalid file path.',
                                }
                            );

                            return;
                        }

                        await renameDockerPath(
                            roomId,
                            oldPath,
                            newPath
                        );

                        const eventPayload = {
                            roomId,
                            oldPath,
                            newPath,
                            username,
                        };

                        io.to(
                            roomId
                        ).emit(
                            'room:file-renamed',
                            eventPayload
                        );
                    } catch (
                        error
                    ) {
                        console.error(
                            `[Docker] File rename failed:`,
                            error
                        );

                        socket.emit(
                            'socket-error',
                            {
                                type:
                                    'FILE_RENAME_ERROR',
                                message:
                                    error instanceof
                                    Error
                                        ? error.message
                                        : 'Unable to rename file.',
                            }
                        );
                    }
                }
            );

            /**
             * ========================================================
             * 8. FOLDER RENAME
             * ========================================================
             */

            socket.on(
                'folder:rename',
                async (
                    payload: FolderRenamePayload
                ) => {
                    try {
                        const roomId =
                            getConnectedRoom(
                                socket
                            );

                        const username =
                            getConnectedUsername(
                                socket
                            );

                        if (
                            !roomId ||
                            !username
                        ) {
                            return;
                        }

                        const oldPath =
                            sanitizePath(
                                payload.oldPath
                            );

                        const newPath =
                            sanitizePath(
                                payload.newPath
                            );

                        if (
                            !isSafeWorkspacePath(
                                oldPath
                            ) ||
                            !isSafeWorkspacePath(
                                newPath
                            )
                        ) {
                            socket.emit(
                                'socket-error',
                                {
                                    type:
                                        'FOLDER_RENAME_ERROR',
                                    message:
                                        'Invalid folder path.',
                                }
                            );

                            return;
                        }

                        await renameDockerPath(
                            roomId,
                            oldPath,
                            newPath
                        );

                        const eventPayload = {
                            roomId,
                            oldPath,
                            newPath,
                            username,
                        };

                        io.to(
                            roomId
                        ).emit(
                            'room:folder-renamed',
                            eventPayload
                        );
                    } catch (
                        error
                    ) {
                        console.error(
                            `[Docker] Folder rename failed:`,
                            error
                        );

                        socket.emit(
                            'socket-error',
                            {
                                type:
                                    'FOLDER_RENAME_ERROR',
                                message:
                                    error instanceof
                                    Error
                                        ? error.message
                                        : 'Unable to rename folder.',
                            }
                        );
                    }
                }
            );

            /**
             * ========================================================
             * 9. LOAD WORKSPACE
             * ========================================================
             */

            socket.on(
                'workspace:load',
                async () => {
                    try {
                        const roomId =
                            getConnectedRoom(
                                socket
                            );

                        if (!roomId) {
                            socket.emit(
                                'socket-error',
                                {
                                    type:
                                        'WORKSPACE_LOAD_ERROR',
                                    message:
                                        'You are not connected to a room.',
                                }
                            );

                            return;
                        }

                        const workspace =
                            await loadDockerWorkspace(
                                roomId
                            );

                        socket.emit(
                            'workspace:loaded',
                            {
                                roomId,
                                files:
                                    workspace?.files ||
                                    workspace?.data?.files ||
                                    [],
                            }
                        );
                    } catch (
                        error
                    ) {
                        console.error(
                            `[Docker] Workspace load failed:`,
                            error
                        );

                        socket.emit(
                            'socket-error',
                            {
                                type:
                                    'WORKSPACE_LOAD_ERROR',
                                message:
                                    error instanceof
                                    Error
                                        ? error.message
                                        : 'Unable to load workspace.',
                            }
                        );
                    }
                }
            );

            /**
             * ========================================================
             * 10. SEND MESSAGE
             * ========================================================
             */

            socket.on(
                'send-message',
                async ({
                    roomId,
                    message,
                    username,
                }: MessagePayload) => {
                    try {
                        const connectedRoom =
                            socket.data.roomId;

                        if (
                            !connectedRoom
                        ) {
                            socket.emit(
                                'socket-error',
                                {
                                    type:
                                        'MESSAGE_ERROR',
                                    message:
                                        'You are not connected to a room.',
                                }
                            );

                            return;
                        }

                        if (
                            roomId !==
                            connectedRoom
                        ) {
                            socket.emit(
                                'socket-error',
                                {
                                    type:
                                        'MESSAGE_ERROR',
                                    message:
                                        'You cannot send messages to another room.',
                                }
                            );

                            return;
                        }

                        const connectedUsername =
                            socket.data.username;

                        if (
                            !connectedUsername
                        ) {
                            socket.emit(
                                'socket-error',
                                {
                                    type:
                                        'MESSAGE_ERROR',
                                    message:
                                        'User information is missing.',
                                }
                            );

                            return;
                        }

                        const databaseRoomId =
                            socket.data
                                .databaseRoomId;

                        if (
                            !databaseRoomId
                        ) {
                            socket.emit(
                                'socket-error',
                                {
                                    type:
                                        'MESSAGE_ERROR',
                                    message:
                                        'Database room information is missing.',
                                }
                            );

                            return;
                        }

                        const cleanMessage =
                            sanitizeString(
                                message,
                                MAX_MESSAGE_LENGTH
                            );

                        if (
                            !isValidMessage(
                                cleanMessage
                            )
                        ) {
                            socket.emit(
                                'socket-error',
                                {
                                    type:
                                        'MESSAGE_ERROR',
                                    message:
                                        'Message cannot be empty or too long.',
                                }
                            );

                            return;
                        }

                        const now =
                            Date.now();

                        const lastMessageAt =
                            socket.data
                                .lastMessageAt ||
                            0;

                        if (
                            now -
                                lastMessageAt <
                            MESSAGE_COOLDOWN_MS
                        ) {
                            socket.emit(
                                'socket-error',
                                {
                                    type:
                                        'RATE_LIMIT',
                                    message:
                                        'Please wait before sending another message.',
                                }
                            );

                            return;
                        }

                        socket.data.lastMessageAt =
                            now;

                        const messageId =
                            generateMessageId();

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

                        const payload: ReceiveMessagePayload =
                            {
                                id:
                                    messageId,
                                roomId:
                                    connectedRoom,
                                message:
                                    savedMessage.message,
                                username:
                                    savedMessage.username,
                                timestamp:
                                    savedMessage.createdAt.toISOString(),
                            };

                        io.to(
                            connectedRoom
                        ).emit(
                            'receive-message',
                            payload
                        );

                        console.log(
                            `[Socket] Message saved and broadcast in ${connectedRoom} from ${connectedUsername}: ${cleanMessage}`
                        );
                    } catch (
                        error
                    ) {
                        console.error(
                            `[Socket] Message error for ${socket.id}:`,
                            error
                        );

                        socket.emit(
                            'socket-error',
                            {
                                type:
                                    'MESSAGE_ERROR',
                                message:
                                    'Unable to save or send message.',
                            }
                        );
                    }
                }
            );

            /**
             * ========================================================
             * 11. LEAVE ROOM
             * ========================================================
             */

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

                        if (
                            !roomId
                        ) {
                            return;
                        }

                        socket.leave(
                            roomId
                        );

                        socket.data.roomId =
                            undefined;

                        socket.data.lastMessageAt =
                            0;

                        socket.data.databaseRoomId =
                            undefined;

                        socket.data.databaseUserId =
                            undefined;

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

                        const count =
                            emitRoomUserCount(
                                io,
                                roomId
                            );

                        io.to(
                            roomId
                        ).emit(
                            'user-left',
                            {
                                username:
                                    username ||
                                    'User',
                                count,
                            }
                        );
                    } catch (
                        error
                    ) {
                        console.error(
                            `[Socket] Leave room error for ${socket.id}:`,
                            error
                        );
                    }
                }
            );

            /**
             * ========================================================
             * 12. DISCONNECT
             * ========================================================
             */

            socket.on(
                'disconnect',
                async (
                    reason
                ) => {
                    try {
                        const roomId =
                            socket.data.roomId;

                        const username =
                            socket.data.username;

                        const databaseUserId =
                            socket.data
                                .databaseUserId;

                        if (
                            roomId
                        ) {
                            const room =
                                io.sockets.adapter.rooms.get(
                                    roomId
                                );

                            const count =
                                room
                                    ? room.size
                                    : 0;

                            io.to(
                                roomId
                            ).emit(
                                'user-count',
                                count
                            );

                            io.to(
                                roomId
                            ).emit(
                                'user-left',
                                {
                                    username:
                                        username ||
                                        'User',
                                    count,
                                }
                            );
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
                                `[Socket] User ${
                                    username ||
                                    'Unknown'
                                } disconnected from ${roomId}. Remaining: ${count}. Reason: ${reason}`
                            );
                        } else {
                            console.log(
                                `[Socket] Client ${socket.id} disconnected. Reason: ${reason}`
                            );
                        }

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
                            } catch (
                                userError
                            ) {
                                console.error(
                                    `[Socket] Failed to update user after disconnect:`,
                                    userError
                                );
                            }
                        }

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
                    } catch (
                        error
                    ) {
                        console.error(
                            `[Socket] Disconnect error for ${socket.id}:`,
                            error
                        );
                    }
                }
            );

            /**
             * ========================================================
             * 13. SOCKET ERROR
             * ========================================================
             */

            socket.on(
                'error',
                (err) => {
                    console.error(
                        `[Socket Error] ${socket.id}:`,
                        err
                    );
                }
            );
        }
    );
};