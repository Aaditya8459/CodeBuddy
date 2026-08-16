import mongoose, { Schema, model, models } from "mongoose";

const UserSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    socketId: {
      type: String,
      default: "placeholder",
    },

    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Room",
      required: true,
    },

    joinedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Prevent duplicate users with the same name
// from being created in the same room.
UserSchema.index(
  {
    roomId: 1,
    name: 1,
  },
  {
    unique: true,
  }
);

export const User =
  models.User || model("User", UserSchema);