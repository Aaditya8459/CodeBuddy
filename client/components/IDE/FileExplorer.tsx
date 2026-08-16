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
  onFileSelect: (fileName: string) => void;

  activeFile: string;

  /**
   * Optional external filesystem.
   * If omitted, the default workspace below is used.
   */
  files?: FileItem[];

  /**
   * Called when user creates a file.
   */
  onCreateFile?: (
    fileName: string,
    parentPath?: string
  ) => void;

  /**
   * Called when user creates a folder.
   */
  onCreateFolder?: (
    folderName: string,
    parentPath?: string
  ) => void;

  /**
   * Called when user deletes a file/folder.
   */
  onDelete?: (
    item: FileItem,
    parentPath?: string
  ) => void;

  /**
   * Called when user presses refresh.
   */
  onRefresh?: () => void;

  /**
   * Indicates whether the workspace is connected
   * to the Docker-backed filesystem.
   */
  dockerConnected?: boolean;

  /**
   * Optional loading state while filesystem
   * is being loaded from Docker/backend.
   */
  loading?: boolean;
}

/* =========================================================
   DEFAULT WORKSPACE
========================================================= */

const defaultFileSystem: FileItem[] = [
  {
    name: "src",
    type: "folder",
    children: [
      {
        name: "App.tsx",
        type: "file",
        icon: "tsx",
      },
      {
        name: "index.css",
        type: "file",
        icon: "css",
      },
      {
        name: "utils.ts",
        type: "file",
        icon: "ts",
      },
    ],
  },

  {
    name: "public",
    type: "folder",
    children: [
      {
        name: "favicon.svg",
        type: "file",
        icon: "svg",
      },
    ],
  },

  {
    name: "package.json",
    type: "file",
    icon: "json",
  },

  {
    name: "README.md",
    type: "file",
    icon: "md",
  },
];

/* =========================================================
   COMPONENT
========================================================= */

