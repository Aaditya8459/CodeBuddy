import {
  Router,
  Request,
  Response,
} from "express";

import {
  writeFile,
  readFile,
  listWorkspace,
  createFile,
  createFolder,
  deletePath,
} from "../workspace/workspaceService.js";

import containerManager from "../containers/containerManager.js";

const router = Router();

/**
 * ============================================================
 * Shared helper
 * ============================================================
 *
 * Ensures that the room Docker container exists and is running.
 *
 * IMPORTANT:
 *
 * Do not use getRoomContainer() directly here.
 *
 * The in-memory registry may be empty after a worker restart
 * even though the Docker container still exists.
 *
 * ensureRoom() uses Docker as the source of truth.
 */
async function ensureRoomContainer(
  roomId: string
) {
  const normalizedRoomId =
    typeof roomId === "string"
      ? roomId.trim()
      : "";

  if (!normalizedRoomId) {
    throw new Error(
      "Room ID is required"
    );
  }

  const roomContainer =
    await containerManager.ensureRoom(
      normalizedRoomId,
      {
        startIfStopped: true,

        /*
         * IMPORTANT:
         *
         * Do not recreate default directories
         * such as src, datasets, documents,
         * projects, or .codebuddy.
         *
         * The browser should create directories
         * dynamically.
         */
        initializeWorkspace: false,
      }
    );

  if (!roomContainer) {
    throw new Error(
      "Unable to ensure room container"
    );
  }

  return roomContainer;
}

/**
 * ============================================================
 * GET /list
 * ============================================================
 *
 * Returns the actual contents of:
 *
 * /workspace
 *
 * from the room's Docker container.
 *
 * This is the endpoint that fixes the browser reload problem.
 *
 * Browser:
 *
 * GET /api/workspace/:roomId
 *
 * Server:
 *
 * POST /internal/workspace/list
 *
 * Worker:
 *
 * GET /internal/workspace/list?roomId=...
 *
 * Docker:
 *
 * /workspace
 */
router.get(
  "/list",
  async (
    req: Request,
    res: Response
  ) => {
    try {
      const roomId =
        typeof req.query.roomId ===
        "string"
          ? req.query.roomId.trim()
          : "";

      if (!roomId) {
        return res
          .status(400)
          .json({
            success: false,
            error:
              "Room ID is required",
          });
      }

      console.log(
        "📂 Workspace list request:",
        {
          roomId,
        }
      );

      const roomContainer =
        await ensureRoomContainer(
          roomId
        );

      console.log(
        "🐳 Room container ready for list:",
        {
          roomId:
            roomContainer.roomId,
          containerId:
            roomContainer.containerId,
          containerName:
            roomContainer.containerName,
        }
      );

      const files =
        await listWorkspace(
          roomContainer.containerId
        );

      console.log(
        "📂 Workspace files found:",
        {
          roomId,
          count:
            files.length,
        }
      );

      return res.json({
        success: true,
        roomId,
        files,
        containerId:
          roomContainer.containerId,
        containerName:
          roomContainer.containerName,
      });
    } catch (error) {
      console.error(
        "❌ Workspace list error:",
        error
      );

      return res
        .status(500)
        .json({
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "Failed to list workspace",
        });
    }
  }
);

/**
 * ============================================================
 * GET /read
 * ============================================================
 *
 * Reads the actual file from the Docker room container.
 *
 * Example:
 *
 * GET /internal/workspace/read
 *     ?roomId=BHASFBRO
 *     &path=app.py
 *
 * The file is read from:
 *
 * /workspace/app.py
 */
router.get(
  "/read",
  async (
    req: Request,
    res: Response
  ) => {
    try {
      const roomId =
        typeof req.query.roomId ===
        "string"
          ? req.query.roomId.trim()
          : "";

      const requestedPath =
        typeof req.query.filePath ===
        "string" &&
        req.query.filePath.trim()
          ? req.query.filePath.trim()
          : typeof req.query.path ===
              "string"
            ? req.query.path.trim()
            : "";

      if (!roomId) {
        return res
          .status(400)
          .json({
            success: false,
            error:
              "Room ID is required",
          });
      }

      if (!requestedPath) {
        return res
          .status(400)
          .json({
            success: false,
            error:
              "File path is required",
          });
      }

      console.log(
        "📖 Workspace read request:",
        {
          roomId,
          filePath:
            requestedPath,
        }
      );

      const roomContainer =
        await ensureRoomContainer(
          roomId
        );

      const content =
        await readFile(
          roomContainer.containerId,
          requestedPath
        );

      console.log(
        "✅ Workspace file read:",
        {
          roomId,
          path:
            requestedPath,
          contentLength:
            content.length,
        }
      );

      return res.json({
        success: true,
        roomId,
        path:
          requestedPath,
        content,
        containerId:
          roomContainer.containerId,
        containerName:
          roomContainer.containerName,
      });
    } catch (error) {
      console.error(
        "❌ Workspace read error:",
        error
      );

      return res
        .status(500)
        .json({
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "Failed to read file",
        });
    }
  }
);

