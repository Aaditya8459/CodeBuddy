import Docker from "dockerode";

import {
    docker,
    getRoomContainer,
    getRoomContainerByName,
    getRoomContainerLabels,
    getRoomContainerName,
    getRoomContainerOptions,
    WORKER_IMAGE,
    DOCKER_NETWORK,
    CONTAINER_CONFIG,
} from "../config/docker.js";

/*
|--------------------------------------------------------------------------
| Types
|--------------------------------------------------------------------------
*/

export interface ContainerStatus {
    roomId: string;
    containerId: string | null;
    containerName: string;
    exists: boolean;
    running: boolean;
    paused: boolean;
    restarting: boolean;
    status: string;
    createdAt?: string;
}

export interface RoomContainer {
    roomId: string;
    containerId: string;
    containerName: string;
    container: Docker.Container;
}

export interface ContainerLifecycleOptions {
    startIfStopped?: boolean;
    ensureWorkspace?: boolean;
}

/*
|--------------------------------------------------------------------------
| Container Lifecycle Manager
|--------------------------------------------------------------------------
|
| One CodeBuddy room = one persistent Docker container.
|
| Example:
|
| room-123
|     ↓
| codebuddy-room-room-123
|     ↓
| /workspace
|
| The same container is reused for:
|
| - file operations
| - code execution
| - terminal
| - full-stack projects
| - uploaded datasets
| - uploaded documents
| - AI-generated code
|
|--------------------------------------------------------------------------
*/

class ContainerLifecycle {

    /*
    |--------------------------------------------------------------------------
    | Creation Locks
    |--------------------------------------------------------------------------
    |
    | Prevents concurrent requests inside this Node.js process from creating
    | duplicate containers for the same room.
    |
    | Example:
    |
    | Request A → createContainer(room123)
    | Request B → createContainer(room123)
    |
    | Both requests wait for the same creation Promise.
    |
    |--------------------------------------------------------------------------
    */

    private readonly creationLocks = new Map<
        string,
        Promise<RoomContainer>
    >();

    /*
    |--------------------------------------------------------------------------
    | Operation Locks
    |--------------------------------------------------------------------------
    |
    | Prevents conflicting lifecycle operations for the same room.
    |
    | Example:
    |
    | startRoom(room1)
    | restartRoom(room1)
    | deleteRoom(room1)
    |
    | cannot execute concurrently inside this process.
    |
    |--------------------------------------------------------------------------
    */

    private readonly operationLocks = new Map<
        string,
        Promise<void>
    >();

    /*
    |--------------------------------------------------------------------------
    | Sleep Utility
    |--------------------------------------------------------------------------
    */

    private sleep(
        milliseconds: number
    ): Promise<void> {
        return new Promise((resolve) =>
            setTimeout(resolve, milliseconds)
        );
    }

    /*
    |--------------------------------------------------------------------------
    | Room Lock
    |--------------------------------------------------------------------------
    |
    | Serializes lifecycle operations for a room.
    |
    |--------------------------------------------------------------------------
    */

    private async withRoomLock<T>(
        roomId: string,
        operation: () => Promise<T>
    ): Promise<T> {

        const previous =
            this.operationLocks.get(roomId);

        let release!: () => void;

        const current = new Promise<void>(
            (resolve) => {
                release = resolve;
            }
        );

        this.operationLocks.set(
            roomId,
            current
        );

        if (previous) {
            await previous;
        }

        try {
            return await operation();
        } finally {
            release();

            if (
                this.operationLocks.get(roomId) ===
                current
            ) {
                this.operationLocks.delete(
                    roomId
                );
            }
        }
    }

    /*
    |--------------------------------------------------------------------------
    | Docker Connection
    |--------------------------------------------------------------------------
    */

    async checkDocker(): Promise<void> {

        try {

            await docker.ping();

        } catch (error) {

            throw new Error(
                `Docker daemon is unavailable: ${this.getErrorMessage(
                    error
                )}`
            );
        }
    }

    /*
    |--------------------------------------------------------------------------
    | Create Room Container - Internal
    |--------------------------------------------------------------------------
    |
    | IMPORTANT:
    |
    | This method DOES NOT acquire withRoomLock().
    |
    | It must only be called when the caller already owns the room lock,
    | or through createContainer() which handles the locking.
    |
    |--------------------------------------------------------------------------
    */

