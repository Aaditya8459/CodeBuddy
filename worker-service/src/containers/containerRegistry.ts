import Docker from "dockerode";

import {
    containerLifecycle,
    RoomContainer,
    ContainerStatus,
} from "./containerLifecycle.js";

/*
|--------------------------------------------------------------------------
| Types
|--------------------------------------------------------------------------
*/

export interface RegisteredContainer {
    roomId: string;
    containerId: string;
    containerName: string;
    container: Docker.Container;

    createdAt: Date;
    lastAccessedAt: Date;

    /*
     * Number of active operations currently using this
     * room container.
     *
     * This is useful later for execution queues and terminal
     * sessions.
     */
    activeOperations: number;
}

export interface RegistryStats {
    total: number;
    running: number;
    stopped: number;
    activeOperations: number;
}

export interface RegistryEntry {
    roomId: string;
    containerId: string;
    containerName: string;
    running: boolean;
    activeOperations: number;
    createdAt: Date;
    lastAccessedAt: Date;
}

/*
|--------------------------------------------------------------------------
| Container Registry
|--------------------------------------------------------------------------
|
| The registry maintains a fast in-memory mapping:
|
|     roomId → Docker container
|
| Example:
|
|     room-a → codebuddy-room-room-a
|     room-b → codebuddy-room-room-b
|     room-c → codebuddy-room-room-c
|
| IMPORTANT:
|
| This registry is NOT the source of truth.
|
| Docker is the actual source of truth.
|
| If worker-service restarts:
|
|     Registry → empty
|     Docker   → containers still exist
|
| The registry can therefore rebuild itself from Docker.
|
|--------------------------------------------------------------------------
*/

class ContainerRegistry {
    /*
    |--------------------------------------------------------------------------
    | Internal Map
    |--------------------------------------------------------------------------
    */

    private readonly containers =
        new Map<string, RegisteredContainer>();

    /*
    |--------------------------------------------------------------------------
    | Register Container
    |--------------------------------------------------------------------------
    */

    register(
        roomId: string,
        roomContainer: RoomContainer
    ): RegisteredContainer {
        const now = new Date();

        const existing =
            this.containers.get(
                roomId
            );

        /*
         * If the same container is already registered,
         * update its reference instead of creating a duplicate
         * registry entry.
         */
        if (
            existing &&
            existing.containerId ===
                roomContainer.containerId
        ) {
            existing.container =
                roomContainer.container;

            existing.containerName =
                roomContainer.containerName;

            existing.lastAccessedAt =
                now;

            return existing;
        }

        const entry: RegisteredContainer = {
            roomId,

            containerId:
                roomContainer.containerId,

            containerName:
                roomContainer.containerName,

            container:
                roomContainer.container,

            createdAt:
                existing?.createdAt ??
                now,

            lastAccessedAt:
                now,

            activeOperations:
                existing?.activeOperations ??
                0,
        };

        this.containers.set(
            roomId,
            entry
        );

        return entry;
    }

    /*
    |--------------------------------------------------------------------------
    | Get Container
    |--------------------------------------------------------------------------
    */

    get(
        roomId: string
    ): RegisteredContainer | null {
        const entry =
            this.containers.get(
                roomId
            );

        if (!entry) {
            return null;
        }

        entry.lastAccessedAt =
            new Date();

        return entry;
    }

    /*
    |--------------------------------------------------------------------------
    | Get Container Without Updating Access Time
    |--------------------------------------------------------------------------
    */

    peek(
        roomId: string
    ): RegisteredContainer | null {
        return (
            this.containers.get(
                roomId
            ) ?? null
        );
    }

    /*
    |--------------------------------------------------------------------------
    | Require Container
    |--------------------------------------------------------------------------
    */

    require(
        roomId: string
    ): RegisteredContainer {
        const entry =
            this.get(roomId);

        if (!entry) {
            throw new Error(
                `Container for room "${roomId}" is not registered`
            );
        }

        return entry;
    }

    /*
    |--------------------------------------------------------------------------
    | Has Container
    |--------------------------------------------------------------------------
    */

    has(
        roomId: string
    ): boolean {
        return this.containers.has(
            roomId
        );
    }

    /*
    |--------------------------------------------------------------------------
    | Remove From Registry
    |--------------------------------------------------------------------------
    |
    | IMPORTANT:
    |
    | This only removes the container from the registry.
    |
    | It does NOT remove the actual Docker container.
    |
    */

    unregister(
        roomId: string
    ): boolean {
        return this.containers.delete(
            roomId
        );
    }

    /*
    |--------------------------------------------------------------------------
    | Clear Registry
    |--------------------------------------------------------------------------
    |
    | This only clears memory.
    |
    | Docker containers remain untouched.
    |
    */

