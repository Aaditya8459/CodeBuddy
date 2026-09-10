"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import Header from "@/components/IDE/Header";
import FileExplorer, {
  FileItem,
} from "@/components/IDE/FileExplorer";
import EditorPanel from "@/components/IDE/Editor";
import ConsolePanel from "@/components/IDE/Console";
import ChatPanel from "@/components/IDE/ChatPanel";
import VideoCall from "@/components/IDE/VideoCall";
import { socket } from "@/lib/socket";

import {
  useParams,
  useSearchParams,
} from "next/navigation";

import {
  PanelLeft,
  Terminal,
  Users,
  Code2,
  Wifi,
  WifiOff,
  Upload,
  RefreshCw,
  Save,
  Cloud,
} from "lucide-react";

import {
  io,
  Socket,
} from "socket.io-client";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface FileData {
  name: string;
  language: string;
  content: string;
  path?: string;
  size?: number;
  isDirectory?: boolean;
}

interface UserData {
  name?: string;
  socketId?: string;
}

interface RoomData {
  roomId: string;
  userName: string;
  userCount: number;
  isOnline: boolean;
  files: FileData[];
}

interface ExecuteResponse {
  success?: boolean;
  message?: string;
  error?: string;

  executionId?: string;

  exitCode?: number | null;

  stdout?: string;
  stderr?: string;
  output?: string;

  durationMs?: number;

  timedOut?: boolean;

  memoryExceeded?: boolean;
}

interface AutoSaveResponse {
  success?: boolean;
  message?: string;
  error?: string;
  path?: string;
  saved?: boolean;
}

interface SocketRoomUpdatePayload {
  userCount?: number;
  users?: unknown[];
}

interface SocketFilePayload {
  roomId?: string;
  fileName?: string;
  path?: string;
  content?: string;
  language?: string;
  username?: string;
  source?: string;
  file?: FileData;
}

interface SocketFolderPayload {
  roomId?: string;
  folderName?: string;
  path?: string;
  username?: string;
}

interface SocketDeletePayload {
  roomId?: string;
  fileName?: string;
  path?: string;
  type?: "file" | "folder";
  username?: string;
}

interface SocketExecutionOutputPayload {
  executionId?: string;
  stdout?: string;
  stderr?: string;
  output?: string;
}

interface SocketExecutionFinishedPayload {
  executionId?: string;
  exitCode?: number;
  durationMs?: number;
}

interface SocketExecutionErrorPayload {
  executionId?: string;
  error?: string;
}

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:5000";

const SOCKET_URL =
  process.env.NEXT_PUBLIC_SOCKET_URL ||
  API_URL;

/*
 * Requested autosave delay.
 *
 * Monaco
 *   ↓
 * handleEditorChange
 *   ↓
 * React state
 *   ↓
 * 5ms debounce
 *   ↓
 * HTTP autosave
 *   ↓
 * Express
 *   ↓
 * worker-service
 *   ↓
 * room Docker container
 *
 * Socket.IO also sends the change immediately for
 * real-time collaboration.
 */
const AUTOSAVE_DELAY_MS = 5;

/* -------------------------------------------------------------------------- */
/* Language Detection                                                         */
/* -------------------------------------------------------------------------- */

function getLanguageFromFile(
  fileName: string
): string {
  const extension =
    fileName
      .split(".")
      .pop()
      ?.toLowerCase();

  switch (extension) {
    case "ts":
      return "typescript";

    case "tsx":
      return "typescript";

    case "js":
      return "javascript";

    case "jsx":
      return "javascript";

    case "mjs":
      return "javascript";

    case "cjs":
      return "javascript";

    case "py":
      return "python";

    case "java":
      return "java";

    case "c":
      return "c";

    case "cpp":
    case "cc":
    case "cxx":
      return "cpp";

    case "go":
      return "go";

    case "rs":
      return "rust";

    case "php":
      return "php";

    case "rb":
      return "ruby";

    case "kt":
      return "kotlin";

    case "swift":
      return "swift";

    case "cs":
      return "csharp";

    case "json":
      return "json";

    case "css":
      return "css";

    case "scss":
      return "scss";

    case "html":
      return "html";

    case "xml":
      return "xml";

    case "md":
      return "markdown";

    case "sql":
      return "sql";

    case "sh":
    case "bash":
      return "shell";

    case "yaml":
    case "yml":
      return "yaml";

    default:
      return "plaintext";
  }
}

/* -------------------------------------------------------------------------- */
/* File Contents                                                              */
/* -------------------------------------------------------------------------- */


/* -------------------------------------------------------------------------- */
/* File Tree                                                                  */
/* -------------------------------------------------------------------------- */

function filesToTree(
  files: FileData[]
): FileItem[] {
  const root: FileItem[] = [];

  const findOrCreateFolder = (
    items: FileItem[],
    name: string
  ): FileItem => {
    const existing =
      items.find(
        (item) =>
          item.type === "folder" &&
          item.name === name
      );

    if (existing) {
      return existing;
    }

    const folder: FileItem = {
      name,
      type: "folder",
      children: [],
    };

    items.push(folder);

    return folder;
  };

  files.forEach(
    (file) => {
      const filePath =
        file.path ||
        file.name;

      const parts =
        filePath
          .split("/")
          .filter(Boolean);

      if (
        parts.length === 0
      ) {
        return;
      }

      let current = root;

      parts.forEach(
        (
          part,
          index
        ) => {
          const isLast =
            index ===
            parts.length - 1;

          if (isLast) {
            if (
              file.isDirectory
            ) {
              findOrCreateFolder(
                current,
                part
              );
            } else if (
              !current.some(
                (item) =>
                  item.name ===
                    part &&
                  item.type ===
                    "file"
              )
            ) {
              current.push({
                name: part,
                type: "file",
                icon:
                  part
                    .split(".")
                    .pop()
                    ?.toLowerCase(),
              });
            }

            return;
          }

          const folder =
            findOrCreateFolder(
              current,
              part
            );

          current =
            folder.children ||
            (folder.children = []);
        }
      );
    }
  );

  return root;
}

/* -------------------------------------------------------------------------- */
/* Normalize Workspace Path                                                   */
/* -------------------------------------------------------------------------- */

function normalizeWorkspacePath(
  value: string
): string {
  return value
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+/g, "/")
    .replace(/\/+$/, "")
    .trim();
}

/* -------------------------------------------------------------------------- */
/* Safe File / Folder Name                                                    */
/* -------------------------------------------------------------------------- */

