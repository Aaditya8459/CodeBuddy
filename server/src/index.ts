import express from 'express';
import http from 'http';
import cors from 'cors';
import dotenv from 'dotenv';
import { Server } from 'socket.io';
import roomRoutes from './routes/roomRoutes';
import { connectToDatabase } from './db';
import { handleSocketEvents } from './socket/socketHandler';

dotenv.config();

const app = express();

// 1. Create HTTP server to support WebSockets
const server = http.createServer(app);

// 2. Initialize Socket.io with CORS
const io = new Server(server, {
    cors: {
        origin: "http://localhost:3000",
        methods: ["GET", "POST"],
        credentials: true,
    }
});

// Middlewares
app.use(express.json());

app.use(cors({
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true,
}));

// Debugger Middleware
app.use((req, res, next) => {
    console.log(`Incoming request: ${req.method} ${req.url}`);
    next();
});

// 3. Initialize Socket Handlers
handleSocketEvents(io);

// Routes
app.use('/api/rooms', roomRoutes);

app.get('/', (req, res) => {
    res.send('Code Buddy Server is running!');
});

// 4. Start Server
const startServer = async () => {
    try {
        await connectToDatabase();

        const PORT = process.env.PORT || 5000;

        // Use server.listen instead of app.listen
        server.listen(PORT, () => {
            console.log(`Server is running on http://localhost:${PORT}`);
        });
    } catch (error) {
        console.error("Failed to start server:", error);
        process.exit(1);
    }
};

startServer();