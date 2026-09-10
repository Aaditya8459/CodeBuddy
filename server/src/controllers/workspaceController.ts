import { Request, Response } from "express";

const WORKER_SERVICE_URL =
  process.env.WORKER_SERVICE_URL ||
  "http://worker:5001";

const WORKER_TIMEOUT = 30000;

interface WorkspaceRequestBody {
  roomId?: string;
  path?: string;
  oldPath?: string;
  newPath?: string;
  filePath?: string;
  fileName?: string;
  content?: string;
  language?: string;
  type?: "file" | "directory";
  recursive?: boolean;
}

interface WorkerResponse {
  success: boolean;
  message?: string;
  error?: string;
  data?: unknown;
  files?: unknown[];
  file?: unknown;
  content?: string;
  roomId?: string;
  path?: string;
  containerId?: string;
  containerName?: string;
}

const sanitizeRoomId = (
  roomId: string
): string => {
  const value = roomId.trim();

  if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
    throw new Error("Invalid roomId");
  }

  return value;
};

const sanitizeWorkspacePath = (
  inputPath?: string
): string => {
  if (
    !inputPath ||
    !inputPath.trim()
  ) {
    return "/workspace";
  }

  let normalized = inputPath
    .trim()
    .replace(/\\/g, "/");

  normalized = normalized.replace(
    /^\/+/,
    "/"
  );

  if (normalized.includes("\0")) {
    throw new Error("Invalid path");
  }

  if (
    normalized === ".." ||
    normalized.startsWith("../") ||
    normalized.includes("/../") ||
    normalized.endsWith("/..")
  ) {
    throw new Error(
      "Path traversal is not allowed"
    );
  }

  if (
    normalized === "~" ||
    normalized.startsWith("~/")
  ) {
    throw new Error(
      "Home directory paths are not allowed"
    );
  }

  if (
    normalized === "/etc" ||
    normalized.startsWith("/etc/") ||
    normalized === "/root" ||
    normalized.startsWith("/root/") ||
    normalized === "/proc" ||
    normalized.startsWith("/proc/") ||
    normalized === "/sys" ||
    normalized.startsWith("/sys/") ||
    normalized === "/dev" ||
    normalized.startsWith("/dev/") ||
    normalized === "/var" ||
    normalized.startsWith("/var/") ||
    normalized === "/usr" ||
    normalized.startsWith("/usr/") ||
    normalized === "/bin" ||
    normalized.startsWith("/bin/") ||
    normalized === "/sbin" ||
    normalized.startsWith("/sbin/") ||
    normalized === "/opt" ||
    normalized.startsWith("/opt/")
  ) {
    throw new Error(
      "Access outside workspace is not allowed"
    );
  }

  if (
    normalized !== "/workspace" &&
    !normalized.startsWith("/workspace/")
  ) {
    normalized =
      `/workspace/${normalized.replace(
        /^\/+/,
        ""
      )}`;
  }

  return normalized;
};

const validateWorkspacePath = (
  inputPath?: string
): string => {
  const normalized =
    sanitizeWorkspacePath(inputPath);

  if (
    normalized !== "/workspace" &&
    normalized.length > 2000
  ) {
    throw new Error(
      "Workspace path is too long"
    );
  }

  return normalized;
};