    private async createContainerInternal(
        roomId: string
    ): Promise<RoomContainer> {

        if (!roomId) {

            throw new Error(
                "roomId is required"
            );
        }

        /*
        |--------------------------------------------------------------------------
        | Double-check container existence.
        |--------------------------------------------------------------------------
        */

        const existing =
            await this.findContainer(
                roomId
            );

        if (existing) {

            /*
            |--------------------------------------------------------------------------
            | If the existing container is stopped, start it.
            |--------------------------------------------------------------------------
            */

            let inspection:

                Docker.ContainerInspectInfo;

            try {

                inspection =
                    await existing.container.inspect();

            } catch (error) {

                throw new Error(
                    `Failed to inspect existing container for room ${roomId}: ${this.getErrorMessage(
                        error
                    )}`
                );
            }

            if (
                !inspection.State.Running
            ) {

                await this.startContainer(
                    existing.container
                );
            }

            await this.ensureWorkspace(
                existing.container
            );

            return this.toRoomContainer(
                roomId,
                existing.container
            );
        }

        /*
        |--------------------------------------------------------------------------
        | Verify Docker daemon.
        |--------------------------------------------------------------------------
        */

        await this.checkDocker();

        /*
        |--------------------------------------------------------------------------
        | Ensure image exists.
        |--------------------------------------------------------------------------
        */

        await this.ensureImage();

        /*
        |--------------------------------------------------------------------------
        | Ensure network exists.
        |--------------------------------------------------------------------------
        */

        await this.ensureNetwork();

        /*
        |--------------------------------------------------------------------------
        | Deterministic container name.
        |--------------------------------------------------------------------------
        */

        const containerName =
            getRoomContainerName(
                roomId
            );

        /*
        |--------------------------------------------------------------------------
        | Container labels.
        |--------------------------------------------------------------------------
        */

        const labels =
            getRoomContainerLabels(
                roomId
            );

        /*
        |--------------------------------------------------------------------------
        | Docker container options.
        |--------------------------------------------------------------------------
        */

        const options =
            getRoomContainerOptions(
                roomId
            );

        /*
        |--------------------------------------------------------------------------
        | Explicit deterministic identity.
        |--------------------------------------------------------------------------
        */

        options.name =
            containerName;

        options.Image =
            WORKER_IMAGE;

        options.Labels =
            labels;

        console.log(
            `🐳 Creating room container: ${containerName}`
        );

        let container: Docker.Container;

        try {

            container =
                await docker.createContainer(
                    options
                );

        } catch (error) {

            /*
            |--------------------------------------------------------------------------
            | Docker name conflict recovery.
            |--------------------------------------------------------------------------
            |
            | Another request/process may have created the container between
            | our lookup and docker.createContainer().
            |--------------------------------------------------------------------------
            */

            const recovered =
                await this.getContainerByName(
                    containerName
                );

            if (recovered) {

                console.log(
                    `♻️ Reusing existing container: ${containerName}`
                );

                const recoveredRoom =
                    this.toRoomContainer(
                        roomId,
                        recovered
                    );

                try {

                    const inspection =
                        await recovered.inspect();

                    if (
                        !inspection.State.Running
                    ) {

                        await this.startContainer(
                            recovered
                        );
                    }

                    await this.ensureWorkspace(
                        recovered
                    );

                } catch (recoveryError) {

                    throw new Error(
                        `Failed to initialize recovered container for room ${roomId}: ${this.getErrorMessage(
                            recoveryError
                        )}`
                    );
                }

                return recoveredRoom;
            }

            throw new Error(
                `Failed to create container for room ${roomId}: ${this.getErrorMessage(
                    error
                )}`
            );
        }

        console.log(
            `✅ Container created: ${container.id}`
        );

        /*
        |--------------------------------------------------------------------------
        | Start container.
        |--------------------------------------------------------------------------
        */

        try {

            const inspection =
                await container.inspect();

            if (
                !inspection.State.Running
            ) {

                await container.start();
            }

        } catch (error) {

            /*
            |--------------------------------------------------------------------------
            | Cleanup failed container.
            |--------------------------------------------------------------------------
            */

            try {

                await container.remove({
                    force: true,
                });

            } catch {

                // Ignore cleanup failure.

            }

            throw new Error(
                `Failed to start container for room ${roomId}: ${this.getErrorMessage(
                    error
                )}`
            );
        }

        /*
        |--------------------------------------------------------------------------
        | Wait until running.
        |--------------------------------------------------------------------------
        */

        await this.waitUntilRunning(
            container,
            10000
        );

        /*
        |--------------------------------------------------------------------------
        | Ensure base workspace.
        |--------------------------------------------------------------------------
        */

        await this.ensureWorkspace(
            container
        );

        console.log(
            `🚀 Room container ready: ${containerName}`
        );

        return this.toRoomContainer(
            roomId,
            container
        );
    }

