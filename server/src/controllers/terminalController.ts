import { Request, Response } from "express";

interface TerminalRequestBody {
  roomId?: string;
  command?: string;
  cwd?: string;
  sessionId?: string;
}

interface TerminalResponse {
  success: boolean;
  sessionId?: string;
  stdout?: string;
  stderr?: string;
  exitCode?: number | null;
  error?: string;
  message?: string;
}

const WORKER_SERVICE_URL =
  process.env.WORKER_SERVICE_URL || "http://localhost:5001";

const TERMINAL_TIMEOUT = 30000;
const MAX_COMMAND_LENGTH = 10000;
const MAX_CWD_LENGTH = 500;

const BLOCKED_COMMAND_PATTERNS = [
  /\brm\s+-rf\s+\/\s*$/i,
  /\brm\s+-rf\s+\/\*/i,
  /\bmkfs\b/i,
  /\bdd\s+if=/i,
  /\bshutdown\b/i,
  /\breboot\b/i,
  /\bpoweroff\b/i,
  /\binit\s+[06]\b/i,
  /\bmount\b/i,
  /\bumount\b/i,
  /\bkill\s+-9\s+-1\b/i,
];

const isDangerousCommand = (command: string): boolean => {
  return BLOCKED_COMMAND_PATTERNS.some((pattern) =>
    pattern.test(command)
  );
};

const normalizeCwd = (cwd?: string): string => {
  if (!cwd || !cwd.trim()) {
    return "/workspace";
  }

  const normalized = cwd.trim();

  if (normalized.length > MAX_CWD_LENGTH) {
    throw new Error("Working directory path is too long");
  }

  if (!normalized.startsWith("/workspace")) {
    throw new Error(
      "Working directory must be inside /workspace"
    );
  }

  if (normalized.includes("..")) {
    throw new Error(
      "Parent directory traversal is not allowed"
    );
  }

  return normalized;
};

const validateSessionId = (sessionId?: string): string | null => {
  if (!sessionId) {
    return null;
  }

  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(sessionId)) {
    throw new Error("Invalid terminal session ID");
  }

  return sessionId;
};