const callWorker = async (
  endpoint: string,
  payload: Record<string, unknown>,
  timeout = WORKER_TIMEOUT
): Promise<{
  response: globalThis.Response;
  data: WorkerResponse;
}> => {
  const controller =
    new AbortController();

  const timer = setTimeout(() => {
    controller.abort();
  }, timeout);

  try {
    const response = await fetch(
      `${WORKER_SERVICE_URL}${endpoint}`,
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      }
    );

    let data: WorkerResponse;

    try {
      data =
        (await response.json()) as WorkerResponse;
    } catch {
      throw new Error(
        "Invalid response from worker service"
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

const workerErrorResponse = (
  res: Response,
  response: globalThis.Response,
  data: WorkerResponse,
  fallbackMessage: string
): void => {
  res.status(response.status).json({
    success: false,
    message:
      data.message ||
      data.error ||
      fallbackMessage,
  });
};

/* -------------------------------------------------------------------------- */
/* LIST WORKSPACE                                                             */
/* -------------------------------------------------------------------------- */

export const listWorkspace = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const roomIdRaw =
      req.query.roomId ||
      req.body?.roomId;

    const pathRaw =
      req.query.path ||
      req.body?.path;

    if (
      !roomIdRaw ||
      typeof roomIdRaw !== "string"
    ) {
      res.status(400).json({
        success: false,
        message: "roomId is required",
      });

      return;
    }

    const roomId =
      sanitizeRoomId(roomIdRaw);

    let workspacePath: string;

    try {
      workspacePath =
        validateWorkspacePath(
          typeof pathRaw === "string"
            ? pathRaw
            : "/workspace"
        );
    } catch (error) {
      res.status(400).json({
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Invalid workspace path",
      });

      return;
    }

    let result;

    try {
      result = await callWorker(
        "/internal/workspace/list",
        {
          roomId,
          path: workspacePath,
        }
      );
    } catch (error) {
      if (
        error instanceof Error &&
        error.name === "AbortError"
      ) {
        res.status(504).json({
          success: false,
          message:
            "Workspace service timed out",
        });

        return;
      }

      console.error(
        "❌ Workspace Worker Error:",
        error
      );

      res.status(503).json({
        success: false,
        message:
          "Workspace service is unavailable",
      });

      return;
    }

    const {
      response,
      data,
    } = result;

    if (!response.ok) {
      workerErrorResponse(
        res,
        response,
        data,
        "Failed to list workspace"
      );

      return;
    }

    res.status(200).json({
      success: true,
      roomId,
      path: workspacePath,
      files: data.files || [],
      data: data.data || null,
      containerId:
        data.containerId || null,
      containerName:
        data.containerName || null,
    });
  } catch (error) {
    console.error(
      "❌ List Workspace Error:",
      error
    );

    res.status(500).json({
      success: false,
      message:
        "Failed to list workspace",
    });
  }
};

/* -------------------------------------------------------------------------- */
/* READ FILE                                                                  */
/* -------------------------------------------------------------------------- */

export const readWorkspaceFile = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const {
      roomId,
      path,
      filePath,
    }: WorkspaceRequestBody = req.body;

    if (
      !roomId ||
      typeof roomId !== "string"
    ) {
      res.status(400).json({
        success: false,
        message: "roomId is required",
      });

      return;
    }

    const requestedPath =
      typeof filePath === "string" &&
      filePath.trim()
        ? filePath
        : path;

    if (
      !requestedPath ||
      typeof requestedPath !== "string"
    ) {
      res.status(400).json({
        success: false,
        message: "path is required",
      });

      return;
    }

    const safeRoomId =
      sanitizeRoomId(roomId);

    let safePath: string;

    try {
      safePath =
        validateWorkspacePath(
          requestedPath
        );
    } catch (error) {
      res.status(400).json({
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Invalid file path",
      });

      return;
    }

    if (safePath === "/workspace") {
      res.status(400).json({
        success: false,
        message:
          "A file path is required",
      });

      return;
    }

    let result;

    try {
      result = await callWorker(
        "/internal/workspace/read",
        {
          roomId: safeRoomId,
          path: safePath,
          filePath: safePath,
        }
      );
    } catch (error) {
      if (
        error instanceof Error &&
        error.name === "AbortError"
      ) {
        res.status(504).json({
          success: false,
          message:
            "File read operation timed out",
        });

        return;
      }

      console.error(
        "❌ Read File Worker Error:",
        error
      );

      res.status(503).json({
        success: false,
        message:
          "Workspace service is unavailable",
      });

      return;
    }

    const {
      response,
      data,
    } = result;

    if (!response.ok) {
      workerErrorResponse(
        res,
        response,
        data,
        "Failed to read file"
      );

      return;
    }

    res.status(200).json({
      success: true,
      roomId: safeRoomId,
      path: safePath,
      content:
        typeof data.content === "string"
          ? data.content
          : "",
      file: data.file || null,
      containerId:
        data.containerId || null,
      containerName:
        data.containerName || null,
    });
  } catch (error) {
    console.error(
      "❌ Read Workspace File Error:",
      error
    );

    res.status(500).json({
      success: false,
      message:
        "Failed to read workspace file",
    });
  }
};

/* -------------------------------------------------------------------------- */
/* CREATE FILE                                                                */
/* -------------------------------------------------------------------------- */

