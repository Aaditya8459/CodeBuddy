import Docker from "dockerode";
import { Writable } from "node:stream";
/**
 * Docker client
 *
 * Worker container must have:
 *
 * DOCKER_SOCKET=/var/run/docker.sock
 *
 * and:
 *
 * /var/run/docker.sock:/var/run/docker.sock
 */
const docker = new Docker({
    socketPath:
        process.env.DOCKER_SOCKET ||
        "/var/run/docker.sock",
});

/**
 * Maximum file size accepted by workspace operations.
 *
 * 10 MB is a reasonable default for a browser IDE.
 * Adjust if your application requires larger files.
 */
const MAX_FILE_SIZE =
    10 * 1024 * 1024;

/**
 * All workspace files must remain inside this directory.
 */
const WORKSPACE_ROOT =
    "/workspace";

/**
 * Information returned for workspace entries.
 */
export interface WorkspaceEntry {
    name: string;
    path: string;
    type: "file" | "folder";
}

/**
 * Result returned after write/create operations.
 */
export interface WorkspaceOperationResult {
    success: boolean;
    path: string;
}

/**
 * Normalize and validate a workspace-relative path.
 *
 * Example:
 *
 * "src/main.py"
 *      ↓
 * "src/main.py"
 *
 * Invalid:
 *
 * "/etc/passwd"
 * "../secret"
 * "src/../../secret"
 * "C:\\secret"
 */
export function validatePath(
    filePath: string,
): string {
    if (
        typeof filePath !== "string"
    ) {
        throw new Error(
            "Workspace path must be a string",
        );
    }

    const normalized =
        filePath
            .replace(/\\/g, "/")
            .trim();

    if (!normalized) {
        throw new Error(
            "Workspace path is required",
        );
    }

    /**
     * Reject null bytes.
     */
    if (
        normalized.includes("\0")
    ) {
        throw new Error(
            "Invalid workspace path",
        );
    }

    /**
     * Workspace paths must be relative.
     */
    if (
        normalized.startsWith("/")
    ) {
        throw new Error(
            "Absolute workspace paths are not allowed",
        );
    }

    /**
     * Reject Windows drive paths.
     */
    if (
        /^[a-zA-Z]:/.test(normalized)
    ) {
        throw new Error(
            "Invalid workspace path",
        );
    }

    /**
     * Reject traversal.
     */
    const segments =
        normalized.split("/");

    if (
        segments.some(
            (segment) =>
                segment === "..",
        )
    ) {
        throw new Error(
            "Path traversal is not allowed",
        );
    }

    /**
     * Remove unnecessary "." segments.
     */
    const safeSegments =
        segments.filter(
            (segment) =>
                segment !== "." &&
                segment !== "",
        );

    if (
        safeSegments.length === 0
    ) {
        throw new Error(
            "Invalid workspace path",
        );
    }

    return safeSegments.join("/");
}

/**
 * Convert a validated relative path
 * into an absolute container path.
 */
function getContainerPath(
    filePath: string,
): string {
    const safePath =
        validatePath(filePath);

    return `${WORKSPACE_ROOT}/${safePath}`;
}

/**
 * Execute a command inside a room container.
 */
async function execInContainer(
    containerId: string,
    command: string[],
): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
}> {
    if (
        !containerId ||
        typeof containerId !== "string"
    ) {
        throw new Error(
            "Container ID is required",
        );
    }

    const container =
        docker.getContainer(
            containerId,
        );

    /*
     * Verify that the container exists.
     */
    try {
        await container.inspect();
    } catch {
        throw new Error(
            `Room container not found: ${containerId}`,
        );
    }

    const exec =
        await container.exec({
            Cmd: command,
            AttachStdout: true,
            AttachStderr: true,
        });

    const stream =
        await exec.start({
            hijack: false,
            stdin: false,
        });

    let stdout = "";
    let stderr = "";

    /*
     * Docker exec streams are multiplexed when
     * hijack=false.
     *
     * Do NOT concatenate the raw stream directly.
     *
     * Dockerode demuxStream() removes the Docker
     * stream headers and separates stdout/stderr.
     */

    const stdoutWriter =
        new Writable({
            write(
                chunk: Buffer,
                _encoding,
                callback,
            ) {
                stdout +=
                    chunk.toString("utf8");

                callback();
            },
        });

    const stderrWriter =
        new Writable({
            write(
                chunk: Buffer,
                _encoding,
                callback,
            ) {
                stderr +=
                    chunk.toString("utf8");

                callback();
            },
        });

    await new Promise<void>(
        (resolve, reject) => {
            stream.on(
                "error",
                reject,
            );

            stream.on(
                "end",
                resolve,
            );

            docker.modem.demuxStream(
                stream,
                stdoutWriter,
                stderrWriter,
            );
        },
    );

    const inspection =
        await exec.inspect();

    const exitCode =
        inspection.ExitCode ?? 0;

    return {
        stdout,
        stderr,
        exitCode,
    };
}

