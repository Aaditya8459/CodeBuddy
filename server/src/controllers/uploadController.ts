import { Request, Response } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";

const WORKER_SERVICE_URL =
  process.env.WORKER_SERVICE_URL || "http://localhost:5001";

const MAX_FILE_SIZE =
  Number(process.env.MAX_UPLOAD_SIZE_MB || 50) * 1024 * 1024;

const TEMP_UPLOAD_DIR =
  process.env.TEMP_UPLOAD_DIR ||
  path.join(process.cwd(), "tmp", "uploads");

const ALLOWED_EXTENSIONS = new Set([
  ".txt",
  ".csv",
  ".tsv",
  ".json",
  ".xml",
  ".md",
  ".py",
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".java",
  ".c",
  ".h",
  ".cpp",
  ".cc",
  ".cxx",
  ".hpp",
  ".go",
  ".rs",
  ".html",
  ".css",
  ".scss",
  ".sass",
  ".sql",
  ".sh",
  ".yaml",
  ".yml",
  ".toml",
  ".ini",
  ".env",
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".zip",
]);

const BLOCKED_EXTENSIONS = new Set([
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".bat",
  ".cmd",
  ".msi",
  ".com",
  ".scr",
  ".vbs",
  ".ps1",
]);

fs.mkdirSync(TEMP_UPLOAD_DIR, {
  recursive: true,
});

const storage = multer.diskStorage({
  destination: (
    _req,
    _file,
    cb
  ) => {
    cb(null, TEMP_UPLOAD_DIR);
  },

  filename: (
    _req,
    file,
    cb
  ) => {
    const timestamp = Date.now();

    const randomPart = Math.random()
      .toString(36)
      .substring(2, 10);

    const safeOriginalName = path
      .basename(file.originalname)
      .replace(/[^a-zA-Z0-9._-]/g, "_");

    cb(
      null,
      `${timestamp}-${randomPart}-${safeOriginalName}`
    );
  },
});

const fileFilter: multer.Options["fileFilter"] = (
  _req,
  file,
  cb
) => {
  const extension = path
    .extname(file.originalname)
    .toLowerCase();

  if (BLOCKED_EXTENSIONS.has(extension)) {
    cb(
      new Error(
        `File type ${extension} is not allowed`
      )
    );
    return;
  }

  if (!ALLOWED_EXTENSIONS.has(extension)) {
    cb(
      new Error(
        `File type ${extension || "unknown"} is not supported`
      )
    );
    return;
  }

  cb(null, true);
};

export const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1,
  },
  fileFilter,
});

interface UploadedFileRequest extends Request {
  file?: Express.Multer.File;
}

interface WorkerUploadResponse {
  success: boolean;
  file?: {
    name?: string;
    path?: string;
    size?: number;
    mimeType?: string;
  };
  message?: string;
  error?: string;
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
  filePath?: string
): string => {
  if (!filePath || !filePath.trim()) {
    return "/workspace";
  }

  const normalized = filePath
    .trim()
    .replace(/\\/g, "/");

  if (normalized.includes("\0")) {
    throw new Error("Invalid file path");
  }

  if (
    normalized.includes("..") ||
    normalized.startsWith("~") ||
    normalized.startsWith("/etc") ||
    normalized.startsWith("/root") ||
    normalized.startsWith("/home")
  ) {
    throw new Error(
      "Invalid workspace path"
    );
  }

  if (
    !normalized.startsWith("/workspace") &&
    !normalized.startsWith("workspace")
  ) {
    throw new Error(
      "File must be stored inside /workspace"
    );
  }

  if (!normalized.startsWith("/")) {
    return `/${normalized}`;
  }

  return normalized;
};

const cleanupTemporaryFile = (
  filePath?: string
): void => {
  if (!filePath) {
    return;
  }

  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.error(
      "⚠️ Failed to remove temporary upload:",
      error
    );
  }
};

export const uploadFile = async (
  req: UploadedFileRequest,
  res: Response
): Promise<void> => {
  let temporaryFilePath: string | undefined;

  try {
    const roomIdRaw = req.body?.roomId;
    const targetPathRaw = req.body?.path;

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

    const roomId = sanitizeRoomId(roomIdRaw);

    let targetPath: string;

    try {
      targetPath = sanitizeWorkspacePath(
        targetPathRaw
      );
    } catch (error) {
      res.status(400).json({
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Invalid target path",
      });

      return;
    }

    if (!req.file) {
      res.status(400).json({
        success: false,
        message: "No file was uploaded",
      });

      return;
    }

    temporaryFilePath = req.file.path;

    const formData = new FormData();

    const fileBuffer = await fs.promises.readFile(
      temporaryFilePath
    );

    const blob = new Blob(
      [fileBuffer],
      {
        type:
          req.file.mimetype ||
          "application/octet-stream",
      }
    );

    formData.append(
      "file",
      blob,
      req.file.originalname
    );

    formData.append(
      "roomId",
      roomId
    );

    formData.append(
      "path",
      targetPath
    );

    const controller =
      new AbortController();

    const timeout = setTimeout(() => {
      controller.abort();
    }, 120000);

    let workerResponse: globalThis.Response;

    try {
      workerResponse = await fetch(
        `${WORKER_SERVICE_URL}/internal/workspace/upload`,
        {
          method: "POST",
          body: formData,
          signal: controller.signal,
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
            "File upload to workspace timed out",
        });

        return;
      }

      console.error(
        "❌ Worker Upload Connection Error:",
        error
      );

      res.status(503).json({
        success: false,
        message:
          "Workspace service is unavailable",
      });

      return;
    } finally {
      clearTimeout(timeout);
    }

    let workerData:
      | WorkerUploadResponse
      | null = null;

    try {
      workerData =
        (await workerResponse.json()) as WorkerUploadResponse;
    } catch {
      workerData = null;
    }

    if (!workerResponse.ok) {
      res.status(workerResponse.status).json({
        success: false,
        message:
          workerData?.message ||
          workerData?.error ||
          "Failed to upload file",
      });

      return;
    }

    res.status(201).json({
      success: true,
      message: "File uploaded successfully",
      roomId,
      file: workerData?.file || {
        name: req.file.originalname,
        path: targetPath,
        size: req.file.size,
        mimeType: req.file.mimetype,
      },
    });
  } catch (error) {
    console.error(
      "❌ Upload Controller Error:",
      error
    );

    res.status(500).json({
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Failed to upload file",
    });
  } finally {
    cleanupTemporaryFile(
      temporaryFilePath
    );
  }
};

export const uploadMultipleFiles = async (
  req: Request,
  res: Response
): Promise<void> => {
  res.status(501).json({
    success: false,
    message:
      "Multiple file upload is not enabled yet",
  });
};