export const createWorkspaceFile = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const {
      roomId,
      path,
      filePath,
      fileName,
      content = "",
    }: WorkspaceRequestBody = req.body;

    if (
      !roomId ||
      typeof roomId !== "string"
    ) {
      res.status(400).json({
        success: false,
        message: "roomId is required",
      });

      return;
    }

    const requestedPath =
      typeof filePath === "string" &&
      filePath.trim()
        ? filePath
        : typeof path === "string" &&
            path.trim()
          ? path
          : fileName;

    if (
      !requestedPath ||
      typeof requestedPath !== "string"
    ) {
      res.status(400).json({
        success: false,
        message: "path is required",
      });

      return;
    }

    if (
      typeof content !== "string"
    ) {
      res.status(400).json({
        success: false,
        message:
          "content must be a string",
      });

      return;
    }

    const safeRoomId =
      sanitizeRoomId(roomId);

    let safePath: string;

    try {
      safePath =
        validateWorkspacePath(
          requestedPath
        );
    } catch (error) {
      res.status(400).json({
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Invalid file path",
      });

      return;
    }

    if (safePath === "/workspace") {
      res.status(400).json({
        success: false,
        message:
          "A file path is required",
      });

      return;
    }

    let result;

    try {
      result = await callWorker(
        "/internal/workspace/file",
        {
          roomId: safeRoomId,
          path: safePath,
          filePath: safePath,
          content,
        }
      );
    } catch (error) {
      if (
        error instanceof Error &&
        error.name === "AbortError"
      ) {
        res.status(504).json({
          success: false,
          message:
            "File creation timed out",
        });

        return;
      }

      console.error(
        "❌ Create File Worker Error:",
        error
      );

      res.status(503).json({
        success: false,
        message:
          "Workspace service is unavailable",
      });

      return;
    }

    const {
      response,
      data,
    } = result;

    if (!response.ok) {
      workerErrorResponse(
        res,
        response,
        data,
        "Failed to create file"
      );

      return;
    }

    res.status(201).json({
      success: true,
      message:
        "File created successfully",
      roomId: safeRoomId,
      path: safePath,
      file: data.file || null,
      containerId:
        data.containerId || null,
      containerName:
        data.containerName || null,
    });
  } catch (error) {
    console.error(
      "❌ Create Workspace File Error:",
      error
    );

    res.status(500).json({
      success: false,
      message:
        "Failed to create workspace file",
    });
  }
};

/* -------------------------------------------------------------------------- */
/* UPDATE FILE                                                                */
/* -------------------------------------------------------------------------- */

export const updateWorkspaceFile = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const {
      roomId,
      path,
      filePath,
      fileName,
      content,
      language,
    }: WorkspaceRequestBody = req.body;

    if (
      !roomId ||
      typeof roomId !== "string"
    ) {
      res.status(400).json({
        success: false,
        message: "roomId is required",
      });

      return;
    }

    const requestedPath =
      typeof filePath === "string" &&
      filePath.trim()
        ? filePath
        : typeof path === "string" &&
            path.trim()
          ? path
          : fileName;

    if (
      !requestedPath ||
      typeof requestedPath !== "string"
    ) {
      res.status(400).json({
        success: false,
        message: "path is required",
      });

      return;
    }

    if (
      typeof content !== "string"
    ) {
      res.status(400).json({
        success: false,
        message:
          "content must be a string",
      });

      return;
    }

    const safeRoomId =
      sanitizeRoomId(roomId);

    let safePath: string;

    try {
      safePath =
        validateWorkspacePath(
          requestedPath
        );
    } catch (error) {
      res.status(400).json({
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Invalid file path",
      });

      return;
    }

    if (safePath === "/workspace") {
      res.status(400).json({
        success: false,
        message:
          "A file path is required",
      });

      return;
    }

    let result;

    try {
      result = await callWorker(
        "/internal/workspace/write",
        {
          roomId: safeRoomId,
          path: safePath,
          filePath: safePath,
          fileName: safePath,
          content,
          language:
            typeof language === "string"
              ? language
              : "",
        }
      );
    } catch (error) {
      if (
        error instanceof Error &&
        error.name === "AbortError"
      ) {
        res.status(504).json({
          success: false,
          message:
            "File update timed out",
        });

        return;
      }

      console.error(
        "❌ Update File Worker Error:",
        error
      );

      res.status(503).json({
        success: false,
        message:
          "Workspace service is unavailable",
      });

      return;
    }

    const {
      response,
      data,
    } = result;

    if (!response.ok) {
      workerErrorResponse(
        res,
        response,
        data,
        "Failed to update file"
      );

      return;
    }

    res.status(200).json({
      success: true,
      message:
        "File updated successfully",
      roomId: safeRoomId,
      path: safePath,
      file: data.file || null,
      containerId:
        data.containerId || null,
      containerName:
        data.containerName || null,
    });
  } catch (error) {
    console.error(
      "❌ Update Workspace File Error:",
      error
    );

    res.status(500).json({
      success: false,
      message:
        "Failed to update workspace file",
    });
  }
};