/**
 * GET / List workspace
 *
 * Returns every file and folder below
 * /workspace.
 */
export async function listWorkspace(
    containerId: string,
): Promise<WorkspaceEntry[]> {
    const result =
        await execInContainer(
            containerId,
            [
                "sh",
                "-c",
                "find /workspace -mindepth 1 -printf '%y\\t%P\\n'",
            ],
        );

    if (result.exitCode !== 0) {
        throw new Error(
            result.stderr ||
                result.stdout ||
                "Failed to list workspace",
        );
    }

    const entries: WorkspaceEntry[] =
        [];

    const lines =
        result.stdout
            .split("\n")
            .map((line) =>
                line.trim(),
            )
            .filter(Boolean);

    for (const line of lines) {
        const separator =
            line.indexOf("\t");

        if (separator === -1) {
            continue;
        }

        const type =
            line.slice(
                0,
                separator,
            );

        const relativePath =
            line.slice(
                separator + 1,
            );

        if (!relativePath) {
            continue;
        }

        let entryType:
            | "file"
            | "folder";

        if (type === "d") {
            entryType = "folder";
        } else if (type === "f") {
            entryType = "file";
        } else {
            /**
             * Ignore symlinks, sockets,
             * devices, etc.
             *
             * This prevents the browser IDE
             * from treating special filesystem
             * objects as normal files.
             */
            continue;
        }

        const safePath =
            validatePath(
                relativePath,
            );

        const name =
            safePath
                .split("/")
                .pop() || "";

        entries.push({
            name,
            path: safePath,
            type: entryType,
        });
    }

    /**
     * Stable ordering makes the FileExplorer
     * predictable.
     */
    entries.sort(
        (a, b) => {
            if (
                a.type !== b.type
            ) {
                return a.type ===
                    "folder"
                    ? -1
                    : 1;
            }

            return a.path.localeCompare(
                b.path,
            );
        },
    );

    return entries;
}

/**
 * GET / Read a file
 */
export async function readFile(
    containerId: string,
    filePath: string,
): Promise<string> {
    const containerPath =
        getContainerPath(
            filePath,
        );

    const result =
        await execInContainer(
            containerId,
            [
                "sh",
                "-c",
                `cat -- '${escapeShellArgument(
                    containerPath,
                )}'`,
            ],
        );

    if (result.exitCode !== 0) {
        throw new Error(
            result.stderr ||
                result.stdout ||
                "Failed to read file",
        );
    }

    return result.stdout;
}

/**
 * POST / Create or overwrite a file.
 *
 * Base64 is used instead of putting the
 * entire file content into an environment
 * variable.
 */
export async function writeFile(
    containerId: string,
    filePath: string,
    content: string,
): Promise<WorkspaceOperationResult> {
    const safePath =
        validatePath(filePath);

    if (
        typeof content !== "string"
    ) {
        throw new Error(
            "File content must be a string",
        );
    }

    const byteLength =
        Buffer.byteLength(
            content,
            "utf8",
        );

    if (
        byteLength >
        MAX_FILE_SIZE
    ) {
        throw new Error(
            `File exceeds maximum size of ${MAX_FILE_SIZE} bytes`,
        );
    }

    const encoded =
        Buffer.from(
            content,
            "utf8",
        ).toString(
            "base64",
        );

    const containerPath =
        getContainerPath(
            safePath,
        );

    const parentPath =
        containerPath
            .split("/")
            .slice(0, -1)
            .join("/");

    const result =
        await execInContainer(
            containerId,
            [
                "sh",
                "-c",
                `mkdir -p -- '${escapeShellArgument(
                    parentPath,
                )}' && printf '%s' '${encoded}' | base64 -d > '${escapeShellArgument(
                    containerPath,
                )}'`,
            ],
        );

    if (result.exitCode !== 0) {
        throw new Error(
            result.stderr ||
                result.stdout ||
                "Failed to write file",
        );
    }

    return {
        success: true,
        path: safePath,
    };
}

/**
 * POST / Create an empty file.
 */
