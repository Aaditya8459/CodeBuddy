import express, {
    Request,
    Response,
    NextFunction,
} from "express";

import cors from "cors";

import dotenv from "dotenv";

import {
    runCode,
} from "./executor.js";

import {
    writeFile,
    readFile,
    listWorkspace,
    createFile,
    createFolder,
    deletePath,
    renamePath,
} from "./workspace/workspaceService.js";

import containerManager from "./containers/containerManager.js";

dotenv.config();

const app = express();

/*
|--------------------------------------------------------------------------
| Configuration
|--------------------------------------------------------------------------
*/

const PORT =
    Number(process.env.PORT) || 5001;

const DEFAULT_TIMEOUT =
    10000;

const MAX_TIMEOUT =
    60000;

const WORKSPACE_ROOT =
    "/workspace";

const MAX_WORKSPACE_PATH_LENGTH =
    2000;

const MAX_FILE_SIZE =
    10 * 1024 * 1024;

/*
|--------------------------------------------------------------------------
| Middleware
|--------------------------------------------------------------------------
*/

app.use(
    cors({
        origin: "*",
        methods: [
            "GET",
            "POST",
            "DELETE",
            "OPTIONS",
        ],
    })
);

app.use(
    express.json({
        limit: "10mb",
    })
);

/*
|--------------------------------------------------------------------------
| Request Logger
|--------------------------------------------------------------------------
*/

app.use(
    (
        req: Request,
        res: Response,
        next: NextFunction
    ) => {

        const start =
            Date.now();

        console.log(
            `➡️  ${req.method} ${req.originalUrl}`
        );

        res.on(
            "finish",
            () => {

                const duration =
                    Date.now() - start;

                console.log(
                    `⬅️  ${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`
                );
            }
        );

        next();
    }
);

/*
|--------------------------------------------------------------------------
| Timeout Sanitization
|--------------------------------------------------------------------------
*/

const sanitizeTimeout = (
    timeout: unknown
): number => {

    if (
        timeout === undefined ||
        timeout === null ||
        timeout === ""
    ) {

        return DEFAULT_TIMEOUT;
    }

    const parsed =
        Number(timeout);

    if (
        !Number.isFinite(parsed)
    ) {

        return DEFAULT_TIMEOUT;
    }

    return Math.min(
        Math.max(
            Math.floor(parsed),
            1000
        ),
        MAX_TIMEOUT
    );
};

/*
|--------------------------------------------------------------------------
| Room ID Validation
|--------------------------------------------------------------------------
*/

const validateRoomId = (
    roomId: unknown
): string => {

    if (
        typeof roomId !== "string"
    ) {

        throw new Error(
            "roomId must be a string"
        );
    }

    const normalized =
        roomId.trim();

    if (
        !normalized
    ) {

        throw new Error(
            "roomId is required"
        );
    }

    if (
        normalized.length > 100
    ) {

        throw new Error(
            "roomId is too long"
        );
    }

    if (
        !/^[a-zA-Z0-9_-]+$/.test(
            normalized
        )
    ) {

        throw new Error(
            "Invalid roomId"
        );
    }

    return normalized;
};

/*
|--------------------------------------------------------------------------
| Workspace Path Validation
|--------------------------------------------------------------------------
*/

const normalizeWorkspacePath = (
    input: unknown
): string => {

    if (
        typeof input !== "string"
    ) {

        throw new Error(
            "Workspace path must be a string"
        );
    }

    let normalized =
        input.trim();

    if (
        !normalized
    ) {

        throw new Error(
            "Workspace path is required"
        );
    }

    if (
        normalized.length >
        MAX_WORKSPACE_PATH_LENGTH
    ) {

        throw new Error(
            "Workspace path is too long"
        );
    }

    /*
     * Convert Windows separators.
     */
    normalized =
        normalized.replace(
            /\\/g,
            "/"
        );

    /*
     * Remove workspace prefix when
     * the caller accidentally supplies
     * /workspace/foo.py.
     */
    if (
        normalized === WORKSPACE_ROOT
    ) {

        return "";
    }

    if (
        normalized.startsWith(
            `${WORKSPACE_ROOT}/`
        )
    ) {

        normalized =
            normalized.slice(
                WORKSPACE_ROOT.length + 1
            );
    }

    /*
     * Reject absolute paths.
     */
    if (
        normalized.startsWith("/")
    ) {

        throw new Error(
            "Absolute workspace paths are not allowed"
        );
    }

    /*
     * Reject NUL bytes.
     */
    if (
        normalized.includes("\0")
    ) {

        throw new Error(
            "Invalid workspace path"
        );
    }

    /*
     * Reject traversal.
     */
    const segments =
        normalized.split("/");

    if (
        segments.some(
            (
                segment
            ) =>
                segment === ".."
        )
    ) {

        throw new Error(
            "Workspace path traversal is not allowed"
        );
    }

    /*
     * Remove harmless "." segments.
     */
    normalized =
        segments
            .filter(
                (
                    segment
                ) =>
                    segment !== "."
            )
            .join("/");

    if (
        normalized === "~" ||
        normalized.startsWith("~/")
    ) {

        throw new Error(
            "Home directory paths are not allowed"
        );
    }

    return normalized;
};

