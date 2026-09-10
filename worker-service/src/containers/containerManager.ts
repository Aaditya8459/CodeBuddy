import Docker from "dockerode";

import path from "path";

import {
    CONTAINER_CONFIG,
} from "../config/docker.js";

import {
    containerLifecycle,
} from "./containerLifecycle.js";

import type {
    RoomContainer,
    ContainerStatus,
} from "./containerLifecycle.js";

/*
|--------------------------------------------------------------------------
| Types
|--------------------------------------------------------------------------
*/

export interface RoomWorkspace {
    root: string;
    source: string;
    datasets: string;
    documents: string;
    projects: string;
    temp: string;
    bin: string;
    logs: string;
}

export interface RoomContainerInfo {
    roomId: string;
    containerId: string;
    containerName: string;
    running: boolean;
    container: Docker.Container;
    workspace: RoomWorkspace;
}

export interface RoomContainerOptions {
    startIfStopped?: boolean;
    initializeWorkspace?: boolean;
}

export interface WorkspaceDirectory {
    name: string;
    path: string;
}

/*
|--------------------------------------------------------------------------
| Container Manager
|--------------------------------------------------------------------------
|
| High-level CodeBuddy room/container manager.
|
| Responsibilities:
|
| - Create room container
| - Ensure room container
| - Initialize workspace
| - Start/stop/restart container
| - Remove room container
| - Check room status
| - Return Docker container
| - Manage room workspace directories
|
| NOT responsible for:
|
| - Compiling code
| - Running code
| - Terminal execution
| - File upload parsing
| - Queue processing
| - Language detection
|
| Those responsibilities belong to:
|
| execution/
| terminal/
| workspace/
| queue/
|
|--------------------------------------------------------------------------
*/

class ContainerManager {

    /*
    |--------------------------------------------------------------------------
    | Workspace Paths
    |--------------------------------------------------------------------------
    */

    private readonly workspaceRoot =
        CONTAINER_CONFIG.workspacePath;

    /*
    |--------------------------------------------------------------------------
    | Room ID Validation
    |--------------------------------------------------------------------------
    |
    | Room IDs are used in Docker labels and filesystem-related
    | operations. Only safe characters are allowed.
    |
    */

    private validateRoomId(
        roomId: string
    ): void {

        if (
            !roomId ||
            typeof roomId !== "string"
        ) {
            throw new Error(
                "roomId is required"
            );
        }

        const normalized =
            roomId.trim();

        if (
            normalized.length === 0
        ) {
            throw new Error(
                "roomId cannot be empty"
            );
        }

        if (
            normalized.length > 128
        ) {
            throw new Error(
                "roomId cannot exceed 128 characters"
            );
        }

        /*
         * Allow MongoDB/ObjectId-style IDs,
         * UUIDs, and normal CodeBuddy room IDs.
         */

        if (
            !/^[a-zA-Z0-9_.:-]+$/.test(
                normalized
            )
        ) {
            throw new Error(
                "Invalid roomId. Only letters, numbers, -, _, ., : are allowed."
            );
        }
    }

    /*
    |--------------------------------------------------------------------------
    | Create Room
    |--------------------------------------------------------------------------
    */

    async createRoomContainer(
        roomId: string
    ): Promise<RoomContainerInfo> {

        this.validateRoomId(
            roomId
        );

        const roomContainer =
            await containerLifecycle.createContainer(
                roomId
            );

        await this.initializeWorkspace(
            roomContainer.container
        );

        return this.toRoomInfo(
            roomId,
            roomContainer
        );
    }

    /*
    |--------------------------------------------------------------------------
    | Ensure Room
    |--------------------------------------------------------------------------
    |
    | This should be the primary entry point used by:
    |
    | - executeController
    | - terminal
    | - workspace
    | - upload
    | - AI services
    |
    */