    clear(): void {
        this.containers.clear();
    }

    /*
    |--------------------------------------------------------------------------
    | Get All
    |--------------------------------------------------------------------------
    */

    getAll(): RegisteredContainer[] {
        return Array.from(
            this.containers.values()
        );
    }

    /*
    |--------------------------------------------------------------------------
    | Get All Room IDs
    |--------------------------------------------------------------------------
    */

    getRoomIds(): string[] {
        return Array.from(
            this.containers.keys()
        );
    }

    /*
    |--------------------------------------------------------------------------
    | Get Registry Size
    |--------------------------------------------------------------------------
    */

    size(): number {
        return this.containers.size;
    }

    /*
    |--------------------------------------------------------------------------
    | Mark Operation Started
    |--------------------------------------------------------------------------
    |
    | Used by execution/terminal services.
    |
    | Example:
    |
    |     registry.acquire(roomId)
    |     run code
    |     registry.release(roomId)
    |
    */

    acquire(
        roomId: string
    ): RegisteredContainer {
        const entry =
            this.require(roomId);

        entry.activeOperations +=
            1;

        entry.lastAccessedAt =
            new Date();

        return entry;
    }

    /*
    |--------------------------------------------------------------------------
    | Mark Operation Finished
    |--------------------------------------------------------------------------
    */

    release(
        roomId: string
    ): RegisteredContainer | null {
        const entry =
            this.peek(roomId);

        if (!entry) {
            return null;
        }

        entry.activeOperations =
            Math.max(
                0,
                entry.activeOperations - 1
            );

        entry.lastAccessedAt =
            new Date();

        return entry;
    }

    /*
    |--------------------------------------------------------------------------
    | Get Active Operations
    |--------------------------------------------------------------------------
    */

    getActiveOperations(
        roomId: string
    ): number {
        const entry =
            this.peek(roomId);

        return (
            entry?.activeOperations ??
            0
        );
    }

    /*
    |--------------------------------------------------------------------------
    | Is Busy
    |--------------------------------------------------------------------------
    */

    isBusy(
        roomId: string
    ): boolean {
        return (
            this.getActiveOperations(
                roomId
            ) > 0
        );
    }

    /*
    |--------------------------------------------------------------------------
    | Update Last Access
    |--------------------------------------------------------------------------
    */

    touch(
        roomId: string
    ): void {
        const entry =
            this.peek(roomId);

        if (!entry) {
            return;
        }

        entry.lastAccessedAt =
            new Date();
    }

    /*
    |--------------------------------------------------------------------------
    | Get Last Access Time
    |--------------------------------------------------------------------------
    */

    getLastAccessedAt(
        roomId: string
    ): Date | null {
        const entry =
            this.peek(roomId);

        return (
            entry?.lastAccessedAt ??
            null
        );
    }

    /*
    |--------------------------------------------------------------------------
    | Refresh Container
    |--------------------------------------------------------------------------
    |
    | Docker is treated as the source of truth.
    |
    | This checks whether the registered container still exists.
    |
    */

    async refresh(
        roomId: string
    ): Promise<RegisteredContainer | null> {
        const entry =
            this.peek(roomId);

        if (!entry) {
            return null;
        }

        try {
            const inspection =
                await entry.container.inspect();

            /*
             * Container still exists.
             */
            entry.lastAccessedAt =
                new Date();

            /*
             * If Docker reports a changed container ID,
             * replace the stale reference.
             */
            if (
                inspection.Id !==
                entry.containerId
            ) {
                entry.containerId =
                    inspection.Id;

                entry.container =
                    entry.container;
            }

            return entry;
        } catch {
            /*
             * Container no longer exists.
             */
            this.unregister(
                roomId
            );

            return null;
        }
    }

    /*
    |--------------------------------------------------------------------------
    | Ensure Registered
    |--------------------------------------------------------------------------
    |
    | If the registry doesn't contain the room, query Docker.
    |
    | This is useful after worker-service restarts.
    |
    */

    async ensureRegistered(
        roomId: string
    ): Promise<RegisteredContainer | null> {
        const existing =
            await this.refresh(
                roomId
            );

        if (existing) {
            return existing;
        }

        /*
         * Recover from Docker.
         */
        const roomContainer =
            await containerLifecycle.getContainer(
                roomId
            );

        if (!roomContainer) {
            return null;
        }

        return this.register(
            roomId,
            roomContainer
        );
    }

    /*
    |--------------------------------------------------------------------------
    | Ensure Running And Registered
    |--------------------------------------------------------------------------
    |
    | Primary method for execution/terminal layers.
    |
    */