/*
|--------------------------------------------------------------------------
| Workspace Absolute Path
|--------------------------------------------------------------------------
*/

const getWorkspaceAbsolutePath = (
    relativePath: string
): string => {

    if (
        !relativePath
    ) {

        return WORKSPACE_ROOT;
    }

    return `${WORKSPACE_ROOT}/${relativePath}`;
};

/*
|--------------------------------------------------------------------------
| Ensure Room Container
|--------------------------------------------------------------------------
*/

const ensureRoomContainer = async (
    roomId: string,
    initializeWorkspace = false
) => {

    const normalizedRoomId =
        validateRoomId(
            roomId
        );

    console.log(
        "🐳 Ensuring room container:",
        {
            roomId:
                normalizedRoomId,
            initializeWorkspace,
        }
    );

    const roomContainer =
        await containerManager.ensureRoom(
            normalizedRoomId,
            {
                startIfStopped: true,
                initializeWorkspace,
            }
        );

    if (
        !roomContainer
    ) {

        throw new Error(
            "Unable to ensure room container"
        );
    }

    console.log(
        "🐳 Room container ready:",
        {
            roomId:
                roomContainer.roomId,

            containerId:
                roomContainer.containerId,

            containerName:
                roomContainer.containerName,
        }
    );

    return roomContainer;
};

/*
|--------------------------------------------------------------------------
| Health Check
|--------------------------------------------------------------------------
*/

app.get(
    "/",
    (
        _req: Request,
        res: Response
    ) => {

        res.status(200).json({

            success: true,

            service:
                "codebuddy-worker",

            status:
                "healthy",

            port:
                PORT,
        });
    }
);

app.get(
    "/health",
    (
        _req: Request,
        res: Response
    ) => {

        res.status(200).json({

            success: true,

            service:
                "codebuddy-worker",

            status:
                "healthy",

            timestamp:
                new Date().toISOString(),
        });
    }
);

/*
|--------------------------------------------------------------------------
| Code Execution
|--------------------------------------------------------------------------
|
| POST /internal/execute
|
*/

