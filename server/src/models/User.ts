import mongoose, { Schema, model, models } from "mongoose";

const UserSchema = new Schema({
  name: { type: String, required: true },
  socketId: { type: String, default: 'placeholder' },
  roomId: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true }, // Links to Room
  joinedAt: { type: Date, default: Date.now }
});

export const User = models.User || model("User", UserSchema);