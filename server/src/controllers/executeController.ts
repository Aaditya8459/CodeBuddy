import { Request, Response } from "express";

interface ExecuteRequestBody {
  roomId?: string;
  filePath?: string;
  language?: string;
  code?: string;
  stdin?: string;
  command?: string;
  timeout?: number;
}

interface WorkerExecutionResponse {
  success: boolean;
  stdout?: string;
  stderr?: string;
  exitCode?: number | null;
  signal?: string | null;
  executionTime?: number;
  memoryUsed?: number;
  error?: string;
  message?: string;
}

const WORKER_SERVICE_URL =
  process.env.WORKER_SERVICE_URL || "http://localhost:5001";

const DEFAULT_TIMEOUT = 10000;
const GO_TIMEOUT = 60000;
const MAX_TIMEOUT = 60000;

const SUPPORTED_LANGUAGES = new Set([
  "python",
  "javascript",
  "typescript",
  "java",
  "c",
  "cpp",
  "go",
  "rust",
]);

const normalizeLanguage = (language: string): string => {
  const normalized = language.trim().toLowerCase();

  const aliases: Record<string, string> = {
    py: "python",
    python3: "python",

    js: "javascript",
    node: "javascript",
    nodejs: "javascript",

    ts: "typescript",

    java: "java",

    c: "c",

    "c++": "cpp",
    cpp: "cpp",

    golang: "go",
    go: "go",

    rs: "rust",
    rust: "rust",
  };

  return aliases[normalized] || normalized;
};

const sanitizeTimeout = (timeout?: number): number => {
  if (
    timeout === undefined ||
    timeout === null ||
    !Number.isFinite(timeout)
  ) {
    return DEFAULT_TIMEOUT;
  }

  return Math.min(
    Math.max(Math.floor(timeout), 1000),
    MAX_TIMEOUT
  );
};