/* -------------------------------------------------------------------------- */
/* DELETE FILE / DIRECTORY                                                    */
/* -------------------------------------------------------------------------- */

export const deleteWorkspaceItem = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const {
      roomId,
      path,
      filePath,
      recursive = false,
    }: WorkspaceRequestBody = req.body;

    if (
      !roomId ||
      typeof roomId !== "string"
    ) {
      res.status(400).json({
        success: false,
        message: "roomId is required",
      });

      return;
    }

    const requestedPath =
      typeof filePath === "string" &&
      filePath.trim()
        ? filePath
        : path;

    if (
      !requestedPath ||
      typeof requestedPath !== "string"
    ) {
      res.status(400).json({
        success: false,
        message: "path is required",
      });

      return;
    }

    if (
      typeof recursive !== "boolean"
    ) {
      res.status(400).json({
        success: false,
        message:
          "recursive must be a boolean",
      });

      return;
    }

    const safeRoomId =
      sanitizeRoomId(roomId);

    let safePath: string;

    try {
      safePath =
        validateWorkspacePath(
          requestedPath
        );
    } catch (error) {
      res.status(400).json({
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Invalid file path",
      });

      return;
    }

    if (safePath === "/workspace") {
      res.status(403).json({
        success: false,
        message:
          "Deleting the root workspace is not allowed",
      });

      return;
    }

    let result;

    try {
      result = await callWorker(
        "/internal/workspace/delete",
        {
          roomId: safeRoomId,
          path: safePath,
          filePath: safePath,
          recursive,
        }
      );
    } catch (error) {
      if (
        error instanceof Error &&
        error.name === "AbortError"
      ) {
        res.status(504).json({
          success: false,
          message:
            "Delete operation timed out",
        });

        return;
      }

      console.error(
        "❌ Delete Worker Error:",
        error
      );

      res.status(503).json({
        success: false,
        message:
          "Workspace service is unavailable",
      });

      return;
    }

    const {
      response,
      data,
    } = result;

    if (!response.ok) {
      workerErrorResponse(
        res,
        response,
        data,
        "Failed to delete workspace item"
      );

      return;
    }

    res.status(200).json({
      success: true,
      message:
        "Workspace item deleted successfully",
      roomId: safeRoomId,
      path: safePath,
    });
  } catch (error) {
    console.error(
      "❌ Delete Workspace Item Error:",
      error
    );

    res.status(500).json({
      success: false,
      message:
        "Failed to delete workspace item",
    });
  }
};

/* -------------------------------------------------------------------------- */
/* CREATE DIRECTORY                                                           */
/* -------------------------------------------------------------------------- */

export const createWorkspaceDirectory =
  async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const {
        roomId,
        path,
      }: WorkspaceRequestBody = req.body;

      if (
        !roomId ||
        typeof roomId !== "string"
      ) {
        res.status(400).json({
          success: false,
          message: "roomId is required",
        });

        return;
      }

      if (
        !path ||
        typeof path !== "string"
      ) {
        res.status(400).json({
          success: false,
          message:
            "path is required",
        });

        return;
      }

      const safeRoomId =
        sanitizeRoomId(roomId);

      let safePath: string;

      try {
        safePath =
          validateWorkspacePath(path);
      } catch (error) {
        res.status(400).json({
          success: false,
          message:
            error instanceof Error
              ? error.message
              : "Invalid directory path",
        });

        return;
      }

      if (safePath === "/workspace") {
        res.status(400).json({
          success: false,
          message:
            "Directory already exists",
        });

        return;
      }

      let result;

      try {
        result = await callWorker(
          "/internal/workspace/folder",
          {
            roomId: safeRoomId,
            path: safePath,
          }
        );
      } catch (error) {
        if (
          error instanceof Error &&
          error.name === "AbortError"
        ) {
          res.status(504).json({
            success: false,
            message:
              "Directory creation timed out",
          });

          return;
        }

        console.error(
          "❌ Create Directory Worker Error:",
          error
        );

        res.status(503).json({
          success: false,
          message:
            "Workspace service is unavailable",
        });

        return;
      }

      const {
        response,
        data,
      } = result;

      if (!response.ok) {
        workerErrorResponse(
          res,
          response,
          data,
          "Failed to create directory"
        );

        return;
      }

      res.status(201).json({
        success: true,
        message:
          "Directory created successfully",
        roomId: safeRoomId,
        path: safePath,
        file: data.file || null,
        containerId:
          data.containerId || null,
        containerName:
          data.containerName || null,
      });
    } catch (error) {
      console.error(
        "❌ Create Workspace Directory Error:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Failed to create workspace directory",
      });
    }
  };