app.post(
    "/internal/execute",
    async (
        req: Request,
        res: Response
    ) => {

        const {
            roomId,
            code,
            language,
            stdin = "",
            timeout,
            filePath,
            command,
        } = req.body;

        const executionTimeout =
            sanitizeTimeout(
                timeout
            );

        console.log(
            "🧪 Worker execution request:",
            {
                roomId,
                language,
                filePath,
                command,

                timeout:
                    executionTimeout,

                hasCode:
                    typeof code === "string",

                stdinLength:
                    typeof stdin === "string"
                        ? stdin.length
                        : 0,
            }
        );

        /*
         * Validate language
         */

        if (
            !language ||
            typeof language !== "string"
        ) {

            res.status(400).json({

                success: false,

                message:
                    "language is required",
            });

            return;
        }

        const normalizedLanguage =
            language
                .trim()
                .toLowerCase();

        /*
         * Validate code
         */

        if (
            code === undefined ||
            code === null
        ) {

            res.status(400).json({

                success: false,

                message:
                    "code is required",
            });

            return;
        }

        if (
            typeof code !== "string"
        ) {

            res.status(400).json({

                success: false,

                message:
                    "code must be a string",
            });

            return;
        }

        /*
         * Validate roomId
         */

        if (
            !roomId ||
            typeof roomId !== "string"
        ) {

            res.status(400).json({

                success: false,

                message:
                    "roomId is required",
            });

            return;
        }

        /*
         * Validate stdin
         */

        if (
            stdin !== undefined &&
            stdin !== null &&
            typeof stdin !== "string"
        ) {

            res.status(400).json({

                success: false,

                message:
                    "stdin must be a string",
            });

            return;
        }

        /*
         * Validate filePath.
         *
         * null is allowed.
         */

        if (
            filePath !== undefined &&
            filePath !== null &&
            typeof filePath !== "string"
        ) {

            res.status(400).json({

                success: false,

                message:
                    "filePath must be a string",
            });

            return;
        }

        /*
         * Validate command.
         *
         * null is allowed.
         */

        if (
            command !== undefined &&
            command !== null &&
            typeof command !== "string"
        ) {

            res.status(400).json({

                success: false,

                message:
                    "command must be a string",
            });

            return;
        }

        try {

            const startedAt =
                Date.now();

            console.log(
                "🚀 Starting code execution:",
                {
                    roomId,

                    language:
                        normalizedLanguage,

                    timeout:
                        executionTimeout,

                    filePath:
                        filePath ?? null,

                    command:
                        command ?? null,
                }
            );

            const output =
                await runCode(
                    code,
                    normalizedLanguage
                );

            const executionTime =
                Date.now() -
                startedAt;

            console.log(
                `✅ Execution completed in ${executionTime}ms`
            );

            if (
                typeof output === "string"
            ) {

                res.status(200).json({

                    success: true,

                    stdout:
                        output,

                    stderr:
                        "",

                    output:
                        output,

                    exitCode:
                        0,

                    signal:
                        null,

                    executionTime,

                    memoryUsed:
                        0,
                });

                return;
            }

            if (
                output &&
                typeof output === "object"
            ) {

                const executionResult =
                    output as any;

                res.status(200).json({

                    success:
                        executionResult.success ??
                        true,

                    stdout:
                        executionResult.stdout ??
                        executionResult.output ??
                        "",

                    stderr:
                        executionResult.stderr ??
                        "",

                    output:
                        executionResult.output ??
                        executionResult.stdout ??
                        "",

                    exitCode:
                        executionResult.exitCode ??
                        0,

                    signal:
                        executionResult.signal ??
                        null,

                    executionTime:
                        executionResult.executionTime ??
                        executionTime,

                    memoryUsed:
                        executionResult.memoryUsed ??
                        0,

                    error:
                        executionResult.error ??
                        undefined,

                    message:
                        executionResult.message ??
                        undefined,
                });

                return;
            }

            res.status(200).json({

                success: true,

                stdout:
                    String(
                        output ?? ""
                    ),

                stderr:
                    "",

                output:
                    String(
                        output ?? ""
                    ),

                exitCode:
                    0,

                signal:
                    null,

                executionTime,

                memoryUsed:
                    0,
            });

        } catch (
            error: unknown
        ) {

            console.error(
                "❌ Code execution failed:",
                error
            );

            const message =
                error instanceof Error
                    ? error.message
                    : "Code execution failed";

            if (
                message
                    .toLowerCase()
                    .includes("timed out") ||
                message
                    .toLowerCase()
                    .includes("timeout")
            ) {

                res.status(504).json({

                    success: false,

                    stdout:
                        "",

                    stderr:
                        message,

                    output:
                        "",

                    exitCode:
                        1,

                    signal:
                        "SIGTERM",

                    error:
                        message,

                    message:
                        message,
                });

                return;
            }

            res.status(500).json({

                success: false,

                stdout:
                    "",

                stderr:
                    message,

                output:
                    "",

                exitCode:
                    1,

                signal:
                    null,

                error:
                    message,

                message:
                    message,
            });
        }
    }
);

/*
|--------------------------------------------------------------------------
| Backward-Compatible Execute Endpoint
|--------------------------------------------------------------------------
|
| POST /execute
|
*/