    async ensureRoom(
        roomId: string,
        options: RoomContainerOptions = {}
    ): Promise<RoomContainerInfo> {

        this.validateRoomId(
            roomId
        );

        const {
            startIfStopped = true,
            initializeWorkspace = true,
        } = options;

        const roomContainer =
            await containerLifecycle.ensureContainer(
                roomId,
                {
                    startIfStopped,
                    ensureWorkspace:
                        initializeWorkspace,
                }
            );

        if (initializeWorkspace) {
            await this.initializeWorkspace(
                roomContainer.container
            );
        }

        return this.toRoomInfo(
            roomId,
            roomContainer
        );
    }

    /*
    |--------------------------------------------------------------------------
    | Get Room Container
    |--------------------------------------------------------------------------
    */

    async getRoomContainer(
        roomId: string
    ): Promise<RoomContainer | null> {

        this.validateRoomId(
            roomId
        );

        return containerLifecycle.getContainer(
            roomId
        );
    }

    /*
    |--------------------------------------------------------------------------
    | Require Room Container
    |--------------------------------------------------------------------------
    |
    | Unlike getRoomContainer(), this throws when the room
    | doesn't exist.
    |
    */

    async requireRoomContainer(
        roomId: string
    ): Promise<RoomContainer> {

        this.validateRoomId(
            roomId
        );

        const container =
            await this.getRoomContainer(
                roomId
            );

        if (!container) {
            throw new Error(
                `Container for room "${roomId}" does not exist`
            );
        }

        return container;
    }

    /*
    |--------------------------------------------------------------------------
    | Start Room
    |--------------------------------------------------------------------------
    */

    async startRoom(
        roomId: string
    ): Promise<RoomContainerInfo> {

        this.validateRoomId(
            roomId
        );

        /*
         * ensureRoom() already handles:
         *
         * - container lookup
         * - creation
         * - duplicate prevention
         * - stopped container startup
         * - workspace initialization
         *
         * Therefore there is no need to duplicate those
         * operations here.
         */

        return this.ensureRoom(
            roomId,
            {
                startIfStopped: true,
                initializeWorkspace: true,
            }
        );
    }

    /*
    |--------------------------------------------------------------------------
    | Stop Room
    |--------------------------------------------------------------------------
    */

    async stopRoom(
        roomId: string
    ): Promise<boolean> {

        this.validateRoomId(
            roomId
        );

        return containerLifecycle.stopContainer(
            roomId
        );
    }

    /*
    |--------------------------------------------------------------------------
    | Restart Room
    |--------------------------------------------------------------------------
    */

    async restartRoom(
        roomId: string
    ): Promise<RoomContainerInfo> {

        this.validateRoomId(
            roomId
        );

        const room =
            await containerLifecycle.restartContainer(
                roomId
            );

        /*
         * restartContainer() guarantees that the
         * container is running and /workspace exists.
         *
         * We intentionally do NOT recreate any
         * predefined CodeBuddy directories here.
         */

        await this.initializeWorkspace(
            room.container
        );

        return this.toRoomInfo(
            roomId,
            room
        );
    }

    /*
    |--------------------------------------------------------------------------
    | Delete Room
    |--------------------------------------------------------------------------
    |
    | This is destructive.
    |
    | When the room container is removed, files stored only
    | inside its writable container filesystem are removed.
    |
    | Persistent storage should eventually be handled by
    | the workspace/storage layer if required.
    |
    */

    async deleteRoom(
        roomId: string
    ): Promise<boolean> {

        this.validateRoomId(
            roomId
        );

        return containerLifecycle.removeContainer(
            roomId
        );
    }

    /*
    |--------------------------------------------------------------------------
    | Force Delete Room
    |--------------------------------------------------------------------------
    */

    async forceDeleteRoom(
        roomId: string
    ): Promise<boolean> {

        this.validateRoomId(
            roomId
        );

        return containerLifecycle.forceRemoveContainer(
            roomId
        );
    }

    /*
    |--------------------------------------------------------------------------
    | Restart If Required
    |--------------------------------------------------------------------------
    */