    /*
    |--------------------------------------------------------------------------
    | Create Room Container
    |--------------------------------------------------------------------------
    |
    | Creates a container only when one does not already exist.
    |
    | This method is protected against duplicate creation by the
    | creation lock.
    |
    |--------------------------------------------------------------------------
    */

    async createContainer(
        roomId: string
    ): Promise<RoomContainer> {

        if (!roomId) {

            throw new Error(
                "roomId is required"
            );
        }

        const existingLock =
            this.creationLocks.get(
                roomId
            );

        if (existingLock) {

            return existingLock;
        }

        const creationPromise =
            this.withRoomLock(
                roomId,
                async () => {

                    /*
                    |--------------------------------------------------------------------------
                    | IMPORTANT:
                    |
                    | createContainerInternal() is used here instead of
                    | createContainer(), preventing recursive room locking.
                    |--------------------------------------------------------------------------
                    */

                    return this.createContainerInternal(
                        roomId
                    );
                }
            );

        this.creationLocks.set(
            roomId,
            creationPromise
        );

        try {

            return await creationPromise;

        } finally {

            if (
                this.creationLocks.get(
                    roomId
                ) === creationPromise
            ) {

                this.creationLocks.delete(
                    roomId
                );
            }
        }
    }

    /*
    |--------------------------------------------------------------------------
    | Ensure Room Container
    |--------------------------------------------------------------------------
    |
    | Primary lifecycle method.
    |
    | Guarantees:
    |
    | - container exists
    | - container is running when requested
    | - workspace exists when requested
    |
    |--------------------------------------------------------------------------
    */

    async ensureContainer(
        roomId: string,
        options: ContainerLifecycleOptions = {}
    ): Promise<RoomContainer> {

        if (!roomId) {

            throw new Error(
                "roomId is required"
            );
        }

        return this.withRoomLock(
            roomId,
            async () => {

                /*
                |--------------------------------------------------------------------------
                | Always perform lookup while holding the room lock.
                |--------------------------------------------------------------------------
                */

                let existing =
                    await this.findContainer(
                        roomId
                    );

                /*
                |--------------------------------------------------------------------------
                | Create only if missing.
                |--------------------------------------------------------------------------
                |
                | IMPORTANT FIX:
                |
                | DO NOT call createContainer() here.
                |
                | ensureContainer() already owns withRoomLock().
                |
                | Calling createContainer() would attempt to acquire the
                | same room lock again and deadlock.
                |--------------------------------------------------------------------------
                */

                if (!existing) {

                    existing =
                        await this.createContainerInternal(
                            roomId
                        );
                }

                /*
                |--------------------------------------------------------------------------
                | Inspect current state.
                |--------------------------------------------------------------------------
                */

                let inspection:
                    Docker.ContainerInspectInfo;

                try {

                    inspection =
                        await existing.container.inspect();

                } catch (error) {

                    /*
                    |--------------------------------------------------------------------------
                    | Container disappeared between lookup and inspect.
                    |--------------------------------------------------------------------------
                    |
                    | Re-check Docker once before creating another container.
                    |--------------------------------------------------------------------------
                    */

                    const recovered =
                        await this.findContainer(
                            roomId
                        );

                    if (!recovered) {

                        throw new Error(
                            `Container for room ${roomId} disappeared during lifecycle operation: ${this.getErrorMessage(
                                error
                            )}`
                        );
                    }

                    existing =
                        recovered;

                    inspection =
                        await existing.container.inspect();
                }

                /*
                |--------------------------------------------------------------------------
                | Start stopped containers by default.
                |--------------------------------------------------------------------------
                */

                if (
                    !inspection.State.Running &&
                    options.startIfStopped !== false
                ) {

                    await this.startContainer(
                        existing.container
                    );
                }

                /*
                |--------------------------------------------------------------------------
                | Ensure workspace.
                |--------------------------------------------------------------------------
                */

                if (
                    options.ensureWorkspace !== false
                ) {

                    await this.ensureWorkspace(
                        existing.container
                    );
                }

                return this.toRoomContainer(
                    roomId,
                    existing.container
                );
            }
        );
    }

