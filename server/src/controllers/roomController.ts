import { Request, Response } from 'express';
import { Room } from '../models/Room';
import { User } from '../models/User';

// ============================================================================
// GENERATE RANDOM ROOM CODE
// ============================================================================

const generateRoomCode = () => {
    return Math.random()
        .toString(36)
        .substring(2, 10)
        .toUpperCase();
};

// ============================================================================
// CREATE A NEW ROOM
// ============================================================================

export const createRoom = async (
    req: Request,
    res: Response
) => {
    try {
        // Convert incoming values to strings
        // to avoid string | string[] TypeScript errors.
        const roomName = String(
            req.body.roomName || ""
        ).trim();

        const yourName = String(
            req.body.yourName || ""
        ).trim();

        // Validate required fields
        if (!roomName || !yourName) {
            return res.status(400).json({
                error: "Room name and your name are required."
            });
        }

        // ====================================================================
        // 1. CHECK IF ROOM NAME ALREADY EXISTS
        // ====================================================================

        const existingRoom = await Room.findOne({
            roomName: roomName
        });

        if (existingRoom) {
            return res.status(400).json({
                error: "A room with this name already exists!"
            });
        }

        // ====================================================================
        // 2. GENERATE UNIQUE ROOM CODE
        // ====================================================================

        let newCode = generateRoomCode();

        let existingCode = await Room.findOne({
            roomCode: newCode
        });

        while (existingCode) {
            newCode = generateRoomCode();

            existingCode = await Room.findOne({
                roomCode: newCode
            });
        }

        // ====================================================================
        // 3. CREATE ROOM
        // ====================================================================

        const newRoom = await Room.create({
            roomCode: newCode,
            roomName: roomName,
            yourName: yourName
        });

        // ====================================================================
        // 4. CREATE ROOM CREATOR AS USER
        // ====================================================================

        /*
         * findOneAndUpdate + upsert means:
         *
         * If the user already exists:
         *     update the existing document.
         *
         * If the user does not exist:
         *     create a new document.
         *
         * This prevents duplicate users.
         */

        const creator = await User.findOneAndUpdate(
            {
                roomId: newRoom._id,
                name: yourName
            },
            {
                $set: {
                    socketId: "creator"
                },
                $setOnInsert: {
                    joinedAt: new Date()
                }
            },
            {
                new: true,
                upsert: true
            }
        );

        console.log(
            "✅ Room saved and creator added:",
            newRoom.roomCode
        );

        console.log(
            "👤 Creator:",
            creator?.name
        );

        // ====================================================================
        // 5. RETURN CREATED ROOM
        // ====================================================================

        return res.status(201).json({
            message: "Room created successfully",

            data: {
                roomCode: newRoom.roomCode,
                roomName: newRoom.roomName,
                yourName: yourName,
                user: creator
            }
        });

    } catch (error: any) {

        // ====================================================================
        // MONGODB DUPLICATE KEY ERROR
        // ====================================================================

        if (error.code === 11000) {
            return res.status(400).json({
                error: "Room name, room code, or user already exists."
            });
        }

        console.error(
            "❌ SAVING FAILED:",
            error
        );

        return res.status(500).json({
            error: "Failed to create room"
        });
    }
};


// ============================================================================
// JOIN ROOM
// ============================================================================

export const joinRoom = async (
    req: Request,
    res: Response
) => {
    try {
        // ====================================================================
        // 1. READ ROOM CODE
        // ====================================================================

        const roomCode = String(
            req.body.roomCode || ""
        )
            .trim()
            .toUpperCase();

        // ====================================================================
        // 2. READ USERNAME
        // ====================================================================

        const yourName = String(
            req.body.yourName || ""
        ).trim();

        // ====================================================================
        // 3. VALIDATE REQUIRED FIELDS
        // ====================================================================

        if (!roomCode || !yourName) {
            return res.status(400).json({
                error: "Room code and your name are required."
            });
        }

        // ====================================================================
        // 4. FIND ROOM
        // ====================================================================

        const room = await Room.findOne({
            roomCode: roomCode
        });

        if (!room) {
            return res.status(404).json({
                error: "Room not found"
            });
        }

        // ====================================================================
        // 5. FIND EXISTING USER OR CREATE NEW USER
        // ====================================================================

        /*
         * The combination of:
         *
         * roomId + name
         *
         * identifies the user inside the room.
         */

        const user = await User.findOneAndUpdate(
            {
                roomId: room._id,
                name: yourName
            },
            {
                $set: {
                    socketId: "placeholder"
                },
                $setOnInsert: {
                    joinedAt: new Date()
                }
            },
            {
                new: true,
                upsert: true
            }
        );

        console.log(
            `✅ User ${yourName} saved successfully!`
        );

        // ====================================================================
        // 6. GET ALL USERS IN THIS ROOM
        // ====================================================================

        const users = await User.find({
            roomId: room._id
        });

        // ====================================================================
        // 7. RETURN JOIN INFORMATION
        // ====================================================================

        return res.status(200).json({
            message: "Successfully joined",

            data: {
                roomCode: room.roomCode,

                roomName: room.roomName,

                yourName: user?.name || yourName,

                user: user,

                users: users,

                userCount: users.length
            }
        });

    } catch (error: any) {

        console.error(
            "❌ Join Error:",
            error
        );

        // ====================================================================
        // MONGODB DUPLICATE KEY ERROR
        // ====================================================================

        if (error.code === 11000) {

            const roomCode = String(
                req.body.roomCode || ""
            )
                .trim()
                .toUpperCase();

            const yourName = String(
                req.body.yourName || ""
            ).trim();

            return res.status(200).json({
                message: "User already exists in this room",

                data: {
                    roomCode: roomCode,

                    yourName: yourName
                }
            });
        }

        return res.status(500).json({
            error: "Failed to join room"
        });
    }
};