app.post(
    "/execute",
    async (
        req: Request,
        res: Response
    ) => {

        const {
            code,
            language,
            timeout,
        } = req.body;

        const executionTimeout =
            sanitizeTimeout(
                timeout
            );

        console.log(
            "🧪 Direct execution request:",
            {
                language,

                timeout:
                    executionTimeout,

                hasCode:
                    typeof code === "string",
            }
        );

        if (
            !language ||
            typeof language !== "string"
        ) {

            res.status(400).json({

                success: false,

                message:
                    "language is required",
            });

            return;
        }

        if (
            code === undefined ||
            code === null
        ) {

            res.status(400).json({

                success: false,

                message:
                    "code is required",
            });

            return;
        }

        if (
            typeof code !== "string"
        ) {

            res.status(400).json({

                success: false,

                message:
                    "code must be a string",
            });

            return;
        }

        try {

            const startedAt =
                Date.now();

            const output =
                await runCode(
                    code,
                    language
                );

            const executionTime =
                Date.now() -
                startedAt;

            console.log(
                `✅ Direct execution completed in ${executionTime}ms`
            );

            if (
                typeof output === "string"
            ) {

                res.status(200).json({

                    success: true,

                    stdout:
                        output,

                    stderr:
                        "",

                    output:
                        output,

                    exitCode:
                        0,

                    signal:
                        null,

                    executionTime,

                    memoryUsed:
                        0,
                });

                return;
            }

            if (
                output &&
                typeof output === "object"
            ) {

                const executionResult =
                    output as any;

                res.status(200).json({

                    success:
                        executionResult.success ??
                        true,

                    stdout:
                        executionResult.stdout ??
                        executionResult.output ??
                        "",

                    stderr:
                        executionResult.stderr ??
                        "",

                    output:
                        executionResult.output ??
                        executionResult.stdout ??
                        "",

                    exitCode:
                        executionResult.exitCode ??
                        0,

                    signal:
                        executionResult.signal ??
                        null,

                    executionTime:
                        executionResult.executionTime ??
                        executionTime,

                    memoryUsed:
                        executionResult.memoryUsed ??
                        0,

                    error:
                        executionResult.error ??
                        undefined,

                    message:
                        executionResult.message ??
                        undefined,
                });

                return;
            }

            res.status(200).json({

                success: true,

                stdout:
                    String(
                        output ?? ""
                    ),

                stderr:
                    "",

                output:
                    String(
                        output ?? ""
                    ),

                exitCode:
                    0,

                signal:
                    null,

                executionTime,

                memoryUsed:
                    0,
            });

        } catch (
            error: unknown
        ) {

            console.error(
                "❌ Direct execution failed:",
                error
            );

            const message =
                error instanceof Error
                    ? error.message
                    : "Code execution failed";

            if (
                message
                    .toLowerCase()
                    .includes("timed out") ||
                message
                    .toLowerCase()
                    .includes("timeout")
            ) {

                res.status(504).json({

                    success: false,

                    stdout:
                        "",

                    stderr:
                        message,

                    output:
                        "",

                    exitCode:
                        1,

                    signal:
                        "SIGTERM",

                    error:
                        message,

                    message:
                        message,
                });

                return;
            }

            res.status(500).json({

                success: false,

                stdout:
                    "",

                stderr:
                    message,

                output:
                    "",

                exitCode:
                    1,

                signal:
                    null,

                error:
                    message,

                message:
                    message,
            });
        }
    }
);

/*
|--------------------------------------------------------------------------
| Workspace List
|--------------------------------------------------------------------------
|
| POST /internal/workspace/list
|
| Returns the actual contents of:
|
| /workspace
|
| from the persistent Docker room container.
|
*/

app.post(
    "/internal/workspace/list",
    async (
        req: Request,
        res: Response
    ) => {

        console.log(
            "📂 WORKSPACE LIST HIT"
        );

        try {

            const roomId =
                validateRoomId(
                    req.body?.roomId
                );

            const relativePath =
                req.body?.path
                    ? normalizeWorkspacePath(
                        req.body.path
                    )
                    : "";

            console.log(
                "📂 Listing workspace:",
                {
                    roomId,
                    path:
                        relativePath || "/workspace",
                }
            );

            const roomContainer =
                await ensureRoomContainer(
                    roomId,
                    false
                );

            const files =
                await listWorkspace(
                    roomContainer.containerId
                );

            console.log(
                "✅ Workspace listed:",
                {
                    roomId,
                    count:
                        Array.isArray(files)
                            ? files.length
                            : 0,
                }
            );

            res.status(200).json({

                success: true,

                roomId,

                path:
                    relativePath,

                workspacePath:
                    getWorkspaceAbsolutePath(
                        relativePath
                    ),

                files,
            });

        } catch (
            error: unknown
        ) {

            console.error(
                "❌ Workspace list failed:",
                error
            );

            const message =
                error instanceof Error
                    ? error.message
                    : "Failed to list workspace";

            res.status(500).json({

                success: false,

                message,
            });
        }
    }
);

