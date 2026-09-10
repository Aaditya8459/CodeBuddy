import Docker from "dockerode";
import path from "path";

import {
    CONTAINER_CONFIG,
} from "../config/docker.js";

import {
    containerManager,
} from "./containerManager.js";

import {
    containerRegistry,
    RegisteredContainer,
} from "./containerRegistry.js";

/*
|--------------------------------------------------------------------------
| Types
|--------------------------------------------------------------------------
*/

export interface RoomFile {
    name: string;
    path: string;
    type: "file" | "directory";
    size?: number;
}

export interface RoomCommandResult {
    exitCode: number;
    stdout: string;
    stderr: string;
}

export interface RoomContainerOptions {
    autoCreate?: boolean;
    autoStart?: boolean;
    initializeWorkspace?: boolean;
}

export interface RoomProcess {
    pid: number;
    command: string;
}

export interface RoomWorkspacePaths {
    root: string;
    source: string;
    datasets: string;
    documents: string;
    projects: string;
    temp: string;
    bin: string;
    logs: string;
}

/*
|--------------------------------------------------------------------------
| Room Container
|--------------------------------------------------------------------------
|
| This class represents ONE CodeBuddy room.
|
| Example:
|
| Room:
|     room-123
|
| Container:
|     codebuddy-room-room-123
|
| Workspace:
|     /workspace
|
|--------------------------------------------------------------------------
|
| Responsibilities:
|
| - Bind a room to its container
| - Ensure container availability
| - Workspace operations
| - File operations
| - Directory operations
| - Internal shell operations
| - Process inspection
|
| NOT responsible for:
|
| - Python execution
| - Java compilation
| - C++ compilation
| - Runtime selection
| - Execution queue
| - AI generation
|
|--------------------------------------------------------------------------
*/

export class RoomContainer {
    /*
    |--------------------------------------------------------------------------
    | Room Identity
    |--------------------------------------------------------------------------
    */

    readonly roomId: string;

    /*
    |--------------------------------------------------------------------------
    | Workspace Root
    |--------------------------------------------------------------------------
    */

    readonly workspaceRoot =
        CONTAINER_CONFIG.workspacePath;

    /*
    |--------------------------------------------------------------------------
    | Internal Docker Container
    |--------------------------------------------------------------------------
    */

    private container:
        Docker.Container | null = null;

    /*
    |--------------------------------------------------------------------------
    | Constructor
    |--------------------------------------------------------------------------
    */

    constructor(
        roomId: string,
        container?: Docker.Container
    ) {
        if (
            !roomId ||
            typeof roomId !== "string"
        ) {
            throw new Error(
                "roomId is required"
            );
        }

        this.validateRoomId(
            roomId
        );

        this.roomId =
            roomId.trim();

        if (container) {
            this.container =
                container;
        }
    }

    /*
    |--------------------------------------------------------------------------
    | Get Docker Container
    |--------------------------------------------------------------------------
    */

    async getDockerContainer(
        options: RoomContainerOptions = {}
    ): Promise<Docker.Container> {
        const {
            autoCreate = true,
            autoStart = true,
            initializeWorkspace = true,
        } = options;

        /*
         * Reuse the local container reference when possible.
         */
        if (this.container) {
            try {
                const inspection =
                    await this.container.inspect();

                if (
                    inspection.State.Running
                ) {
                    return this.container;
                }

                if (
                    autoStart
                ) {
                    await this.container.start();

                    await this.waitUntilRunning(
                        this.container
                    );

                    if (
                        initializeWorkspace
                    ) {
                        await this.initializeWorkspace();
                    }

                    return this.container;
                }
            } catch {
                /*
                 * Reference is stale.
                 * Recover from registry/manager.
                 */
                this.container =
                    null;
            }
        }

        /*
         * Try registry first.
         */
        const registered =
            await containerRegistry.ensureRegistered(
                this.roomId
            );

        if (registered) {
            this.container =
                registered.container;

            if (
                autoStart
            ) {
                const inspection =
                    await this.container.inspect();

                if (
                    !inspection.State.Running
                ) {
                    await this.container.start();

                    await this.waitUntilRunning(
                        this.container
                    );
                }
            }

            if (
                initializeWorkspace
            ) {
                await this.initializeWorkspace();
            }

            return this.container;
        }

        /*
         * No container exists.
         */
        if (!autoCreate) {
            throw new Error(
                `Container for room "${this.roomId}" does not exist`
            );
        }

        const room =
            await containerManager.ensureRoom(
                this.roomId,
                {
                    startIfStopped:
                        autoStart,

                    initializeWorkspace,
                }
            );

        const dockerContainer =
            await containerManager.getRoomContainer(
                this.roomId
            );

        if (!dockerContainer) {
            throw new Error(
                `Failed to obtain Docker container for room "${this.roomId}"`
            );
        }

        this.container =
            dockerContainer.container;

        return this.container;
    }