    async ensureRunning(
        roomId: string
    ): Promise<RegisteredContainer> {
        const roomContainer =
            await containerLifecycle.ensureContainer(
                roomId,
                {
                    startIfStopped: true,
                    ensureWorkspace: true,
                }
            );

        return this.register(
            roomId,
            roomContainer
        );
    }

    /*
    |--------------------------------------------------------------------------
    | Sync With Docker
    |--------------------------------------------------------------------------
    |
    | Rebuilds registry entries for CodeBuddy room containers.
    |
    | This is useful:
    |
    | - worker startup
    | - recovery
    | - health checks
    |
    */

    async sync(): Promise<{
        registered: number;
        removed: number;
    }> {
        let registered = 0;
        let removed = 0;

        /*
         * First validate existing registry entries.
         */
        const currentRoomIds =
            this.getRoomIds();

        for (
            const roomId of currentRoomIds
        ) {
            const refreshed =
                await this.refresh(
                    roomId
                );

            if (!refreshed) {
                removed++;
            }
        }

        /*
         * Docker discovery happens through the lifecycle
         * layer when a specific room is requested.
         *
         * We intentionally don't blindly register every
         * Docker container on the host.
         */
        registered =
            this.size();

        return {
            registered,
            removed,
        };
    }

    /*
    |--------------------------------------------------------------------------
    | Remove Stale Containers
    |--------------------------------------------------------------------------
    |
    | Removes registry references that no longer exist in Docker.
    |
    | It does NOT remove Docker containers.
    |
    */

    async removeStaleEntries(): Promise<number> {
        let removed = 0;

        const roomIds =
            this.getRoomIds();

        for (
            const roomId of roomIds
        ) {
            const entry =
                this.peek(roomId);

            if (!entry) {
                continue;
            }

            try {
                await entry.container.inspect();
            } catch {
                this.unregister(
                    roomId
                );

                removed++;
            }
        }

        return removed;
    }

    /*
    |--------------------------------------------------------------------------
    | Get Container Status
    |--------------------------------------------------------------------------
    */

    async getStatus(
        roomId: string
    ): Promise<ContainerStatus> {
        return containerLifecycle.getStatus(
            roomId
        );
    }

    /*
    |--------------------------------------------------------------------------
    | Get Registry Statistics
    |--------------------------------------------------------------------------
    */

    async getStats(): Promise<RegistryStats> {
        let running = 0;
        let stopped = 0;
        let activeOperations = 0;

        for (
            const entry of this.containers.values()
        ) {
            activeOperations +=
                entry.activeOperations;

            try {
                const inspection =
                    await entry.container.inspect();

                if (
                    inspection.State.Running
                ) {
                    running++;
                } else {
                    stopped++;
                }
            } catch {
                /*
                 * Stale entry is treated as stopped
                 * for statistics.
                 */
                stopped++;
            }
        }

        return {
            total:
                this.size(),

            running,

            stopped,

            activeOperations,
        };
    }

    /*
    |--------------------------------------------------------------------------
    | Find Idle Containers
    |--------------------------------------------------------------------------
    |
    | Used later by an optional idle-container cleanup service.
    |
    | IMPORTANT:
    |
    | This method only identifies candidates.
    | It does NOT stop or remove containers.
    |
    */

    findIdleContainers(
        idleTimeMs: number
    ): RegisteredContainer[] {
        const now =
            Date.now();

        return this.getAll().filter(
            (entry) => {
                const idleTime =
                    now -
                    entry.lastAccessedAt.getTime();

                return (
                    entry.activeOperations ===
                        0 &&
                    idleTime >=
                        idleTimeMs
                );
            }
        );
    }

    /*
    |--------------------------------------------------------------------------
    | Find Busy Containers
    |--------------------------------------------------------------------------
    */

    findBusyContainers():
        RegisteredContainer[] {
        return this.getAll().filter(
            (entry) =>
                entry.activeOperations >
                0
        );
    }

    /*
    |--------------------------------------------------------------------------
    | Get Registry Snapshot
    |--------------------------------------------------------------------------
    |
    | Safe serializable representation.
    |
    | Docker container objects are intentionally excluded.
    |
    */

    getSnapshot(): RegistryEntry[] {
        return this.getAll().map(
            (entry) => ({
                roomId:
                    entry.roomId,

                containerId:
                    entry.containerId,

                containerName:
                    entry.containerName,

                running: false,

                activeOperations:
                    entry.activeOperations,

                createdAt:
                    entry.createdAt,

                lastAccessedAt:
                    entry.lastAccessedAt,
            })
        );
    }
}

/*
|--------------------------------------------------------------------------
| Singleton
|--------------------------------------------------------------------------
|
| A single registry instance is shared by the worker-service.
|
|--------------------------------------------------------------------------
*/

export const containerRegistry =
    new ContainerRegistry();

export default containerRegistry;