/*
|--------------------------------------------------------------------------
| Workspace Read
|--------------------------------------------------------------------------
|
| POST /internal/workspace/read
|
*/

app.post(
    "/internal/workspace/read",
    async (
        req: Request,
        res: Response
    ) => {

        console.log(
            "📖 WORKSPACE READ HIT"
        );

        try {

            const roomId =
                validateRoomId(
                    req.body?.roomId
                );

            const requestedPath =
                req.body?.filePath ??
                req.body?.path;

            const relativePath =
                normalizeWorkspacePath(
                    requestedPath
                );

            if (
                !relativePath
            ) {

                throw new Error(
                    "A file path is required"
                );
            }

            const roomContainer =
                await ensureRoomContainer(
                    roomId,
                    false
                );

            const content =
                await readFile(
                    roomContainer.containerId,
                    relativePath
                );

            console.log(
                "✅ Workspace file read:",
                {
                    roomId,
                    path:
                        relativePath,

                    contentLength:
                        typeof content === "string"
                            ? content.length
                            : 0,
                }
            );

            res.status(200).json({

                success: true,

                roomId,

                path:
                    relativePath,

                content:
                    typeof content === "string"
                        ? content
                        : String(
                            content ?? ""
                        ),
            });

        } catch (
            error: unknown
        ) {

            console.error(
                "❌ Workspace read failed:",
                error
            );

            const message =
                error instanceof Error
                    ? error.message
                    : "Failed to read workspace file";

            const status =
                message
                    .toLowerCase()
                    .includes("not found")
                    ? 404
                    : 500;

            res.status(status).json({

                success: false,

                message,
            });
        }
    }
);

/*
|--------------------------------------------------------------------------
| Workspace Create File
|--------------------------------------------------------------------------
|
| POST /internal/workspace/file
|
*/

app.post(
    "/internal/workspace/file",
    async (
        req: Request,
        res: Response
    ) => {

        console.log(
            "📄 WORKSPACE CREATE FILE HIT"
        );

        try {

            const roomId =
                validateRoomId(
                    req.body?.roomId
                );

            const requestedPath =
                req.body?.filePath ??
                req.body?.path ??
                req.body?.fileName;

            const relativePath =
                normalizeWorkspacePath(
                    requestedPath
                );

            if (
                !relativePath
            ) {

                throw new Error(
                    "File path is required"
                );
            }

            const content =
                req.body?.content ??
                "";

            if (
                typeof content !== "string"
            ) {

                throw new Error(
                    "File content must be a string"
                );
            }

            if (
                Buffer.byteLength(
                    content,
                    "utf8"
                ) > MAX_FILE_SIZE
            ) {

                throw new Error(
                    "File content exceeds maximum allowed size"
                );
            }

            const roomContainer =
                await ensureRoomContainer(
                    roomId,
                    false
                );

            await createFile(
                roomContainer.containerId,
                relativePath
            );

            console.log(
                "✅ Workspace file created:",
                {
                    roomId,
                    path:
                        relativePath,
                }
            );

            res.status(200).json({

                success: true,

                message:
                    "Workspace file created successfully",

                roomId,

                path:
                    relativePath,

                containerId:
                    roomContainer.containerId,

                containerName:
                    roomContainer.containerName,
            });

        } catch (
            error: unknown
        ) {

            console.error(
                "❌ Workspace file creation failed:",
                error
            );

            const message =
                error instanceof Error
                    ? error.message
                    : "Failed to create workspace file";

            res.status(500).json({

                success: false,

                message,
            });
        }
    }
);

/*
|--------------------------------------------------------------------------
| Workspace Write / Autosave
|--------------------------------------------------------------------------
|
| POST /internal/workspace/write
|
*/