    /*
    |--------------------------------------------------------------------------
    | Start Container
    |--------------------------------------------------------------------------
    */

    async startContainer(
        container: Docker.Container
    ): Promise<void> {

        let inspection:
            Docker.ContainerInspectInfo;

        try {

            inspection =
                await container.inspect();

        } catch (error) {

            throw new Error(
                `Failed to inspect container ${container.id}: ${this.getErrorMessage(
                    error
                )}`
            );
        }

        /*
        |--------------------------------------------------------------------------
        | Already running.
        |--------------------------------------------------------------------------
        */

        if (
            inspection.State.Running
        ) {

            return;
        }

        /*
        |--------------------------------------------------------------------------
        | Cannot directly start a paused container.
        |--------------------------------------------------------------------------
        */

        if (
            inspection.State.Paused
        ) {

            try {

                await container.unpause();

                return;

            } catch (error) {

                throw new Error(
                    `Failed to unpause container ${container.id}: ${this.getErrorMessage(
                        error
                    )}`
                );
            }
        }

        /*
        |--------------------------------------------------------------------------
        | Container may be restarting.
        |--------------------------------------------------------------------------
        */

        if (
            inspection.State.Restarting
        ) {

            await this.waitUntilRunning(
                container,
                10000
            );

            return;
        }

        console.log(
            `▶️ Starting container: ${container.id}`
        );

        try {

            await container.start();

            await this.waitUntilRunning(
                container,
                10000
            );

            console.log(
                `✅ Container started: ${container.id}`
            );

        } catch (error) {

            /*
            |--------------------------------------------------------------------------
            | Container may have been started by another concurrent operation.
            |--------------------------------------------------------------------------
            */

            try {

                const current =
                    await container.inspect();

                if (
                    current.State.Running
                ) {

                    return;
                }

            } catch {

                // Continue with original error.

            }

            throw new Error(
                `Failed to start container ${container.id}: ${this.getErrorMessage(
                    error
                )}`
            );
        }
    }

    /*
    |--------------------------------------------------------------------------
    | Stop Container
    |--------------------------------------------------------------------------
    */

    async stopContainer(
        roomId: string,
        timeout = 10
    ): Promise<boolean> {

        if (!roomId) {

            throw new Error(
                "roomId is required"
            );
        }

        return this.withRoomLock(
            roomId,
            async () => {

                const result =
                    await this.findContainer(
                        roomId
                    );

                if (!result) {

                    return false;
                }

                const {
                    container,
                } = result;

                try {

                    const inspection =
                        await container.inspect();

                    if (
                        !inspection.State.Running
                    ) {

                        return true;
                    }

                    console.log(
                        `⏹️ Stopping container for room: ${roomId}`
                    );

                    await container.stop({
                        t: timeout,
                    });

                    console.log(
                        `✅ Container stopped: ${container.id}`
                    );

                    return true;

                } catch (error) {

                    /*
                    |--------------------------------------------------------------------------
                    | It may already have stopped.
                    |--------------------------------------------------------------------------
                    */

                    try {

                        const current =
                            await container.inspect();

                        if (
                            !current.State.Running
                        ) {

                            return true;
                        }

                    } catch {

                        // Ignore secondary inspection error.

                    }

                    throw new Error(
                        `Failed to stop container for room ${roomId}: ${this.getErrorMessage(
                            error
                        )}`
                    );
                }
            }
        );
    }

    /*
    |--------------------------------------------------------------------------
    | Restart Container
    |--------------------------------------------------------------------------
    */