function cleanEntryName(
  value: string
): string {
  return value
    .trim()
    .replace(/[\\/]/g, "");
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

export default function RoomPage() {
  const params =
    useParams<{
      id: string;
    }>();

  const searchParams =
    useSearchParams();
    
  const roomId = String(params.id);

  /* ------------------------------------------------------------------------ */
  /* Room                                                                     */
  /* ------------------------------------------------------------------------ */

  const [room, setRoom] =
    useState<RoomData>({
      roomId: "",
      userName: "You",
      userCount: 0,
      isOnline: false,
      files: [],
    });

  const [roomLoading, setRoomLoading] =
    useState(true);

  const [roomError, setRoomError] =
    useState("");

  /* ------------------------------------------------------------------------ */
  /* Editor                                                                   */
  /* ------------------------------------------------------------------------ */

  const [activeFile, setActiveFile] =
    useState("");

  const [fileContents, setFileContents] =
    useState<Record<string, string>>({});

  /* ------------------------------------------------------------------------ */
  /* Autosave                                                                 */
  /* ------------------------------------------------------------------------ */

  const [isSaving, setIsSaving] =
    useState(false);

  const [saveError, setSaveError] =
    useState("");

  const [lastSavedAt, setLastSavedAt] =
    useState<Date | null>(null);

  const autosaveTimerRef =
    useRef<
      ReturnType<typeof setTimeout> | null
    >(null);

  const autosaveRequestRef =
    useRef<AbortController | null>(null);

  const latestContentRef =
    useRef<Record<string, string>>({});

  const localChangeRef =
    useRef<Record<string, number>>({});

  /* ------------------------------------------------------------------------ */
  /* Execution                                                                */
  /* ------------------------------------------------------------------------ */

  const [consoleOutput, setConsoleOutput] =
    useState("");

  const [isRunning, setIsRunning] =
    useState(false);

  const [executionId, setExecutionId] =
    useState("");

  /* ------------------------------------------------------------------------ */
  /* Workspace                                                                */
  /* ------------------------------------------------------------------------ */

  const [workspaceLoading, setWorkspaceLoading] =
    useState(false);

  /* ------------------------------------------------------------------------ */
  /* Upload                                                                   */
  /* ------------------------------------------------------------------------ */

  const [uploading, setUploading] =
    useState(false);

  /* ------------------------------------------------------------------------ */
/* Layout                                                                   */
/* ------------------------------------------------------------------------ */

  const [showExplorer, setShowExplorer] =
    useState(true);

  const [showConsole, setShowConsole] =
    useState(true);

  const [mounted, setMounted] =
    useState(false);

/* ------------------------------------------------------------------------ */
/* Video Call                                                               */
/* ------------------------------------------------------------------------ */

  const [videoCallOpen, setVideoCallOpen] =
    useState(false);

  /* ------------------------------------------------------------------------ */
  /* Socket                                                                   */
  /* ------------------------------------------------------------------------ */

  const socketRef =
    useRef<Socket | null>(null);

  /* ------------------------------------------------------------------------ */
  /* URL Username                                                              */
  /* ------------------------------------------------------------------------ */

  const urlUserName =
    useMemo(
      () => {
        const name =
          searchParams?.get(
            "name"
          );

        if (!name) {
          return "";
        }

        return name.trim();
      },
      [searchParams]
    );

  /* ------------------------------------------------------------------------ */
  /* Current File                                                              */
  /* ------------------------------------------------------------------------ */

  const currentFile =
    useMemo(
      () => {
        return room.files.find(
          (file) =>
            !file.isDirectory &&
            (file.path ||
              file.name) ===
              activeFile
        );
      },
      [
        room.files,
        activeFile,
      ]
    );

  /* ------------------------------------------------------------------------ */
  /* Current Code                                                              */
  /* ------------------------------------------------------------------------ */

  const currentCode =
    fileContents[
      activeFile
    ] ?? "";

  /* ------------------------------------------------------------------------ */
  /* File Tree                                                                 */
  /* ------------------------------------------------------------------------ */

  const fileTree =
    useMemo(
      () =>
        filesToTree(
          room.files
        ),
      [room.files]
    );

  /* ------------------------------------------------------------------------ */
  /* Mount                                                                     */
  /* ------------------------------------------------------------------------ */

  useEffect(
    () => {
      const timer =
        window.setTimeout(
          () => {
            setMounted(true);
          },
          50
        );

      return () => {
        window.clearTimeout(
          timer
        );
      };
    },
    []
  );

  /* ------------------------------------------------------------------------ */
  /* Keep Latest Content Ref Synchronized                                     */
  /* ------------------------------------------------------------------------ */

  useEffect(
    () => {
      latestContentRef.current =
        fileContents;
    },
    [fileContents]
  );

  /* ------------------------------------------------------------------------ */
  /* Auto Save                                                                 */
  /* ------------------------------------------------------------------------ */

  const saveFileToDocker =
    useCallback(
      async (
        filePath: string,
        content: string,
        language: string
      ) => {
        if (!room.roomId) {
          return;
        }

        if (!filePath) {
          return;
        }

        const normalizedPath =
          normalizeWorkspacePath(
            filePath
          );

        if (
          !normalizedPath
        ) {
          return;
        }

        const fileExists =
          room.files.some(
            (file) =>
              !file.isDirectory &&
              normalizeWorkspacePath(
                file.path ||
                  file.name
              ) ===
                normalizedPath
          );

        if (!fileExists) {
          return;
        }

        if (
          autosaveRequestRef.current
        ) {
          autosaveRequestRef.current.abort();
        }

        const controller =
          new AbortController();

        autosaveRequestRef.current =
          controller;

        const revision =
          localChangeRef.current[
            normalizedPath
          ] || 0;

        try {
          setIsSaving(true);
          setSaveError("");

          const response =
            await fetch(
              `${API_URL}/api/workspace/autosave`,
              {
                method: "POST",

                headers: {
                  "Content-Type":
                    "application/json",
                },

                credentials:
                  "include",

                signal:
                  controller.signal,

                body:
                  JSON.stringify({
                    roomId:
                      room.roomId,

                    fileName:
                      normalizedPath,

                    path:
                      normalizedPath,

                    language,

                    content,
                  }),
              }
            );

          let data:
            AutoSaveResponse =
            {};

          try {
            data =
              await response.json();
          } catch {
            data = {};
          }

          if (!response.ok) {
            throw new Error(
              data.error ||
                `Autosave failed (${response.status})`
            );
          }

          const latestRevision =
            localChangeRef.current[
              normalizedPath
            ] || 0;

          if (
            revision ===
            latestRevision
          ) {
            setLastSavedAt(
              new Date()
            );
          }
        } catch (
          error
        ) {
          if (
            error instanceof
              DOMException &&
            error.name ===
              "AbortError"
          ) {
            return;
          }

          if (
            error instanceof
              Error &&
            error.name ===
              "AbortError"
          ) {
            return;
          }

          console.error(
            "Autosave error:",
            error
          );

          setSaveError(
            error instanceof
              Error
              ? error.message
              : "Autosave failed."
          );
        } finally {
          if (
            autosaveRequestRef.current ===
            controller
          ) {
            autosaveRequestRef.current =
              null;

            setIsSaving(false);
          }
        }
      },
      [
        room.roomId,
        room.files,
      ]
    );

  /* ------------------------------------------------------------------------ */
  /* Schedule Auto Save                                                       */
  /* ------------------------------------------------------------------------ */

  const scheduleAutoSave =
    useCallback(
      (
        filePath: string,
        content: string,
        language: string
      ) => {
        if (!filePath) {
          return;
        }

        if (
          autosaveTimerRef.current
        ) {
          clearTimeout(
            autosaveTimerRef.current
          );
        }

        autosaveTimerRef.current =
          setTimeout(
            () => {
              void saveFileToDocker(
                filePath,
                content,
                language
              );
            },
            AUTOSAVE_DELAY_MS
          );
      },
      [
        saveFileToDocker,
      ]
    );

  /* ------------------------------------------------------------------------ */
  /* Autosave Cleanup                                                         */
  /* ------------------------------------------------------------------------ */

  useEffect(
    () => {
      return () => {
        if (
          autosaveTimerRef.current
        ) {
          clearTimeout(
            autosaveTimerRef.current
          );
        }

        if (
          autosaveRequestRef.current
        ) {
          autosaveRequestRef.current.abort();
        }
      };
    },
    []
  );

  /* ------------------------------------------------------------------------ */
  /* Load Room                                                                */
  /* ------------------------------------------------------------------------ */

  const loadRoom =
    useCallback(
      async () => {
        const roomId =
          params?.id?.toString();

        if (!roomId) {
          setRoomError(
            "Room ID is missing."
          );

          setRoomLoading(false);

          return;
        }

        try {
          setRoomLoading(true);
          setRoomError("");

          const response =
            await fetch(
              `${API_URL}/api/rooms/${encodeURIComponent(
                roomId
              )}`,
              {
                method: "GET",

                credentials:
                  "include",

                cache:
                  "no-store",
              }
            );

          if (!response.ok) {
            throw new Error(
              `Unable to load room (${response.status})`
            );
          }

          const responseData =
            await response.json();

          const roomData =
            responseData?.data?.room;

          const users =
            responseData?.data?.users ||
            [];

          if (!roomData) {
            throw new Error(
              "Room data is missing from server response."
            );
          }

          /*
           * IMPORTANT:
           *
           * There are deliberately NO default files.
           *
           * The Docker room starts empty.
           *
           * The backend is responsible for returning
           * the current Docker workspace.
           */

const workspaceResponse =
  await fetch(
    `${API_URL}/api/workspace?roomId=${encodeURIComponent(
      roomId
    )}`,
    {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    }
  );

if (!workspaceResponse.ok) {
  throw new Error(
    `Unable to load Docker workspace (${workspaceResponse.status})`
  );
}

const workspaceData =
  await workspaceResponse.json();

if (
  workspaceData?.success !== true
) {
  throw new Error(
    workspaceData?.error ||
      workspaceData?.message ||
      "Unable to load Docker workspace."
  );
}

const workspaceFiles =
  Array.isArray(
    workspaceData?.files
  )
    ? workspaceData.files
    : [];

const fetchedFiles:
  FileData[] =
  workspaceFiles.map(
    (
      file: {
        name?: string;
        path?: string;
        type?: "file" | "folder";
        size?: number;
      }
    ) => {
      const filePath =
        normalizeWorkspacePath(
          file.path ||
            file.name ||
            ""
        );

      const isDirectory =
        file.type ===
        "folder";

      return {
        name:
          file.name ||
          filePath
            .split("/")
            .pop() ||
          filePath,

        path:
          filePath,

        language:
          isDirectory
            ? "plaintext"
            : getLanguageFromFile(
                filePath
              ),

        content:
          "",

        size:
          typeof file.size ===
          "number"
            ? file.size
            : 0,

        isDirectory,
      };
    }
  );

          const backendUserName =
            typeof roomData.yourName ===
            "string"
              ? roomData.yourName.trim()
              : "";

          const mongoUserName =
            users.find(
              (
                user: UserData
              ) =>
                typeof user?.name ===
                  "string" &&
                user.name.trim() ===
                  urlUserName
            )?.name || "";

          const currentUserName =
            urlUserName ||
            mongoUserName ||
            backendUserName ||
            "You";

          const resolvedRoomId =
            roomData.roomCode ||
            roomData.roomId ||
            roomId
              .toString()
              .toUpperCase();

          setRoom({
            roomId:
              resolvedRoomId,

            userName:
              currentUserName,

            userCount:
              typeof responseData?.data
                ?.userCount ===
              "number"
                ? responseData.data
                    .userCount
                : Array.isArray(
                    users
                  )
                ? users.length
                : 0,

            isOnline:
              false,

            files:
              fetchedFiles,
          });

          setFileContents(
            {}
          );

          latestContentRef.current =
            {};

        const firstFile =
          fetchedFiles.find(
            (file) =>
              !file.isDirectory
          );

        if (firstFile) {
          const firstFilePath =
            normalizeWorkspacePath(
              firstFile.path ||
                firstFile.name
            );

          setActiveFile(
            firstFilePath
          );
        } else {
          setActiveFile(
            ""
          );
        }
        } catch (
          error
        ) {
          console.error(
            "Room loading error:",
            error
          );

          setRoomError(
            error instanceof
              Error
              ? error.message
              : "Unable to load room."
          );

          setRoom({
            roomId:
              roomId
                .toString()
                .toUpperCase(),

            userName:
              urlUserName ||
              "You",

            userCount:
              0,

            isOnline:
              false,

            files: [],
          });

          setFileContents({});

          latestContentRef.current =
            {};

          setActiveFile("");
        } finally {
          setRoomLoading(false);
        }
      },
      [
        params?.id,
        urlUserName,
      ]
    );

  /* ------------------------------------------------------------------------ */
  /* Load Room On Mount                                                       */
  /* ------------------------------------------------------------------------ */

  useEffect(
    () => {
      void loadRoom();
    },
    [loadRoom]
  );

  /* ------------------------------------------------------------------------ */
  /* Socket.IO                                                                */
  /* ------------------------------------------------------------------------ */

  useEffect(
    () => {
      if (
        !room.roomId ||
        !room.userName
      ) {
        return;
      }

      let cancelled =
        false;

      /*
       * Create ONE socket for this page.
       *
       * Do not create a socket and then discard
       * its reference.
       */
      

      /* -------------------------------------------------------------------- */
      /* Connect                                                              */
      /* -------------------------------------------------------------------- */

      const handleConnect =
        () => {
          if (
            cancelled
          ) {
            return;
          }

          console.log(
            "[Socket.IO] Connected:",
            socket.id
          );

          setRoom(
            (
              previous
            ) => ({
              ...previous,

              isOnline:
                true,
            })
          );

          /*
           * IMPORTANT:
           *
           * Only roomId and username are sent here.
           *
           * The server should store these in
           * socket.data and trust those values
           * for later file operations.
           */
          socket.emit(
            "join-room",
            {
              roomId:
                room.roomId,

              username:
                room.userName,
            }
          );
        };

      /* -------------------------------------------------------------------- */
      /* Connect Error                                                        */
      /* -------------------------------------------------------------------- */

      const handleConnectError =
        (
          error: Error
        ) => {
          console.error(
            "[Socket.IO] Connection error:",
            error
          );

          if (
            cancelled
          ) {
            return;
          }

          setRoom(
            (
              previous
            ) => ({
              ...previous,

              isOnline:
                false,
            })
          );
        };

      /* -------------------------------------------------------------------- */
      /* Room Update                                                          */
      /* -------------------------------------------------------------------- */

      const handleRoomUpdate =
        (
          message: SocketRoomUpdatePayload
        ) => {
          if (
            cancelled
          ) {
            return;
          }

          setRoom(
            (
              previous
            ) => ({
              ...previous,

              userCount:
                typeof message?.userCount ===
                "number"
                  ? message.userCount
                  : Array.isArray(
                      message?.users
                    )
                  ? message.users.length
                  : previous.userCount,
            })
          );
        };

/* -------------------------------------------------------------------- */
/* User Joined                                                          */
/* -------------------------------------------------------------------- */

const handleUserJoined =
  (
    message: SocketRoomUpdatePayload
  ) => {
    if (
      cancelled
    ) {
      return;
    }

    setRoom(
      (
        previous
      ) => ({
        ...previous,

        isOnline:
          true,
      })
    );
  };

/* -------------------------------------------------------------------- */
/* User Left                                                            */
/* -------------------------------------------------------------------- */

const handleUserLeft =
  (
    message: SocketRoomUpdatePayload
  ) => {
    if (
      cancelled
    ) {
      return;
    }

    setRoom(
      (
        previous
      ) => ({
        ...previous,

        isOnline:
          true,
      })
    );
  };

      /* -------------------------------------------------------------------- */
      /* Remote File Update                                                   */
      /* -------------------------------------------------------------------- */

      const handleRemoteFileUpdate =
        (
          message: SocketFilePayload
        ) => {
          if (
            cancelled
          ) {
            return;
          }

          const filePath =
            normalizeWorkspacePath(
              message.path ||
                message.fileName ||
                message.file?.path ||
                message.file?.name ||
                ""
            );

          if (!filePath) {
            return;
          }

          const content =
            typeof message.content ===
            "string"
              ? message.content
              : typeof message.file?.content ===
                "string"
              ? message.file.content
              : "";

          const language =
            message.language ||
            message.file?.language ||
            getLanguageFromFile(
              filePath
            );

          /*
           * Update editor content.
           */
          setFileContents(
            (
              previous
            ) => ({
              ...previous,

              [filePath]:
                content,
            })
          );

          latestContentRef.current =
            {
              ...latestContentRef.current,

              [filePath]:
                content,
            };

          /*
           * Update room metadata.
           */
          setRoom(
            (
              previous
            ) => {
              const exists =
                previous.files.some(
                  (
                    file
                  ) =>
                    normalizeWorkspacePath(
                      file.path ||
                        file.name
                    ) ===
                    filePath
                );

              if (exists) {
                return {
                  ...previous,

                  files:
                    previous.files.map(
                      (
                        file
                      ) =>
                        normalizeWorkspacePath(
                          file.path ||
                            file.name
                        ) ===
                        filePath
                          ? {
                              ...file,

                              path:
                                filePath,

                              language,

                              content,

                              size:
                                new Blob([
                                  content,
                                ]).size,
                            }
                          : file
                    ),
                };
              }

              return {
                ...previous,

                files: [
                  ...previous.files,

                  {
                    name:
                      filePath
                        .split("/")
                        .pop() ||
                      filePath,

                    path:
                      filePath,

                    language,

                    content,

                    size:
                      new Blob([
                        content,
                      ]).size,

                    isDirectory:
                      false,
                  },
                ],
              };
            }
          );
        };

      /* -------------------------------------------------------------------- */
      /* File Created                                                         */
      /* -------------------------------------------------------------------- */

      const handleFileCreated =
        (
          message: SocketFilePayload
        ) => {
          if (
            cancelled
          ) {
            return;
          }

          const file =
            message.file;

          const filePath =
            normalizeWorkspacePath(
              message.path ||
                file?.path ||
                message.fileName ||
                file?.name ||
                ""
            );

          if (!filePath) {
            return;
          }

          const content =
            typeof message.content ===
            "string"
              ? message.content
              : typeof file?.content ===
                "string"
              ? file.content
              : "";

          const language =
            message.language ||
            file?.language ||
            getLanguageFromFile(
              filePath
            );

          const newFile:
            FileData = {
            name:
              file?.name ||
              filePath
                .split("/")
                .pop() ||
              filePath,

            path:
              filePath,

            language,

            content,

            size:
              typeof file?.size ===
              "number"
                ? file.size
                : new Blob([
                    content,
                  ]).size,

            isDirectory:
              false,
          };

          setRoom(
            (
              previous
            ) => {
              const existing =
                previous.files.some(
                  (
                    item
                  ) =>
                    normalizeWorkspacePath(
                      item.path ||
                        item.name
                    ) ===
                    filePath
                );

              if (
                existing
              ) {
                return {
                  ...previous,

                  files:
                    previous.files.map(
                      (
                        item
                      ) =>
                        normalizeWorkspacePath(
                          item.path ||
                            item.name
                        ) ===
                        filePath
                          ? {
                              ...item,

                              ...newFile,
                            }
                          : item
                    ),
                };
              }

              return {
                ...previous,

                files: [
                  ...previous.files,
                  newFile,
                ],
              };
            }
          );

          setFileContents(
            (
              previous
            ) => ({
              ...previous,

              [filePath]:
                content,
            })
          );

          latestContentRef.current =
            {
              ...latestContentRef.current,

              [filePath]:
                content,
            };
        };

      /* -------------------------------------------------------------------- */
      /* Folder Created                                                       */
      /* -------------------------------------------------------------------- */

      const handleFolderCreated =
        (
          message: SocketFolderPayload
        ) => {
          if (
            cancelled
          ) {
            return;
          }

          const folderPath =
            normalizeWorkspacePath(
              message.path ||
                message.folderName ||
                ""
            );

          if (!folderPath) {
            return;
          }

          const folderName =
            message.folderName ||
            folderPath
              .split("/")
              .pop() ||
            folderPath;

          setRoom(
            (
              previous
            ) => {
              const exists =
                previous.files.some(
                  (
                    item
                  ) =>
                    item.isDirectory &&
                    normalizeWorkspacePath(
                      item.path ||
                        item.name
                    ) ===
                    folderPath
                );

              if (
                exists
              ) {
                return previous;
              }

              return {
                ...previous,

                files: [
                  ...previous.files,

                  {
                    name:
                      folderName,

                    path:
                      folderPath,

                    language:
                      "plaintext",

                    content:
                      "",

                    size:
                      0,

                    isDirectory:
                      true,
                  },
                ],
              };
            }
          );
        };

      /* -------------------------------------------------------------------- */
      /* File Deleted                                                         */
      /* -------------------------------------------------------------------- */

      const handleFileDeleted =
        (
          message: SocketDeletePayload
        ) => {
          if (
            cancelled
          ) {
            return;
          }

          const deletedPath =
            normalizeWorkspacePath(
              message.path ||
                message.fileName ||
                ""
            );

          if (!deletedPath) {
            return;
          }

          setRoom(
            (
              previous
            ) => ({
              ...previous,

              files:
                previous.files.filter(
                  (
                    file
                  ) => {
                    const path =
                      normalizeWorkspacePath(
                        file.path ||
                          file.name
                      );

                    return (
                      path !==
                        deletedPath &&
                      !path.startsWith(
                        `${deletedPath}/`
                      )
                    );
                  }
                ),
            })
          );

          setFileContents(
            (
              previous
            ) => {
              const next =
                {
                  ...previous,
                };

              Object.keys(
                next
              ).forEach(
                (
                  path
                ) => {
                  if (
                    path ===
                      deletedPath ||
                    path.startsWith(
                      `${deletedPath}/`
                    )
                  ) {
                    delete next[
                      path
                    ];
                  }
                }
              );

              return next;
            }
          );

          Object.keys(
            latestContentRef.current
          ).forEach(
            (
              path
            ) => {
              if (
                path ===
                  deletedPath ||
                path.startsWith(
                  `${deletedPath}/`
                )
              ) {
                delete latestContentRef
                  .current[path];
              }
            }
          );

          setActiveFile(
            (
              previous
            ) => {
              if (
                previous ===
                  deletedPath ||
                previous.startsWith(
                  `${deletedPath}/`
                )
              ) {
                return "";
              }

              return previous;
            }
          );
        };

      /* -------------------------------------------------------------------- */
      /* Execution Output                                                     */
      /* -------------------------------------------------------------------- */

      const handleExecutionOutput =
        (
          message: SocketExecutionOutputPayload
        ) => {
          if (
            message.executionId &&
            executionId &&
            message.executionId !==
              executionId
          ) {
            return;
          }

          const chunks:
            string[] = [];

          if (
            message.output
          ) {
            chunks.push(
              message.output
            );
          }

          if (
            message.stdout
          ) {
            chunks.push(
              message.stdout
            );
          }

          if (
            message.stderr
          ) {
            chunks.push(
              `[stderr]\n${message.stderr}`
            );
          }

          if (
            chunks.length > 0
          ) {
            setConsoleOutput(
              (
                previous
              ) =>
                previous +
                (
                  previous
                    ? "\n"
                    : ""
                ) +
                chunks.join(
                  "\n"
                )
            );
          }
        };

      /* -------------------------------------------------------------------- */
      /* Execution Finished                                                   */
      /* -------------------------------------------------------------------- */

      const handleExecutionFinished =
        (
          message: SocketExecutionFinishedPayload
        ) => {
          if (
            message.executionId &&
            executionId &&
            message.executionId !==
              executionId
          ) {
            return;
          }

          setIsRunning(
            false
          );

          const exitCode =
            message.exitCode;

          if (
            typeof exitCode ===
            "number"
          ) {
            setConsoleOutput(
              (
                previous
              ) =>
                `${previous}\n\n> Process exited with code ${exitCode}${
                  message.durationMs
                    ? ` (${message.durationMs}ms)`
                    : ""
                }`
            );
          }
        };

      /* -------------------------------------------------------------------- */
      /* Execution Error                                                      */
      /* -------------------------------------------------------------------- */

      const handleExecutionError =
        (
          message: SocketExecutionErrorPayload
        ) => {
          if (
            message.executionId &&
            executionId &&
            message.executionId !==
              executionId
          ) {
            return;
          }

          setIsRunning(
            false
          );

          setConsoleOutput(
            (
              previous
            ) =>
              `${previous}\n\n> Execution Error:\n${
                message.error ||
                "Unknown execution error"
              }`
          );
        };

      /* -------------------------------------------------------------------- */
      /* Disconnect                                                           */
      /* -------------------------------------------------------------------- */

      const handleDisconnect =
        (
          reason: string
        ) => {
          console.log(
            "[Socket.IO] Disconnected:",
            reason
          );

          if (
            cancelled
          ) {
            return;
          }

          setRoom(
            (
              previous
            ) => ({
              ...previous,

              isOnline:
                false,
            })
          );
        };

      /* -------------------------------------------------------------------- */
      /* Register Listeners                                                   */
      /* -------------------------------------------------------------------- */

      socket.on(
        "connect",
        handleConnect
      );

      socket.on(
        "connect_error",
        handleConnectError
      );

      socket.on(
        "user-count",
        (count: number) => {
          console.log("👥 Live user count:", count);

          setRoom(
            (previous) => ({
              ...previous,
              userCount: count,
            })
          );
        }
      );

      socket.on(
        "room:update",
        handleRoomUpdate
      );

      socket.on(
        "room:user-joined",
        handleUserJoined
      );

      socket.on(
        "user-joined",
        handleUserJoined
      );

      socket.on(
        "room:user-left",
        handleUserLeft
      );

      socket.on(
        "user-left",
        handleUserLeft
      );

      socket.on(
        "room:file-updated",
        handleRemoteFileUpdate
      );

      socket.on(
        "file:update",
        handleRemoteFileUpdate
      );

      socket.on(
        "file-updated",
        handleRemoteFileUpdate
      );

      socket.on(
        "room:file-created",
        handleFileCreated
      );

      socket.on(
        "file:created",
        handleFileCreated
      );

      socket.on(
        "room:folder-created",
        handleFolderCreated
      );

      socket.on(
        "folder:created",
        handleFolderCreated
      );

      socket.on(
        "room:file-deleted",
        handleFileDeleted
      );

      socket.on(
        "file:deleted",
        handleFileDeleted
      );

      socket.on(
        "execution:output",
        handleExecutionOutput
      );

      socket.on(
        "execution:finished",
        handleExecutionFinished
      );

      socket.on(
        "execution:error",
        handleExecutionError
      );

      socket.on(
        "disconnect",
        handleDisconnect
      );

      /* -------------------------------------------------------------------- */
      /* Connect Socket                                                        */
      /* -------------------------------------------------------------------- */

      socket.connect();

      /* -------------------------------------------------------------------- */
      /* Cleanup                                                               */
      /* -------------------------------------------------------------------- */

      return () => {
        cancelled = true;

        /*
         * Remove ONLY listeners belonging to
         * this page.
         *
         * Do not call removeAllListeners().
         */
        socket.off(
          "connect",
          handleConnect
        );

        socket.off(
          "connect_error",
          handleConnectError
        );

        socket.off(
          "room:update",
          handleRoomUpdate
        );

        socket.off(
          "room:user-joined",
          handleUserJoined
        );

        socket.off(
          "user-joined",
          handleUserJoined
        );

        socket.off(
          "room:user-left",
          handleUserLeft
        );

        socket.off(
          "user-left",
          handleUserLeft
        );

        socket.off(
          "room:file-updated",
          handleRemoteFileUpdate
        );

        socket.off(
          "file:update",
          handleRemoteFileUpdate
        );

        socket.off(
          "file-updated",
          handleRemoteFileUpdate
        );

        socket.off(
          "room:file-created",
          handleFileCreated
        );

        socket.off(
          "file:created",
          handleFileCreated
        );

        socket.off(
          "room:folder-created",
          handleFolderCreated
        );

        socket.off(
          "folder:created",
          handleFolderCreated
        );

        socket.off(
          "room:file-deleted",
          handleFileDeleted
        );

        socket.off(
          "file:deleted",
          handleFileDeleted
        );

        socket.off(
          "execution:output",
          handleExecutionOutput
        );

        socket.off(
          "execution:finished",
          handleExecutionFinished
        );

        socket.off(
          "execution:error",
          handleExecutionError
        );

        socket.off(
          "disconnect",
          handleDisconnect
        );

        socket.disconnect();

        if (
          socketRef.current ===
          socket
        ) {
          socketRef.current =
            null;
        }

      };
    },
    [
      room.roomId,
      room.userName,
    ]
  );

  /* ------------------------------------------------------------------------ */
  /* File Select                                                              */
  /* ------------------------------------------------------------------------ */

const handleFileSelect =
  useCallback(
    async (
      fileName: string
    ) => {
      const normalizedPath =
        normalizeWorkspacePath(
          fileName
        );

      if (!normalizedPath) {
        return;
      }

      const file =
        room.files.find(
          (
            item
          ) =>
            !item.isDirectory &&
            normalizeWorkspacePath(
              item.path ||
                item.name
            ) ===
            normalizedPath
        );

      if (
        !file
      ) {
        return;
      }

      setActiveFile(
        normalizedPath
      );

      setConsoleOutput("");

      setSaveError("");

      /*
       * If the file content is already loaded,
       * use the local copy.
       */
      if (
        Object.prototype.hasOwnProperty.call(
          fileContents,
          normalizedPath
        )
      ) {
        return;
      }

      /*
       * Read the real file from the Docker
       * room container.
       *
       * Browser
       *   ↓
       * Server
       *   ↓
       * Worker
       *   ↓
       * Docker /workspace
       */
      try {
        const response =
          await fetch(
            `${API_URL}/api/workspace/read`,
            {
              method: "POST",

              headers: {
                "Content-Type":
                  "application/json",
              },

              credentials:
                "include",

              cache:
                "no-store",

              body:
                JSON.stringify({
                  roomId:
                    room.roomId,

                  path:
                    normalizedPath,
                }),
            }
          );

        let data:
          {
            success?: boolean;
            error?: string;
            message?: string;
            content?: string;
          } =
          {};

        try {
          data =
            await response.json();
        } catch {
          data = {};
        }

        if (!response.ok) {
          throw new Error(
            data.error ||
              data.message ||
              `Unable to read file (${response.status})`
          );
        }

        if (
          data.success ===
            false
        ) {
          throw new Error(
            data.error ||
              data.message ||
              "Unable to read file from Docker."
          );
        }

        const content =
          typeof data.content ===
          "string"
            ? data.content
            : "";

        setFileContents(
          (
            previous
          ) => ({
            ...previous,

            [normalizedPath]:
              content,
          })
        );

        latestContentRef.current =
          {
            ...latestContentRef.current,

            [normalizedPath]:
              content,
          };

        setRoom(
          (
            previous
          ) => ({
            ...previous,

            files:
              previous.files.map(
                (
                  item
                ) =>
                  normalizeWorkspacePath(
                    item.path ||
                      item.name
                  ) ===
                  normalizedPath
                    ? {
                        ...item,

                        path:
                          normalizedPath,

                        content,

                        size:
                          new Blob([
                            content,
                          ]).size,
                      }
                    : item
              ),
          })
        );
      } catch (
        error
      ) {
        console.error(
          "Docker file read error:",
          error
        );

        setConsoleOutput(
          `> Failed to read ${normalizedPath}: ${
            error instanceof Error
              ? error.message
              : String(error)
          }`
        );
      }
    },
    [
      room.roomId,
      room.files,
      fileContents,
    ]
  );
  /* -------------Added------- */
  /* ------------------------------------------------------------------------ */
/* Load Active File Content From Docker                                    */
/* ------------------------------------------------------------------------ */

useEffect(
  () => {
    if (
      !activeFile ||
      !room.roomId
    ) {
      return;
    }

    const file =
      room.files.find(
        (
          item
        ) =>
          !item.isDirectory &&
          normalizeWorkspacePath(
            item.path ||
              item.name
          ) ===
          activeFile
      );

    if (!file) {
      return;
    }

    if (
      Object.prototype.hasOwnProperty.call(
        fileContents,
        activeFile
      )
    ) {
      return;
    }

    void handleFileSelect(
      activeFile
    );
  },
  [
    activeFile,
    room.roomId,
    room.files,
    fileContents,
    handleFileSelect,
  ]
);  
  /* ------------------------------------------------------------------------ */
  /* Create File                                                              */
  /* ------------------------------------------------------------------------ */

  const handleCreateFile =
    useCallback(
      async (
        fileName: string,
        parentPath = ""
      ) => {
        const cleanName =
          cleanEntryName(
            fileName
          );

        if (
          !cleanName
        ) {
          return;
        }

        const cleanParent =
          normalizeWorkspacePath(
            parentPath
          );

        const filePath =
          cleanParent
            ? `${cleanParent}/${cleanName}`
            : cleanName;

        if (
          filePath.includes(
            ".."
          )
        ) {
          setConsoleOutput(
            "> Invalid file path."
          );

          return;
        }

        const alreadyExists =
          room.files.some(
            (
              file
            ) =>
              normalizeWorkspacePath(
                file.path ||
                  file.name
              ) ===
              filePath
          );

        if (
          alreadyExists
        ) {
          setConsoleOutput(
            `> File already exists: ${filePath}`
          );

          return;
        }

        const newFile:
          FileData = {
          name:
            cleanName,

          path:
            filePath,

          language:
            getLanguageFromFile(
              cleanName
            ),

          content:
            "",

          size:
            0,

          isDirectory:
            false,
        };

        /*
         * Optimistic UI.
         */
        setRoom(
          (
            previous
          ) => ({
            ...previous,

            files: [
              ...previous.files,
              newFile,
            ],
          })
        );

        setFileContents(
          (
            previous
          ) => ({
            ...previous,

            [filePath]:
              "",
          })
        );

        latestContentRef.current =
          {
            ...latestContentRef.current,

            [filePath]:
              "",
          };

        localChangeRef.current[
          filePath
        ] = 0;

        setActiveFile(
          filePath
        );

        /*
         * Primary path:
         *
         * Socket.IO
         *   ↓
         * server socketHandler
         *   ↓
         * worker-service
         *   ↓
         * room container
         */
        if (
          socket?.connected
        ) {
          socket.emit(
            "file:create",
            {
              roomId:
                room.roomId,

              fileName:
                cleanName,

              path:
                filePath,

              language:
                newFile.language,

              content:
                "",

              username:
                room.userName,
            }
          );

          setConsoleOutput(
            `> Created file: ${filePath}`
          );

          return;
        }

        /*
         * HTTP fallback.
         */
        try {
          const response =
            await fetch(
              `${API_URL}/api/workspace/file`,
              {
                method: "POST",

                headers: {
                  "Content-Type":
                    "application/json",
                },

                credentials:
                  "include",

                body:
                  JSON.stringify({
                    roomId:
                      room.roomId,

                    fileName:
                      filePath,

                    path:
                      filePath,

                    language:
                      newFile.language,

                    content:
                      "",
                  }),
              }
            );

          let data:
            {
              error?: string;
            } =
            {};

          try {
            data =
              await response.json();
          } catch {
            data = {};
          }

          if (!response.ok) {
            throw new Error(
              data.error ||
                `File creation failed (${response.status})`
            );
          }

          setConsoleOutput(
            `> Created file: ${filePath}`
          );
        } catch (
          error
        ) {
          console.error(
            "File creation error:",
            error
          );

          /*
           * Roll back optimistic UI
           * when persistence failed.
           */
          setRoom(
            (
              previous
            ) => ({
              ...previous,

              files:
                previous.files.filter(
                  (
                    file
                  ) =>
                    normalizeWorkspacePath(
                      file.path ||
                        file.name
                    ) !==
                    filePath
                ),
            })
          );

          setFileContents(
            (
              previous
            ) => {
              const next =
                {
                  ...previous,
                };

              delete next[
                filePath
              ];

              return next;
            }
          );

          delete latestContentRef
            .current[filePath];

          setActiveFile(
            ""
          );

          setConsoleOutput(
            `> File creation failed: ${
              error instanceof Error
                ? error.message
                : String(error)
            }`
          );
        }
      },
      [
        room.files,
        room.roomId,
        room.userName,
        socket,
      ]
    );

  /* ------------------------------------------------------------------------ */
  /* Create Folder                                                            */
  /* ------------------------------------------------------------------------ */

  const handleCreateFolder =
    useCallback(
      async (
        folderName: string,
        parentPath = ""
      ) => {
        const cleanName =
          cleanEntryName(
            folderName
          );

        if (
          !cleanName
        ) {
          return;
        }

        const cleanParent =
          normalizeWorkspacePath(
            parentPath
          );

        const folderPath =
          cleanParent
            ? `${cleanParent}/${cleanName}`
            : cleanName;

        if (
          folderPath.includes(
            ".."
          )
        ) {
          setConsoleOutput(
            "> Invalid folder path."
          );

          return;
        }

        const alreadyExists =
          room.files.some(
            (
              file
            ) =>
              normalizeWorkspacePath(
                file.path ||
                  file.name
              ) ===
              folderPath
          );

        if (
          alreadyExists
        ) {
          setConsoleOutput(
            `> Folder already exists: ${folderPath}`
          );

          return;
        }

        const newFolder:
          FileData = {
          name:
            cleanName,

          path:
            folderPath,

          language:
            "plaintext",

          content:
            "",

          size:
            0,

          isDirectory:
            true,
        };

        /*
         * Optimistic UI.
         */
        setRoom(
          (
            previous
          ) => ({
            ...previous,

            files: [
              ...previous.files,
              newFolder,
            ],
          })
        );

        /*
         * Primary Docker persistence
         * through Socket.IO.
         */
        if (
          socket?.connected
        ) {
          socket.emit(
            "folder:create",
            {
              roomId:
                room.roomId,

              folderName:
                cleanName,

              path:
                folderPath,

              username:
                room.userName,
            }
          );

          setConsoleOutput(
            `> Created folder: ${folderPath}`
          );

          return;
        }

        /*
         * HTTP fallback.
         */
        try {
          const response =
            await fetch(
              `${API_URL}/api/workspace/folder`,
              {
                method: "POST",

                headers: {
                  "Content-Type":
                    "application/json",
                },

                credentials:
                  "include",

                body:
                  JSON.stringify({
                    roomId:
                      room.roomId,

                    folderName:
                      cleanName,

                    path:
                      folderPath,
                  }),
              }
            );

          let data:
            {
              error?: string;
            } =
            {};

          try {
            data =
              await response.json();
          } catch {
            data = {};
          }

          if (!response.ok) {
            throw new Error(
              data.error ||
                `Folder creation failed (${response.status})`
            );
          }

          setConsoleOutput(
            `> Created folder: ${folderPath}`
          );
        } catch (
          error
        ) {
          console.error(
            "Folder creation error:",
            error
          );

          setRoom(
            (
              previous
            ) => ({
              ...previous,

              files:
                previous.files.filter(
                  (
                    file
                  ) =>
                    normalizeWorkspacePath(
                      file.path ||
                        file.name
                    ) !==
                    folderPath
                ),
            })
          );

          setConsoleOutput(
            `> Folder creation failed: ${
              error instanceof Error
                ? error.message
                : String(error)
            }`
          );
        }
      },
      [
        room.files,
        room.roomId,
        room.userName,
        socket,
      ]
    );

  const handleRename = useCallback(
      async (
          oldPath: string,
          newPath: string
      ) => {
          if (!roomId) {
              return;
          }

          const safeOldPath =
              normalizeWorkspacePath(oldPath);

          const safeNewPath =
              normalizeWorkspacePath(newPath);

          if (
              !safeOldPath ||
              !safeNewPath
          ) {
              return;
          }

          if (
              safeOldPath ===
              safeNewPath
          ) {
              return;
          }

          const existingItem =
              room?.files.find(
                  (file) =>
                      normalizeWorkspacePath(
                          file.path || file.name
                      ) === safeNewPath
              );

          if (existingItem) {
              console.error(
                  "Rename destination already exists:",
                  safeNewPath
              );
              return;
          }

          try {
              const connectedSocket =
                  socketRef.current;

              if (
                  connectedSocket?.connected
              ) {
                  connectedSocket.emit(
                      "file:rename",
                      {
                          roomId,
                          oldPath:
                              safeOldPath,
                          newPath:
                              safeNewPath,
                          username:
                              urlUserName,
                      }
                  );

                  return;
              }

              const response =
                  await fetch(
                      `${API_URL}/api/workspace/rename`,
                      {
                          method: "POST",
                          headers: {
                              "Content-Type":
                                  "application/json",
                          },
                          body: JSON.stringify({
                              roomId,
                              oldPath:
                                  safeOldPath,
                              newPath:
                                  safeNewPath,
                          }),
                      }
                  );

              if (!response.ok) {
                  throw new Error(
                      "Failed to rename workspace item"
                  );
              }

              await loadRoom();
          } catch (error) {
              console.error(
                  "Rename failed:",
                  error
              );

              await loadRoom();
          }
      },
      [
          roomId,
          room,
          urlUserName,
          loadRoom,
      ]
  );
  /* ------------------------------------------------------------------------ */
  /* Delete File / Folder                                                     */
  /* ------------------------------------------------------------------------ */

  const handleDeleteFile =
    useCallback(
      async (
        item: FileItem,
        parentPath = ""
      ) => {
        const cleanParent =
          normalizeWorkspacePath(
            parentPath
          );

        const itemName =
          cleanEntryName(
            item.name
          );

        const itemPath =
          cleanParent
            ? `${cleanParent}/${itemName}`
            : itemName;

        if (
          !itemPath
        ) {
          return;
        }

        if (
          itemPath.includes(
            ".."
          )
        ) {
          setConsoleOutput(
            "> Invalid delete path."
          );

          return;
        }

        const matchesPath =
          (
            file: FileData
          ) => {
            const path =
              normalizeWorkspacePath(
                file.path ||
                  file.name
              );

            return (
              path ===
                itemPath ||
              path.startsWith(
                `${itemPath}/`
              )
            );
          };

        const deletedPaths =
          room.files
            .filter(
              matchesPath
            )
            .map(
              (
                file
              ) =>
                normalizeWorkspacePath(
                  file.path ||
                    file.name
                )
            );

        /*
         * Optimistic UI.
         */
        setRoom(
          (
            previous
          ) => ({
            ...previous,

            files:
              previous.files.filter(
                (
                  file
                ) =>
                  !matchesPath(
                    file
                  )
              ),
          })
        );

        setFileContents(
          (
            previous
          ) => {
            const next =
              {
                ...previous,
              };

            deletedPaths.forEach(
              (
                path
              ) => {
                delete next[
                  path
                ];
              }
            );

            return next;
          }
        );

        deletedPaths.forEach(
          (
            path
          ) => {
            delete latestContentRef
              .current[path];

            delete localChangeRef
              .current[path];
          }
        );

        if (
          activeFile ===
            itemPath ||
          activeFile.startsWith(
            `${itemPath}/`
          )
        ) {
          const fallback =
            room.files.find(
              (
                file
              ) =>
                !file.isDirectory &&
                !matchesPath(
                  file
                )
            );

          setActiveFile(
            fallback?.path ||
              fallback?.name ||
              ""
          );
        }

        /*
         * Primary Docker persistence.
         */
        if (
          socket?.connected
        ) {
          socket.emit(
            "file:delete",
            {
              roomId:
                room.roomId,

              fileName:
                item.name,

              path:
                itemPath,

              type:
                item.type,

              username:
                room.userName,
            }
          );

          setConsoleOutput(
            `> Deleted ${item.type}: ${itemPath}`
          );

          return;
        }

        /*
         * HTTP fallback.
         */
        try {
          const response =
            await fetch(
              `${API_URL}/api/workspace/delete`,
              {
                method: "DELETE",

                headers: {
                  "Content-Type":
                    "application/json",
                },

                credentials:
                  "include",

                body:
                  JSON.stringify({
                    roomId:
                      room.roomId,

                    path:
                      itemPath,

                    type:
                      item.type,
                  }),
              }
            );

          let data:
            {
              error?: string;
            } =
            {};

          try {
            data =
              await response.json();
          } catch {
            data = {};
          }

          if (!response.ok) {
            throw new Error(
              data.error ||
                `Delete failed (${response.status})`
            );
          }

          setConsoleOutput(
            `> Deleted ${item.type}: ${itemPath}`
          );
        } catch (
          error
        ) {
          console.error(
            "Delete error:",
            error
          );

          setConsoleOutput(
            `> Delete persistence failed: ${
              error instanceof Error
                ? error.message
                : String(error)
            }`
          );

          /*
           * Reload actual Docker workspace
           * after a failed delete so the UI
           * becomes authoritative again.
           */
          await loadRoom();
        }
      },
      [
        activeFile,
        room.files,
        room.roomId,
        room.userName,
        socket,
        loadRoom,
      ]
    );

  /* ------------------------------------------------------------------------ */
  /* Editor Change                                                            */
  /* ------------------------------------------------------------------------ */

  const handleEditorChange =
    useCallback(
      (
        value:
          | string
          | undefined
      ) => {
        if (
          !activeFile ||
          !currentFile
        ) {
          return;
        }

        const nextValue =
          value ?? "";

        const normalizedPath =
          normalizeWorkspacePath(
            activeFile
          );

        /*
         * Local revision.
         */
        localChangeRef.current[
          normalizedPath
        ] =
          (
            localChangeRef.current[
              normalizedPath
            ] || 0
          ) + 1;

        /*
         * Update editor immediately.
         */
        setFileContents(
          (
            previous
          ) => ({
            ...previous,

            [normalizedPath]:
              nextValue,
          })
        );

        latestContentRef.current =
          {
            ...latestContentRef.current,

            [normalizedPath]:
              nextValue,
          };

        /*
         * Update local room metadata.
         */
        setRoom(
          (
            previous
          ) => ({
            ...previous,

            files:
              previous.files.map(
                (
                  file
                ) =>
                  normalizeWorkspacePath(
                    file.path ||
                      file.name
                  ) ===
                  normalizedPath
                    ? {
                        ...file,

                        path:
                          normalizedPath,

                        content:
                          nextValue,

                        size:
                          new Blob([
                            nextValue,
                          ]).size,
                      }
                    : file
              ),
          })
        );

        /*
         * ---------------------------------------------------------------
         * REAL-TIME COLLABORATION
         * ---------------------------------------------------------------
         *
         * This goes to:
         *
         * browser
         *    ↓
         * socketHandler.ts
         *    ↓
         * worker-service
         *    ↓
         * room Docker container
         *
         * The server should use socket.data.roomId
         * and socket.data.username instead of
         * trusting these client values.
         */
        if (
          socket &&
          socket.connected &&
          room.roomId
        ) {
          socket.emit(
            "file:update",
            {
              roomId:
                room.roomId,

              fileName:
                normalizedPath,

              path:
                normalizedPath,

              language:
                currentFile.language,

              content:
                nextValue,

              username:
                room.userName,

              source:
                "editor",
            }
          );
        }

        /*
         * ---------------------------------------------------------------
         * HTTP DOCKER AUTOSAVE
         * ---------------------------------------------------------------
         */
        scheduleAutoSave(
          normalizedPath,
          nextValue,
          currentFile.language
        );
      },
      [
        activeFile,
        currentFile,
        room.roomId,
        room.userName,
        socket,
        scheduleAutoSave,
      ]
    );

  /* ------------------------------------------------------------------------ */
  /* Run Code                                                                 */
  /* ------------------------------------------------------------------------ */

  const handleRun =
    useCallback(
      async (
        code: string
      ) => {
        if (
          !room.roomId
        ) {
          setConsoleOutput(
            "> Room is not available."
          );

          return;
        }

        if (
          !activeFile
        ) {
          setConsoleOutput(
            "> No file selected."
          );

          return;
        }

        if (
          !code.trim()
        ) {
          setConsoleOutput(
            "> Nothing to execute."
          );

          return;
        }

        if (
          !currentFile
        ) {
          setConsoleOutput(
            "> Selected file no longer exists in the Docker workspace."
          );

          return;
        }

        if (
          isRunning
        ) {
          return;
        }

        /*
         * Force the newest editor content
         * into Docker before execution.
         */
        await saveFileToDocker(
          activeFile,
          code,
          currentFile.language
        );

        setIsRunning(
          true
        );

        setExecutionId(
          ""
        );

        setConsoleOutput(
          [
            "> CodeBuddy Execution Engine",
            "> --------------------------------",
            `> Room: ${room.roomId}`,
            `> File: ${activeFile}`,
            `> Language: ${currentFile.language}`,
            "> Saving latest code to Docker...",
            "> Starting execution...",
            "",
          ].join("\n")
        );

        try {
          const response =
            await fetch(
              `${API_URL}/api/execute`,
              {
                method: "POST",

                headers: {
                  "Content-Type":
                    "application/json",
                },

                credentials:
                  "include",

                body:
                  JSON.stringify({
                    roomId:
                      room.roomId,

                    fileName:
                      activeFile,

                    language:
                      currentFile.language,

                    code,

                    mode:
                      "run",
                  }),
              }
            );

          let data:
            ExecuteResponse =
            {};

          try {
            data =
              await response.json();
          } catch {
            throw new Error(
              `Invalid response from execution server (${response.status})`
            );
          }

          if (!response.ok) {
            throw new Error(
              data.error ||
                data.message ||
                `Execution failed (${response.status})`
            );
          }

          if (
            data.executionId
          ) {
            setExecutionId(
              data.executionId
            );
          }

          const outputParts:
            string[] = [];

          outputParts.push(
            "> Execution completed."
          );

          if (
            data.executionId
          ) {
            outputParts.push(
              `> Execution ID: ${data.executionId}`
            );
          }

          if (
            typeof data.exitCode ===
            "number"
          ) {
            outputParts.push(
              `> Exit code: ${data.exitCode}`
            );
          }

          if (
            typeof data.durationMs ===
            "number"
          ) {
            outputParts.push(
              `> Duration: ${data.durationMs} ms`
            );
          }

          if (
            data.timedOut
          ) {
            outputParts.push(
              "> Execution timed out."
            );
          }

          if (
            data.memoryExceeded
          ) {
            outputParts.push(
              "> Memory limit exceeded."
            );
          }

          if (
            data.stdout
          ) {
            outputParts.push(
              data.stdout
            );
          }

          if (
            data.stderr
          ) {
            outputParts.push(
              `[stderr]\n${data.stderr}`
            );
          }

          if (
            data.output
          ) {
            outputParts.push(
              data.output
            );
          }

          if (
            outputParts.length ===
            1
          ) {
            outputParts.push(
              "> Program completed with no output."
            );
          }

          setConsoleOutput(
            outputParts.join(
              "\n"
            )
          );
        } catch (
          error
        ) {
          console.error(
            "Code execution error:",
            error
          );

          setConsoleOutput(
            [
              "> Execution failed.",
              "",
              error instanceof
                Error
                ? error.message
                : String(error),
            ].join("\n")
          );
        } finally {
          setIsRunning(
            false
          );
        }
      },
      [
        activeFile,
        currentFile,
        isRunning,
        room.roomId,
        saveFileToDocker,
      ]
    );

  /* ------------------------------------------------------------------------ */
  /* Refresh Workspace                                                        */
  /* ------------------------------------------------------------------------ */

  const handleRefreshWorkspace =
    useCallback(
      async () => {
        if (
          workspaceLoading
        ) {
          return;
        }

        setWorkspaceLoading(
          true
        );

        try {
          await loadRoom();

          setConsoleOutput(
            "> Workspace refreshed from Docker."
          );
        } catch (
          error
        ) {
          console.error(
            "Workspace refresh error:",
            error
          );
        } finally {
          setWorkspaceLoading(
            false
          );
        }
      },
      [
        loadRoom,
        workspaceLoading,
      ]
    );

  /* ------------------------------------------------------------------------ */
  /* Upload File                                                              */
  /* ------------------------------------------------------------------------ */

  const handleUpload =
    useCallback(
      async (
        event: React.ChangeEvent<HTMLInputElement>
      ) => {
        const file =
          event.target.files?.[0];

        if (!file) {
          return;
        }

        if (
          !room.roomId
        ) {
          setRoomError(
            "Room is not available."
          );

          return;
        }

        setUploading(
          true
        );

        try {
          const formData =
            new FormData();

          formData.append(
            "file",
            file
          );

          formData.append(
            "roomId",
            room.roomId
          );

          const response =
            await fetch(
              `${API_URL}/api/upload`,
              {
                method: "POST",

                body:
                  formData,

                credentials:
                  "include",
              }
            );

          let data:
            {
              error?: string;
            } =
            {};

          try {
            data =
              await response.json();
          } catch {
            data = {};
          }

          if (!response.ok) {
            throw new Error(
              data.error ||
                `Upload failed (${response.status})`
            );
          }

          setConsoleOutput(
            `> File uploaded successfully: ${file.name}`
          );

          await loadRoom();
        } catch (
          error
        ) {
          console.error(
            "Upload error:",
            error
          );

          setConsoleOutput(
            [
              "> Upload failed:",
              error instanceof
                Error
                ? error.message
                : String(error),
            ].join("\n")
          );
        } finally {
          setUploading(
            false
          );

          event.target.value =
            "";
        }
      },
      [
        room.roomId,
        loadRoom,
      ]
    );

  /* ------------------------------------------------------------------------ */
  /* Clear Console                                                            */
  /* ------------------------------------------------------------------------ */

  const handleClearConsole =
    useCallback(
      () => {
        setConsoleOutput(
          ""
        );
      },
      []
    );

  /* ------------------------------------------------------------------------ */
  /* Loading                                                                   */
  /* ------------------------------------------------------------------------ */

  if (
    roomLoading
  ) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-10 h-10 rounded-full border-2 border-[#fa8c00]/20 border-t-[#fa8c00] animate-spin" />

            <Code2 className="absolute inset-0 m-auto w-4 h-4 text-[#fa8c00]" />
          </div>

          <div className="text-center">
            <p className="text-sm font-medium">
              Connecting to Code Buddy
            </p>

            <p className="text-xs text-[#52525b] mt-1">
              Loading isolated Docker workspace...
            </p>
          </div>
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------------------------ */
  /* Main IDE                                                                  */
  /* ------------------------------------------------------------------------ */

  return (
    <div
      className={`
        h-screen
        w-screen
        overflow-hidden
        bg-[#0a0a0a]
        text-white
        flex
        flex-col
        transition-opacity
        duration-500
        ${
          mounted
            ? "opacity-100"
            : "opacity-0"
        }
      `}
    >
      {/* ------------------------------------------------------------------ */}
      {/* Header                                                             */}
      {/* ------------------------------------------------------------------ */}

      <Header
        roomId={
          room.roomId
        }
        userName={
          room.userName
        }
        userCount={
          room.userCount
        }
        isOnline={
          room.isOnline
        }
        onVideoCall={() =>
          setVideoCallOpen(true)
        }
      />

      {/* ------------------------------------------------------------------ */}
      {/* Error                                                              */}
      {/* ------------------------------------------------------------------ */}

      {roomError && (
        <div className="absolute top-[57px] left-1/2 -translate-x-1/2 z-[60]">
          <div className="px-3 py-1.5 rounded-b-lg bg-[#1a1a1a] border border-[#27272a] shadow-xl">
            <span className="text-[10px] text-[#cca700]">
              {roomError}
            </span>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Toolbar                                                            */}
      {/* ------------------------------------------------------------------ */}

      <div className="h-9 flex-shrink-0 flex items-center justify-between px-2 border-b border-[#27272a] bg-[#0f0f0f]">
        <div className="flex items-center gap-1">
          {/* Explorer */}

          <button
            onClick={() =>
              setShowExplorer(
                (
                  previous
                ) =>
                  !previous
              )
            }
            className={`
              flex
              items-center
              gap-1.5
              px-2.5
              h-7
              rounded-md
              text-[11px]
              font-medium
              transition-all
              duration-200
              ${
                showExplorer
                  ? "bg-[#1a1a1a] text-white"
                  : "text-[#71717a] hover:text-white hover:bg-[#18181b]"
              }
            `}
          >
            <PanelLeft className="w-3.5 h-3.5" />

            Explorer
          </button>

          {/* Console */}

          <button
            onClick={() =>
              setShowConsole(
                (
                  previous
                ) =>
                  !previous
              )
            }
            className={`
              flex
              items-center
              gap-1.5
              px-2.5
              h-7
              rounded-md
              text-[11px]
              font-medium
              transition-all
              duration-200
              ${
                showConsole
                  ? "bg-[#1a1a1a] text-white"
                  : "text-[#71717a] hover:text-white hover:bg-[#18181b]"
              }
            `}
          >
            <Terminal className="w-3.5 h-3.5" />

            Console
          </button>

          {/* Upload */}

          <label
            className={`
              flex
              items-center
              gap-1.5
              px-2.5
              h-7
              rounded-md
              text-[11px]
              font-medium
              cursor-pointer
              transition-all
              duration-200
              text-[#71717a]
              hover:text-white
              hover:bg-[#18181b]
              ${
                uploading
                  ? "opacity-50 pointer-events-none"
                  : ""
              }
            `}
          >
            <Upload className="w-3.5 h-3.5" />

            {uploading
              ? "Uploading..."
              : "Upload"}

            <input
              type="file"
              className="hidden"
              onChange={
                handleUpload
              }
              accept=".csv,.txt,.json,.pdf,.doc,.docx,.xls,.xlsx,.md"
            />
          </label>

          {/* Refresh */}

          <button
            onClick={
              handleRefreshWorkspace
            }
            disabled={
              workspaceLoading
            }
            className="
              flex
              items-center
              gap-1.5
              px-2.5
              h-7
              rounded-md
              text-[11px]
              font-medium
              text-[#71717a]
              hover:text-white
              hover:bg-[#18181b]
              disabled:opacity-50
              transition-all
              duration-200
            "
          >
            <RefreshCw
              className={`
                w-3.5
                h-3.5
                ${
                  workspaceLoading
                    ? "animate-spin"
                    : ""
                }
              `}
            />

            Refresh
          </button>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Workspace Information                                            */}
        {/* ---------------------------------------------------------------- */}

        <div className="hidden sm:flex items-center gap-3">
          {/* Docker Save Status */}

          <div className="flex items-center gap-1.5 text-[10px]">
            {isSaving ? (
              <>
                <Save className="w-3 h-3 text-[#fa8c00] animate-pulse" />

                <span className="text-[#fa8c00]">
                  Saving...
                </span>
              </>
            ) : saveError ? (
              <>
                <Save className="w-3 h-3 text-[#ef4444]" />

                <span className="text-[#ef4444]">
                  Save failed
                </span>
              </>
            ) : lastSavedAt ? (
              <>
                <Cloud className="w-3 h-3 text-[#22c55e]" />

                <span className="text-[#22c55e]">
                  Saved to Docker
                </span>
              </>
            ) : (
              <>
                <Cloud className="w-3 h-3 text-[#52525b]" />

                <span className="text-[#52525b]">
                  Docker workspace
                </span>
              </>
            )}
          </div>

          <div className="w-px h-3 bg-[#27272a]" />

          {/* Connection */}

          <div className="flex items-center gap-1.5 text-[10px] text-[#52525b]">
            {room.isOnline ? (
              <>
                <Wifi className="w-3 h-3 text-[#22c55e]" />

                <span className="text-[#22c55e]">
                  Connected
                </span>
              </>
            ) : (
              <>
                <WifiOff className="w-3 h-3 text-[#ef4444]" />

                <span className="text-[#ef4444]">
                  Offline
                </span>
              </>
            )}
          </div>

          <div className="w-px h-3 bg-[#27272a]" />

          {/* Users */}

          <div className="flex items-center gap-1.5 text-[10px] text-[#71717a]">
            <Users className="w-3 h-3 text-[#fa8c00]" />

            <span>
              {room.userCount}{" "}
              {
                room.userCount ===
                1
                  ? "client"
                  : "clients"
              }
            </span>
          </div>

          <div className="w-px h-3 bg-[#27272a]" />

          <span className="font-mono text-[10px] text-[#52525b]">
            {room.roomId}
          </span>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Workspace                                                           */}
      {/* ------------------------------------------------------------------ */}

      <div className="flex-1 min-h-0 min-w-0 flex overflow-hidden relative">
        {/* ---------------------------------------------------------------- */}
        {/* File Explorer                                                     */}
        {/* ---------------------------------------------------------------- */}

        {showExplorer && (
          <aside className="w-56 flex-shrink-0 border-r border-[#27272a] bg-[#0f0f0f] overflow-hidden">
            <FileExplorer
              files={
                fileTree
              }
              onFileSelect={
                handleFileSelect
              }
              activeFile={
                activeFile
              }
              onCreateFile={
                handleCreateFile
              }
              onCreateFolder={
                handleCreateFolder
              }
              onDelete={
                handleDeleteFile
              }
              onRefresh={
                handleRefreshWorkspace
              }
              dockerConnected={
                room.isOnline
              }
              onRename={
                handleRename
              }
              loading={
                workspaceLoading
              }
            />
          </aside>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* Editor + Console                                                  */}
        {/* ---------------------------------------------------------------- */}

        <main className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
          {/* Editor */}

          <div className="flex-1 min-h-0 min-w-0">
            {currentFile ? (
              <EditorPanel
                fileName={
                  currentFile.name
                }
                language={
                  currentFile.language
                }
                value={
                  currentCode
                }
                onChange={
                  handleEditorChange
                }
                onRun={
                  handleRun
                }
                isRunning={
                  isRunning
                }
                onLanguageChange={(language) => {
                  if (!activeFile) {
                    return;
                  }

                  setRoom((previous) => ({
                    ...previous,

                    files: previous.files.map((file) =>
                      normalizeWorkspacePath(
                        file.path || file.name
                      ) === activeFile
                        ? {
                            ...file,
                            language,
                          }
                        : file
                    ),
                  }));
                  }}
              />
            ) : (
              <div className="flex h-full items-center justify-center bg-[#0a0a0a]">
                <div className="text-center">
                  <Code2 className="mx-auto mb-3 h-8 w-8 text-[#27272a]" />

                  <p className="text-sm text-[#71717a]">
                    No file selected
                  </p>

                  <p className="mt-1 text-xs text-[#3f3f46]">
                    The Docker workspace is empty.
                    Create a file from the Explorer
                    to start coding.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Console */}

          {showConsole && (
            <div className="flex-shrink-0 min-w-0">
              <ConsolePanel
                output={
                  consoleOutput
                }
                onClear={
                  handleClearConsole
                }
              />
            </div>
          )}
        </main>

        {/* ---------------------------------------------------------------- */}
        {/* Chat                                                               */}
        {/* ---------------------------------------------------------------- */}

        <ChatPanel
          roomId={
            room.roomId
          }
          userName={
            room.userName
          }
          userCount={
            room.userCount
          }

        />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Status Bar                                                          */}
      {/* ------------------------------------------------------------------ */}

      <footer className="h-6 flex-shrink-0 flex items-center justify-between px-3 border-t border-[#27272a] bg-[#111111]">
        <div className="flex items-center gap-3 text-[10px] font-mono text-[#52525b]">
          {/* Live status */}

          <span className="flex items-center gap-1">
            <span
              className={`
                w-1.5
                h-1.5
                rounded-full
                ${
                  room.isOnline
                    ? "bg-[#22c55e]"
                    : "bg-[#ef4444]"
                }
              `}
            />

            {room.isOnline
              ? "Live"
              : "Offline"}
          </span>

          {/* Save status */}

          <span className="flex items-center gap-1">
            <Save className="w-2.5 h-2.5" />

            {isSaving
              ? "Saving"
              : saveError
              ? "Save Error"
              : lastSavedAt
              ? "Saved"
              : "Not Saved"}
          </span>

          {/* Language */}

          <span>
            {currentFile?.language ||
              "plaintext"}
          </span>

          {/* Character count */}

          <span>
            {currentCode.length.toLocaleString()}{" "}
            chars
          </span>

          {/* Execution */}

          {isRunning && (
            <span className="text-[#fa8c00]">
              Executing...
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 text-[10px] font-mono text-[#52525b]">
          <span>
            {activeFile}
          </span>

          <span className="text-[#3f3f46]">
            {room.roomId}
          </span>
        </div>
      </footer>
      {/* ------------------------------------------------------------------ */}
      {/* Video Call                                                          */}
      {/* ------------------------------------------------------------------ */}

      <VideoCall
        isOpen={
          videoCallOpen
        }
        onClose={() =>
          setVideoCallOpen(false)
        }
        roomId={
          room.roomId
        }
      />
    </div>
  );
}