import mongoose, {
    Schema,
    model,
    models,
    Document,
} from "mongoose";

/**
 * Message document interface.
 *
 * This describes the structure of a chat message
 * stored inside MongoDB.
 */
export interface IMessage extends Document {
    roomId: mongoose.Types.ObjectId;
    userId?: mongoose.Types.ObjectId;
    username: string;
    message: string;
    socketMessageId: string;
    createdAt: Date;
    updatedAt: Date;
}

/**
 * Message Schema
 *
 * Every chat message belongs to a Room.
 *
 * We intentionally keep messages in their own collection
 * instead of storing them directly inside Room documents.
 *
 * This prevents Room documents from becoming extremely large
 * when a room contains thousands of chat messages.
 */
const MessageSchema = new Schema<IMessage>(
    {
        /**
         * MongoDB Room reference.
         *
         * This connects the message to the Room collection.
         */
        roomId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Room",
            required: true,
            index: true,
        },

        /**
         * Optional reference to the User who sent
         * the message.
         *
         * This is optional because the Socket.IO user
         * may disconnect before the message is processed,
         * or older messages may not have a User document.
         */
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: false,
            index: true,
        },

        /**
         * Username displayed in the chat.
         *
         * We intentionally store the username directly
         * so historical messages remain readable even
         * if the User document changes later.
         */
        username: {
            type: String,
            required: true,
            trim: true,
            maxlength: 50,
        },

        /**
         * Actual chat message.
         */
        message: {
            type: String,
            required: true,
            trim: true,
            maxlength: 2000,
        },

        /**
         * Socket.IO message ID.
         *
         * This allows us to identify the same real-time
         * message and helps prevent accidental duplicate
         * database records.
         */
        socketMessageId: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },
    },
    {
        /**
         * Automatically creates:
         *
         * createdAt
         * updatedAt
         */
        timestamps: true,
    }
);

/**
 * IMPORTANT INDEX
 *
 * Chat history is normally queried like:
 *
 * find messages belonging to one room
 * sorted from oldest → newest.
 *
 * This compound index makes that operation efficient.
 */
MessageSchema.index({
    roomId: 1,
    createdAt: 1,
});

/**
 * Optional reverse-time index.
 *
 * Useful when retrieving the latest N messages,
 * for example the latest 50 messages when a user
 * joins a room.
 */
MessageSchema.index({
    roomId: 1,
    createdAt: -1,
});

/**
 * Reuse the existing model during development.
 *
 * This prevents:
 *
 * OverwriteModelError:
 * Cannot overwrite `Message` model once compiled.
 *
 * It is especially useful with Next.js/TypeScript
 * hot reload and development environments.
 */
export const Message =
    models.Message ||
    model<IMessage>("Message", MessageSchema);