    /*
    |--------------------------------------------------------------------------
    | Get Registered Container
    |--------------------------------------------------------------------------
    */

    async getRegisteredContainer():
        Promise<RegisteredContainer> {
        const registered =
            await containerRegistry.ensureRegistered(
                this.roomId
            );

        if (!registered) {
            throw new Error(
                `Container for room "${this.roomId}" is not registered`
            );
        }

        return registered;
    }

    /*
    |--------------------------------------------------------------------------
    | Ensure Room
    |--------------------------------------------------------------------------
    */

    async ensure(
        initializeWorkspace = true
    ): Promise<void> {
        const container =
            await this.getDockerContainer(
                {
                    autoCreate: true,
                    autoStart: true,
                    initializeWorkspace,
                }
            );

        if (
            initializeWorkspace
        ) {
            await this.initializeWorkspace();
        }

        containerRegistry.touch(
            this.roomId
        );
    }

    /*
    |--------------------------------------------------------------------------
    | Initialize Workspace
    |--------------------------------------------------------------------------
    */

    async initializeWorkspace():
        Promise<void> {
        await containerManager.ensureWorkspaceDirectory(
            this.roomId,
            "."
        );

        const directories = [
            "src",
            "datasets",
            "documents",
            "projects",
            ".codebuddy/temp",
            ".codebuddy/bin",
            ".codebuddy/logs",
        ];

        for (
            const directory of directories
        ) {
            await this.createDirectory(
                directory
            );
        }
    }

    /*
    |--------------------------------------------------------------------------
    | Workspace Paths
    |--------------------------------------------------------------------------
    */

    getWorkspacePaths():
        RoomWorkspacePaths {
        return {
            root:
                this.workspaceRoot,

            source:
                `${this.workspaceRoot}/src`,

            datasets:
                `${this.workspaceRoot}/datasets`,

            documents:
                `${this.workspaceRoot}/documents`,

            projects:
                `${this.workspaceRoot}/projects`,

            temp:
                `${this.workspaceRoot}/.codebuddy/temp`,

            bin:
                `${this.workspaceRoot}/.codebuddy/bin`,

            logs:
                `${this.workspaceRoot}/.codebuddy/logs`,
        };
    }

    /*
    |--------------------------------------------------------------------------
    | Resolve Workspace Path
    |--------------------------------------------------------------------------
    */

    resolvePath(
        requestedPath: string
    ): string {
        if (
            !requestedPath ||
            typeof requestedPath !==
                "string"
        ) {
            throw new Error(
                "Path is required"
            );
        }

        let normalized =
            requestedPath
                .trim()
                .replace(
                    /\\/g,
                    "/"
                );

        /*
         * Convert relative paths into workspace paths.
         */
        if (
            !normalized.startsWith("/")
        ) {
            normalized =
                `${this.workspaceRoot}/${normalized}`;
        }

        /*
         * Use POSIX path normalization.
         */
        normalized =
            path.posix.normalize(
                normalized
            );

        /*
         * Remove trailing slash except root.
         */
        if (
            normalized.length > 1
        ) {
            normalized =
                normalized.replace(
                    /\/+$/,
                    ""
                );
        }

        /*
         * Security boundary.
         */
        if (
            normalized !==
                this.workspaceRoot &&
            !normalized.startsWith(
                `${this.workspaceRoot}/`
            )
        ) {
            throw new Error(
                "Path must remain inside /workspace"
            );
        }

        return normalized;
    }