app.post(
    "/internal/workspace/write",
    async (
        req: Request,
        res: Response
    ) => {

        console.log(
            "🔥 WORKER WORKSPACE WRITE HIT"
        );

        console.log(
            "🔥 WORKSPACE WRITE BODY:",
            {
                roomId:
                    req.body?.roomId,

                filePath:
                    req.body?.filePath,

                path:
                    req.body?.path,

                fileName:
                    req.body?.fileName,

                contentType:
                    typeof req.body?.content,

                contentLength:
                    typeof req.body?.content === "string"
                        ? req.body.content.length
                        : null,
            }
        );

        try {

            const roomId =
                validateRoomId(
                    req.body?.roomId
                );

            const content =
                req.body?.content;

            const filePath =
                typeof req.body?.filePath === "string"
                    ? req.body.filePath
                    : req.body?.path;

            if (
                !filePath ||
                typeof filePath !== "string"
            ) {

                res.status(400).json({

                    success: false,

                    message:
                        "filePath is required",
                });

                return;
            }

            if (
                typeof content !== "string"
            ) {

                res.status(400).json({

                    success: false,

                    message:
                        "content must be a string",
                });

                return;
            }

            const normalizedPath =
                normalizeWorkspacePath(
                    filePath
                );

            if (
                !normalizedPath
            ) {

                res.status(400).json({

                    success: false,

                    message:
                        "A file path is required",
                });

                return;
            }

            if (
                Buffer.byteLength(
                    content,
                    "utf8"
                ) > MAX_FILE_SIZE
            ) {

                res.status(413).json({

                    success: false,

                    message:
                        "File content exceeds maximum allowed size",
                });

                return;
            }

            console.log(
                "📁 Workspace write request:",
                {
                    roomId,

                    filePath:
                        normalizedPath,

                    contentLength:
                        content.length,
                }
            );

            const roomContainer =
                await ensureRoomContainer(
                    roomId,
                    false
                );

            console.log(
                "🐳 Room container found:",
                {
                    roomId,

                    containerId:
                        roomContainer.containerId,
                }
            );

            await writeFile(
                roomContainer.containerId,
                normalizedPath,
                content
            );

            console.log(
                `✅ Workspace file written successfully: ${normalizedPath}`
            );

            res.status(200).json({

                success: true,

                message:
                    "Workspace file written successfully",

                roomId,

                filePath:
                    normalizedPath,

                path:
                    normalizedPath,

                containerId:
                    roomContainer.containerId,

                containerName:
                    roomContainer.containerName,
            });

        } catch (
            error: unknown
        ) {

            console.error(
                "❌ Workspace write failed:",
                error
            );

            const message =
                error instanceof Error
                    ? error.message
                    : "Workspace write failed";

            res.status(500).json({

                success: false,

                message,
            });
        }
    }
);

/*
|--------------------------------------------------------------------------
| Workspace Create Folder
|--------------------------------------------------------------------------
|
| POST /internal/workspace/folder
|
*/

app.post(
    "/internal/workspace/folder",
    async (
        req: Request,
        res: Response
    ) => {

        console.log(
            "📁 WORKSPACE CREATE FOLDER HIT"
        );

        try {

            const roomId =
                validateRoomId(
                    req.body?.roomId
                );

            const requestedPath =
                req.body?.path ??
                req.body?.filePath ??
                req.body?.folderPath;

            const relativePath =
                normalizeWorkspacePath(
                    requestedPath
                );

            if (
                !relativePath
            ) {

                throw new Error(
                    "Folder path is required"
                );
            }

            const roomContainer =
                await ensureRoomContainer(
                    roomId,
                    false
                );

            await createFolder(
                roomContainer.containerId,
                relativePath
            );

            console.log(
                "✅ Workspace folder created:",
                {
                    roomId,

                    path:
                        relativePath,
                }
            );

            res.status(200).json({

                success: true,

                message:
                    "Workspace folder created successfully",

                roomId,

                path:
                    relativePath,

                containerId:
                    roomContainer.containerId,

                containerName:
                    roomContainer.containerName,
            });

        } catch (
            error: unknown
        ) {

            console.error(
                "❌ Workspace folder creation failed:",
                error
            );

            const message =
                error instanceof Error
                    ? error.message
                    : "Failed to create workspace folder";

            res.status(500).json({

                success: false,

                message,
            });
        }
    }
);

/*
|--------------------------------------------------------------------------
| Workspace Delete
|--------------------------------------------------------------------------
|
| POST /internal/workspace/delete
|
*/

