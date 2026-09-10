"use client";

import {
  useState,
  useMemo,
  useCallback,
} from "react";

import {
  FileCode2,
  FileJson,
  FileText,
  FileType2,
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Plus,
  FolderPlus,
  FilePlus2,
  Trash2,
  RefreshCw,
  MoreHorizontal,
  Package,
  Database,
  Container,
  Pencil,
} from "lucide-react";

import { Button } from "@/components/ui/button";

/* =========================================================
   TYPES
========================================================= */

export interface FileItem {
  name: string;
  type: "file" | "folder";
  icon?: string;
  children?: FileItem[];
}

interface FileExplorerProps {
  /**
   * Docker-backed filesystem tree.
   *
   * IMPORTANT:
   * This defaults to an EMPTY array.
   *
   * There are NO default files.
   * There are NO default folders.
   *
   * Docker is the source of truth.
   */
  files?: FileItem[];

  /**
   * Currently active file.
   *
   * Example:
   *   "main.py"
   *   "src/main.py"
   *   "src/components/App.tsx"
   */
  activeFile: string;

  /**
   * Called when a file is selected.
   */
  onFileSelect: (fileName: string) => void;

  /**
   * Create a file inside the Docker workspace.
   *
   * parentPath:
   *
   * undefined
   *     -> /workspace
   *
   * "src"
   *     -> /workspace/src
   *
   * "src/components"
   *     -> /workspace/src/components
   */
  onCreateFile?: (
    fileName: string,
    parentPath?: string
  ) => void | Promise<void>;

  /**
   * Create a folder inside the Docker workspace.
   */
  onCreateFolder?: (
    folderName: string,
    parentPath?: string
  ) => void | Promise<void>;

  /**
   * Delete a file or folder from Docker.
   */
  onDelete?: (
    item: FileItem,
    parentPath?: string
  ) => void | Promise<void>;

  /**
   * Rename a file or folder inside Docker.
   *
   * oldPath:
   *
   * "main.py"
   * "src/main.py"
   * "src/components"
   *
   * newPath:
   *
   * "app.py"
   * "src/app.py"
   * "src/ui"
   */
  onRename?: (
    oldPath: string,
    newPath: string
  ) => void | Promise<void>;

  /**
   * Refresh filesystem from Docker.
   */
  onRefresh?: () => void | Promise<void>;

  /**
   * Indicates that the room Docker container
   * is available.
   */
  dockerConnected?: boolean;

  /**
   * Indicates that the filesystem is currently
   * being loaded from Docker.
   */
  loading?: boolean;
}

/* =========================================================
   COMPONENT
========================================================= */

