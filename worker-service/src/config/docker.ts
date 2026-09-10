import Docker from "dockerode";
import dotenv from "dotenv";

dotenv.config();

/*
|--------------------------------------------------------------------------
| Docker Connection
|--------------------------------------------------------------------------
*/

const DOCKER_SOCKET =
    process.env.DOCKER_SOCKET?.trim() ||
    "//./pipe/docker_engine";

export const docker = new Docker({
    socketPath: DOCKER_SOCKET,
});

/*
|--------------------------------------------------------------------------
| Runtime Image
|--------------------------------------------------------------------------
|
| IMPORTANT:
| This image must contain ALL supported programming
| language runtimes.
|
*/

export const WORKER_IMAGE =
    process.env.WORKER_IMAGE?.trim() ||
    "codebuddy-runtime:latest";

/*
|--------------------------------------------------------------------------
| Docker Network
|--------------------------------------------------------------------------
*/

export const DOCKER_NETWORK =
    process.env.DOCKER_NETWORK?.trim() ||
    "codebuddy-network";

/*
|--------------------------------------------------------------------------
| Container Configuration
|--------------------------------------------------------------------------
*/

export const CONTAINER_CONFIG = {
    prefix:
        process.env.CONTAINER_PREFIX?.trim() ||
        "codebuddy-room",

    workspacePath:
        process.env.WORKSPACE_PATH?.trim() ||
        "/workspace",

    workingDirectory:
        process.env.WORKSPACE_PATH?.trim() ||
        "/workspace",

    openStdin: true,

    tty: false,

    autoRemove: false,

    capDrop: [
        "ALL",
    ],

    securityOpt: [
        "no-new-privileges:true",
    ],
};

/*
|--------------------------------------------------------------------------
| Container Resources
|--------------------------------------------------------------------------
*/

export const CONTAINER_RESOURCES = {
    memory:
        Number(
            process.env.CONTAINER_MEMORY_BYTES
        ) ||
        1024 * 1024 * 1024,

    memorySwap:
        Number(
            process.env.CONTAINER_MEMORY_SWAP_BYTES
        ) ||
        1024 * 1024 * 1024,

    cpuPeriod:
        Number(
            process.env.CONTAINER_CPU_PERIOD
        ) ||
        100000,

    cpuQuota:
        Number(
            process.env.CONTAINER_CPU_QUOTA
        ) ||
        100000,

    pidsLimit:
        Number(
            process.env.CONTAINER_PIDS_LIMIT
        ) ||
        256,

    cpuShares:
        Number(
            process.env.CONTAINER_CPU_SHARES
        ) ||
        1024,
};

/*
|--------------------------------------------------------------------------
| Container Environment
|--------------------------------------------------------------------------
*/

export const CONTAINER_ENVIRONMENT = [
    "CODEBUDDY_CONTAINER=true",
    "CODEBUDDY_WORKSPACE=/workspace",
    "PYTHONUNBUFFERED=1",
];

/*
|--------------------------------------------------------------------------
| Supported Languages
|--------------------------------------------------------------------------
*/

export const SUPPORTED_LANGUAGES = {
    python: {
        id: "python",
        name: "Python",
        extension: ".py",
        command: "python3",
        runtime: "python",
    },

    javascript: {
        id: "javascript",
        name: "JavaScript",
        extension: ".js",
        command: "node",
        runtime: "node",
    },

    typescript: {
        id: "typescript",
        name: "TypeScript",
        extension: ".ts",
        command: "tsx",
        runtime: "node",
    },

    java: {
        id: "java",
        name: "Java",
        extension: ".java",
        command: "java",
        runtime: "java",
    },

    c: {
        id: "c",
        name: "C",
        extension: ".c",
        command: "gcc",
        runtime: "gcc",
    },

    cpp: {
        id: "cpp",
        name: "C++",
        extension: ".cpp",
        command: "g++",
        runtime: "g++",
    },

    go: {
        id: "go",
        name: "Go",
        extension: ".go",
        command: "go",
        runtime: "go",
    },

    rust: {
        id: "rust",
        name: "Rust",
        extension: ".rs",
        command: "rustc",
        runtime: "rust",
    },
} as const;

/*
|--------------------------------------------------------------------------
| Docker Labels
|--------------------------------------------------------------------------
*/

export const DOCKER_LABELS = {
    managedBy:
        "codebuddy.managed=true",

    service:
        "codebuddy.service=worker",

    room:
        "codebuddy.room",

    containerType:
        "codebuddy.container.type=room",
};

/*
|--------------------------------------------------------------------------
| Room Container Name
|--------------------------------------------------------------------------
*/

export const getRoomContainerName = (
    roomId: string
): string => {

    const sanitizedRoomId =
        roomId
            .replace(
                /[^a-zA-Z0-9_.-]/g,
                "-"
            )
            .slice(0, 100);

    return `${CONTAINER_CONFIG.prefix}-${sanitizedRoomId}`;
};