app.post(
    "/internal/workspace/delete",
    async (
        req: Request,
        res: Response
    ) => {

        console.log(
            "🗑️ WORKSPACE DELETE HIT"
        );

        try {

            const roomId =
                validateRoomId(
                    req.body?.roomId
                );

            const requestedPath =
                req.body?.path ??
                req.body?.filePath;

            const relativePath =
                normalizeWorkspacePath(
                    requestedPath
                );

            if (
                !relativePath
            ) {

                throw new Error(
                    "Path is required"
                );
            }

            const recursive =
                req.body?.recursive === true;

            const roomContainer =
                await ensureRoomContainer(
                    roomId,
                    false
                );

            await deletePath(
                roomContainer.containerId,
                relativePath
            );
            

            console.log(
                "✅ Workspace item deleted:",
                {
                    roomId,

                    path:
                        relativePath,

                    recursive,
                }
            );

            res.status(200).json({

                success: true,

                message:
                    "Workspace item deleted successfully",

                roomId,

                path:
                    relativePath,
            });

        } catch (
            error: unknown
        ) {

            console.error(
                "❌ Workspace delete failed:",
                error
            );

            const message =
                error instanceof Error
                    ? error.message
                    : "Failed to delete workspace item";

            res.status(500).json({

                success: false,

                message,
            });
        }
    }
);

/*
|--------------------------------------------------------------------------
| Workspace Rename
|--------------------------------------------------------------------------
|
| POST /internal/workspace/rename
|
*/

app.post(
    "/internal/workspace/rename",
    async (
        req: Request,
        res: Response
    ) => {
        console.log(
            "✏️ WORKSPACE RENAME HIT"
        );

        try {
            const roomId =
                validateRoomId(
                    req.body?.roomId
                );

            const oldPath =
                normalizeWorkspacePath(
                    req.body?.oldPath
                );

            const newPath =
                normalizeWorkspacePath(
                    req.body?.newPath
                );

            if (
                !oldPath ||
                !newPath
            ) {
                throw new Error(
                    "Both oldPath and newPath are required"
                );
            }

            const roomContainer =
                await ensureRoomContainer(
                    roomId,
                    false
                );

            const result =
                await renamePath(
                    roomContainer.containerId,
                    oldPath,
                    newPath
                );

            console.log(
                "✅ Workspace item renamed:",
                {
                    roomId,
                    oldPath,
                    newPath,
                    containerId:
                        roomContainer.containerId,
                }
            );

            res.status(200).json({
                success: true,
                message:
                    "Workspace item renamed successfully",
                roomId,
                oldPath,
                newPath,
                containerId:
                    roomContainer.containerId,
                containerName:
                    roomContainer.containerName,
                path:
                    result.path,
            });
        } catch (
            error: unknown
        ) {
            console.error(
                "❌ Workspace rename failed:",
                error
            );

            const message =
                error instanceof Error
                    ? error.message
                    : "Failed to rename workspace item";

            const status =
                message
                    .toLowerCase()
                    .includes("does not exist")
                    ? 404
                    : message
                        .toLowerCase()
                        .includes("already exists")
                        ? 409
                        : 500;

            res.status(status).json({
                success: false,
                message,
            });
        }
    }
);

/*
|--------------------------------------------------------------------------
| Workspace Status
|--------------------------------------------------------------------------
|
| POST /internal/workspace/status
|
*/

app.post(
    "/internal/workspace/status",
    async (
        req: Request,
        res: Response
    ) => {

        console.log(
            "📊 WORKSPACE STATUS HIT"
        );

        try {

            const roomId =
                validateRoomId(
                    req.body?.roomId
                );

            const roomContainer =
                await ensureRoomContainer(
                    roomId,
                    false
                );

            res.status(200).json({

                success: true,

                roomId,

                containerId:
                    roomContainer.containerId,

                containerName:
                    roomContainer.containerName,

                workspace:
                    roomContainer.workspace,

                workspacePath:
                    WORKSPACE_ROOT,
            });

        } catch (
            error: unknown
        ) {

            console.error(
                "❌ Workspace status failed:",
                error
            );

            const message =
                error instanceof Error
                    ? error.message
                    : "Failed to get workspace status";

            res.status(500).json({

                success: false,

                message,
            });
        }
    }
);