    /*
    |--------------------------------------------------------------------------
    | Create Directory
    |--------------------------------------------------------------------------
    */

    async createDirectory(
        directoryPath: string
    ): Promise<void> {
        const safePath =
            this.resolvePath(
                directoryPath
            );

        const container =
            await this.getDockerContainer();

        await this.executeInternalCommand(
            container,
            [
                "sh",
                "-c",
                `mkdir -p '${this.escapeShellArgument(
                    safePath
                )}'`,
            ]
        );
    }

    /*
    |--------------------------------------------------------------------------
    | Check Path Exists
    |--------------------------------------------------------------------------
    */

    async exists(
        requestedPath: string
    ): Promise<boolean> {
        const safePath =
            this.resolvePath(
                requestedPath
            );

        const container =
            await this.getDockerContainer();

        const result =
            await this.executeInternalCommand(
                container,
                [
                    "sh",
                    "-c",
                    `if [ -e '${this.escapeShellArgument(
                        safePath
                    )}' ]; then printf '1'; else printf '0'; fi`,
                ]
            );

        return (
            result.stdout.trim() ===
            "1"
        );
    }

    /*
    |--------------------------------------------------------------------------
    | Check File
    |--------------------------------------------------------------------------
    */

    async isFile(
        requestedPath: string
    ): Promise<boolean> {
        const safePath =
            this.resolvePath(
                requestedPath
            );

        const container =
            await this.getDockerContainer();

        const result =
            await this.executeInternalCommand(
                container,
                [
                    "sh",
                    "-c",
                    `if [ -f '${this.escapeShellArgument(
                        safePath
                    )}' ]; then printf '1'; else printf '0'; fi`,
                ]
            );

        return (
            result.stdout.trim() ===
            "1"
        );
    }

    /*
    |--------------------------------------------------------------------------
    | Check Directory
    |--------------------------------------------------------------------------
    */

    async isDirectory(
        requestedPath: string
    ): Promise<boolean> {
        const safePath =
            this.resolvePath(
                requestedPath
            );

        const container =
            await this.getDockerContainer();

        const result =
            await this.executeInternalCommand(
                container,
                [
                    "sh",
                    "-c",
                    `if [ -d '${this.escapeShellArgument(
                        safePath
                    )}' ]; then printf '1'; else printf '0'; fi`,
                ]
            );

        return (
            result.stdout.trim() ===
            "1"
        );
    }

    /*
    |--------------------------------------------------------------------------
    | Write File
    |--------------------------------------------------------------------------
    |
    | Uses base64 encoding to safely transfer file contents
    | through the Docker exec shell.
    |
    */

    async writeFile(
        requestedPath: string,
        content: string
    ): Promise<void> {
        if (
            typeof content !==
            "string"
        ) {
            throw new Error(
                "File content must be a string"
            );
        }

        const safePath =
            this.resolvePath(
                requestedPath
            );

        const container =
            await this.getDockerContainer();

        const encoded =
            Buffer.from(
                content,
                "utf8"
            ).toString(
                "base64"
            );

        const parent =
            path.posix.dirname(
                safePath
            );

        await this.executeInternalCommand(
            container,
            [
                "sh",
                "-c",
                [
                    `mkdir -p '${this.escapeShellArgument(
                        parent
                    )}'`,
                    `printf '%s' '${encoded}' | base64 -d > '${this.escapeShellArgument(
                        safePath
                    )}'`,
                ].join(
                    " && "
                ),
            ]
        );
    }

    /*
    |--------------------------------------------------------------------------
    | Read File
    |--------------------------------------------------------------------------
    */