    async restartContainer(
        roomId: string
    ): Promise<RoomContainer> {

        if (!roomId) {

            throw new Error(
                "roomId is required"
            );
        }

        return this.withRoomLock(
            roomId,
            async () => {

                let result =
                    await this.findContainer(
                        roomId
                    );

                /*
                |--------------------------------------------------------------------------
                | Missing container → create it safely.
                |--------------------------------------------------------------------------
                |
                | IMPORTANT FIX:
                |
                | Do not call createContainer() here because this method already
                | owns the room lock.
                |--------------------------------------------------------------------------
                */

                if (!result) {

                    return this.createContainerInternal(
                        roomId
                    );
                }

                console.log(
                    `🔄 Restarting container for room: ${roomId}`
                );

                try {

                    await result.container.restart({
                        t: 10,
                    });

                    await this.waitUntilRunning(
                        result.container,
                        10000
                    );

                    await this.ensureWorkspace(
                        result.container
                    );

                    /*
                    |--------------------------------------------------------------------------
                    | Re-fetch container after restart.
                    |--------------------------------------------------------------------------
                    |
                    | Docker container ID should remain the same, but fetching again
                    | guarantees we return a valid current Docker handle.
                    |--------------------------------------------------------------------------
                    */

                    const refreshed =
                        await this.findContainer(
                            roomId
                        );

                    if (refreshed) {

                        result =
                            refreshed;
                    }

                    console.log(
                        `✅ Container restarted: ${result.container.id}`
                    );

                    return this.toRoomContainer(
                        roomId,
                        result.container
                    );

                } catch (error) {

                    throw new Error(
                        `Failed to restart container for room ${roomId}: ${this.getErrorMessage(
                            error
                        )}`
                    );
                }
            }
        );
    }

    /*
    |--------------------------------------------------------------------------
    | Remove Container
    |--------------------------------------------------------------------------
    |
    | Removes the room container.
    |
    |--------------------------------------------------------------------------
    */

    async removeContainer(
        roomId: string,
        force = false
    ): Promise<boolean> {

        if (!roomId) {

            throw new Error(
                "roomId is required"
            );
        }

        return this.withRoomLock(
            roomId,
            async () => {

                const result =
                    await this.findContainer(
                        roomId
                    );

                if (!result) {

                    return false;
                }

                const {
                    container,
                } = result;

                console.log(
                    `🗑️ Removing container for room: ${roomId}`
                );

                try {

                    await container.remove({
                        force,
                    });

                    console.log(
                        `✅ Container removed for room: ${roomId}`
                    );

                    return true;

                } catch (error) {

                    throw new Error(
                        `Failed to remove container for room ${roomId}: ${this.getErrorMessage(
                            error
                        )}`
                    );
                }
            }
        );
    }

    /*
    |--------------------------------------------------------------------------
    | Force Remove Container
    |--------------------------------------------------------------------------
    */

    async forceRemoveContainer(
        roomId: string
    ): Promise<boolean> {

        if (!roomId) {

            throw new Error(
                "roomId is required"
            );
        }

        return this.withRoomLock(
            roomId,
            async () => {

                const result =
                    await this.findContainer(
                        roomId
                    );

                if (!result) {

                    return false;
                }

                console.log(
                    `🗑️ Force removing container for room: ${roomId}`
                );

                try {

                    await result.container.remove({
                        force: true,
                    });

                    console.log(
                        `✅ Container force removed for room: ${roomId}`
                    );

                    return true;

                } catch (error) {

                    /*
                    |--------------------------------------------------------------------------
                    | Docker may report "no such container" if it was already
                    | removed by another process.
                    |--------------------------------------------------------------------------
                    */

                    const message =
                        this.getErrorMessage(
                            error
                        ).toLowerCase();

                    if (
                        message.includes(
                            "no such container"
                        )
                    ) {

                        return true;
                    }

                    throw new Error(
                        `Failed to force remove container for room ${roomId}: ${this.getErrorMessage(
                            error
                        )}`
                    );
                }
            }
        );
    }

    /*
    |--------------------------------------------------------------------------
    | Get Container
    |--------------------------------------------------------------------------
    */

    async getContainer(
        roomId: string
    ): Promise<RoomContainer | null> {

        if (!roomId) {

            return null;
        }

        const result =
            await this.findContainer(
                roomId
            );

        if (!result) {

            return null;
        }

        return this.toRoomContainer(
            roomId,
            result.container
        );
    }

    /*
    |--------------------------------------------------------------------------
    | Find Container
    |--------------------------------------------------------------------------
    |
    | Search order:
    |
    | 1. CodeBuddy room label
    | 2. Deterministic container name
    |
    |--------------------------------------------------------------------------
    */

