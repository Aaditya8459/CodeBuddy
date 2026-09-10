import Docker from "dockerode";
import dotenv from "dotenv";

dotenv.config();

/*
|--------------------------------------------------------------------------
| Docker Connection
|--------------------------------------------------------------------------
| Windows Docker Desktop
|--------------------------------------------------------------------------
*/

const DOCKER_SOCKET =
    process.env.DOCKER_SOCKET ||
    "/var/run/docker.sock";

const docker = new Docker({
    socketPath: DOCKER_SOCKET,
});

/*
|--------------------------------------------------------------------------
| Language Configuration
|--------------------------------------------------------------------------
*/

interface LanguageConfig {
    image: string;
    cmd: string[];
}

const LANGUAGE_CONFIG: Record<
    string,
    LanguageConfig
> = {

    /*
    |--------------------------------------------------------------------------
    | Python
    |--------------------------------------------------------------------------
    */

    python: {
        image: "python:3.9-slim",

        cmd: [
            "sh",
            "-c",
            `
                printf '%s' "$CODE" > /tmp/main.py &&
                python3 /tmp/main.py
            `,
        ],
    },

    /*
    |--------------------------------------------------------------------------
    | JavaScript
    |--------------------------------------------------------------------------
    */

    javascript: {
        image: "node:22-alpine",

        cmd: [
            "sh",
            "-c",
            `
                printf '%s' "$CODE" > /tmp/main.js &&
                node /tmp/main.js
            `,
        ],
    },

    /*
    |--------------------------------------------------------------------------
    | TypeScript
    |--------------------------------------------------------------------------
    */

    typescript: {
        image: "codebuddy-typescript:latest",

        cmd: [
            "sh",
            "-c",
            `
                mkdir -p /workspace &&
                printf '%s' "$CODE" > /workspace/main.ts &&
                tsx /workspace/main.ts
            `,
        ],
    },

    /*
    |--------------------------------------------------------------------------
    | C
    |--------------------------------------------------------------------------
    */

    c: {
        image: "gcc:11",

        cmd: [
            "sh",
            "-c",
            `
                printf '%s' "$CODE" > /tmp/main.c &&
                gcc /tmp/main.c -o /tmp/app &&
                /tmp/app
            `,
        ],
    },

    /*
    |--------------------------------------------------------------------------
    | C++
    |--------------------------------------------------------------------------
    */

    cpp: {
        image: "gcc:11",

        cmd: [
            "sh",
            "-c",
            `
                printf '%s' "$CODE" > /tmp/main.cpp &&
                g++ /tmp/main.cpp -o /tmp/app &&
                /tmp/app
            `,
        ],
    },

    /*
    |--------------------------------------------------------------------------
    | Java
    |--------------------------------------------------------------------------
    */

    java: {
        image: "eclipse-temurin:11-jdk-alpine",

        cmd: [
            "sh",
            "-c",
            `
                printf '%s' "$CODE" > /tmp/Main.java &&
                javac /tmp/Main.java &&
                java -cp /tmp Main
            `,
        ],
    },

    /*
    |--------------------------------------------------------------------------
    | Go
    |--------------------------------------------------------------------------
    */

    go: {
        image: "codebuddy-go:latest",
        cmd: [
            "sh",
            "-c",
            `
                printf '%s' "$CODE" > /tmp/main.go &&
                go run /tmp/main.go
            `,
        ],
    },

    /*
    |--------------------------------------------------------------------------
    | Rust
    |--------------------------------------------------------------------------
    */

    rust: {
        image: "rust:1.80-slim",

        cmd: [
            "sh",
            "-c",
            `
                printf '%s' "$CODE" > /tmp/main.rs &&
                rustc /tmp/main.rs -o /tmp/app &&
                /tmp/app
            `,
        ],
    },
};

/*
|--------------------------------------------------------------------------
| Docker Log Decoder
|--------------------------------------------------------------------------
|
| Docker Engine returns stdout/stderr as multiplexed frames when the
| container does not use a TTY.
|
| Each frame has:
|
| Byte 0     -> stream type
|              1 = stdout
|              2 = stderr
|
| Bytes 1-3  -> reserved
|
| Bytes 4-7  -> payload size (big endian)
|
| Bytes 8... -> actual output
|
| Calling logs.toString() directly exposes the frame header as characters
| such as:
|
|     13
|
| This function removes those Docker headers and returns only the actual
| program output.
|--------------------------------------------------------------------------
*/

