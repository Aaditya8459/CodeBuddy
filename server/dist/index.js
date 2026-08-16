"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const socket_io_1 = require("socket.io");
const roomRoutes_1 = __importDefault(require("./routes/roomRoutes"));
const db_1 = require("./db");
const socketHandler_1 = require("./socket/socketHandler");
dotenv_1.default.config();
const app = (0, express_1.default)();
// 1. Create HTTP server to support WebSockets
const server = http_1.default.createServer(app);
// 2. Initialize Socket.io with CORS
const io = new socket_io_1.Server(server, {
    cors: {
        origin: "http://localhost:3000",
        methods: ["GET", "POST"],
    }
});
// Middlewares
app.use(express_1.default.json());
app.use((0, cors_1.default)({
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
}));
// Debugger Middleware
app.use((req, res, next) => {
    console.log(`Incoming request: ${req.method} ${req.url}`);
    next();
});
// 3. Initialize Socket Handlers
(0, socketHandler_1.handleSocketEvents)(io);
// Routes
app.use('/api/rooms', roomRoutes_1.default);
app.get('/', (req, res) => {
    res.send('Code Buddy Server is running!');
});
// 4. Start Server
const startServer = async () => {
    try {
        await (0, db_1.connectToDatabase)();
        const PORT = process.env.PORT || 5000;
        // Use server.listen instead of app.listen
        server.listen(PORT, () => {
            console.log(`Server is running on http://localhost:${PORT}`);
        });
    }
    catch (error) {
        console.error("Failed to start server:", error);
        process.exit(1);
    }
};
startServer();
//# sourceMappingURL=index.js.map