export async function createFile(
    containerId: string,
    filePath: string,
): Promise<WorkspaceOperationResult> {
    const safePath =
        validatePath(filePath);

    const containerPath =
        getContainerPath(
            safePath,
        );

    const parentPath =
        containerPath
            .split("/")
            .slice(0, -1)
            .join("/");

    const result =
        await execInContainer(
            containerId,
            [
                "sh",
                "-c",
                `mkdir -p -- '${escapeShellArgument(
                    parentPath,
                )}' && touch -- '${escapeShellArgument(
                    containerPath,
                )}'`,
            ],
        );

    if (result.exitCode !== 0) {
        throw new Error(
            result.stderr ||
                result.stdout ||
                "Failed to create file",
        );
    }

    return {
        success: true,
        path: safePath,
    };
}

/**
 * POST / Create folder.
 */
export async function createFolder(
    containerId: string,
    folderPath: string,
): Promise<WorkspaceOperationResult> {
    const safePath =
        validatePath(folderPath);

    const containerPath =
        getContainerPath(
            safePath,
        );

    const result =
        await execInContainer(
            containerId,
            [
                "sh",
                "-c",
                `mkdir -p -- '${escapeShellArgument(
                    containerPath,
                )}'`,
            ],
        );

    if (result.exitCode !== 0) {
        throw new Error(
            result.stderr ||
                result.stdout ||
                "Failed to create folder",
        );
    }

    return {
        success: true,
        path: safePath,
    };
}

/**
 * DELETE / Delete a file or folder.
 *
 * Recursive deletion is supported for
 * folders.
 */
export async function deletePath(
    containerId: string,
    filePath: string,
): Promise<WorkspaceOperationResult> {
    const safePath =
        validatePath(filePath);

    const containerPath =
        getContainerPath(
            safePath,
        );

    /**
     * Never allow deletion of /workspace.
     */
    if (
        containerPath ===
        WORKSPACE_ROOT
    ) {
        throw new Error(
            "Deleting workspace root is not allowed",
        );
    }

    const result =
        await execInContainer(
            containerId,
            [
                "sh",
                "-c",
                `if [ ! -e '${escapeShellArgument(
                    containerPath,
                )}' ]; then exit 2; fi; rm -rf -- '${escapeShellArgument(
                    containerPath,
                )}'`,
            ],
        );

    if (result.exitCode !== 0) {
        if (
            result.exitCode === 2
        ) {
            throw new Error(
                "Workspace path does not exist",
            );
        }

        throw new Error(
            result.stderr ||
                result.stdout ||
                "Failed to delete workspace path",
        );
    }

    return {
        success: true,
        path: safePath,
    };
}

/**
 * RENAME / Rename a file or folder.
 *
 * Works for both files and directories.
 *
 * The destination must not already exist.
 */
export async function renamePath(
    containerId: string,
    oldPath: string,
    newPath: string,
): Promise<WorkspaceOperationResult> {
    const safeOldPath =
        validatePath(oldPath);

    const safeNewPath =
        validatePath(newPath);

    const oldContainerPath =
        getContainerPath(
            safeOldPath,
        );

    const newContainerPath =
        getContainerPath(
            safeNewPath,
        );

    /**
     * Never allow renaming /workspace itself.
     */
    if (
        oldContainerPath ===
        WORKSPACE_ROOT
    ) {
        throw new Error(
            "Renaming workspace root is not allowed",
        );
    }

    if (
        newContainerPath ===
        WORKSPACE_ROOT
    ) {
        throw new Error(
            "Renaming workspace root is not allowed",
        );
    }

    /**
     * Nothing to do when source and
     * destination are identical.
     */
    if (
        safeOldPath ===
        safeNewPath
    ) {
        return {
            success: true,
            path: safeNewPath,
        };
    }

    const result =
        await execInContainer(
            containerId,
            [
                "sh",
                "-c",
                `if [ ! -e '${escapeShellArgument(
                    oldContainerPath,
                )}' ]; then exit 2; fi; if [ -e '${escapeShellArgument(
                    newContainerPath,
                )}' ]; then exit 3; fi; mv -- '${escapeShellArgument(
                    oldContainerPath,
                )}' '${escapeShellArgument(
                    newContainerPath,
                )}'`,
            ],
        );

    if (
        result.exitCode !== 0
    ) {
        if (
            result.exitCode === 2
        ) {
            throw new Error(
                "Workspace path does not exist",
            );
        }

        if (
            result.exitCode === 3
        ) {
            throw new Error(
                "Destination workspace path already exists",
            );
        }

        throw new Error(
            result.stderr ||
                result.stdout ||
                "Failed to rename workspace path",
        );
    }

    return {
        success: true,
        path: safeNewPath,
    };
}
/**
 * Escape a shell argument.
 *
 * This function is used only after
 * path validation.
 */
function escapeShellArgument(
    value: string,
): string {
    return value.replace(
        /'/g,
        "'\\''",
    );
}