export default function FileExplorer({
  onFileSelect,
  activeFile,
  files = defaultFileSystem,
  onCreateFile,
  onCreateFolder,
  onDelete,
  onRefresh,
  dockerConnected = false,
  loading = false,
}: FileExplorerProps) {
  const [expandedFolders, setExpandedFolders] =
    useState<string[]>(["src"]);

  const [hoveredItem, setHoveredItem] =
    useState<string | null>(null);

  const [showActions, setShowActions] =
    useState(false);

  /* =======================================================
     FILE COUNT
  ======================================================= */

  const fileCount = useMemo(() => {
    const countFiles = (items: FileItem[]): number => {
      return items.reduce((total, item) => {
        if (item.type === "file") {
          return total + 1;
        }

        return (
          total +
          countFiles(item.children || [])
        );
      }, 0);
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
      return items.reduce((total, item) => {
        if (item.type !== "folder") {
          return total;
        }

        return (
          total +
          1 +
          countFolders(item.children || [])
        );
      }, 0);
    };

    return countFolders(files);
  }, [files]);

  /* =======================================================
     TOGGLE FOLDER
  ======================================================= */

  const toggleFolder = useCallback(
    (path: string) => {
      setExpandedFolders((previous) =>
        previous.includes(path)
          ? previous.filter(
              (folder) => folder !== path
            )
          : [...previous, path]
      );
    },
    []
  );

  /* =======================================================
     FILE ICON
  ======================================================= */

  const getIcon = useCallback(
    (iconType?: string) => {
      switch (iconType) {
        case "tsx":
        case "ts":
          return (
            <FileCode2
              className={`
                h-4 w-4
                text-[#3178c6]
              `}
            />
          );

        case "js":
        case "jsx":
          return (
            <FileCode2
              className={`
                h-4 w-4
                text-[#f0db4f]
              `}
            />
          );

        case "css":
          return (
            <FileType2
              className={`
                h-4 w-4
                text-[#264de4]
              `}
            />
          );

        case "json":
          return (
            <FileJson
              className={`
                h-4 w-4
                text-[#f0db4f]
              `}
            />
          );

        case "md":
          return (
            <FileText
              className={`
                h-4 w-4
                text-[#38bdf8]
              `}
            />
          );

        case "svg":
          return (
            <FileCode2
              className={`
                h-4 w-4
                text-[#f97316]
              `}
            />
          );

        case "html":
          return (
            <FileCode2
              className={`
                h-4 w-4
                text-[#e44d26]
              `}
            />
          );

        case "py":
          return (
            <FileCode2
              className={`
                h-4 w-4
                text-[#3572a5]
              `}
            />
          );

        default:
          return (
            <FileText
              className={`
                h-4 w-4
                text-[#71717a]
              `}
            />
          );
      }
    },
    []
  );

  /* =======================================================
     CREATE FILE
  ======================================================= */

  const handleCreateFile = () => {
    const fileName = window.prompt(
      "Enter file name"
    );

    if (!fileName?.trim()) {
      return;
    }

    onCreateFile?.(fileName.trim());
  };

  /* =======================================================
     CREATE FOLDER
  ======================================================= */

  const handleCreateFolder = () => {
    const folderName = window.prompt(
      "Enter folder name"
    );

    if (!folderName?.trim()) {
      return;
    }

    onCreateFolder?.(folderName.trim());
  };

  /* =======================================================
     DELETE
  ======================================================= */

  const handleDelete = (
    item: FileItem,
    parentPath?: string
  ) => {
    const confirmed = window.confirm(
      `Delete "${item.name}"?`
    );

    if (!confirmed) {
      return;
    }

    onDelete?.(item, parentPath);
  };

  /* =======================================================
     RENDER TREE
  ======================================================= */

  const renderItems = (
    items: FileItem[],
    parentPath = "",
    depth = 0
  ) => {
    return items.map((item) => {
      const currentPath = parentPath
        ? `${parentPath}/${item.name}`
        : item.name;

      const isExpanded =
        expandedFolders.includes(currentPath);

      const isActive =
        activeFile === item.name ||
        activeFile === currentPath;

      const isHovered =
        hoveredItem === currentPath;

      /* ================================================
         FOLDER
      ================================================ */

      if (item.type === "folder") {
        return (
          <div key={currentPath}>
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
                setHoveredItem(currentPath)
              }
              onMouseLeave={() =>
                setHoveredItem(null)
              }
            >
              <button
                type="button"
                onClick={() =>
                  toggleFolder(currentPath)
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
                    10 + depth * 14,
                  paddingRight: 6,
                }}
              >
                {/* Chevron */}
                <span className="mr-1 shrink-0">
                  {isExpanded ? (
                    <ChevronDown
                      className="h-3.5 w-3.5"
                    />
                  ) : (
                    <ChevronRight
                      className="h-3.5 w-3.5"
                    />
                  )}
                </span>

                {/* Folder */}
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

                {/* Name */}
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

              {/* Folder actions */}
              {isHovered && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();

                    handleDelete(
                      item,
                      parentPath
                    );
                  }}
                  className={`
                    mr-2
                    rounded
                    p-1
                    text-[#52525b]
                    opacity-0
                    transition-all
                    group-hover:opacity-100
                    hover:bg-[#f48771]/10
                    hover:text-[#f48771]
                  `}
                  title="Delete folder"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>

            {/* Children */}
            {isExpanded &&
              item.children &&
              item.children.length > 0 && (
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

      /* ================================================
         FILE
      ================================================ */

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
            setHoveredItem(currentPath)
          }
          onMouseLeave={() =>
            setHoveredItem(null)
          }
        >
          <button
            type="button"
            onClick={() =>
              onFileSelect(currentPath)
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
                26 + depth * 14,
              paddingRight: 6,
            }}
          >
            <span className="mr-2 shrink-0">
              {getIcon(item.icon)}
            </span>

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

          {/* File delete */}
          {isHovered && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();

                handleDelete(
                  item,
                  parentPath
                );
              }}
              className={`
                mr-2
                rounded
                p-1
                text-[#52525b]
                opacity-0
                transition-all
                group-hover:opacity-100
                hover:bg-[#f48771]/10
                hover:text-[#f48771]
              `}
              title="Delete file"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
      );
    });
  };

  /* =======================================================
     RENDER
  ======================================================= */

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

        <div className="relative flex items-center gap-0.5">
          {/* Add */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() =>
              setShowActions(
                (previous) => !previous
              )
            }
            title="New file or folder"
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

          {/* Refresh */}
          <Button
            variant="ghost"
            size="icon"
            onClick={onRefresh}
            disabled={loading}
            title="Refresh workspace"
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

          {/* More */}
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

          {/* Create Menu */}
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
              <button
                type="button"
                onClick={() => {
                  setShowActions(false);
                  handleCreateFile();
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
                `}
              >
                <FilePlus2 className="h-3.5 w-3.5" />

                New File
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowActions(false);
                  handleCreateFolder();
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
                `}
              >
                <FolderPlus className="h-3.5 w-3.5" />

                New Folder
              </button>
            </div>
          )}
        </div>
      </div>

      {/* =====================================================
          WORKSPACE STATUS
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
            Workspace
          </span>
        </div>

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
              ? "Docker"
              : "Local"}
          </span>
        </div>
      </div>

      {/* =====================================================
          TREE
      ===================================================== */}

      <div className="custom-explorer-scrollbar flex-1 overflow-y-auto py-2">
        {loading ? (
          <div className="space-y-2 px-4 py-3">
            {Array.from({
              length: 8,
            }).map((_, index) => (
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
                    ((index * 13) % 35)
                  }%`,
                }}
              />
            ))}
          </div>
        ) : files.length > 0 ? (
          renderItems(files)
        ) : (
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
            <Folder
              className={`
                mb-3
                h-8
                w-8
                text-[#27272a]
              `}
            />

            <p
              className={`
                text-xs
                font-medium
                text-[#52525b]
              `}
            >
              Empty workspace
            </p>

            <p
              className={`
                mt-1
                text-[10px]
                text-[#3c3c3c]
              `}
            >
              Create a file to get started.
            </p>

            <Button
              onClick={handleCreateFile}
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
              New File
            </Button>
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
        <div className="flex items-center gap-2">
          <Package className="h-2.5 w-2.5" />

          <span>
            {folderCount} folder
            {folderCount !== 1
              ? "s"
              : ""}
          </span>

          <span>
            {fileCount} file
            {fileCount !== 1
              ? "s"
              : ""}
          </span>
        </div>

        {dockerConnected && (
          <div className="flex items-center gap-1 text-[#52525b]">
            <Database className="h-2.5 w-2.5" />
            synced
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