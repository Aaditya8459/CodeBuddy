"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectToDatabase = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const MONGODB_URI = process.env.MONGODB_URI;
const connectToDatabase = async () => {
    if (!MONGODB_URI) {
        throw new Error("Please define MONGODB_URI inside your .env file");
    }
    try {
        await mongoose_1.default.connect(MONGODB_URI);
        console.log("✅ MongoDB Connected Successfully");
    }
    catch (error) {
        console.error("❌ MongoDB Connection Error:", error);
        process.exit(1); // Exit process with failure if DB connection fails
    }
};
exports.connectToDatabase = connectToDatabase;
//# sourceMappingURL=db.js.map