    async readFile(
        requestedPath: string
    ): Promise<string> {
        const safePath =
            this.resolvePath(
                requestedPath
            );

        const container =
            await this.getDockerContainer();

        const result =
            await this.executeInternalCommand(
                container,
                [
                    "sh",
                    "-c",
                    `cat '${this.escapeShellArgument(
                        safePath
                    )}'`,
                ]
            );

        return result.stdout;
    }

    /*
    |--------------------------------------------------------------------------
    | Delete File Or Directory
    |--------------------------------------------------------------------------
    */

    async delete(
        requestedPath: string
    ): Promise<void> {
        const safePath =
            this.resolvePath(
                requestedPath
            );

        /*
         * Never allow deletion of /workspace itself.
         */
        if (
            safePath ===
            this.workspaceRoot
        ) {
            throw new Error(
                "Deleting /workspace is not allowed"
            );
        }

        const container =
            await this.getDockerContainer();

        await this.executeInternalCommand(
            container,
            [
                "sh",
                "-c",
                `rm -rf '${this.escapeShellArgument(
                    safePath
                )}'`,
            ]
        );
    }

    /*
    |--------------------------------------------------------------------------
    | List Directory
    |--------------------------------------------------------------------------
    */

    async list(
        requestedPath = "."
    ): Promise<RoomFile[]> {
        const safePath =
            this.resolvePath(
                requestedPath
            );

        const container =
            await this.getDockerContainer();

        /*
         * Use find to return:
         *
         * type
         * size
         * path
         *
         * separated by tabs.
         */
        const command = [
            "sh",
            "-c",
            [
                `find '${this.escapeShellArgument(
                    safePath
                )}' -maxdepth 1 -mindepth 1 \\( -type f -o -type d \\) -printf '%y\\t%s\\t%p\\n'`,
            ].join(
                " "
            ),
        ];

        const result =
            await this.executeInternalCommand(
                container,
                command
            );

        const files: RoomFile[] =
            [];

        const lines =
            result.stdout
                .split("\n")
                .filter(
                    (line) =>
                        line.trim()
                            .length > 0
                );

        for (
            const line of lines
        ) {
            const parts =
                line.split(
                    "\t"
                );

            if (
                parts.length < 3
            ) {
                continue;
            }

            const type =
                parts[0] === "d"
                    ? "directory"
                    : "file";

            const size =
                Number(parts[1]);

            const absolutePath =
                parts
                    .slice(2)
                    .join("\t");

            const relativePath =
                path.posix.relative(
                    this.workspaceRoot,
                    absolutePath
                );

            files.push({
                name:
                    path.posix.basename(
                        absolutePath
                    ),

                path:
                    relativePath ||
                    ".",

                type,

                size:
                    Number.isFinite(
                        size
                    )
                        ? size
                        : undefined,
            });
        }

        return files;
    }

    /*
    |--------------------------------------------------------------------------
    | Move / Rename
    |--------------------------------------------------------------------------
    */

    async move(
        sourcePath: string,
        destinationPath: string
    ): Promise<void> {
        const source =
            this.resolvePath(
                sourcePath
            );

        const destination =
            this.resolvePath(
                destinationPath
            );

        if (
            source ===
            this.workspaceRoot
        ) {
            throw new Error(
                "Cannot move /workspace"
            );
        }

        const container =
            await this.getDockerContainer();

        const destinationParent =
            path.posix.dirname(
                destination
            );

        await this.executeInternalCommand(
            container,
            [
                "sh",
                "-c",
                [
                    `mkdir -p '${this.escapeShellArgument(
                        destinationParent
                    )}'`,
                    `mv '${this.escapeShellArgument(
                        source
                    )}' '${this.escapeShellArgument(
                        destination
                    )}'`,
                ].join(
                    " && "
                ),
            ]
        );
    }

    /*
    |--------------------------------------------------------------------------
    | Copy
    |--------------------------------------------------------------------------
    */