/*
|--------------------------------------------------------------------------
| Room Container Labels
|--------------------------------------------------------------------------
*/

export const getRoomContainerLabels = (
    roomId: string
): Record<string, string> => {

    return {
        [DOCKER_LABELS.managedBy]:
            "true",

        [DOCKER_LABELS.service]:
            "worker",

        [DOCKER_LABELS.room]:
            roomId,

        [DOCKER_LABELS.containerType]:
            "room",
    };
};

/*
|--------------------------------------------------------------------------
| Room Container Options
|--------------------------------------------------------------------------
*/

export const getRoomContainerOptions = (
    roomId: string
): Docker.ContainerCreateOptions => {

    return {
        name:
            getRoomContainerName(
                roomId
            ),

        Image:
            WORKER_IMAGE,

        Cmd: [
            "tail",
            "-f",
            "/dev/null",
        ],

        WorkingDir:
            CONTAINER_CONFIG.workspacePath,

        Env:
            CONTAINER_ENVIRONMENT,

        Labels:
            getRoomContainerLabels(
                roomId
            ),

        OpenStdin:
            CONTAINER_CONFIG.openStdin,

        Tty:
            CONTAINER_CONFIG.tty,

        HostConfig: {
            Memory:
                CONTAINER_RESOURCES.memory,

            MemorySwap:
                CONTAINER_RESOURCES.memorySwap,

            CpuPeriod:
                CONTAINER_RESOURCES.cpuPeriod,

            CpuQuota:
                CONTAINER_RESOURCES.cpuQuota,

            CpuShares:
                CONTAINER_RESOURCES.cpuShares,

            PidsLimit:
                CONTAINER_RESOURCES.pidsLimit,

            Privileged:
                false,

            CapDrop:
                CONTAINER_CONFIG.capDrop,

            SecurityOpt:
                CONTAINER_CONFIG.securityOpt,

            ReadonlyRootfs:
                false,

            NetworkMode:
                DOCKER_NETWORK,

            AutoRemove:
                false,

            PidMode:
                "",

            IpcMode:
                "",
        },
    };
};

/*
|--------------------------------------------------------------------------
| Check Docker Connection
|--------------------------------------------------------------------------
*/

export const checkDockerConnection =
    async (): Promise<boolean> => {

        try {

            await docker.ping();

            console.log(
                "🐳 Docker connection established"
            );

            return true;

        } catch (error) {

            console.error(
                "❌ Docker connection failed:",
                error
            );

            return false;
        }
    };

/*
|--------------------------------------------------------------------------
| Ensure Docker Network
|--------------------------------------------------------------------------
*/

export const ensureDockerNetwork =
    async (): Promise<Docker.Network> => {

        const networks =
            await docker.listNetworks({
                filters: JSON.stringify({
                    name: [
                        DOCKER_NETWORK,
                    ],
                }),
            });

        /*
        * Dockerode typings can differ between versions.
        *
        * Use the network ID instead of depending on
        * NetworkInfo.Name.
        */

        const existingNetwork =
            networks.find(
                (network) =>
                    network.Id
            );

        if (
            existingNetwork?.Id
        ) {

            return docker.getNetwork(
                existingNetwork.Id
            );
        }

        console.log(
            `🌐 Creating Docker network: ${DOCKER_NETWORK}`
        );

        return docker.createNetwork({
            Name:
                DOCKER_NETWORK,

            Driver:
                "bridge",

            Internal:
                false,

            Attachable:
                true,

            Labels: {
                "codebuddy.managed":
                    "true",

                "codebuddy.network":
                    "true",
            },
        });
    };

/*
|--------------------------------------------------------------------------
| Get Room Container
|--------------------------------------------------------------------------
*/

export const getRoomContainer =
    async (
        roomId: string
    ): Promise<Docker.Container | null> => {

        const containers =
            await docker.listContainers({
                all: true,

                filters: JSON.stringify({
                    label: [
                        `${DOCKER_LABELS.room}=${roomId}`,
                    ],
                }),
            });

        if (
            containers.length === 0
        ) {

            return null;
        }

        return docker.getContainer(
            containers[0].Id
        );
    };

/*
|--------------------------------------------------------------------------
| Get Room Container By Name
|--------------------------------------------------------------------------
*/

export const getRoomContainerByName =
    async (
        roomId: string
    ): Promise<Docker.Container | null> => {

        const name =
            getRoomContainerName(
                roomId
            );

        try {

            const container =
                docker.getContainer(
                    name
                );

            await container.inspect();

            return container;

        } catch {

            return null;
        }
    };

/*
|--------------------------------------------------------------------------
| Docker Configuration
|--------------------------------------------------------------------------
*/

export const dockerConfig = {

    image:
        WORKER_IMAGE,

    network:
        DOCKER_NETWORK,

    containerPrefix:
        CONTAINER_CONFIG.prefix,

    workspace:
        CONTAINER_CONFIG.workspacePath,

    resources:
        CONTAINER_RESOURCES,

    languages:
        SUPPORTED_LANGUAGES,
};