    async findContainer(
        roomId: string
    ): Promise<RoomContainer | null> {

        if (
            !roomId ||
            typeof roomId !== "string"
        ) {

            return null;
        }

        /*
        |--------------------------------------------------------------------------
        | First search by room label.
        |--------------------------------------------------------------------------
        */

        try {

            const labeled =
                await getRoomContainer(
                    roomId
                );

            if (labeled) {

                return this.toRoomContainer(
                    roomId,
                    labeled
                );
            }

        } catch (error) {

            console.warn(
                `⚠️ Failed label lookup for room ${roomId}: ${this.getErrorMessage(
                    error
                )}`
            );
        }

        /*
        |--------------------------------------------------------------------------
        | Fallback to deterministic container name.
        |--------------------------------------------------------------------------
        */

        try {

            const named =
                await getRoomContainerByName(
                    roomId
                );

            if (named) {

                return this.toRoomContainer(
                    roomId,
                    named
                );
            }

        } catch (error) {

            console.warn(
                `⚠️ Failed name lookup for room ${roomId}: ${this.getErrorMessage(
                    error
                )}`
            );
        }

        return null;
    }

    /*
    |--------------------------------------------------------------------------
    | Get Container By Name
    |--------------------------------------------------------------------------
    */

    async getContainerByName(
        containerName: string
    ): Promise<Docker.Container | null> {

        if (
            !containerName ||
            typeof containerName !== "string"
        ) {

            return null;
        }

        try {

            const container =
                docker.getContainer(
                    containerName
                );

            await container.inspect();

            return container;

        } catch {

            return null;
        }
    }

    /*
    |--------------------------------------------------------------------------
    | Container Status
    |--------------------------------------------------------------------------
    */

    async getStatus(
        roomId: string
    ): Promise<ContainerStatus> {

        if (!roomId) {

            throw new Error(
                "roomId is required"
            );
        }

        const containerName =
            getRoomContainerName(
                roomId
            );

        const result =
            await this.findContainer(
                roomId
            );

        if (!result) {

            return {
                roomId,
                containerId: null,
                containerName,
                exists: false,
                running: false,
                paused: false,
                restarting: false,
                status: "not_found",
            };
        }

        try {

            const inspection =
                await result.container.inspect();

            /*
            |--------------------------------------------------------------------------
            | Docker returns container names with a leading "/".
            |--------------------------------------------------------------------------
            */

            const inspectedName =
                inspection.Name
                    ? inspection.Name.replace(
                        /^\//,
                        ""
                    )
                    : containerName;

            return {
                roomId,
                containerId:
                    inspection.Id,
                containerName:
                    inspectedName,
                exists: true,
                running:
                    inspection.State.Running,
                paused:
                    inspection.State.Paused,
                restarting:
                    inspection.State.Restarting,
                status:
                    inspection.State.Status,
                createdAt:
                    inspection.Created,
            };

        } catch (error) {

            /*
            |--------------------------------------------------------------------------
            | Container could disappear between find and inspect.
            |--------------------------------------------------------------------------
            */

            const current =
                await this.findContainer(
                    roomId
                );

            if (!current) {

                return {
                    roomId,
                    containerId: null,
                    containerName,
                    exists: false,
                    running: false,
                    paused: false,
                    restarting: false,
                    status: "not_found",
                };
            }

            throw new Error(
                `Failed to inspect room container ${roomId}: ${this.getErrorMessage(
                    error
                )}`
            );
        }
    }

    /*
    |--------------------------------------------------------------------------
    | Is Running
    |--------------------------------------------------------------------------
    */

    async isRunning(
        roomId: string
    ): Promise<boolean> {

        const status =
            await this.getStatus(
                roomId
            );

        return (
            status.exists &&
            status.running
        );
    }

    /*
    |--------------------------------------------------------------------------
    | Wait Until Running
    |--------------------------------------------------------------------------
    */

    async waitUntilRunning(
        container: Docker.Container,
        timeoutMs = 10000
    ): Promise<void> {

        const start =
            Date.now();

        let lastError: unknown = null;

        while (
            Date.now() - start <
            timeoutMs
        ) {

            try {

                const inspection =
                    await container.inspect();

                lastError = null;

                if (
                    inspection.State.Running
                ) {

                    return;
                }

                /*
                |--------------------------------------------------------------------------
                | OOM must be checked before generic dead state handling.
                |--------------------------------------------------------------------------
                */

                if (
                    inspection.State.OOMKilled
                ) {

                    throw new Error(
                        "Container was killed because of out-of-memory condition"
                    );
                }

                if (
                    inspection.State.Dead
                ) {

                    const exitCode =
                        inspection.State.ExitCode;

                    const errorMessage =
                        inspection.State.Error;

                    throw new Error(
                        `Container entered dead state${
                            exitCode !== undefined
                                ? ` with exit code ${exitCode}`
                                : ""
                        }${
                            errorMessage
                                ? `: ${errorMessage}`
                                : ""
                        }`
                    );
                }

            } catch (error) {

                /*
                |--------------------------------------------------------------------------
                | Do not silently swallow lifecycle errors.
                |--------------------------------------------------------------------------
                */

                if (
                    error instanceof Error &&
                    (
                        error.message.includes(
                            "dead state"
                        ) ||
                        error.message.includes(
                            "out-of-memory"
                        )
                    )
                ) {

                    throw error;
                }

                lastError =
                    error;
            }

            await this.sleep(200);
        }

        const suffix =
            lastError
                ? ` Last Docker error: ${this.getErrorMessage(
                    lastError
                )}`
                : "";

        throw new Error(
            `Container ${container.id} did not become running within ${timeoutMs}ms.${suffix}`
        );
    }

