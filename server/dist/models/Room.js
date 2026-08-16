"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Room = void 0;
const mongoose_1 = require("mongoose");
const RoomSchema = new mongoose_1.Schema({
    roomName: { type: String, required: true, trim: true, unique: true },
    yourName: { type: String, required: true },
    roomCode: { type: String, required: true, unique: true, uppercase: true },
    // IMPORTANT: THERE SHOULD BE NO 'users' FIELD HERE
}, { timestamps: true });
exports.Room = mongoose_1.models.Room || (0, mongoose_1.model)("Room", RoomSchema);
//# sourceMappingURL=Room.js.map