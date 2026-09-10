import { Router } from "express";

import {
  listWorkspace,
  readWorkspaceFile,
  createWorkspaceFile,
  updateWorkspaceFile,
  deleteWorkspaceItem,
  createWorkspaceDirectory,
  renameWorkspaceItem,
  getWorkspaceStatus,
} from "../controllers/workspaceController";

const router = Router();

/* -------------------------------------------------------------------------- */
/* Workspace Listing                                                          */
/* -------------------------------------------------------------------------- */

/*
 * GET /api/workspace
 *
 * Lists the files and directories that currently exist inside the
 * persistent Docker room workspace.
 *
 * The controller communicates with the worker service, which reads the
 * actual contents of the room's Docker container.
 */
router.get(
  "/",
  listWorkspace
);

/* -------------------------------------------------------------------------- */
/* Workspace Status                                                           */
/* -------------------------------------------------------------------------- */

/*
 * GET /api/workspace/status
 *
 * Returns the current status of the room workspace/container.
 */
router.get(
  "/status",
  getWorkspaceStatus
);

/* -------------------------------------------------------------------------- */
/* Read Workspace File                                                        */
/* -------------------------------------------------------------------------- */

/*
 * POST /api/workspace/read
 *
 * Reads the actual file content from the persistent Docker room container.
 *
 * Expected body:
 *
 * {
 *   roomId: "BHASFBRO",
 *   path: "app.py"
 * }
 */
router.post(
  "/read",
  readWorkspaceFile
);

/* -------------------------------------------------------------------------- */
/* Create Workspace File                                                      */
/* -------------------------------------------------------------------------- */

/*
 * POST /api/workspace/file
 *
 * Creates a new file inside the persistent Docker room container.
 *
 * Expected body:
 *
 * {
 *   roomId: "BHASFBRO",
 *   path: "app.py",
 *   content: ""
 * }
 */
router.post(
  "/file",
  createWorkspaceFile
);

/* -------------------------------------------------------------------------- */
/* Update Workspace File                                                      */
/* -------------------------------------------------------------------------- */

/*
 * POST /api/workspace/file/update
 *
 * Updates an existing workspace file.
 *
 * This route is kept separate from /file so that file creation and file
 * updating do not conflict with each other.
 */
router.post(
  "/file/update",
  updateWorkspaceFile
);

/* -------------------------------------------------------------------------- */
/* Autosave Workspace File                                                    */
/*                                                                            */
/* Monaco Editor sends the latest file content to this endpoint.              */
/* The same updateWorkspaceFile controller is reused so autosave writes      */
/* directly into the persistent Docker room container.                       */
/* -------------------------------------------------------------------------- */

/*
 * POST /api/workspace/autosave
 *
 * Expected body:
 *
 * {
 *   roomId: "BHASFBRO",
 *   fileName: "app.py",
 *   path: "app.py",
 *   language: "python",
 *   content: "print('Hello')"
 * }
 *
 * Autosave and normal file updates therefore use the exact same persistence
 * mechanism.
 */
router.post(
  "/autosave",
  updateWorkspaceFile
);

/* -------------------------------------------------------------------------- */
/* Delete Workspace File / Directory                                          */
/* -------------------------------------------------------------------------- */

/*
 * DELETE /api/workspace/item
 *
 * Deletes a file or directory from the persistent Docker room container.
 */
router.delete(
  "/item",
  deleteWorkspaceItem
);

/* -------------------------------------------------------------------------- */
/* Delete Workspace File / Directory - Compatibility Alias                    */
/* -------------------------------------------------------------------------- */

/*
 * DELETE /api/workspace/delete
 *
 * Compatibility endpoint for the existing FileExplorer/page.tsx client.
 *
 * This intentionally uses the same controller as /item.
 */
router.delete(
  "/delete",
  deleteWorkspaceItem
);

/* -------------------------------------------------------------------------- */
/* Create Workspace Directory                                                 */
/* -------------------------------------------------------------------------- */

/*
 * POST /api/workspace/directory
 *
 * Creates a directory inside the persistent Docker room container.
 *
 * Expected body:
 *
 * {
 *   roomId: "BHASFBRO",
 *   path: "src"
 * }
 */
router.post(
  "/directory",
  createWorkspaceDirectory
);

/* -------------------------------------------------------------------------- */
/* Create Workspace Directory - Compatibility Alias                            */
/* -------------------------------------------------------------------------- */

/*
 * POST /api/workspace/folder
 *
 * Compatibility endpoint for the existing FileExplorer/page.tsx client.
 *
 * This intentionally uses the same controller as /directory.
 */
router.post(
  "/folder",
  createWorkspaceDirectory
);

/* -------------------------------------------------------------------------- */
/* Rename Workspace File / Directory                                          */
/* -------------------------------------------------------------------------- */

/*
 * POST /api/workspace/rename
 *
 * Renames a file or directory inside the persistent Docker room container.
 *
 * Expected body:
 *
 * {
 *   roomId: "BHASFBRO",
 *   oldPath: "old-name.py",
 *   newPath: "new-name.py"
 * }
 */
router.post(
  "/rename",
  renameWorkspaceItem
);

/* -------------------------------------------------------------------------- */
/* Export Router                                                              */
/* -------------------------------------------------------------------------- */

export default router;