/**
 * ============================================================
 * POST /write
 * ============================================================
 *
 * Creates or overwrites a file.
 *
 * This keeps compatibility with your existing autosave code.
 *
 * Accepted body:
 *
 * {
 *   roomId: "BHASFBRO",
 *   path: "app.py",
 *   filePath: "app.py",
 *   content: "print('hello')"
 * }
 *
 * Either path OR filePath can be supplied.
 */
router.post(
  "/write",
  async (
    req: Request,
    res: Response
  ) => {
    try {
      const {
        roomId,
        path,
        filePath,
        content = "",
      } = req.body;

      const normalizedRoomId =
        typeof roomId === "string"
          ? roomId.trim()
          : "";

      const normalizedPath =
        typeof filePath === "string" &&
        filePath.trim()
          ? filePath.trim()
          : typeof path === "string"
            ? path.trim()
            : "";

      if (!normalizedRoomId) {
        return res
          .status(400)
          .json({
            success: false,
            error:
              "Room ID is required",
          });
      }

      if (!normalizedPath) {
        return res
          .status(400)
          .json({
            success: false,
            error:
              "File path is required",
          });
      }

      if (typeof content !== "string") {
        return res
          .status(400)
          .json({
            success: false,
            error:
              "File content must be a string",
          });
      }

      console.log(
        "📁 Workspace write request:",
        {
          roomId:
            normalizedRoomId,
          filePath:
            normalizedPath,
          contentLength:
            content.length,
        }
      );

      /*
       * Do not call getRoomContainer()
       * directly.
       *
       * ensureRoom() guarantees that the
       * Docker room container exists and
       * is running.
       */
      const roomContainer =
        await ensureRoomContainer(
          normalizedRoomId
        );

      console.log(
        "🐳 Room container ready:",
        {
          roomId:
            roomContainer.roomId,
          containerId:
            roomContainer.containerId,
          containerName:
            roomContainer.containerName,
        }
      );

      /*
       * Write the file into the room's
       * dedicated Docker container.
       */
      await writeFile(
        roomContainer.containerId,
        normalizedPath,
        content
      );

      console.log(
        "✅ Workspace file written:",
        {
          roomId:
            normalizedRoomId,
          path:
            normalizedPath,
          containerId:
            roomContainer.containerId,
        }
      );

      return res.json({
        success: true,
        roomId:
          normalizedRoomId,
        path:
          normalizedPath,
        containerId:
          roomContainer.containerId,
        containerName:
          roomContainer.containerName,
      });
    } catch (error) {
      console.error(
        "❌ Workspace write error:",
        error
      );

      return res
        .status(500)
        .json({
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "Failed to write file",
        });
    }
  }
);

/**
 * ============================================================
 * POST /file
 * ============================================================
 *
 * Creates a new file.
 *
 * Body:
 *
 * {
 *   roomId: "BHASFBRO",
 *   path: "src/main.py"
 * }
 *
 * The parent directory is automatically
 * created by the workspace service.
 */
router.post(
  "/file",
  async (
    req: Request,
    res: Response
  ) => {
    try {
      const {
        roomId,
        path,
        filePath,
        content,
      } = req.body;

      const normalizedRoomId =
        typeof roomId === "string"
          ? roomId.trim()
          : "";

      const normalizedPath =
        typeof filePath === "string" &&
        filePath.trim()
          ? filePath.trim()
          : typeof path === "string"
            ? path.trim()
            : "";

      if (!normalizedRoomId) {
        return res
          .status(400)
          .json({
            success: false,
            error:
              "Room ID is required",
          });
      }

      if (!normalizedPath) {
        return res
          .status(400)
          .json({
            success: false,
            error:
              "File path is required",
          });
      }

      console.log(
        "📄 Workspace file create request:",
        {
          roomId:
            normalizedRoomId,
          path:
            normalizedPath,
        }
      );

      const roomContainer =
        await ensureRoomContainer(
          normalizedRoomId
        );

      let result;

      /*
       * If content is supplied, create the
       * file with that content.
       *
       * Otherwise create an empty file.
       */
      if (
        typeof content ===
        "string"
      ) {
        result =
          await writeFile(
            roomContainer.containerId,
            normalizedPath,
            content
          );
      } else {
        result =
          await createFile(
            roomContainer.containerId,
            normalizedPath
          );
      }

      console.log(
        "✅ Workspace file created:",
        {
          roomId:
            normalizedRoomId,
          path:
            normalizedPath,
        }
      );

      return res
        .status(201)
        .json({
          success: true,
          roomId:
            normalizedRoomId,
          path:
            result.path,
          containerId:
            roomContainer.containerId,
          containerName:
            roomContainer.containerName,
        });
    } catch (error) {
      console.error(
        "❌ Workspace file create error:",
        error
      );

      return res
        .status(500)
        .json({
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "Failed to create file",
        });
    }
  }
);