export default function FileExplorer({
  /*
   * IMPORTANT:
   *
   * Empty array.
   *
   * This is intentionally NOT a default filesystem.
   */
  files = [],

  activeFile,

  onFileSelect,

  onCreateFile,

  onCreateFolder,

  onDelete,

  onRename,

  onRefresh,

  dockerConnected = false,

  loading = false,
}: FileExplorerProps) {
  /* =======================================================
     STATE
  ======================================================= */

  /**
   * Expanded Docker folders.
   *
   * Initially empty because a new room/container
   * contains no folders.
   */
  const [expandedFolders, setExpandedFolders] =
    useState<string[]>([]);

  /**
   * Currently hovered tree item.
   */
  const [hoveredItem, setHoveredItem] =
    useState<string | null>(null);

  /**
   * Create file/folder popup.
   */
  const [showActions, setShowActions] =
    useState(false);

  /**
   * Folder currently selected as the creation
   * destination.
   *
   * Empty string means Docker /workspace root.
   */
  const [selectedFolder, setSelectedFolder] =
    useState<string>("");

  /* =======================================================
     FILE COUNT
  ======================================================= */

  const fileCount = useMemo(() => {
    const countFiles = (
      items: FileItem[]
    ): number => {
      return items.reduce(
        (total, item) => {
          if (item.type === "file") {
            return total + 1;
          }

          return (
            total +
            countFiles(
              item.children ?? []
            )
          );
        },
        0
      );
    };

    return countFiles(files);
  }, [files]);

  /* =======================================================
     FOLDER COUNT
  ======================================================= */

  const folderCount = useMemo(() => {
    const countFolders = (
      items: FileItem[]
    ): number => {
      return items.reduce(
        (total, item) => {
          if (item.type !== "folder") {
            return total;
          }

          return (
            total +
            1 +
            countFolders(
              item.children ?? []
            )
          );
        },
        0
      );
    };

    return countFolders(files);
  }, [files]);

  /* =======================================================
     TOGGLE FOLDER
  ======================================================= */

  const toggleFolder = useCallback(
    (path: string) => {
      setExpandedFolders(
        (previous) => {
          if (
            previous.includes(path)
          ) {
            return previous.filter(
              (folder) =>
                folder !== path
            );
          }

          return [
            ...previous,
            path,
          ];
        }
      );

      /*
       * Make this folder the target for
       * New File / New Folder.
       */
      setSelectedFolder(path);
    },
    []
  );

  /* =======================================================
     FILE ICON
  ======================================================= */

  const getIcon = useCallback(
    (
      iconType?: string,
      fileName?: string
    ) => {
      /*
      * Prefer icon returned by backend.
      *
      * Otherwise derive icon from filename.
      */
      const extension =
        iconType ||
        fileName
          ?.split(".")
          .pop()
          ?.toLowerCase();

      switch (extension) {
        /* =================================================
          TYPESCRIPT
        ================================================= */

        case "tsx":
        case "ts":
          return (
            <FileCode2
              className="h-4 w-4 text-[#3178c6]"
            />
          );

        /* =================================================
          JAVASCRIPT
        ================================================= */

        case "js":
        case "jsx":
        case "mjs":
        case "cjs":
          return (
            <FileCode2
              className="h-4 w-4 text-[#f7df1e]"
            />
          );

        /* =================================================
          PYTHON
        ================================================= */

        case "py":
          return (
            <FileCode2
              className="h-4 w-4 text-[#3776ab]"
            />
          );

        /* =================================================
          JAVA
        ================================================= */

        case "java":
          return (
            <FileCode2
              className="h-4 w-4 text-[#ed333b]"
            />
          );

        /* =================================================
          C
        ================================================= */

        case "c":
          return (
            <FileCode2
              className="h-4 w-4 text-[#5c6bc0]"
            />
          );

        /* =================================================
          C++
        ================================================= */

        case "cpp":
        case "cc":
        case "cxx":
          return (
            <FileCode2
              className="h-4 w-4 text-[#a855f7]"
            />
          );

        /* =================================================
          GO
        ================================================= */

        case "go":
          return (
            <FileCode2
              className="h-4 w-4 text-[#00add8]"
            />
          );

        /* =================================================
          RUST
        ================================================= */

        case "rs":
          return (
            <FileCode2
              className="h-4 w-4 text-[#ff8a3d]"
            />
          );

        /* =================================================
          HTML
        ================================================= */

        case "html":
        case "htm":
          return (
            <FileCode2
              className="h-4 w-4 text-[#e34f26]"
            />
          );

        /* =================================================
          CSS
        ================================================= */

        case "css":
        case "scss":
        case "sass":
          return (
            <FileType2
              className="h-4 w-4 text-[#2965f1]"
            />
          );

        /* =================================================
          JSON
        ================================================= */

        case "json":
          return (
            <FileJson
              className="h-4 w-4 text-[#f59e0b]"
            />
          );

        /* =================================================
          MARKDOWN
        ================================================= */

        case "md":
        case "mdx":
          return (
            <FileText
              className="h-4 w-4 text-[#ec4899]"
            />
          );

        /* =================================================
          SVG
        ================================================= */

        case "svg":
          return (
            <FileCode2
              className="h-4 w-4 text-[#f97316]"
            />
          );

        /* =================================================
          SQL
        ================================================= */

        case "sql":
          return (
            <FileCode2
              className="h-4 w-4 text-[#14b8a6]"
            />
          );

        /* =================================================
          XML
        ================================================= */

        case "xml":
          return (
            <FileCode2
              className="h-4 w-4 text-[#84cc16]"
            />
          );

        /* =================================================
          YAML
        ================================================= */

        case "yaml":
        case "yml":
          return (
            <FileCode2
              className="h-4 w-4 text-[#ef4444]"
            />
          );

        /* =================================================
          HEADER FILES
        ================================================= */

        case "h":
          return (
            <FileCode2
              className="h-4 w-4 text-[#6366f1]"
            />
          );

        case "hpp":
          return (
            <FileCode2
              className="h-4 w-4 text-[#c084fc]"
            />
          );

        /* =================================================
          TEXT
        ================================================= */

        case "txt":
          return (
            <FileText
              className="h-4 w-4 text-[#a1a1aa]"
            />
          );

        /* =================================================
          DEFAULT
        ================================================= */

        default:
          return (
            <FileText
              className="h-4 w-4 text-[#71717a]"
            />
          );
      }
    },
    []
  );

  /* =======================================================
     CREATE FILE
  ======================================================= */

  const handleCreateFile = async () => {
    /*
     * Never allow a file operation when
     * Docker isn't available.
     */
    if (!dockerConnected) {
      window.alert(
        "Docker workspace is not connected."
      );

      return;
    }

    /*
     * Ask user for filename.
     */
    const fileName =
      window.prompt(
        selectedFolder
          ? `Enter file name in "${selectedFolder}"`
          : "Enter file name"
      );

    /*
     * Cancel / empty input.
     */
    if (
      !fileName ||
      !fileName.trim()
    ) {
      return;
    }

    const cleanFileName =
      fileName.trim();

    /*
     * Basic path traversal protection
     * on the client side.
     *
     * Backend MUST also validate this.
     */
    if (
      cleanFileName.includes("..") ||
      cleanFileName.includes("/") ||
      cleanFileName.includes("\\")
    ) {
      window.alert(
        "Invalid file name."
      );

      return;
    }

    try {
      /*
       * Send creation request to parent.
       *
       * Parent should call Docker API.
       */
      await onCreateFile?.(
        cleanFileName,
        selectedFolder ||
          undefined
      );
    } catch (error) {
      console.error(
        "Failed to create Docker file:",
        error
      );

      window.alert(
        "Failed to create file."
      );
    }
  };

  /* =======================================================
     CREATE FOLDER
  ======================================================= */

  const handleCreateFolder = async () => {
    /*
     * Docker is required.
     */
    if (!dockerConnected) {
      window.alert(
        "Docker workspace is not connected."
      );

      return;
    }

    /*
     * Ask user for folder name.
     */
    const folderName =
      window.prompt(
        selectedFolder
          ? `Enter folder name in "${selectedFolder}"`
          : "Enter folder name"
      );

    /*
     * Cancel / empty input.
     */
    if (
      !folderName ||
      !folderName.trim()
    ) {
      return;
    }

    const cleanFolderName =
      folderName.trim();

    /*
     * Basic path traversal protection.
     *
     * Backend MUST validate this too.
     */
    if (
      cleanFolderName.includes("..") ||
      cleanFolderName.includes("/") ||
      cleanFolderName.includes("\\")
    ) {
      window.alert(
        "Invalid folder name."
      );

      return;
    }

    try {
      /*
       * Parent component will create the
       * directory inside Docker.
       */
      await onCreateFolder?.(
        cleanFolderName,
        selectedFolder ||
          undefined
      );
    } catch (error) {
      console.error(
        "Failed to create Docker folder:",
        error
      );

      window.alert(
        "Failed to create folder."
      );
    }
  };

  /* =======================================================
     DELETE
  ======================================================= */

  const handleDelete = async (
    item: FileItem,
    parentPath?: string
  ) => {
    /*
     * Docker is required.
     */
    if (!dockerConnected) {
      window.alert(
        "Docker workspace is not connected."
      );

      return;
    }

    /*
     * Confirm deletion.
     */
    const confirmed =
      window.confirm(
        `Delete "${item.name}" from the Docker workspace?`
      );

    if (!confirmed) {
      return;
    }

    try {
      /*
       * Parent component performs the
       * actual Docker deletion.
       */
      await onDelete?.(
        item,
        parentPath
      );
    } catch (error) {
      console.error(
        "Failed to delete Docker item:",
        error
      );

      window.alert(
        `Failed to delete "${item.name}".`
      );
    }
  };

  /* =======================================================
     RENAME
  ======================================================= */

  const handleRename = async (
    item: FileItem,
    parentPath = ""
  ) => {
    /*
     * Docker is required.
     */
    if (!dockerConnected) {
      window.alert(
        "Docker workspace is not connected."
      );

      return;
    }

    /*
     * Build the current relative path.
     *
     * Example:
     *
     * main.py
     * src/main.py
     * src/components/App.tsx
     */
    const oldPath =
      parentPath
        ? `${parentPath}/${item.name}`
        : item.name;

    /*
     * Ask user for the new name.
     */
    const newName =
      window.prompt(
        `Rename "${item.name}"`,
        item.name
      );

    /*
     * Cancel / empty input.
     */
    if (
      !newName ||
      !newName.trim()
    ) {
      return;
    }

    const cleanNewName =
      newName.trim();

    /*
     * Nothing changed.
     */
    if (
      cleanNewName ===
      item.name
    ) {
      return;
    }

    /*
     * Basic path traversal protection.
     *
     * Only a name is allowed here.
     */
    if (
      cleanNewName.includes("..") ||
      cleanNewName.includes("/") ||
      cleanNewName.includes("\\")
    ) {
      window.alert(
        "Invalid new name."
      );

      return;
    }

    /*
     * Build the new relative path.
     */
    const newPath =
      parentPath
        ? `${parentPath}/${cleanNewName}`
        : cleanNewName;

    try {
      /*
       * Parent component performs the
       * actual Docker rename.
       */
      await onRename?.(
        oldPath,
        newPath
      );
    } catch (error) {
      console.error(
        "Failed to rename Docker item:",
        error
      );

      window.alert(
        `Failed to rename "${item.name}".`
      );
    }
  };

  /* =======================================================
     REFRESH
  ======================================================= */

  const handleRefresh = async () => {
    /*
     * Cannot refresh a disconnected
     * Docker workspace.
     */
    if (!dockerConnected) {
      return;
    }

    try {
      /*
       * Parent fetches the tree from Docker.
       */
      await onRefresh?.();
    } catch (error) {
      console.error(
        "Failed to refresh Docker workspace:",
        error
      );
    }
  };

  /* =======================================================
     RENDER TREE
  ======================================================= */

  const renderItems = (
    items: FileItem[],
    parentPath = "",
    depth = 0
  ) => {
    return items.map(
      (item) => {
        /*
         * Build relative Docker path.
         *
         * Example:
         *
         * src
         * src/main.py
         * src/components
         * src/components/App.tsx
         */
        const currentPath =
          parentPath
            ? `${parentPath}/${item.name}`
            : item.name;

        /*
         * Is folder expanded?
         */
        const isExpanded =
          expandedFolders.includes(
            currentPath
          );

        /*
         * Is file currently active?
         */
        const isActive =
          activeFile ===
            item.name ||
          activeFile ===
            currentPath;

        /*
         * Is item hovered?
         */
        const isHovered =
          hoveredItem ===
          currentPath;

        /* =================================================
           FOLDER
        ================================================= */

        if (
          item.type ===
          "folder"
        ) {
          return (
            <div
              key={currentPath}
            >
              <div
                className={`
                  group
                  relative
                  flex
                  w-full
                  items-center
                  rounded-sm
                  transition-all
                  duration-150
                  ${
                    isHovered
                      ? "bg-[#18181b]"
                      : ""
                  }
                `}
                onMouseEnter={() =>
                  setHoveredItem(
                    currentPath
                  )
                }
                onMouseLeave={() =>
                  setHoveredItem(
                    null
                  )
                }
              >
                <button
                  type="button"
                  onClick={() =>
                    toggleFolder(
                      currentPath
                    )
                  }
                  className={`
                    flex
                    min-w-0
                    flex-1
                    items-center
                    py-1.5
                    text-left
                    text-[#a1a1aa]
                    hover:text-white
                  `}
                  style={{
                    paddingLeft:
                      10 +
                      depth * 14,
                    paddingRight: 6,
                  }}
                >
                  {/* Chevron */}
                  <span className="mr-1 shrink-0">
                    {isExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )}
                  </span>

                  {/* Folder Icon */}
                  {isExpanded ? (
                    <FolderOpen
                      className={`
                        mr-2
                        h-4
                        w-4
                        shrink-0
                        text-[#fa8c00]
                      `}
                    />
                  ) : (
                    <Folder
                      className={`
                        mr-2
                        h-4
                        w-4
                        shrink-0
                        text-[#71717a]
                      `}
                    />
                  )}

                  {/* Folder Name */}
                  <span
                    className={`
                      truncate
                      text-[12px]
                      font-mono
                    `}
                  >
                    {item.name}
                  </span>
                </button>

                {/* Folder Actions */}
                {isHovered && (
                  <div
                    className="
                      mr-2
                      flex
                      items-center
                      gap-0.5
                    "
                  >
                    {/* Folder Rename */}
                    <button
                      type="button"
                      onClick={(
                        event
                      ) => {
                        event.stopPropagation();

                        void handleRename(
                          item,
                          parentPath
                        );
                      }}
                      className={`
                        rounded
                        p-1
                        text-[#52525b]
                        transition-all
                        hover:bg-[#27272a]
                        hover:text-[#fa8c00]
                      `}
                      title="Rename folder"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>

                    {/* Folder Delete */}
                    <button
                      type="button"
                      onClick={(
                        event
                      ) => {
                        event.stopPropagation();

                        void handleDelete(
                          item,
                          parentPath
                        );
                      }}
                      className={`
                        rounded
                        p-1
                        text-[#52525b]
                        transition-all
                        hover:bg-[#f48771]/10
                        hover:text-[#f48771]
                      `}
                      title="Delete folder"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>

              {/* Folder Children */}
              {isExpanded &&
                item.children &&
                item.children.length >
                  0 && (
                  <div>
                    {renderItems(
                      item.children,
                      currentPath,
                      depth + 1
                    )}
                  </div>
                )}
            </div>
          );
        }

        /* =================================================
           FILE
        ================================================= */

        return (
          <div
            key={currentPath}
            className={`
              group
              relative
              flex
              w-full
              items-center
              border-l-2
              transition-all
              duration-150
              ${
                isActive
                  ? `
                    border-[#fa8c00]
                    bg-[#18181b]
                    text-white
                  `
                  : `
                    border-transparent
                    text-[#a1a1aa]
                    hover:bg-[#18181b]/70
                    hover:text-white
                  `
              }
            `}
            onMouseEnter={() =>
              setHoveredItem(
                currentPath
              )
            }
            onMouseLeave={() =>
              setHoveredItem(
                null
              )
            }
          >
            {/* File Select */}
            <button
              type="button"
              onClick={() =>
                onFileSelect(
                  currentPath
                )
              }
              className={`
                flex
                min-w-0
                flex-1
                items-center
                py-1.5
                text-left
              `}
              style={{
                paddingLeft:
                  26 +
                  depth * 14,
                paddingRight: 6,
              }}
            >
              {/* File Icon */}
              <span className="mr-2 shrink-0">
                {getIcon(
                  item.icon,
                  item.name
                )}
              </span>

              {/* File Name */}
              <span
                className={`
                  truncate
                  text-[12px]
                  font-mono
                `}
              >
                {item.name}
              </span>
            </button>

            {/* File Actions */}
            {isHovered && (
              <div
                className="
                  mr-2
                  flex
                  items-center
                  gap-0.5
                "
              >
                {/* File Rename */}
                <button
                  type="button"
                  onClick={(
                    event
                  ) => {
                    event.stopPropagation();

                    void handleRename(
                      item,
                      parentPath
                    );
                  }}
                  className={`
                    rounded
                    p-1
                    text-[#52525b]
                    transition-all
                    hover:bg-[#27272a]
                    hover:text-[#fa8c00]
                  `}
                  title="Rename file"
                >
                  <Pencil className="h-3 w-3" />
                </button>

                {/* File Delete */}
                <button
                  type="button"
                  onClick={(
                    event
                  ) => {
                    event.stopPropagation();

                    void handleDelete(
                      item,
                      parentPath
                    );
                  }}
                  className={`
                    rounded
                    p-1
                    text-[#52525b]
                    transition-all
                    hover:bg-[#f48771]/10
                    hover:text-[#f48771]
                  `}
                  title="Delete file"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>
        );
      }
    );
  };

  /* =========================================================
     RENDER
  ========================================================= */

  return (
    <div
      className={`
        relative
        flex
        h-full
        w-full
        flex-col
        select-none
        overflow-hidden
        bg-[#0f0f0f]
        font-mono
      `}
    >
      {/* =====================================================
          HEADER
      ===================================================== */}

      <div
        className={`
          flex
          min-h-[42px]
          items-center
          justify-between
          border-b
          border-[#27272a]/70
          bg-[#111111]
          px-3
        `}
      >
        {/* Explorer Title */}
        <div className="flex items-center gap-2">
          <span
            className={`
              text-[10px]
              font-bold
              uppercase
              tracking-[0.18em]
              text-[#71717a]
            `}
          >
            Explorer
          </span>

          {/* File Count */}
          <span
            className={`
              rounded
              bg-[#1a1a1a]
              px-1.5
              py-0.5
              text-[9px]
              text-[#52525b]
            `}
          >
            {fileCount}
          </span>
        </div>

        {/* Header Actions */}
        <div className="relative flex items-center gap-0.5">
          {/* =================================================
              ADD BUTTON
          ================================================= */}

          <Button
            variant="ghost"
            size="icon"
            onClick={() =>
              setShowActions(
                (previous) =>
                  !previous
              )
            }
            disabled={
              !dockerConnected
            }
            title={
              dockerConnected
                ? "New file or folder"
                : "Docker workspace is not connected"
            }
            className={`
              h-7
              w-7
              text-[#71717a]
              hover:bg-[#27272a]
              hover:text-white
            `}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>

          {/* =================================================
              REFRESH BUTTON
          ================================================= */}

          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              void handleRefresh();
            }}
            disabled={
              loading ||
              !dockerConnected
            }
            title="Refresh Docker workspace"
            className={`
              h-7
              w-7
              text-[#71717a]
              hover:bg-[#27272a]
              hover:text-white
            `}
          >
            <RefreshCw
              className={`
                h-3.5
                w-3.5
                ${
                  loading
                    ? "animate-spin"
                    : ""
                }
              `}
            />
          </Button>

          {/* =================================================
              MORE BUTTON
          ================================================= */}

          <Button
            variant="ghost"
            size="icon"
            title="Explorer options"
            className={`
              h-7
              w-7
              text-[#71717a]
              hover:bg-[#27272a]
              hover:text-white
            `}
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </Button>

          {/* =================================================
              CREATE MENU
          ================================================= */}

          {showActions && (
            <div
              className={`
                absolute
                right-0
                top-8
                z-50
                w-44
                overflow-hidden
                rounded-lg
                border
                border-[#3f3f46]
                bg-[#18181b]
                p-1
                shadow-2xl
                shadow-black/40
              `}
            >
              {/* New File */}
              <button
                type="button"
                disabled={
                  !dockerConnected
                }
                onClick={() => {
                  setShowActions(
                    false
                  );

                  void handleCreateFile();
                }}
                className={`
                  flex
                  w-full
                  items-center
                  gap-2
                  rounded-md
                  px-2.5
                  py-2
                  text-left
                  text-[11px]
                  text-[#a1a1aa]
                  hover:bg-[#27272a]
                  hover:text-white
                  disabled:cursor-not-allowed
                  disabled:opacity-40
                `}
              >
                <FilePlus2 className="h-3.5 w-3.5" />

                <span>
                  New File
                </span>
              </button>

              {/* New Folder */}
              <button
                type="button"
                disabled={
                  !dockerConnected
                }
                onClick={() => {
                  setShowActions(
                    false
                  );

                  void handleCreateFolder();
                }}
                className={`
                  flex
                  w-full
                  items-center
                  gap-2
                  rounded-md
                  px-2.5
                  py-2
                  text-left
                  text-[11px]
                  text-[#a1a1aa]
                  hover:bg-[#27272a]
                  hover:text-white
                  disabled:cursor-not-allowed
                  disabled:opacity-40
                `}
              >
                <FolderPlus className="h-3.5 w-3.5" />

                <span>
                  New Folder
                </span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* =====================================================
          DOCKER WORKSPACE STATUS
      ===================================================== */}

      <div
        className={`
          flex
          items-center
          justify-between
          border-b
          border-[#27272a]/50
          bg-[#0c0c0c]
          px-3
          py-1.5
        `}
      >
        {/* Workspace Label */}
        <div className="flex items-center gap-2">
          <Container
            className={`
              h-3
              w-3
              text-[#71717a]
            `}
          />

          <span
            className={`
              text-[9px]
              uppercase
              tracking-wider
              text-[#52525b]
            `}
          >
            Docker Workspace
          </span>
        </div>

        {/* Docker Status */}
        <div className="flex items-center gap-1.5">
          <span
            className={`
              h-1.5
              w-1.5
              rounded-full
              ${
                dockerConnected
                  ? `
                    bg-[#89d185]
                    shadow-[0_0_6px_rgba(137,209,133,0.5)]
                  `
                  : "bg-[#52525b]"
              }
            `}
          />

          <span
            className={`
              text-[9px]
              ${
                dockerConnected
                  ? "text-[#89d185]"
                  : "text-[#52525b]"
              }
            `}
          >
            {dockerConnected
              ? "Connected"
              : "Disconnected"}
          </span>
        </div>
      </div>

      {/* =====================================================
          FILE TREE
      ===================================================== */}

      <div
        className={`
          custom-explorer-scrollbar
          flex-1
          overflow-y-auto
          py-2
        `}
      >
        {/* ===================================================
            LOADING STATE
        =================================================== */}

        {loading ? (
          <div
            className={`
              space-y-2
              px-4
              py-3
            `}
          >
            {Array.from({
              length: 6,
            }).map(
              (_, index) => (
                <div
                  key={index}
                  className={`
                    h-5
                    animate-pulse
                    rounded
                    bg-[#18181b]
                  `}
                  style={{
                    width: `${
                      55 +
                      ((index * 13) %
                        35)
                    }%`,
                  }}
                />
              )
            )}
          </div>
        ) : files.length >
          0 ? (
          /* =================================================
             DOCKER FILESYSTEM
          ================================================= */

          renderItems(files)
        ) : (
          /* =================================================
             EMPTY DOCKER WORKSPACE
          ================================================= */

          <div
            className={`
              flex
              h-full
              min-h-[200px]
              flex-col
              items-center
              justify-center
              px-5
              text-center
            `}
          >
            {/* Docker Icon */}
            <Container
              className={`
                mb-3
                h-8
                w-8
                text-[#27272a]
              `}
            />

            {/* Empty Message */}
            <p
              className={`
                text-xs
                font-medium
                text-[#52525b]
              `}
            >
              Empty Docker workspace
            </p>

            {/* Description */}
            <p
              className={`
                mt-1
                text-[10px]
                text-[#3c3c3c]
              `}
            >
              Create a file or folder
              to get started.
            </p>

            {/* Docker Connected */}
            {dockerConnected ? (
              <Button
                onClick={() => {
                  void handleCreateFile();
                }}
                size="sm"
                className={`
                  mt-4
                  h-7
                  bg-[#1a1a1a]
                  text-[10px]
                  text-[#a1a1aa]
                  hover:bg-[#27272a]
                  hover:text-white
                `}
              >
                <FilePlus2 className="mr-1.5 h-3 w-3" />

                <span>
                  New File
                </span>
              </Button>
            ) : (
              /* Docker Disconnected */
              <p
                className={`
                  mt-4
                  text-[9px]
                  text-[#3c3c3c]
                `}
              >
                Waiting for Docker
                workspace...
              </p>
            )}
          </div>
        )}
      </div>

      {/* =====================================================
          FOOTER
      ===================================================== */}

      <div
        className={`
          flex
          h-6
          items-center
          justify-between
          border-t
          border-[#27272a]/60
          bg-[#111111]/80
          px-3
          font-mono
          text-[9px]
          text-[#3c3c3c]
        `}
      >
        {/* Counts */}
        <div className="flex items-center gap-2">
          <Package className="h-2.5 w-2.5" />

          <span>
            {folderCount} folder
            {folderCount !==
            1
              ? "s"
              : ""}
          </span>

          <span>
            {fileCount} file
            {fileCount !==
            1
              ? "s"
              : ""}
          </span>
        </div>

        {/* Docker Sync */}
        {dockerConnected && (
          <div
            className={`
              flex
              items-center
              gap-1
              text-[#52525b]
            `}
          >
            <Database className="h-2.5 w-2.5" />

            <span>
              Docker synced
            </span>
          </div>
        )}
      </div>

      {/* =====================================================
          SCROLLBAR
      ===================================================== */}

      <style jsx>{`
        .custom-explorer-scrollbar::-webkit-scrollbar {
          width: 6px;
        }

        .custom-explorer-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }

        .custom-explorer-scrollbar::-webkit-scrollbar-thumb {
          background: #2f2f32;
          border-radius: 4px;
        }

        .custom-explorer-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #52525b;
        }

        .custom-explorer-scrollbar {
          scrollbar-width: thin;
          scrollbar-color: #2f2f32 transparent;
        }
      `}</style>
    </div>
  );
}