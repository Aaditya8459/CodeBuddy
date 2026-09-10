import fs from "fs";
import path from "path";

export interface RuntimeCommand {
    command: string[];
}

export interface RuntimeRequirements {
    executables: string[];
}

export interface RuntimeConfig {
    id: string;
    name: string;
    version: string;
    extensions: string[];
    entrypoints: string[];

    compile:
        | RuntimeCommand
        | null;

    run: RuntimeCommand;

    interactive: boolean;

    requirements: RuntimeRequirements;
}

const RUNTIMES_DIR = path.resolve(
    process.cwd(),
    "runtimes"
);

class RuntimeRegistry {
    private runtimes = new Map<
        string,
        RuntimeConfig
    >();

    private extensionMap = new Map<
        string,
        RuntimeConfig
    >();

    private initialized = false;

    initialize(): void {
        if (this.initialized) {
            return;
        }

        if (!fs.existsSync(RUNTIMES_DIR)) {
            throw new Error(
                `Runtime directory not found: ${RUNTIMES_DIR}`
            );
        }

        const runtimeDirectories =
            fs
                .readdirSync(
                    RUNTIMES_DIR,
                    {
                        withFileTypes: true,
                    }
                )
                .filter(
                    (entry) =>
                        entry.isDirectory()
                );

        for (const directory of runtimeDirectories) {
            this.loadRuntime(
                directory.name
            );
        }

        this.initialized = true;

        console.log(
            `✅ Loaded ${this.runtimes.size} runtimes`
        );
    }

    private loadRuntime(
        runtimeId: string
    ): void {
        const runtimeFile =
            path.join(
                RUNTIMES_DIR,
                runtimeId,
                "runtime.json"
            );

        if (!fs.existsSync(runtimeFile)) {
            console.warn(
                `⚠️ Runtime configuration missing: ${runtimeFile}`
            );

            return;
        }

        try {
            const raw =
                fs.readFileSync(
                    runtimeFile,
                    "utf-8"
                );

            const runtime =
                JSON.parse(
                    raw
                ) as RuntimeConfig;

            this.validateRuntime(
                runtime
            );

            this.runtimes.set(
                runtime.id,
                runtime
            );

            for (const extension of runtime.extensions) {
                this.extensionMap.set(
                    extension.toLowerCase(),
                    runtime
                );
            }

            console.log(
                `✅ Runtime loaded: ${runtime.name}`
            );
        } catch (error) {
            console.error(
                `❌ Failed to load runtime: ${runtimeId}`,
                error
            );

            throw error;
        }
    }

    private validateRuntime(
        runtime: RuntimeConfig
    ): void {
        if (
            !runtime.id ||
            !runtime.name
        ) {
            throw new Error(
                "Runtime must contain id and name"
            );
        }

        if (
            !Array.isArray(
                runtime.extensions
            ) ||
            runtime.extensions.length === 0
        ) {
            throw new Error(
                `Runtime ${runtime.id} has no extensions`
            );
        }

        if (
            !runtime.run ||
            !Array.isArray(
                runtime.run.command
            )
        ) {
            throw new Error(
                `Runtime ${runtime.id} has invalid run command`
            );
        }

        if (
            runtime.compile !== null &&
            runtime.compile !== undefined &&
            !Array.isArray(
                runtime.compile.command
            )
        ) {
            throw new Error(
                `Runtime ${runtime.id} has invalid compile command`
            );
        }

        if (
            !runtime.requirements ||
            !Array.isArray(
                runtime.requirements
                    .executables
            )
        ) {
            throw new Error(
                `Runtime ${runtime.id} has invalid requirements`
            );
        }
    }

    getById(
        runtimeId: string
    ): RuntimeConfig | undefined {
        this.initialize();

        return this.runtimes.get(
            runtimeId
        );
    }

    getByExtension(
        extension: string
    ): RuntimeConfig | undefined {
        this.initialize();

        const normalized =
            extension
                .startsWith(".")
                ? extension.toLowerCase()
                : `.${extension.toLowerCase()}`;

        return this.extensionMap.get(
            normalized
        );
    }

    getByFileName(
        fileName: string
    ): RuntimeConfig | undefined {
        this.initialize();

        const extension =
            path.extname(
                fileName
            );

        return this.getByExtension(
            extension
        );
    }

    getAll(): RuntimeConfig[] {
        this.initialize();

        return Array.from(
            this.runtimes.values()
        );
    }

    has(
        runtimeId: string
    ): boolean {
        this.initialize();

        return this.runtimes.has(
            runtimeId
        );
    }

    getSupportedExtensions(): string[] {
        this.initialize();

        return Array.from(
            this.extensionMap.keys()
        );
    }
}

export const runtimeRegistry =
    new RuntimeRegistry();