/**
 * ============================================================
 * POST /folder
 * ============================================================
 *
 * Creates a folder dynamically inside
 * the Docker room container.
 *
 * Body:
 *
 * {
 *   roomId: "BHASFBRO",
 *   path: "src"
 * }
 */
router.post(
  "/folder",
  async (
    req: Request,
    res: Response
  ) => {
    try {
      const {
        roomId,
        path,
      } = req.body;

      const normalizedRoomId =
        typeof roomId === "string"
          ? roomId.trim()
          : "";

      const normalizedPath =
        typeof path === "string"
          ? path.trim()
          : "";

      if (!normalizedRoomId) {
        return res
          .status(400)
          .json({
            success: false,
            error:
              "Room ID is required",
          });
      }

      if (!normalizedPath) {
        return res
          .status(400)
          .json({
            success: false,
            error:
              "Folder path is required",
          });
      }

      console.log(
        "📁 Workspace folder create request:",
        {
          roomId:
            normalizedRoomId,
          path:
            normalizedPath,
        }
      );

      const roomContainer =
        await ensureRoomContainer(
          normalizedRoomId
        );

      const result =
        await createFolder(
          roomContainer.containerId,
          normalizedPath
        );

      console.log(
        "✅ Workspace folder created:",
        {
          roomId:
            normalizedRoomId,
          path:
            normalizedPath,
        }
      );

      return res
        .status(201)
        .json({
          success: true,
          roomId:
            normalizedRoomId,
          path:
            result.path,
          containerId:
            roomContainer.containerId,
          containerName:
            roomContainer.containerName,
        });
    } catch (error) {
      console.error(
        "❌ Workspace folder create error:",
        error
      );

      return res
        .status(500)
        .json({
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "Failed to create folder",
        });
    }
  }
);

/**
 * ============================================================
 * DELETE /delete
 * ============================================================
 *
 * Deletes a file or folder from the Docker
 * room container.
 *
 * Body:
 *
 * {
 *   roomId: "BHASFBRO",
 *   path: "src/main.py"
 * }
 *
 * For a folder, deletePath() can recursively
 * remove the folder.
 */
router.delete(
  "/delete",
  async (
    req: Request,
    res: Response
  ) => {
    try {
      const {
        roomId,
        path,
        filePath,
      } = req.body;

      const normalizedRoomId =
        typeof roomId === "string"
          ? roomId.trim()
          : "";

      const normalizedPath =
        typeof filePath === "string" &&
        filePath.trim()
          ? filePath.trim()
          : typeof path === "string"
            ? path.trim()
            : "";

      if (!normalizedRoomId) {
        return res
          .status(400)
          .json({
            success: false,
            error:
              "Room ID is required",
          });
      }

      if (!normalizedPath) {
        return res
          .status(400)
          .json({
            success: false,
            error:
              "File path is required",
          });
      }

      console.log(
        "🗑️ Workspace delete request:",
        {
          roomId:
            normalizedRoomId,
          path:
            normalizedPath,
        }
      );

      const roomContainer =
        await ensureRoomContainer(
          normalizedRoomId
        );

      const result =
        await deletePath(
          roomContainer.containerId,
          normalizedPath
        );

      console.log(
        "✅ Workspace path deleted:",
        {
          roomId:
            normalizedRoomId,
          path:
            normalizedPath,
        }
      );

      return res.json({
        success: true,
        roomId:
          normalizedRoomId,
        path:
          result.path,
        containerId:
          roomContainer.containerId,
        containerName:
          roomContainer.containerName,
      });
    } catch (error) {
      console.error(
        "❌ Workspace delete error:",
        error
      );

      return res
        .status(500)
        .json({
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "Failed to delete workspace path",
        });
    }
  }
);

export default router;