    async ensureRoomRunning(
        roomId: string
    ): Promise<RoomContainerInfo> {

        this.validateRoomId(
            roomId
        );

        return this.ensureRoom(
            roomId,
            {
                startIfStopped: true,
                initializeWorkspace: true,
            }
        );
    }

    /*
    |--------------------------------------------------------------------------
    | Room Exists
    |--------------------------------------------------------------------------
    */

    async roomExists(
        roomId: string
    ): Promise<boolean> {

        this.validateRoomId(
            roomId
        );

        const room =
            await containerLifecycle.getContainer(
                roomId
            );

        return room !== null;
    }

    /*
    |--------------------------------------------------------------------------
    | Room Is Running
    |--------------------------------------------------------------------------
    */

    async roomIsRunning(
        roomId: string
    ): Promise<boolean> {

        this.validateRoomId(
            roomId
        );

        return containerLifecycle.isRunning(
            roomId
        );
    }

    /*
    |--------------------------------------------------------------------------
    | Room Status
    |--------------------------------------------------------------------------
    */

    async getRoomStatus(
        roomId: string
    ): Promise<ContainerStatus> {

        this.validateRoomId(
            roomId
        );

        return containerLifecycle.getStatus(
            roomId
        );
    }

    /*
    |--------------------------------------------------------------------------
    | Workspace Initialization
    |--------------------------------------------------------------------------
    |
    | A new CodeBuddy room starts with ONLY:
    |
    | /workspace
    |
    | No src/
    | No datasets/
    | No documents/
    | No projects/
    | No .codebuddy/
    |
    | These directories will only be created when the
    | user explicitly creates them or when another
    | CodeBuddy operation requires them.
    |
    */

    async initializeWorkspace(
        container: Docker.Container
    ): Promise<void> {

        const command = [
            "sh",
            "-c",
            [
                /*
                 * Create only the workspace root.
                 */
                `mkdir -p '${this.escapeShellArgument(
                    this.workspaceRoot
                )}'`,

                /*
                 * Workspace permissions are intentionally
                 * controlled inside the container.
                 */
                `chmod -R u+rwX '${this.escapeShellArgument(
                    this.workspaceRoot
                )}'`,
            ].join(" && "),
        ];

        await this.execSimpleCommand(
            container,
            command
        );
    }

    /*
    |--------------------------------------------------------------------------
    | Get Workspace Structure
    |--------------------------------------------------------------------------
    |
    | These are logical paths only.
    |
    | They are NOT automatically created.
    |
    */

