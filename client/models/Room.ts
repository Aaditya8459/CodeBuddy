// models/Room.ts
import mongoose, { Schema, model, models } from "mongoose";

const RoomSchema = new Schema(
  {
    roomName: {
      type: String,
      required: [true, "Room name is required"],
      trim: true,
      minlength: [3, "Room name must be at least 3 characters"],
      maxlength: [50, "Room name cannot exceed 50 characters"],
    },
    yourName: {
      type: String,
      required: [true, "Your name is required"],
      trim: true,
      minlength: [2, "Your name must be at least 2 characters"],
      maxlength: [30, "Your name cannot exceed 30 characters"],
    },
    roomCode: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      minlength: 8,
      maxlength: 8,
    },
  },
  { timestamps: true }
);

export const Room = models.Room || model("Room", RoomSchema);