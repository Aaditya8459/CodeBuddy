import express from "express";
import http from "http";
import cors from "cors";
import dotenv from "dotenv";
import { Server } from "socket.io";

import roomRoutes from "./routes/roomRoutes";
import aiRoutes from "./routes/aiRoutes";
import workspaceRoutes from "./routes/workspaceRoutes";
import uploadRoutes from "./routes/uploadRoutes";
import terminalRoutes from "./routes/terminalRoutes";
import executeRoutes from "./routes/executeRoutes";

import { connectToDatabase } from "./db";
import { handleSocketEvents } from "./socket/socketHandler";

dotenv.config();

const app = express();

/*
|--------------------------------------------------------------------------
| Configuration
|--------------------------------------------------------------------------
*/

const PORT = Number(process.env.PORT) || 5000;

const CLIENT_URL =
    process.env.CLIENT_URL || "http://localhost:3000";

/*
|--------------------------------------------------------------------------
| HTTP Server
|--------------------------------------------------------------------------
|
| We use the HTTP server instead of app.listen() because Socket.io
| requires access to the underlying HTTP server.
|
*/

const server = http.createServer(app);

/*
|--------------------------------------------------------------------------
| Socket.io
|--------------------------------------------------------------------------
*/

const io = new Server(server, {
    cors: {
        origin: CLIENT_URL,
        methods: ["GET", "POST", "PUT", "DELETE"],
        credentials: true,
    },

    transports: ["websocket", "polling"],
});

/*
|--------------------------------------------------------------------------
| Global Middleware
|--------------------------------------------------------------------------
*/

app.use(
    cors({
        origin: CLIENT_URL,
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        credentials: true,
    })
);

app.use(
    express.json({
        limit: "10mb",
    })
);

app.use(
    express.urlencoded({
        extended: true,
        limit: "10mb",
    })
);

/*
|--------------------------------------------------------------------------
| Request Logger
|--------------------------------------------------------------------------
*/

app.use((req, res, next) => {
    const start = Date.now();

    console.log(
        `➡️  ${req.method} ${req.originalUrl}`
    );

    res.on("finish", () => {
        const duration = Date.now() - start;

        console.log(
            `⬅️  ${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`
        );
    });

    next();
});

/*
|--------------------------------------------------------------------------
| Socket Events
|--------------------------------------------------------------------------
*/

handleSocketEvents(io);

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
*/

/*
 * Room management
 *
 * Examples:
 * POST /api/rooms
 * GET  /api/rooms/:id
 * PUT  /api/rooms/:id
 * DELETE /api/rooms/:id
 */
app.use(
    "/api/rooms",
    roomRoutes
);

/*
 * AI assistant
 *
 * POST /api/ai
 */
app.use(
    "/api/ai",
    aiRoutes
);

/*
 * Room workspace
 *
 * GET    /api/workspace
 * GET    /api/workspace/status
 * POST   /api/workspace/read
 * POST   /api/workspace/file
 * PUT    /api/workspace/file
 * DELETE /api/workspace/item
 * POST   /api/workspace/directory
 * POST   /api/workspace/rename
 */
app.use(
    "/api/workspace",
    workspaceRoutes
);

/*
 * File upload
 *
 * POST /api/upload
 *
 * Multipart/form-data
 */
app.use(
    "/api/upload",
    uploadRoutes
);

/*
 * Code Execution
 *
 * POST /api/execute
 */
app.use(
    "/api/execute",
    executeRoutes
);

/*
 * Terminal
 *
 * POST /api/terminal/session
 * POST /api/terminal/execute
 * POST /api/terminal/close
 */
app.use(
    "/api/terminal",
    terminalRoutes
);

/*
|--------------------------------------------------------------------------
| Health Check
|--------------------------------------------------------------------------
*/

app.get(
    "/",
    (_req, res) => {
        res.status(200).json({
            success: true,
            message: "Code Buddy Server is running!",
            service: "codebuddy-server",
            status: "healthy",
        });
    }
);

app.get(
    "/health",
    (_req, res) => {
        res.status(200).json({
            success: true,
            status: "healthy",
            service: "codebuddy-server",
            timestamp: new Date().toISOString(),
        });
    }
);

/*
|--------------------------------------------------------------------------
| 404 Handler
|--------------------------------------------------------------------------
*/

app.use(
    (req, res) => {
        res.status(404).json({
            success: false,
            message: "API endpoint not found",
            path: req.originalUrl,
        });
    }
);

/*
|--------------------------------------------------------------------------
| Global Error Handler
|--------------------------------------------------------------------------
*/

app.use(
    (
        error: any,
        _req: express.Request,
        res: express.Response,
        _next: express.NextFunction
    ) => {
        console.error(
            "❌ Global Server Error:",
            error
        );

        if (res.headersSent) {
            return;
        }

        const statusCode =
            error?.statusCode ||
            error?.status ||
            500;

        res.status(statusCode).json({
            success: false,
            message:
                error?.message ||
                "Internal server error",
        });
    }
);

/*
|--------------------------------------------------------------------------
| Start Server
|--------------------------------------------------------------------------
*/

const startServer = async () => {
    try {
        console.log(
            "🚀 Starting CodeBuddy Server..."
        );

        /*
         * Connect MongoDB before accepting requests.
         */
        await connectToDatabase();

        /*
         * Start HTTP + Socket.io server.
         */
        server.listen(
            PORT,
            () => {
                console.log("");
                console.log(
                    "=========================================="
                );
                console.log(
                    "        CODEBUDDY SERVER STARTED"
                );
                console.log(
                    "=========================================="
                );
                console.log(
                    `🚀 Server:    http://localhost:${PORT}`
                );
                console.log(
                    `🌐 Client:    ${CLIENT_URL}`
                );
                console.log(
                    `🤖 AI:        http://localhost:${PORT}/api/ai`
                );
                console.log(
                    `📁 Workspace: http://localhost:${PORT}/api/workspace`
                );
                console.log(
                    `📤 Upload:    http://localhost:${PORT}/api/upload`
                );
                console.log(
                    `▶️  Execute:   http://localhost:${PORT}/api/execute`
                );
                console.log(
                    `💻 Terminal:  http://localhost:${PORT}/api/terminal`
                );
                console.log(
                    `🏠 Rooms:     http://localhost:${PORT}/api/rooms`
                );
                console.log(
                    `❤️  Health:    http://localhost:${PORT}/health`
                );
                console.log(
                    "=========================================="
                );
                console.log("");
            }
        );
    } catch (error) {
        console.error(
            "❌ Failed to start CodeBuddy Server:",
            error
        );

        process.exit(1);
    }
};

/*
|--------------------------------------------------------------------------
| Graceful Shutdown
|--------------------------------------------------------------------------
*/

const shutdown = (
    signal: string
) => {
    console.log(
        `\n🛑 ${signal} received. Shutting down server...`
    );

    server.close(() => {
        console.log(
            "✅ HTTP server closed."
        );

        process.exit(0);
    });

    /*
     * Force shutdown if something is hanging.
     */
    setTimeout(() => {
        console.error(
            "⚠️ Forced shutdown."
        );

        process.exit(1);
    }, 10000).unref();
};

process.on(
    "SIGINT",
    () => shutdown("SIGINT")
);

process.on(
    "SIGTERM",
    () => shutdown("SIGTERM")
);

/*
|--------------------------------------------------------------------------
| Start
|--------------------------------------------------------------------------
*/

startServer();

export { app, server, io };