/* -------------------------------------------------------------------------- */
/* RENAME / MOVE                                                              */
/* -------------------------------------------------------------------------- */

export const renameWorkspaceItem =
  async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const {
        roomId,
        oldPath,
        newPath,
      }: WorkspaceRequestBody = req.body;

      if (
        !roomId ||
        typeof roomId !== "string"
      ) {
        res.status(400).json({
          success: false,
          message: "roomId is required",
        });

        return;
      }

      if (
        !oldPath ||
        typeof oldPath !== "string"
      ) {
        res.status(400).json({
          success: false,
          message:
            "oldPath is required",
        });

        return;
      }

      if (
        !newPath ||
        typeof newPath !== "string"
      ) {
        res.status(400).json({
          success: false,
          message:
            "newPath is required",
        });

        return;
      }

      const safeRoomId =
        sanitizeRoomId(roomId);

      let safeOldPath: string;
      let safeNewPath: string;

      try {
        safeOldPath =
          validateWorkspacePath(
            oldPath
          );

        safeNewPath =
          validateWorkspacePath(
            newPath
          );
      } catch (error) {
        res.status(400).json({
          success: false,
          message:
            error instanceof Error
              ? error.message
              : "Invalid workspace path",
        });

        return;
      }

      if (
        safeOldPath === "/workspace"
      ) {
        res.status(403).json({
          success: false,
          message:
            "The root workspace cannot be renamed",
        });

        return;
      }

      if (
        safeNewPath === "/workspace"
      ) {
        res.status(400).json({
          success: false,
          message:
            "Invalid destination path",
        });

        return;
      }

      let result;

      try {
        result = await callWorker(
          "/internal/workspace/rename",
          {
            roomId: safeRoomId,
            oldPath: safeOldPath,
            newPath: safeNewPath,
          }
        );
      } catch (error) {
        if (
          error instanceof Error &&
          error.name === "AbortError"
        ) {
          res.status(504).json({
            success: false,
            message:
              "Rename operation timed out",
          });

          return;
        }

        console.error(
          "❌ Rename Worker Error:",
          error
        );

        res.status(503).json({
          success: false,
          message:
            "Workspace service is unavailable",
        });

        return;
      }

      const {
        response,
        data,
      } = result;

      if (!response.ok) {
        workerErrorResponse(
          res,
          response,
          data,
          "Failed to rename workspace item"
        );

        return;
      }

      res.status(200).json({
        success: true,
        message:
          "Workspace item renamed successfully",
        roomId: safeRoomId,
        oldPath: safeOldPath,
        newPath: safeNewPath,
      });
    } catch (error) {
      console.error(
        "❌ Rename Workspace Item Error:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Failed to rename workspace item",
      });
    }
  };

/* -------------------------------------------------------------------------- */
/* WORKSPACE STATUS                                                           */
/* -------------------------------------------------------------------------- */

export const getWorkspaceStatus =
  async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const roomIdRaw =
        req.query.roomId ||
        req.body?.roomId;

      if (
        !roomIdRaw ||
        typeof roomIdRaw !== "string"
      ) {
        res.status(400).json({
          success: false,
          message: "roomId is required",
        });

        return;
      }

      const roomId =
        sanitizeRoomId(roomIdRaw);

      let result;

      try {
        result = await callWorker(
          "/internal/workspace/status",
          {
            roomId,
          }
        );
      } catch (error) {
        if (
          error instanceof Error &&
          error.name === "AbortError"
        ) {
          res.status(504).json({
            success: false,
            message:
              "Workspace status request timed out",
          });

          return;
        }

        console.error(
          "❌ Workspace Status Worker Error:",
          error
        );

        res.status(503).json({
          success: false,
          message:
            "Workspace service is unavailable",
        });

        return;
      }

      const {
        response,
        data,
      } = result;

      if (!response.ok) {
        workerErrorResponse(
          res,
          response,
          data,
          "Failed to get workspace status"
        );

        return;
      }

      res.status(200).json({
        success: true,
        roomId,
        data: data.data || null,
        containerId:
          data.containerId || null,
        containerName:
          data.containerName || null,
      });
    } catch (error) {
      console.error(
        "❌ Workspace Status Error:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Failed to get workspace status",
      });
    }
  };