// ============================================================================
// GET / LOAD AN EXISTING ROOM
// ============================================================================

export const getRoom = async (
    req: Request,
    res: Response
) => {
    try {

        // ====================================================================
        // 1. GET ROOM CODE FROM URL
        // ====================================================================

        const roomCode = String(
            req.params.id || ""
        )
            .trim()
            .toUpperCase();

        // ====================================================================
        // 2. GET USERNAME FROM QUERY PARAMETER
        // ====================================================================

        /*
         * Example frontend URL:
         *
         * http://localhost:3000/room/6YC6SRUZ?name=YDKING
         *
         * Next.js sends:
         *
         * GET /api/rooms/6YC6SRUZ?name=YDKING
         *
         * Therefore:
         *
         * req.query.name
         *
         * will contain:
         *
         * YDKING
         */

        const requestedName = String(
            req.query.name || ""
        ).trim();

        // ====================================================================
        // 3. VALIDATE ROOM CODE
        // ====================================================================

        if (!roomCode) {
            return res.status(400).json({
                error: "Room code is required"
            });
        }

        // ====================================================================
        // 4. FIND ROOM BY ROOM CODE
        // ====================================================================

        const room = await Room.findOne({
            roomCode: roomCode
        });

        if (!room) {
            return res.status(404).json({
                error: "Room not found"
            });
        }

        // ====================================================================
        // 5. FIND ALL USERS BELONGING TO THIS ROOM
        // ====================================================================

        const users = await User.find({
            roomId: room._id
        });

        // ====================================================================
        // 6. FIND THE CURRENT USER
        // ====================================================================

        /*
         * If the URL contains:
         *
         * ?name=YDKING
         *
         * we specifically search MongoDB for:
         *
         * roomId = current room
         * name   = YDKING
         *
         * This prevents the frontend from always displaying
         * the room creator's name.
         */

        let currentUser = null;

        if (requestedName) {

            currentUser = await User.findOne({
                roomId: room._id,
                name: requestedName
            });

            // =================================================================
            // CASE-INSENSITIVE FALLBACK
            // =================================================================

            /*
             * If exact matching fails, try a case-insensitive
             * regular expression.
             *
             * Example:
             *
             * URL:
             * ?name=ydking
             *
             * MongoDB:
             * name = YDKING
             */

            if (!currentUser) {

                currentUser = await User.findOne({
                    roomId: room._id,
                    name: {
                        $regex: `^${requestedName.replace(
                            /[.*+?^${}()|[\]\\]/g,
                            "\\$&"
                        )}$`,
                        $options: "i"
                    }
                });
            }
        }

        // ====================================================================
        // 7. DETERMINE CURRENT USERNAME
        // ====================================================================

        /*
         * Priority:
         *
         * 1. User found in MongoDB
         * 2. Requested URL username
         * 3. Room creator username
         * 4. "You"
         */

        const currentUserName =
            currentUser?.name ||
            requestedName ||
            room.yourName ||
            "You";

        // ====================================================================
        // 8. LOG ROOM + USER INFORMATION
        // ====================================================================

        console.log(
            `✅ Room loaded successfully: ${room.roomCode}`
        );

        console.log(
            `👤 Requested username: ${requestedName || "none"}`
        );

        console.log(
            `👤 MongoDB username: ${currentUser?.name || "not found"}`
        );

        console.log(
            `👤 Current username: ${currentUserName}`
        );

        console.log(
            `👥 Total users: ${users.length}`
        );

        // ====================================================================
        // 9. RETURN COMPLETE ROOM RESPONSE
        // ====================================================================

        return res.status(200).json({

            message: "Room loaded successfully",

            data: {

                // =============================================================
                // ROOM
                // =============================================================

                room: room,

                // =============================================================
                // CURRENT USER
                // =============================================================

                user: currentUser,

                // =============================================================
                // CURRENT USERNAME
                // =============================================================

                yourName: currentUserName,

                // =============================================================
                // ALL USERS
                // =============================================================

                users: users,

                // =============================================================
                // USER COUNT
                // =============================================================

                userCount: users.length
            }
        });

    } catch (error) {

        // ====================================================================
        // ERROR HANDLING
        // ====================================================================

        console.error(
            "❌ Get Room Error:",
            error
        );

        return res.status(500).json({
            error: "Failed to load room"
        });
    }
};