export const executeCode = async (
  req: Request,
  res: Response
): Promise<void> => {
  const requestStartedAt = Date.now();

  try {
    const {
      roomId,
      filePath,
      language,
      code,
      stdin = "",
      command,
      timeout,
    }: ExecuteRequestBody = req.body;

    if (!roomId || typeof roomId !== "string") {
      res.status(400).json({
        success: false,
        message: "roomId is required",
      });
      return;
    }

    if (!language || typeof language !== "string") {
      res.status(400).json({
        success: false,
        message: "language is required",
      });
      return;
    }

    const normalizedLanguage = normalizeLanguage(language);

    if (!SUPPORTED_LANGUAGES.has(normalizedLanguage)) {
      res.status(400).json({
        success: false,
        message: `Unsupported language: ${language}`,
        supportedLanguages: Array.from(SUPPORTED_LANGUAGES),
      });
      return;
    }

    if (
      code !== undefined &&
      typeof code !== "string"
    ) {
      res.status(400).json({
        success: false,
        message: "code must be a string",
      });
      return;
    }

    if (typeof stdin !== "string") {
      res.status(400).json({
        success: false,
        message: "stdin must be a string",
      });
      return;
    }

    if (
      filePath !== undefined &&
      typeof filePath !== "string"
    ) {
      res.status(400).json({
        success: false,
        message: "filePath must be a string",
      });
      return;
    }

    if (
      command !== undefined &&
      typeof command !== "string"
    ) {
      res.status(400).json({
        success: false,
        message: "command must be a string",
      });
      return;
    }

    /*
    |--------------------------------------------------------------------------
    | Determine execution timeout
    |--------------------------------------------------------------------------
    |
    | Go compilation inside the isolated execution container currently takes
    | approximately 47 seconds on this machine.
    |
    | Therefore Go receives a 60-second timeout unless the caller explicitly
    | provides a larger/smaller value within the allowed range.
    |
    */

    let executionTimeout: number;

    if (normalizedLanguage === "go") {
      if (
        timeout === undefined ||
        timeout === null ||
        !Number.isFinite(timeout)
      ) {
        executionTimeout = GO_TIMEOUT;
      } else {
        executionTimeout = Math.min(
          Math.max(Math.floor(timeout), 1000),
          MAX_TIMEOUT
        );

        /*
        |----------------------------------------------------------------------
        | Prevent the client default of 10 seconds from killing Go execution.
        |----------------------------------------------------------------------
        */

        if (executionTimeout < GO_TIMEOUT) {
          executionTimeout = GO_TIMEOUT;
        }
      }
    } else {
      executionTimeout = sanitizeTimeout(timeout);
    }

    const workerPayload = {
      roomId,
      filePath: filePath || null,
      language: normalizedLanguage,
      code: code ?? null,
      stdin,
      command: command || null,
      timeout: executionTimeout,
    };

    console.log(
      "🚀 Sending execution request to worker:",
      {
        roomId,
        language: normalizedLanguage,
        timeout: executionTimeout,
        filePath: filePath || null,
        command: command || null,
        codeLength:
          typeof code === "string"
            ? code.length
            : 0,
        stdinLength: stdin.length,
      }
    );

    const controller = new AbortController();

    /*
    |--------------------------------------------------------------------------
    | Worker request timeout
    |--------------------------------------------------------------------------
    |
    | Give the worker additional time to return its response after the actual
    | execution timeout.
    |
    */

    const workerRequestTimeout =
      executionTimeout + 15000;

    const abortTimer = setTimeout(() => {
      console.warn(
        "⏱️ Worker request timeout reached:",
        {
          language: normalizedLanguage,
          executionTimeout,
          workerRequestTimeout,
        }
      );

      controller.abort();
    }, workerRequestTimeout);

    let workerResponse: globalThis.Response;

    try {
      workerResponse = await fetch(
        `${WORKER_SERVICE_URL}/internal/execute`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(workerPayload),
          signal: controller.signal,
        }
      );
    } catch (error) {
      clearTimeout(abortTimer);

      if (
        error instanceof Error &&
        error.name === "AbortError"
      ) {
        console.error(
          "⏱️ Worker execution request timed out:",
          {
            language: normalizedLanguage,
            executionTimeout,
            workerRequestTimeout,
            elapsed:
              Date.now() - requestStartedAt,
          }
        );

        res.status(504).json({
          success: false,
          message:
            "Code execution request timed out",
          roomId,
          executionTime:
            Date.now() - requestStartedAt,
        });

        return;
      }

      console.error(
        "❌ Worker Service Connection Error:",
        error
      );

      res.status(503).json({
        success: false,
        message:
          "Code execution service is unavailable",
      });

      return;
    }

    clearTimeout(abortTimer);

    let workerData: WorkerExecutionResponse;

    try {
      workerData =
        (await workerResponse.json()) as WorkerExecutionResponse;
    } catch {
      console.error(
        "❌ Invalid response received from worker service"
      );

      res.status(502).json({
        success: false,
        message:
          "Invalid response from code execution service",
      });

      return;
    }

    if (!workerResponse.ok) {
      console.error(
        "❌ Worker execution returned an error:",
        {
          status: workerResponse.status,
          language: normalizedLanguage,
          workerData,
        }
      );

      res.status(workerResponse.status).json({
        success: false,
        message:
          workerData.message ||
          workerData.error ||
          "Code execution failed",
        roomId,
      });

      return;
    }

    console.log(
      "✅ Worker execution response received:",
      {
        roomId,
        language: normalizedLanguage,
        success: workerData.success,
        exitCode:
          workerData.exitCode ?? null,
        executionTime:
          workerData.executionTime ??
          Date.now() - requestStartedAt,
      }
    );

    res.status(200).json({
      success: workerData.success,
      roomId,

      stdout:
        workerData.stdout || "",

      stderr:
        workerData.stderr || "",

      exitCode:
        workerData.exitCode !== undefined
          ? workerData.exitCode
          : null,

      signal:
        workerData.signal !== undefined
          ? workerData.signal
          : null,

      executionTime:
        workerData.executionTime !== undefined
          ? workerData.executionTime
          : Date.now() - requestStartedAt,

      memoryUsed:
        workerData.memoryUsed !== undefined
          ? workerData.memoryUsed
          : null,

      error:
        workerData.error || null,
    });
  } catch (error) {
    console.error(
      "❌ Execute Controller Error:",
      error
    );

    res.status(500).json({
      success: false,
      message:
        "Failed to process code execution request",
    });
  }
};