    async copy(
        sourcePath: string,
        destinationPath: string
    ): Promise<void> {
        const source =
            this.resolvePath(
                sourcePath
            );

        const destination =
            this.resolvePath(
                destinationPath
            );

        const container =
            await this.getDockerContainer();

        const destinationParent =
            path.posix.dirname(
                destination
            );

        await this.executeInternalCommand(
            container,
            [
                "sh",
                "-c",
                [
                    `mkdir -p '${this.escapeShellArgument(
                        destinationParent
                    )}'`,
                    `cp -R '${this.escapeShellArgument(
                        source
                    )}' '${this.escapeShellArgument(
                        destination
                    )}'`,
                ].join(
                    " && "
                ),
            ]
        );
    }

    /*
    |--------------------------------------------------------------------------
    | Execute Internal Command
    |--------------------------------------------------------------------------
    |
    | Used only for room-management operations.
    |
    | The actual user code execution engine should use
    | its own process/command layer.
    |
    */

    async executeInternalCommand(
        container: Docker.Container,
        command: string[]
    ): Promise<RoomCommandResult> {
        const exec =
            await container.exec({
                Cmd: command,

                AttachStdout: true,

                AttachStderr: true,

                WorkingDir:
                    this.workspaceRoot,
            });

        const stream =
            await exec.start({
                hijack: true,

                stdin: false,

                Tty: false,
            });

        let stdout = "";
        let stderr = "";

        /*
         * Docker multiplexes stdout/stderr when TTY=false.
         */
        const outputStream =
            await this.demuxDockerStream(
                stream,
                (data) => {
                    stdout += data;
                },
                (data) => {
                    stderr += data;
                }
            );

        /*
         * Keep the reference alive until stream closes.
         */
        await outputStream;

        const inspection =
            await exec.inspect();

        return {
            exitCode:
                inspection.ExitCode ??
                0,

            stdout,

            stderr,
        };
    }

    /*
    |--------------------------------------------------------------------------
    | Run Simple Shell Command
    |--------------------------------------------------------------------------
    */

    async shell(
        command: string
    ): Promise<RoomCommandResult> {
        if (
            !command ||
            typeof command !==
                "string"
        ) {
            throw new Error(
                "Command is required"
            );
        }

        const container =
            await this.getDockerContainer();

        /*
         * This method is intended for trusted internal
         * operations. Do not expose directly as an arbitrary
         * user shell API.
         */
        return this.executeInternalCommand(
            container,
            [
                "sh",
                "-c",
                command,
            ]
        );
    }

    /*
    |--------------------------------------------------------------------------
    | Process List
    |--------------------------------------------------------------------------
    */

    async listProcesses():
        Promise<RoomProcess[]> {
        const container =
            await this.getDockerContainer();

        const result =
            await this.executeInternalCommand(
                container,
                [
                    "sh",
                    "-c",
                    "ps -eo pid,args --no-headers 2>/dev/null || ps",
                ]
            );

        const processes: RoomProcess[] =
            [];

        const lines =
            result.stdout
                .split("\n")
                .filter(
                    (line) =>
                        line.trim()
                            .length > 0
                );

        for (
            const line of lines
        ) {
            const match =
                line
                    .trim()
                    .match(
                        /^(\d+)\s+(.*)$/
                    );

            if (!match) {
                continue;
            }

            processes.push({
                pid:
                    Number(
                        match[1]
                    ),

                command:
                    match[2],
            });
        }

        return processes;
    }

    /*
    |--------------------------------------------------------------------------
    | Kill Process
    |--------------------------------------------------------------------------
    */

    async killProcess(
        pid: number
    ): Promise<void> {
        if (
            !Number.isInteger(pid) ||
            pid <= 0
        ) {
            throw new Error(
                "Invalid process ID"
            );
        }

        const container =
            await this.getDockerContainer();

        await this.executeInternalCommand(
            container,
            [
                "sh",
                "-c",
                `kill -TERM ${pid} 2>/dev/null || true`,
            ]
        );
    }

