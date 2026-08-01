import mongoose, { Schema, model, models } from "mongoose";

const RoomSchema = new Schema({
  roomName: { type: String, required: true, trim: true, unique: true },
  yourName: { type: String, required: true },
  roomCode: { type: String, required: true, unique: true, uppercase: true },
  // IMPORTANT: THERE SHOULD BE NO 'users' FIELD HERE
}, { timestamps: true });

export const Room = models.Room || model("Room", RoomSchema);