const callWorker = async (
  endpoint: string,
  payload: Record<string, unknown>,
  timeout: number = TERMINAL_TIMEOUT
): Promise<{
  response: globalThis.Response;
  data: TerminalResponse;
}> => {
  const controller = new AbortController();

  const timer = setTimeout(() => {
    controller.abort();
  }, timeout);

  try {
    const response = await fetch(
      `${WORKER_SERVICE_URL}${endpoint}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      }
    );

    let data: TerminalResponse;

    try {
      data = (await response.json()) as TerminalResponse;
    } catch {
      throw new Error(
        "Invalid response received from worker service"
      );
    }

    return {
      response,
      data,
    };
  } finally {
    clearTimeout(timer);
  }
};

export const executeTerminalCommand = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const {
      roomId,
      command,
      cwd,
      sessionId,
    }: TerminalRequestBody = req.body;

    if (!roomId || typeof roomId !== "string") {
      res.status(400).json({
        success: false,
        message: "roomId is required",
      });
      return;
    }

    if (!command || typeof command !== "string") {
      res.status(400).json({
        success: false,
        message: "command is required",
      });
      return;
    }

    const trimmedCommand = command.trim();

    if (!trimmedCommand) {
      res.status(400).json({
        success: false,
        message: "Command cannot be empty",
      });
      return;
    }

    if (trimmedCommand.length > MAX_COMMAND_LENGTH) {
      res.status(400).json({
        success: false,
        message: "Command is too long",
      });
      return;
    }

    if (isDangerousCommand(trimmedCommand)) {
      res.status(403).json({
        success: false,
        message: "Command is not allowed",
      });
      return;
    }

    let workingDirectory: string;

    try {
      workingDirectory = normalizeCwd(cwd);
    } catch (error) {
      res.status(400).json({
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Invalid working directory",
      });
      return;
    }

    let validatedSessionId: string | null;

    try {
      validatedSessionId = validateSessionId(sessionId);
    } catch (error) {
      res.status(400).json({
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Invalid session ID",
      });
      return;
    }

    const payload = {
      roomId,
      command: trimmedCommand,
      cwd: workingDirectory,
      sessionId: validatedSessionId,
    };

    let workerResult;

    try {
      workerResult = await callWorker(
        "/internal/terminal/execute",
        payload
      );
    } catch (error) {
      if (
        error instanceof Error &&
        error.name === "AbortError"
      ) {
        res.status(504).json({
          success: false,
          message: "Terminal command timed out",
        });
        return;
      }

      console.error(
        "❌ Terminal Worker Connection Error:",
        error
      );

      res.status(503).json({
        success: false,
        message: "Terminal service is unavailable",
      });

      return;
    }

    const { response, data } = workerResult;

    if (!response.ok) {
      res.status(response.status).json({
        success: false,
        message:
          data.message ||
          data.error ||
          "Terminal command failed",
        roomId,
        sessionId: data.sessionId || validatedSessionId,
      });

      return;
    }

    res.status(200).json({
      success: data.success,
      roomId,
      sessionId:
        data.sessionId || validatedSessionId,
      stdout: data.stdout || "",
      stderr: data.stderr || "",
      exitCode:
        data.exitCode !== undefined
          ? data.exitCode
          : null,
      error: data.error || null,
    });
  } catch (error) {
    console.error(
      "❌ Terminal Controller Error:",
      error
    );

    res.status(500).json({
      success: false,
      message: "Failed to process terminal request",
    });
  }
};

export const createTerminalSession = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { roomId, cwd }: TerminalRequestBody = req.body;

    if (!roomId || typeof roomId !== "string") {
      res.status(400).json({
        success: false,
        message: "roomId is required",
      });
      return;
    }

    let workingDirectory: string;

    try {
      workingDirectory = normalizeCwd(cwd);
    } catch (error) {
      res.status(400).json({
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Invalid working directory",
      });
      return;
    }

    let workerResult;

    try {
      workerResult = await callWorker(
        "/internal/terminal/create",
        {
          roomId,
          cwd: workingDirectory,
        }
      );
    } catch (error) {
      if (
        error instanceof Error &&
        error.name === "AbortError"
      ) {
        res.status(504).json({
          success: false,
          message: "Terminal session creation timed out",
        });
        return;
      }

      console.error(
        "❌ Terminal Session Worker Error:",
        error
      );

      res.status(503).json({
        success: false,
        message: "Terminal service is unavailable",
      });

      return;
    }

    const { response, data } = workerResult;

    if (!response.ok) {
      res.status(response.status).json({
        success: false,
        message:
          data.message ||
          data.error ||
          "Failed to create terminal session",
      });

      return;
    }

    res.status(201).json({
      success: true,
      roomId,
      sessionId: data.sessionId,
    });
  } catch (error) {
    console.error(
      "❌ Create Terminal Session Error:",
      error
    );

    res.status(500).json({
      success: false,
      message: "Failed to create terminal session",
    });
  }
};

export const closeTerminalSession = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { roomId, sessionId }: TerminalRequestBody =
      req.body;

    if (!roomId || typeof roomId !== "string") {
      res.status(400).json({
        success: false,
        message: "roomId is required",
      });
      return;
    }

    if (!sessionId || typeof sessionId !== "string") {
      res.status(400).json({
        success: false,
        message: "sessionId is required",
      });
      return;
    }

    try {
      validateSessionId(sessionId);
    } catch (error) {
      res.status(400).json({
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Invalid session ID",
      });
      return;
    }

    let workerResult;

    try {
      workerResult = await callWorker(
        "/internal/terminal/close",
        {
          roomId,
          sessionId,
        }
      );
    } catch (error) {
      console.error(
        "❌ Close Terminal Worker Error:",
        error
      );

      res.status(503).json({
        success: false,
        message: "Terminal service is unavailable",
      });

      return;
    }

    const { response, data } = workerResult;

    if (!response.ok) {
      res.status(response.status).json({
        success: false,
        message:
          data.message ||
          data.error ||
          "Failed to close terminal session",
      });

      return;
    }

    res.status(200).json({
      success: true,
      roomId,
      sessionId,
    });
  } catch (error) {
    console.error(
      "❌ Close Terminal Session Error:",
      error
    );

    res.status(500).json({
      success: false,
      message: "Failed to close terminal session",
    });
  }
};