    getWorkspace(
        roomId: string
    ): RoomWorkspace {

        this.validateRoomId(
            roomId
        );

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
    | Get Workspace Directories
    |--------------------------------------------------------------------------
    |
    | No directories are automatically created.
    |
    | Therefore this method returns an empty list.
    |
    */

    getWorkspaceDirectories():
        WorkspaceDirectory[] {

        return [];
    }

    /*
    |--------------------------------------------------------------------------
    | Ensure Workspace Directory
    |--------------------------------------------------------------------------
    |
    | This method is used when a specific directory is
    | explicitly requested.
    |
    */

    async ensureWorkspaceDirectory(
        roomId: string,
        directory: string
    ): Promise<void> {

        this.validateRoomId(
            roomId
        );

        const room =
            await containerLifecycle.ensureContainer(
                roomId,
                {
                    startIfStopped: true,
                    ensureWorkspace: true,
                }
            );

        const safePath =
            this.resolveWorkspacePath(
                directory
            );

        const command = [
            "sh",
            "-c",
            `mkdir -p '${this.escapeShellArgument(
                safePath
            )}'`,
        ];

        await this.execSimpleCommand(
            room.container,
            command
        );
    }

    /*
    |--------------------------------------------------------------------------
    | Resolve Workspace Path
    |--------------------------------------------------------------------------
    |
    | Prevent paths from escaping /workspace.
    |
    | Example:
    |
    | valid:
    |
    | /workspace/src/main.py
    |
    | invalid:
    |
    | /etc/passwd
    | ../../etc/passwd
    |
    |--------------------------------------------------------------------------
    */

    resolveWorkspacePath(
        requestedPath: string
    ): string {

        if (
            !requestedPath ||
            typeof requestedPath !== "string"
        ) {
            throw new Error(
                "Workspace path is required"
            );
        }

        /*
         * Convert Windows path separators to
         * POSIX separators before normalization.
         */

        const normalizedInput =
            requestedPath
                .trim()
                .replace(/\\/g, "/");

        if (
            normalizedInput.length === 0
        ) {
            throw new Error(
                "Workspace path cannot be empty"
            );
        }

        /*
         * Do not allow absolute paths outside the
         * configured workspace.
         */

        const resolved =
            path.posix.normalize(
                normalizedInput.startsWith("/")
                    ? normalizedInput
                    : `${this.workspaceRoot}/${normalizedInput}`
            );

        /*
         * Ensure the workspace root itself is valid.
         */

        const normalizedRoot =
            path.posix.normalize(
                this.workspaceRoot
            );

        if (
            resolved !== normalizedRoot &&
            !resolved.startsWith(
                `${normalizedRoot}/`
            )
        ) {
            throw new Error(
                "Path must remain inside the room workspace"
            );
        }

        return resolved;
    }

    /*
    |--------------------------------------------------------------------------
    | Create Project Directory
    |--------------------------------------------------------------------------
    */

    async createProjectDirectory(
        roomId: string,
        projectName: string
    ): Promise<string> {

        this.validateRoomId(
            roomId
        );

        if (
            !projectName ||
            typeof projectName !==
                "string"
        ) {
            throw new Error(
                "projectName is required"
            );
        }

        projectName =
            projectName.trim();

        /*
         * Project names cannot contain path separators.
         */

        if (
            projectName === "." ||
            projectName === ".." ||
            !/^[a-zA-Z0-9._-]+$/.test(
                projectName
            )
        ) {
            throw new Error(
                "Invalid project name. Only letters, numbers, -, _, and . are allowed."
            );
        }

        if (
            projectName.length > 128
        ) {
            throw new Error(
                "Project name cannot exceed 128 characters"
            );
        }

        const projectPath =
            this.resolveWorkspacePath(
                `projects/${projectName}`
            );

        const room =
            await this.ensureRoomRunning(
                roomId
            );

        await this.execSimpleCommand(
            room.container,
            [
                "sh",
                "-c",
                `mkdir -p '${this.escapeShellArgument(
                    projectPath
                )}'`,
            ]
        );

        return projectPath;
    }

    /*
    |--------------------------------------------------------------------------
    | Clear Temporary Files
    |--------------------------------------------------------------------------
    |
    | Does NOT delete source files, datasets, documents,
    | or projects.
    |
    | Temporary directories are created only if they
    | already exist or are explicitly required.
    |
    */

    async clearTemporaryFiles(
        roomId: string
    ): Promise<void> {

        this.validateRoomId(
            roomId
        );

        const room =
            await this.ensureRoomRunning(
                roomId
            );

        const temp =
            `${this.workspaceRoot}/.codebuddy/temp`;

        const bin =
            `${this.workspaceRoot}/.codebuddy/bin`;

        await this.execSimpleCommand(
            room.container,
            [
                "sh",
                "-c",
                [
                    /*
                     * Remove temporary files only if
                     * the directories exist.
                     */
                    `if [ -d '${this.escapeShellArgument(
                        temp
                    )}' ]; then rm -rf '${this.escapeShellArgument(
                        temp
                    )}'/*; fi`,

                    `if [ -d '${this.escapeShellArgument(
                        bin
                    )}' ]; then rm -rf '${this.escapeShellArgument(
                        bin
                    )}'/*; fi`,
                ].join(" && "),
            ]
        );
    }

    /*
    |--------------------------------------------------------------------------
    | Container Resource Information
    |--------------------------------------------------------------------------
    */

    async getContainerStats(
        roomId: string
    ): Promise<{
        cpuPercent: number;
        memoryUsage: number;
        memoryLimit: number;
        memoryPercent: number;
    }> {

        this.validateRoomId(
            roomId
        );

        const room =
            await this.requireRoomContainer(
                roomId
            );

        const inspection =
            await room.container.inspect();

        if (
            !inspection.State.Running
        ) {
            return {
                cpuPercent: 0,
                memoryUsage: 0,
                memoryLimit: 0,
                memoryPercent: 0,
            };
        }

        const stats =
            await room.container.stats({
                stream: false,
            });

        /*
         * Docker can occasionally return missing
         * CPU statistics depending on runtime/platform.
         */

        const cpuUsage =
            stats.cpu_stats?.cpu_usage
                ?.total_usage ?? 0;

        const previousCpuUsage =
            stats.precpu_stats?.cpu_usage
                ?.total_usage ?? 0;

        const cpuDelta =
            Math.max(
                0,
                cpuUsage -
                    previousCpuUsage
            );

        const systemUsage =
            stats.cpu_stats
                ?.system_cpu_usage ?? 0;

        const previousSystemUsage =
            stats.precpu_stats
                ?.system_cpu_usage ?? 0;

        const systemDelta =
            Math.max(
                0,
                systemUsage -
                    previousSystemUsage
            );

        const onlineCpus =
            stats.cpu_stats
                ?.online_cpus ||
            1;

        let cpuPercent = 0;

        if (
            systemDelta > 0 &&
            cpuDelta > 0
        ) {
            cpuPercent =
                (cpuDelta /
                    systemDelta) *
                onlineCpus *
                100;
        }

        const memoryUsage =
            Number(
                stats.memory_stats?.usage ||
                    0
            );

        const memoryLimit =
            Number(
                stats.memory_stats?.limit ||
                    0
            );

        const memoryPercent =
            memoryLimit > 0
                ? (memoryUsage /
                      memoryLimit) *
                  100
                : 0;

        return {
            cpuPercent:
                Number(
                    cpuPercent.toFixed(
                        2
                    )
                ),

            memoryUsage,

            memoryLimit,

            memoryPercent:
                Number(
                    memoryPercent.toFixed(
                        2
                    )
                ),
        };
    }

    /*
    |--------------------------------------------------------------------------
    | Execute Simple Container Command
    |--------------------------------------------------------------------------
    |
    | This is intentionally private.
    |
    | It is only used for internal container-management tasks:
    |
    | - mkdir
    | - chmod
    | - cleanup
    |
    | Actual user code execution will use the execution service.
    |
    */

    private async execSimpleCommand(
        container: Docker.Container,
        command: string[]
    ): Promise<void> {

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

        await new Promise<void>(
            (
                resolve,
                reject
            ) => {

                let settled =
                    false;

                const finishSuccess =
                    () => {

                        if (
                            settled
                        ) {
                            return;
                        }

                        settled = true;

                        resolve();
                    };

                const finishError =
                    (
                        error: Error
                    ) => {

                        if (
                            settled
                        ) {
                            return;
                        }

                        settled = true;

                        reject(
                            error
                        );
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

        const inspection =
            await exec.inspect();

        if (
            inspection.ExitCode !==
            0
        ) {
            throw new Error(
                `Container command failed with exit code ${inspection.ExitCode}`
            );
        }
    }

    /*
    |--------------------------------------------------------------------------
    | Shell Argument Escape
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
    | Convert Room Container
    |--------------------------------------------------------------------------
    */

    private async toRoomInfo(
        roomId: string,
        roomContainer: RoomContainer
    ): Promise<RoomContainerInfo> {

        const inspection =
            await roomContainer.container.inspect();

        return {
            roomId,

            containerId:
                roomContainer.containerId,

            containerName:
                roomContainer.containerName,

            running:
                inspection.State.Running,

            container:
                roomContainer.container,

            workspace:
                this.getWorkspace(
                    roomId
                ),
        };
    }
}

/*
|--------------------------------------------------------------------------
| Singleton
|--------------------------------------------------------------------------
*/

export const containerManager =
    new ContainerManager();

export default containerManager;