function decodeDockerLogs(
    logs: Buffer
): string {

    /*
    |--------------------------------------------------------------------------
    | Validate Buffer
    |--------------------------------------------------------------------------
    */

    if (!Buffer.isBuffer(logs)) {
        return String(logs ?? "");
    }

    /*
    |--------------------------------------------------------------------------
    | Empty Logs
    |--------------------------------------------------------------------------
    */

    if (logs.length === 0) {
        return "";
    }

    /*
    |--------------------------------------------------------------------------
    | Docker Multiplexed Frame Parsing
    |--------------------------------------------------------------------------
    */

    let offset = 0;

    let stdout = "";
    let stderr = "";

    while (offset + 8 <= logs.length) {

        /*
        |--------------------------------------------------------------------------
        | Read Stream Type
        |--------------------------------------------------------------------------
        */

        const streamType =
            logs[offset];

        /*
        |--------------------------------------------------------------------------
        | Read Payload Size
        |--------------------------------------------------------------------------
        */

        const payloadSize =
            logs.readUInt32BE(
                offset + 4
            );

        /*
        |--------------------------------------------------------------------------
        | Calculate Payload Start
        |--------------------------------------------------------------------------
        */

        const payloadStart =
            offset + 8;

        /*
        |--------------------------------------------------------------------------
        | Calculate Payload End
        |--------------------------------------------------------------------------
        */

        const payloadEnd =
            payloadStart + payloadSize;

        /*
        |--------------------------------------------------------------------------
        | Protect Against Invalid Frame
        |--------------------------------------------------------------------------
        */

        if (
            payloadEnd > logs.length
        ) {
            break;
        }

        /*
        |--------------------------------------------------------------------------
        | Extract Payload
        |--------------------------------------------------------------------------
        */

        const payload =
            logs
                .subarray(
                    payloadStart,
                    payloadEnd
                )
                .toString("utf8");

        /*
        |--------------------------------------------------------------------------
        | Append To Correct Stream
        |--------------------------------------------------------------------------
        */

        if (streamType === 1) {

            stdout += payload;

        } else if (streamType === 2) {

            stderr += payload;

        } else {

            /*
            |--------------------------------------------------------------------------
            | Unknown Stream
            |--------------------------------------------------------------------------
            |
            | This normally should not happen. Preserve the payload rather
            | than silently throwing away program output.
            |--------------------------------------------------------------------------
            */

            stdout += payload;
        }

        /*
        |--------------------------------------------------------------------------
        | Move To Next Frame
        |--------------------------------------------------------------------------
        */

        offset = payloadEnd;
    }

    /*
    |--------------------------------------------------------------------------
    | Handle Non-Multiplexed Output
    |--------------------------------------------------------------------------
    |
    | Some Docker configurations can return plain output instead of
    | multiplexed frames. If no frame was successfully decoded, return
    | the original buffer.
    |--------------------------------------------------------------------------
    */

    if (
        stdout.length === 0 &&
        stderr.length === 0 &&
        logs.length > 0
    ) {
        return logs.toString("utf8");
    }

    /*
    |--------------------------------------------------------------------------
    | Combine stdout + stderr
    |--------------------------------------------------------------------------
    |
    | CodeBuddy's console displays both normal program output and errors.
    |--------------------------------------------------------------------------
    */

    return stdout + stderr;
}

/*
|--------------------------------------------------------------------------
| Clean Program Output
|--------------------------------------------------------------------------
*/

function cleanOutput(
    output: string
): string {

    return output
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .trim();
}

/*
|--------------------------------------------------------------------------
| Run Code
|--------------------------------------------------------------------------
*/