/*
|--------------------------------------------------------------------------
| Workspace Ensure
|--------------------------------------------------------------------------
|
| POST /internal/workspace/ensure
|
*/

app.post(
    "/internal/workspace/ensure",
    async (
        req: Request,
        res: Response
    ) => {

        console.log(
            "🐳 WORKER WORKSPACE ENSURE HIT"
        );

        try {

            const normalizedRoomId =
                validateRoomId(
                    req.body?.roomId
                );

            console.log(
                "🐳 Ensuring room container:",
                {
                    roomId:
                        normalizedRoomId,
                }
            );

            const roomContainer =
                await containerManager.ensureRoom(
                    normalizedRoomId,
                    {
                        startIfStopped:
                            true,

                        initializeWorkspace:
                            true,
                    }
                );

            console.log(
                "✅ Room container ensured:",
                {
                    roomId:
                        normalizedRoomId,

                    containerId:
                        roomContainer.containerId,
                }
            );

            res.status(200).json({

                success: true,

                message:
                    "Room workspace ensured successfully",

                roomId:
                    normalizedRoomId,

                containerId:
                    roomContainer.containerId,

                containerName:
                    roomContainer.containerName,

                workspacePath:
                    roomContainer.workspace,
            });

        } catch (
            error: unknown
        ) {

            console.error(
                "❌ Workspace ensure failed:",
                error
            );

            const message =
                error instanceof Error
                    ? error.message
                    : "Failed to ensure room workspace";

            res.status(500).json({

                success: false,

                message,

                roomId:
                    typeof req.body?.roomId === "string"
                        ? req.body.roomId
                        : null,
            });
        }
    }
);

/*
|--------------------------------------------------------------------------
| 404 Handler
|--------------------------------------------------------------------------
*/

app.use(
    (
        req: Request,
        res: Response
    ) => {

        res.status(404).json({

            success: false,

            message:
                "Worker endpoint not found",

            path:
                req.originalUrl,
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
        error: unknown,
        _req: Request,
        res: Response,
        _next: NextFunction
    ) => {

        console.error(
            "❌ Worker global error:",
            error
        );

        const message =
            error instanceof Error
                ? error.message
                : "Internal worker error";

        if (
            res.headersSent
        ) {

            return;
        }

        res.status(500).json({

            success: false,

            message,
        });
    }
);

/*
|--------------------------------------------------------------------------
| Start Worker
|--------------------------------------------------------------------------
*/

const startWorker = () => {

    app.listen(
        PORT,
        () => {

            console.log("");

            console.log(
                "=========================================="
            );

            console.log(
                "        CODEBUDDY WORKER SERVICE"
            );

            console.log(
                "=========================================="
            );

            console.log(
                `🚀 Worker:     http://localhost:${PORT}`
            );

            console.log(
                `❤️  Health:    http://localhost:${PORT}/health`
            );

            console.log(
                `▶️  Execute:   http://localhost:${PORT}/internal/execute`
            );

            console.log(
                `🧪 Direct:    http://localhost:${PORT}/execute`
            );

            console.log(
                `📂 List:      http://localhost:${PORT}/internal/workspace/list`
            );

            console.log(
                `📖 Read:      http://localhost:${PORT}/internal/workspace/read`
            );

            console.log(
                `📄 File:      http://localhost:${PORT}/internal/workspace/file`
            );

            console.log(
                `🔥 Write:     http://localhost:${PORT}/internal/workspace/write`
            );

            console.log(
                `📁 Folder:    http://localhost:${PORT}/internal/workspace/folder`
            );

            console.log(
                `🗑️  Delete:    http://localhost:${PORT}/internal/workspace/delete`
            );

            console.log(
                `✏️  Rename:    http://localhost:${PORT}/internal/workspace/rename`
            );

            console.log(
                `📊 Status:    http://localhost:${PORT}/internal/workspace/status`
            );

            console.log(
                `🐳 Ensure:    http://localhost:${PORT}/internal/workspace/ensure`
            );

            console.log(
                `🐳 Image:     ${
                    process.env.WORKER_IMAGE ||
                    "codebuddy-runtime:latest"
                }`
            );

            console.log(
                `🌐 Network:   ${
                    process.env.DOCKER_NETWORK ||
                    "codebuddy-network"
                }`
            );

            console.log(
                "=========================================="
            );

            console.log("");
        }
    );
};

startWorker();

export default app;