    /*
    |--------------------------------------------------------------------------
    | Ensure Workspace
    |--------------------------------------------------------------------------
    |
    | Creates /workspace if it doesn't exist.
    |
    |--------------------------------------------------------------------------
    */

    async ensureWorkspace(
        container: Docker.Container
    ): Promise<void> {

        /*
        |--------------------------------------------------------------------------
        | Make sure container is running.
        |--------------------------------------------------------------------------
        */

        let inspection:
            Docker.ContainerInspectInfo;

        try {

            inspection =
                await container.inspect();

        } catch (error) {

            throw new Error(
                `Failed to inspect container ${container.id}: ${this.getErrorMessage(
                    error
                )}`
            );
        }

        if (
            !inspection.State.Running
        ) {

            throw new Error(
                `Cannot create workspace because container ${container.id} is not running`
            );
        }

        const workspacePath =
            this.escapeShellArgument(
                CONTAINER_CONFIG.workspacePath
            );

        const command = [
            "sh",
            "-c",
            `mkdir -p '${workspacePath}'`,
        ];

        const exec =
            await container.exec({
                Cmd: command,
                AttachStdout: true,
                AttachStderr: true,
                WorkingDir:
                    CONTAINER_CONFIG.workspacePath,
            });

        const stream =
            await exec.start({
                hijack: true,
                stdin: false,
                Tty: false,
            });

        await new Promise<void>(
            (
                resolve,
                reject
            ) => {

                let settled = false;

                const finishSuccess =
                    () => {

                        if (settled) {

                            return;
                        }

                        settled = true;

                        resolve();
                    };

                const finishError =
                    (
                        error: Error
                    ) => {

                        if (settled) {

                            return;
                        }

                        settled = true;

                        reject(error);
                    };

                stream.on(
                    "end",
                    finishSuccess
                );

                stream.on(
                    "close",
                    finishSuccess
                );

                stream.on(
                    "error",
                    finishError
                );
            }
        );

        const inspectionResult =
            await exec.inspect();

        if (
            inspectionResult.ExitCode !== 0
        ) {

            throw new Error(
                `Failed to create workspace inside container ${container.id}. Exit code: ${inspectionResult.ExitCode}`
            );
        }
    }

    /*
    |--------------------------------------------------------------------------
    | Ensure Docker Image
    |--------------------------------------------------------------------------
    */

    async ensureImage(): Promise<void> {

        try {

            const image =
                docker.getImage(
                    WORKER_IMAGE
                );

            await image.inspect();

            return;

        } catch {

            throw new Error(
                `Docker image "${WORKER_IMAGE}" was not found. Build the CodeBuddy runtime image before creating room containers.`
            );
        }
    }

    /*
    |--------------------------------------------------------------------------
    | Ensure Docker Network
    |--------------------------------------------------------------------------
    */

    async ensureNetwork(): Promise<void> {

        try {

            const networks =
                await docker.listNetworks({
                    filters: JSON.stringify({
                        name: [
                            DOCKER_NETWORK,
                        ],
                    }),
                });

            const exists =
                networks.some(
                    (network: {
                        Name?: string;
                        name?: string;
                    }) =>
                        network.Name ===
                            DOCKER_NETWORK ||
                        network.name ===
                            DOCKER_NETWORK
                );

            if (exists) {

                return;
            }

            await docker.createNetwork({
                Name:
                    DOCKER_NETWORK,
                Driver:
                    "bridge",
                Attachable:
                    true,
                Internal:
                    false,
                Labels: {
                    "codebuddy.managed":
                        "true",
                    "codebuddy.network":
                        "true",
                },
            });

            console.log(
                `🌐 Docker network created: ${DOCKER_NETWORK}`
            );

        } catch (error) {

            /*
            * Another process may have created the network
            * between listNetworks() and createNetwork().
            *
            * Verify before failing.
            */

            const networks =
                await docker.listNetworks({
                    filters: JSON.stringify({
                        name: [
                            DOCKER_NETWORK,
                        ],
                    }),
                });

            const exists =
                networks.some(
                    (network: {
                        Name?: string;
                        name?: string;
                    }) =>
                        network.Name ===
                            DOCKER_NETWORK ||
                        network.name ===
                            DOCKER_NETWORK
                );

            if (!exists) {

                throw new Error(
                    `Failed to create Docker network "${DOCKER_NETWORK}": ${this.getErrorMessage(
                        error
                    )}`
                );
            }
        }
    }