    /*
    |--------------------------------------------------------------------------
    | Clear Temporary Workspace
    |--------------------------------------------------------------------------
    */

    async clearTemporaryWorkspace():
        Promise<void> {
        const container =
            await this.getDockerContainer();

        const temp =
            `${this.workspaceRoot}/.codebuddy/temp`;

        const bin =
            `${this.workspaceRoot}/.codebuddy/bin`;

        await this.executeInternalCommand(
            container,
            [
                "sh",
                "-c",
                [
                    `rm -rf '${this.escapeShellArgument(
                        temp
                    )}'/*`,
                    `rm -rf '${this.escapeShellArgument(
                        bin
                    )}'/*`,
                    `mkdir -p '${this.escapeShellArgument(
                        temp
                    )}'`,
                    `mkdir -p '${this.escapeShellArgument(
                        bin
                    )}'`,
                ].join(
                    " && "
                ),
            ]
        );
    }

    /*
    |--------------------------------------------------------------------------
    | Acquire Container
    |--------------------------------------------------------------------------
    |
    | Marks the room as busy.
    |
    */

    async acquire():
        Promise<RegisteredContainer> {
        const room =
            await this.getDockerContainer();

        /*
         * Ensure registry contains the latest reference.
         */
        const registered =
            containerRegistry.get(
                this.roomId
            );

        if (!registered) {
            containerRegistry.register(
                this.roomId,
                {
                    roomId:
                        this.roomId,

                    containerId:
                        room.id,

                    containerName:
                        room.id,

                    container: room,
                }
            );
        }

        return containerRegistry.acquire(
            this.roomId
        );
    }

    /*
    |--------------------------------------------------------------------------
    | Release Container
    |--------------------------------------------------------------------------
    */

    release(): void {
        containerRegistry.release(
            this.roomId
        );
    }

    /*
    |--------------------------------------------------------------------------
    | Is Busy
    |--------------------------------------------------------------------------
    */

    isBusy(): boolean {
        return containerRegistry.isBusy(
            this.roomId
        );
    }

    /*
    |--------------------------------------------------------------------------
    | Container Status
    |--------------------------------------------------------------------------
    */

    async status() {
        return containerManager.getRoomStatus(
            this.roomId
        );
    }

    /*
    |--------------------------------------------------------------------------
    | Stop
    |--------------------------------------------------------------------------
    */

    async stop(): Promise<boolean> {
        return containerManager.stopRoom(
            this.roomId
        );
    }

    /*
    |--------------------------------------------------------------------------
    | Restart
    |--------------------------------------------------------------------------
    */

    async restart(): Promise<void> {
        const room =
            await containerManager.restartRoom(
                this.roomId
            );

        this.container =
            room
                ? (
                      await containerManager.getRoomContainer(
                          this.roomId
                      )
                  )?.container ??
                  null
                : null;

        await this.initializeWorkspace();
    }

    /*
    |--------------------------------------------------------------------------
    | Delete
    |--------------------------------------------------------------------------
    */

    async remove(): Promise<boolean> {
        /*
         * Do not allow room deletion while operations
         * are still active.
         */
        if (
            this.isBusy()
        ) {
            throw new Error(
                `Cannot remove room "${this.roomId}" while ${containerRegistry.getActiveOperations(
                    this.roomId
                )} operation(s) are active`
            );
        }

        const removed =
            await containerManager.deleteRoom(
                this.roomId
            );

        if (removed) {
            containerRegistry.unregister(
                this.roomId
            );

            this.container =
                null;
        }

        return removed;
    }

    /*
    |--------------------------------------------------------------------------
    | Wait Until Running
    |--------------------------------------------------------------------------
    */

