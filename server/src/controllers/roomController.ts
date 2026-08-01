import { Request, Response } from 'express';
import { Room } from '../models/Room';
import { User } from '../models/user'; // Import the new User model

const generateRoomCode = () => {
    return Math.random().toString(36).substring(2, 10).toUpperCase();
};

// CREATE A NEW ROOM
export const createRoom = async (req: Request, res: Response) => {
    try {
        const { roomName, yourName } = req.body;

        // 1. Check if a room with this name already exists
        const existingRoom = await Room.findOne({ roomName });
        if (existingRoom) {
            return res.status(400).json({ error: "A room with this name already exists!" });
        }

        // 2. Generate a unique code
        const newCode = generateRoomCode();

        // 3. Create room
        const newRoom = await Room.create({
            roomCode: newCode,
            roomName: roomName,
            yourName: yourName
        });

        // 4. Create the creator as a User linked to this room
        await User.create({
            name: yourName,
            roomId: newRoom._id,
            socketId: 'creator'
        });
        
        console.log("✅ Room saved and creator added:", newRoom.roomCode);
        
        res.status(201).json({ data: { roomCode: newRoom.roomCode } });
    } catch (error: any) {
        if (error.code === 11000) {
            return res.status(400).json({ error: "Room name or code conflict." });
        }
        console.error("❌ SAVING FAILED:", error);
        res.status(500).json({ error: "Failed to create room" });
    }
};

// Join Room - UPDATED TO MATCH FRONTEND KEY
export const joinRoom = async (req: Request, res: Response) => {
    try {
        // Change 'name' to 'yourName' here:
        const { roomCode, yourName } = req.body; 

        const room = await Room.findOne({ roomCode });
        if (!room) {
            return res.status(404).json({ error: "Room not found" });
        }

        // Use 'yourName' (which contains the name)
        const userData = { 
            name: yourName, // Map yourName to the database field 'name'
            roomId: room._id,
            socketId: 'placeholder' 
        };

        await User.create(userData);
        
        console.log(`✅ User ${yourName} saved successfully!`);
        
        res.status(200).json({ 
            message: "Successfully joined", 
            data: { roomCode: room.roomCode } 
        });
    } catch (error) {
        console.error("❌ Join Error:", error);
        res.status(500).json({ error: "Failed to join room" });
    }
};