    /*
    |--------------------------------------------------------------------------
    | Pause Container
    |--------------------------------------------------------------------------
    */

    async pauseContainer(
        roomId: string
    ): Promise<boolean> {

        if (!roomId) {

            throw new Error(
                "roomId is required"
            );
        }

        return this.withRoomLock(
            roomId,
            async () => {

                const result =
                    await this.findContainer(
                        roomId
                    );

                if (!result) {

                    return false;
                }

                const inspection =
                    await result.container.inspect();

                if (
                    !inspection.State.Running
                ) {

                    return false;
                }

                if (
                    inspection.State.Paused
                ) {

                    return true;
                }

                try {

                    await result.container.pause();

                    return true;

                } catch (error) {

                    throw new Error(
                        `Failed to pause container for room ${roomId}: ${this.getErrorMessage(
                            error
                        )}`
                    );
                }
            }
        );
    }

    /*
    |--------------------------------------------------------------------------
    | Unpause Container
    |--------------------------------------------------------------------------
    */

    async unpauseContainer(
        roomId: string
    ): Promise<boolean> {

        if (!roomId) {

            throw new Error(
                "roomId is required"
            );
        }

        return this.withRoomLock(
            roomId,
            async () => {

                const result =
                    await this.findContainer(
                        roomId
                    );

                if (!result) {

                    return false;
                }

                const inspection =
                    await result.container.inspect();

                if (
                    !inspection.State.Paused
                ) {

                    return true;
                }

                try {

                    await result.container.unpause();

                    return true;

                } catch (error) {

                    throw new Error(
                        `Failed to unpause container for room ${roomId}: ${this.getErrorMessage(
                            error
                        )}`
                    );
                }
            }
        );
    }

    /*
    |--------------------------------------------------------------------------
    | Escape Shell Argument
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

    /*
    |--------------------------------------------------------------------------
    | Convert Docker Container
    |--------------------------------------------------------------------------
    */

    private toRoomContainer(
        roomId: string,
        container: Docker.Container
    ): RoomContainer {

        return {
            roomId,
            containerId:
                container.id,
            containerName:
                getRoomContainerName(
                    roomId
                ),
            container,
        };
    }

    /*
    |--------------------------------------------------------------------------
    | Error Helper
    |--------------------------------------------------------------------------
    */

    private getErrorMessage(
        error: unknown
    ): string {

        if (
            error instanceof Error
        ) {

            return error.message;
        }

        if (
            typeof error ===
            "string"
        ) {

            return error;
        }

        if (
            error &&
            typeof error ===
                "object"
        ) {

            const dockerError =
                error as {
                    statusCode?: number;
                    reason?: string;
                    message?: string;
                };

            if (
                dockerError.message
            ) {

                return dockerError.statusCode
                    ? `${dockerError.statusCode}: ${dockerError.message}`
                    : dockerError.message;
            }

            if (
                dockerError.reason
            ) {

                return dockerError.statusCode
                    ? `${dockerError.statusCode}: ${dockerError.reason}`
                    : dockerError.reason;
            }
        }

        try {

            const serialized =
                JSON.stringify(
                    error
                );

            if (
                serialized &&
                serialized !== "{}"
            ) {

                return serialized;
            }

        } catch {

            // Ignore serialization failure.

        }

        return "Unknown Docker error";
    }
}

/*
|--------------------------------------------------------------------------
| Singleton
|--------------------------------------------------------------------------
|
| Every part of worker-service uses the same lifecycle manager.
|
|--------------------------------------------------------------------------
*/

export const containerLifecycle =
    new ContainerLifecycle();

export default containerLifecycle;