    private async waitUntilRunning(
        container: Docker.Container,
        timeoutMs = 10000
    ): Promise<void> {
        const start =
            Date.now();

        while (
            Date.now() -
                start <
            timeoutMs
        ) {
            try {
                const inspection =
                    await container.inspect();

                if (
                    inspection.State.Running
                ) {
                    return;
                }

                if (
                    inspection.State.Dead
                ) {
                    throw new Error(
                        "Room container entered dead state"
                    );
                }
            } catch (error) {
                if (
                    error instanceof Error &&
                    error.message.includes(
                        "dead state"
                    )
                ) {
                    throw error;
                }
            }

            await new Promise<void>(
                (resolve) =>
                    setTimeout(
                        resolve,
                        200
                    )
            );
        }

        throw new Error(
            `Room container did not become ready within ${timeoutMs}ms`
        );
    }

    /*
    |--------------------------------------------------------------------------
    | Docker Stream Demultiplexing
    |--------------------------------------------------------------------------
    */

    private async demuxDockerStream(
        stream: NodeJS.ReadableStream,
        onStdout: (
            data: string
        ) => void,
        onStderr: (
            data: string
        ) => void
    ): Promise<void> {
        return new Promise<void>(
            (
                resolve,
                reject
            ) => {
                let buffer =
                    Buffer.alloc(0);

                let settled =
                    false;

                const finish =
                    (
                        callback: () => void
                    ) => {
                        if (
                            settled
                        ) {
                            return;
                        }

                        settled = true;

                        callback();
                    };

                stream.on(
                    "data",
                    (
                        chunk: Buffer
                    ) => {
                        buffer =
                            Buffer.concat([
                                buffer,
                                Buffer.isBuffer(
                                    chunk
                                )
                                    ? chunk
                                    : Buffer.from(
                                          chunk
                                      ),
                            ]);

                        /*
                         * Docker raw stream frames:
                         *
                         * Byte 0:
                         *     1 = stdout
                         *     2 = stderr
                         *
                         * Bytes 4-7:
                         *     payload size
                         *
                         * Bytes 8+:
                         *     payload
                         */
                        while (
                            buffer.length >=
                            8
                        ) {
                            const streamType =
                                buffer[0];

                            const payloadLength =
                                buffer.readUInt32BE(
                                    4
                                );

                            const frameLength =
                                8 +
                                payloadLength;

                            if (
                                buffer.length <
                                frameLength
                            ) {
                                break;
                            }

                            const payload =
                                buffer.subarray(
                                    8,
                                    frameLength
                                );

                            const text =
                                payload.toString(
                                    "utf8"
                                );

                            if (
                                streamType ===
                                1
                            ) {
                                onStdout(
                                    text
                                );
                            } else if (
                                streamType ===
                                2
                            ) {
                                onStderr(
                                    text
                                );
                            }

                            buffer =
                                buffer.subarray(
                                    frameLength
                                );
                        }
                    }
                );

                stream.on(
                    "end",
                    () =>
                        finish(
                            resolve
                        )
                );

                stream.on(
                    "close",
                    () =>
                        finish(
                            resolve
                        )
                );

                stream.on(
                    "error",
                    (
                        error
                    ) =>
                        finish(
                            () =>
                                reject(
                                    error
                                )
                        )
                );
            }
        );
    }

    /*
    |--------------------------------------------------------------------------
    | Room ID Validation
    |--------------------------------------------------------------------------
    */

    private validateRoomId(
        roomId: string
    ): void {
        if (
            !/^[a-zA-Z0-9_.:-]+$/.test(
                roomId.trim()
            )
        ) {
            throw new Error(
                "Invalid roomId"
            );
        }
    }

    /*
    |--------------------------------------------------------------------------
    | Shell Argument Escaping
    |--------------------------------------------------------------------------
    */

    private escapeShellArgument(
        value: string
    ): string {
        return value.replace(
            /'/g,
            "'\\''"
        );
    }
}

/*
|--------------------------------------------------------------------------
| Factory
|--------------------------------------------------------------------------
|
| Recommended usage:
|
| const room =
|     new RoomContainer(roomId);
|
|--------------------------------------------------------------------------
*/

export function createRoomContainer(
    roomId: string
): RoomContainer {
    return new RoomContainer(
        roomId
    );
}

export default RoomContainer;