export async function runCode(
    code: string,
    language: string
) {

    /*
    |--------------------------------------------------------------------------
    | Normalize Language
    |--------------------------------------------------------------------------
    */

    const normalizedLanguage =
        language
            .trim()
            .toLowerCase();

    /*
    |--------------------------------------------------------------------------
    | Get Language Configuration
    |--------------------------------------------------------------------------
    */

    const config =
        LANGUAGE_CONFIG[
            normalizedLanguage
        ];

    /*
    |--------------------------------------------------------------------------
    | Validate Language
    |--------------------------------------------------------------------------
    */

    if (!config) {
        throw new Error(
            `Unsupported language: ${language}`
        );
    }

    /*
    |--------------------------------------------------------------------------
    | Validate Code
    |--------------------------------------------------------------------------
    */

    if (
        typeof code !== "string" ||
        code.length === 0
    ) {
        throw new Error(
            "Code cannot be empty"
        );
    }

    /*
    |--------------------------------------------------------------------------
    | Check Docker Connection
    |--------------------------------------------------------------------------
    */

    try {

        await docker.ping();

    } catch (error) {

        console.error(
            "❌ Docker connection failed:",
            error
        );

        throw new Error(
            "Docker Desktop is not reachable"
        );
    }

    /*
    |--------------------------------------------------------------------------
    | Verify Docker Image
    |--------------------------------------------------------------------------
    */

    try {

        await docker
            .getImage(config.image)
            .inspect();

    } catch (error) {

        console.error(
            `❌ Docker image unavailable: ${config.image}`,
            error
        );

        throw new Error(
            `Docker image not found: ${config.image}`
        );
    }

    /*
    |--------------------------------------------------------------------------
    | Create Execution Container
    |--------------------------------------------------------------------------
    */

    let container;

    try {

        container =
            await docker.createContainer({

                /*
                |--------------------------------------------------------------------------
                | Docker Image
                |--------------------------------------------------------------------------
                */

                Image:
                    config.image,

                /*
                |--------------------------------------------------------------------------
                | Execution Command
                |--------------------------------------------------------------------------
                */

                Cmd:
                    config.cmd,

                /*
                |--------------------------------------------------------------------------
                | Source Code
                |--------------------------------------------------------------------------
                */

                Env: [
                    `CODE=${code}`,
                ],

                /*
                |--------------------------------------------------------------------------
                | Working Directory
                |--------------------------------------------------------------------------
                */

                WorkingDir:
                    normalizedLanguage === "go" ||
                    normalizedLanguage === "typescript"
                        ? "/workspace"
                        : "/tmp",

                /*
                |--------------------------------------------------------------------------
                | Container Restrictions
                |--------------------------------------------------------------------------
                */

                HostConfig: {

                    /*
                     * Manual cleanup.
                     */

                    AutoRemove:
                        false,

                    /*
                     * Memory limit.
                     */

                    Memory:
                        Number(
                            process.env
                                .CONTAINER_MEMORY_BYTES
                        ) ||
                        256 *
                            1024 *
                            1024,

                    /*
                     * Memory + swap limit.
                     */

                    MemorySwap:
                        Number(
                            process.env
                                .CONTAINER_MEMORY_SWAP_BYTES
                        ) ||
                        256 *
                            1024 *
                            1024,

                    /*
                     * CPU limit.
                     */

                    NanoCpus:
                        500000000,

                    /*
                     * Process limit.
                     */

                    PidsLimit:
                        Number(
                            process.env
                                .CONTAINER_PIDS_LIMIT
                        ) ||
                        256,

                    /*
                     * Disable network access.
                     */

                    NetworkMode:
                        "none",
                },
            });

    } catch (error) {

        console.error(
            "❌ Failed to create execution container:",
            error
        );

        throw error;
    }

    /*
    |--------------------------------------------------------------------------
    | Execute Container
    |--------------------------------------------------------------------------
    */

    try {

        /*
        |--------------------------------------------------------------------------
        | Start Container
        |--------------------------------------------------------------------------
        */

        await container.start();

        console.log(
            `🐳 Container started: ${container.id}`
        );

        /*
        |--------------------------------------------------------------------------
        | Wait Until Program Finishes
        |--------------------------------------------------------------------------
        */

        const EXECUTION_TIMEOUT =
            Number(process.env.EXECUTION_TIMEOUT_MS) || 50000;

        const result = await Promise.race([
            container.wait(),

            new Promise<never>((_, reject) => {
                setTimeout(() => {
                    reject(
                        new Error(
                            `Container execution timed out after ${EXECUTION_TIMEOUT}ms`
                        )
                    );
                }, EXECUTION_TIMEOUT);
            }),
        ]);

        console.log(
            "🐳 Container finished:",
            {
                id:
                    container.id,

                status:
                    result?.StatusCode,

                error:
                    result?.Error,
            }
        );

        /*
        |--------------------------------------------------------------------------
        | Collect stdout + stderr
        |--------------------------------------------------------------------------
        */

        const logs =
            await container.logs({

                stdout:
                    true,

                stderr:
                    true,

                timestamps:
                    false,
            });

        /*
        |--------------------------------------------------------------------------
        | Decode Docker Multiplexed Logs
        |--------------------------------------------------------------------------
        */

        const decodedOutput =
            decodeDockerLogs(
                logs
            );

        /*
        |--------------------------------------------------------------------------
        | Clean Program Output
        |--------------------------------------------------------------------------
        */

        const output =
            cleanOutput(
                decodedOutput
            );

        /*
        |--------------------------------------------------------------------------
        | Return Program Output
        |--------------------------------------------------------------------------
        */

        return output;

    } catch (error) {

        /*
        |--------------------------------------------------------------------------
        | Execution Error
        |--------------------------------------------------------------------------
        */

        console.error(
            "❌ Container execution error:",
            error
        );

        throw error;

    } 
    finally {
    try {
        const inspect = await container.inspect();

        console.log("🔍 EXECUTION CONTAINER FINAL STATE:", {
            id: container.id,
            status: inspect.State?.Status,
            running: inspect.State?.Running,
            exitCode: inspect.State?.ExitCode,
            error: inspect.State?.Error,
            oomKilled: inspect.State?.OOMKilled,
            startedAt: inspect.State?.StartedAt,
            finishedAt: inspect.State?.FinishedAt,
            pid: inspect.State?.Pid,
        });

        if (inspect.State?.Running) {
            console.warn(
                "⚠️ Container is STILL RUNNING after execution timeout:",
                container.id
            );

            console.warn(
                "⚠️ Container was intentionally NOT removed for debugging."
            );
        } else {
            await container.remove({ force: true });

            console.log(
                "🗑️ Execution container removed:",
                container.id
            );
        }
    } catch (cleanupError) {
        console.warn(
            "⚠️ Execution container cleanup/inspection failed:",
            cleanupError
        );
    }
}
}