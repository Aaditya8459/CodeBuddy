"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import Header from "@/components/IDE/Header";
import FileExplorer from "@/components/IDE/FileExplorer";
import EditorPanel from "@/components/IDE/Editor";
import ConsolePanel from "@/components/IDE/Console";
import ChatPanel from "@/components/IDE/ChatPanel";
import { useParams, useSearchParams } from "next/navigation";

import {
  PanelLeft,
  Terminal,
  Users,
  Code2,
  Wifi,
  WifiOff,
} from "lucide-react";

import { io, Socket } from "socket.io-client";

interface FileData {
  name: string;
  language: string;
  content: string;
}

interface RoomData {
  roomId: string;
  userName: string;
  userCount: number;
  isOnline: boolean;
  files: FileData[];
}

/* -------------------------------------------------------------------------- */
/* Default project                                                            */
/* -------------------------------------------------------------------------- */

const DEFAULT_FILES: FileData[] = [
  {
    name: "App.tsx",
    language: "typescript",
    content: `import React, { useState } from "react";

interface Props {
  name: string;
}

export default function App({ name }: Props) {
  const [count, setCount] = useState(0);

  return (
    <div className="p-4">
      <h1>Hello, {name}!</h1>

      <p>Count: {count}</p>

      <button onClick={() => setCount((c) => c + 1)}>
        Increment
      </button>
    </div>
  );
}
`,
  },
  {
    name: "index.css",
    language: "css",
    content: `@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  margin: 0;
  padding: 0;
  font-family: Inter, sans-serif;
}
`,
  },
  {
    name: "utils.ts",
    language: "typescript",
    content: `export function fibonacci(n: number): number {
  if (n <= 1) {
    return n;
  }

  return fibonacci(n - 1) + fibonacci(n - 2);
}

console.log("Fibonacci sequence:");

for (let i = 0; i < 10; i++) {
  console.log(\`F(\${i}) = \${fibonacci(i)}\`);
}
`,
  },
  {
    name: "package.json",
    language: "json",
    content: `{
  "name": "code-buddy-project",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start"
  }
}
`,
  },
  {
    name: "README.md",
    language: "markdown",
    content: `# Code Buddy

A collaborative coding environment.

## Features

- Real-time collaboration
- Monaco code editor
- Docker-based code execution
- Live console
- Real-time chat
- MongoDB room persistence

## Getting Started

1. Create a room
2. Invite your team
3. Open the project
4. Start coding
5. Run your code
`,
  },
];

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function getLanguageFromFile(fileName: string): string {
  const extension = fileName.split(".").pop()?.toLowerCase();

  switch (extension) {
    case "ts":
      return "typescript";

    case "tsx":
      return "typescript";

    case "js":
      return "javascript";

    case "jsx":
      return "javascript";

    case "py":
      return "python";

    case "json":
      return "json";

    case "css":
      return "css";

    case "html":
      return "html";

    case "md":
      return "markdown";

    default:
      return "plaintext";
  }
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

export default function RoomPage() {
  const params = useParams<{ id: string }>();

  const searchParams = useSearchParams();

  /* ------------------------------------------------------------------------ */
  /* Room state                                                               */
  /* ------------------------------------------------------------------------ */

  const [room, setRoom] = useState<RoomData>({
    roomId: "",
    userName: "You",
    userCount: 1,
    isOnline: false,
    files: DEFAULT_FILES,
  });

  const [roomLoading, setRoomLoading] = useState(true);
  const [roomError, setRoomError] = useState("");

  /* ------------------------------------------------------------------------ */
  /* IDE state                                                                */
  /* ------------------------------------------------------------------------ */

  const [activeFile, setActiveFile] = useState("App.tsx");

  const [fileContents, setFileContents] =
    useState<Record<string, string>>(() => {
      return DEFAULT_FILES.reduce<Record<string, string>>(
        (accumulator, file) => {
          accumulator[file.name] = file.content;
          return accumulator;
        },
        {}
      );
    });

  const [consoleOutput, setConsoleOutput] = useState("");

  const [isRunning, setIsRunning] = useState(false);

  /* ------------------------------------------------------------------------ */
  /* Layout state                                                             */
  /* ------------------------------------------------------------------------ */

  const [showExplorer, setShowExplorer] = useState(true);

  const [showConsole, setShowConsole] = useState(true);

  const [mounted, setMounted] = useState(false);

  /* ------------------------------------------------------------------------ */
  /* Socket state                                                             */
  /* ------------------------------------------------------------------------ */

  const [socket, setSocket] = useState<Socket | null>(null);

  /* ------------------------------------------------------------------------ */
  /* URL username                                                             */
  /* ------------------------------------------------------------------------ */

  const urlUserName = useMemo(() => {
    const name = searchParams?.get("name");

    if (!name) {
      return "";
    }

    return name.trim();
  }, [searchParams]);

  /* ------------------------------------------------------------------------ */
  /* Current file                                                             */
  /* ------------------------------------------------------------------------ */

  const currentFile = useMemo(() => {
    return (
      room.files.find((file) => file.name === activeFile) ||
      DEFAULT_FILES.find((file) => file.name === activeFile) ||
      DEFAULT_FILES[0]
    );
  }, [room.files, activeFile]);

  const currentCode = fileContents[activeFile] ?? "";

  /* ------------------------------------------------------------------------ */
  /* Mount animation                                                          */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setMounted(true);
    }, 50);

    return () => window.clearTimeout(timer);
  }, []);

  /* ------------------------------------------------------------------------ */
  /* Fetch current room                                                       */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    let cancelled = false;

    async function loadRoom() {
      try {
        setRoomLoading(true);
        setRoomError("");

        /*
         * Backend endpoint:
         *
         * GET /api/rooms/:id
         *
         * Example:
         *
         * GET http://localhost:5000/api/rooms/ABC123
         *
         * Backend response:
         *
         * {
         *   "data": {
         *     "room": {...},
         *     "users": [...]
         *   }
         * }
         */

        const roomId = params?.id;

        if (!roomId) {
          throw new Error("Room ID is missing");
        }

        const response = await fetch(
          `http://localhost:5000/api/rooms/${encodeURIComponent(roomId)}`,
          {
            method: "GET",
            credentials: "include",
            cache: "no-store",
          }
        );

        if (!response.ok) {
          throw new Error(
            `Unable to load room (${response.status})`
          );
        }

        const responseData = await response.json();

        const roomData = responseData.data?.room;
        const users = responseData.data?.users || [];

        if (!roomData) {
          throw new Error("Room data is missing from server response");
        }

        if (cancelled) {
          return;
        }

        /*
         * Your current backend does not return files yet.
         * Therefore keep using DEFAULT_FILES until files
         * are stored and returned by the backend.
         */
        const fetchedFiles: FileData[] = DEFAULT_FILES;

        /*
         * IMPORTANT:
         *
         * The URL:
         *
         * /room/6YC6SRUZ?name=YDKING
         *
         * contains the current client's username.
         *
         * We prefer the explicit URL username because it identifies
         * the person currently opening this room.
         *
         * If no ?name= value exists, we use the backend/MongoDB
         * username returned by getRoom().
         *
         * Finally we fall back to "You".
         */
        const backendUserName =
          typeof roomData.yourName === "string"
            ? roomData.yourName.trim()
            : "";

        const mongoUserName =
          users.find(
            (user: {
              name?: string;
            }) =>
              typeof user?.name === "string" &&
              user.name.trim() === urlUserName
          )?.name || "";

        const currentUserName =
          urlUserName ||
          mongoUserName ||
          backendUserName ||
          "You";

        setRoom({
          roomId:
            roomData.roomCode ||
            roomId.toString().toUpperCase(),
          userName: currentUserName,
          userCount:
            typeof responseData.data?.userCount === "number"
              ? responseData.data.userCount
              : Array.isArray(users)
              ? users.length
              : 1,
          isOnline: false,
          files: fetchedFiles,
        });

        const nextContents = fetchedFiles.reduce<
          Record<string, string>
        >((accumulator, file) => {
          accumulator[file.name] = file.content;
          return accumulator;
        }, {});

        setFileContents(nextContents);

        if (fetchedFiles.length > 0) {
          setActiveFile(fetchedFiles[0].name);
        }

        /*
         * If the URL supplied a username but MongoDB does not yet
         * contain that exact user, the Socket.IO join operation will
         * register/update the user on the backend.
         */
      } catch (error) {
        console.error("Room loading error:", error);

        if (cancelled) {
          return;
        }

        /*
         * Do NOT silently create a fake LOCAL-ROOM anymore.
         *
         * This makes backend/API/Socket.IO problems much easier
         * to identify during development.
         */
        setRoom((previous) => ({
          ...previous,
          roomId:
            params?.id?.toString().toUpperCase() || "",
          userName:
            urlUserName ||
            previous.userName ||
            "You",
          userCount: 0,
          isOnline: false,
          files: DEFAULT_FILES,
        }));

        setFileContents(
          DEFAULT_FILES.reduce<Record<string, string>>(
            (accumulator, file) => {
              accumulator[file.name] = file.content;
              return accumulator;
            },
            {}
          )
        );

        setRoomError(
          error instanceof Error
            ? error.message
            : "Unable to load room."
        );
      } finally {
        if (!cancelled) {
          setRoomLoading(false);
        }
      }
    }

    loadRoom();

    return () => {
      cancelled = true;
    };
  }, [params?.id, urlUserName]);

  /* ------------------------------------------------------------------------ */
  /* Socket.IO connection                                                     */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    if (!room.roomId) {
      return;
    }

    /*
     * Socket.IO server URL.
     *
     * .env.local:
     *
     * NEXT_PUBLIC_SOCKET_URL=http://localhost:5000
     *
     * IMPORTANT:
     *
     * Do NOT append /rooms/:roomId here.
     *
     * Socket.IO handles the connection and room joining through
     * socket.emit().
     */
    const socketUrl =
      process.env.NEXT_PUBLIC_SOCKET_URL;

    if (!socketUrl) {
      console.error(
        "NEXT_PUBLIC_SOCKET_URL is not configured."
      );

      setRoom((previous) => ({
        ...previous,
        isOnline: false,
      }));

      setRoomError(
        "Socket.IO URL is not configured. Add NEXT_PUBLIC_SOCKET_URL to client/.env.local."
      );

      return;
    }

    let cancelled = false;

    /*
     * Create Socket.IO connection.
     */
    const newSocket: Socket = io(socketUrl, {
      transports: ["websocket", "polling"],
      withCredentials: true,
      autoConnect: true,
    });

    setSocket(newSocket);

    /* ---------------------------------------------------------------------- */
    /* Socket connected                                                       */
    /* ---------------------------------------------------------------------- */

    newSocket.on("connect", () => {
      if (cancelled) {
        return;
      }

      console.log(
        "✅ Socket.IO connected:",
        newSocket.id
      );

      setRoom((previous) => ({
        ...previous,
        isOnline: true,
      }));

      /*
       * IMPORTANT:
       *
       * Socket.IO uses emit(), not socket.send(JSON.stringify(...)).
       *
       * This event must match the backend socket handler.
       */
      newSocket.emit("join-room", {
        roomId: room.roomId,
        username: room.userName,
      });
    });

    /* ---------------------------------------------------------------------- */
    /* Socket connection error                                                */
    /* ---------------------------------------------------------------------- */

    newSocket.on(
      "connect_error",
      (error) => {
        console.error(
          "❌ Socket.IO connection error:",
          error
        );

        if (cancelled) {
          return;
        }

        setRoom((previous) => ({
          ...previous,
          isOnline: false,
        }));
      }
    );

    /* ---------------------------------------------------------------------- */
    /* Generic room update                                                    */
    /* ---------------------------------------------------------------------- */

    newSocket.on(
      "room:update",
      (message: {
        userCount?: number;
        isOnline?: boolean;
        users?: unknown[];
      }) => {
        if (cancelled) {
          return;
        }

        setRoom((previous) => ({
          ...previous,

          userCount:
            typeof message?.userCount === "number"
              ? message.userCount
              : Array.isArray(message?.users)
              ? message.users.length
              : previous.userCount,

          isOnline:
            typeof message?.isOnline === "boolean"
              ? message.isOnline
              : true,
        }));
      }
    );

    /* ---------------------------------------------------------------------- */
    /* User joined                                                            */
    /* ---------------------------------------------------------------------- */

    newSocket.on(
      "room:user-joined",
      (message: {
        userCount?: number;
        users?: unknown[];
        user?: {
          name?: string;
        };
        username?: string;
        userName?: string;
      }) => {
        if (cancelled) {
          return;
        }

        console.log(
          "👤 User joined:",
          message
        );

        setRoom((previous) => ({
          ...previous,

          userCount:
            typeof message?.userCount === "number"
              ? message.userCount
              : Array.isArray(message?.users)
              ? message.users.length
              : previous.userCount + 1,

          isOnline: true,
        }));
      }
    );

    /* ---------------------------------------------------------------------- */
    /* User left                                                              */
    /* ---------------------------------------------------------------------- */

    newSocket.on(
      "room:user-left",
      (message: {
        userCount?: number;
        users?: unknown[];
        user?: {
          name?: string;
        };
        username?: string;
        userName?: string;
      }) => {
        if (cancelled) {
          return;
        }

        console.log(
          "👋 User left:",
          message
        );

        setRoom((previous) => ({
          ...previous,

          userCount:
            typeof message?.userCount === "number"
              ? message.userCount
              : Array.isArray(message?.users)
              ? message.users.length
              : Math.max(
                  0,
                  previous.userCount - 1
                ),

          isOnline: true,
        }));
      }
    );

    /* ---------------------------------------------------------------------- */
    /* File updated                                                           */
    /* ---------------------------------------------------------------------- */

    newSocket.on(
      "room:file-updated",
      (message: {
        fileName?: string;
        content?: string;
        language?: string;
      }) => {
        if (cancelled) {
          return;
        }

        const fileName = message?.fileName;

        if (!fileName) {
          return;
        }

        console.log(
          "📝 File updated:",
          fileName
        );

        setFileContents((previous) => ({
          ...previous,
          [fileName]:
            typeof message.content === "string"
              ? message.content
              : "",
        }));
      }
    );

    /*
     * Also listen for file:update for compatibility with
     * an older backend implementation.
     *
     * The primary event above is room:file-updated.
     */
    newSocket.on(
      "file:update",
      (message: {
        fileName?: string;
        content?: string;
        language?: string;
      }) => {
        if (cancelled) {
          return;
        }

        const fileName = message?.fileName;

        if (!fileName) {
          return;
        }

        setFileContents((previous) => ({
          ...previous,
          [fileName]:
            typeof message.content === "string"
              ? message.content
              : "",
        }));
      }
    );

    /* ---------------------------------------------------------------------- */
    /* Socket disconnected                                                    */
    /* ---------------------------------------------------------------------- */

    newSocket.on("disconnect", (reason) => {
      console.log(
        "⚠️ Socket.IO disconnected:",
        reason
      );

      if (cancelled) {
        return;
      }

      setRoom((previous) => ({
        ...previous,
        isOnline: false,
      }));
    });

    /* ---------------------------------------------------------------------- */
    /* Cleanup                                                                */
    /* ---------------------------------------------------------------------- */

    return () => {
      cancelled = true;

      console.log(
        "🔌 Disconnecting Socket.IO..."
      );

      newSocket.removeAllListeners();

      newSocket.disconnect();

      setSocket(null);
    };
  }, [room.roomId, room.userName]);

  /* ------------------------------------------------------------------------ */
  /* File selection                                                           */
  /* ------------------------------------------------------------------------ */

  const handleFileSelect = useCallback(
    (fileName: string) => {
      const file = room.files.find(
        (item) => item.name === fileName
      );

      if (!file) {
        return;
      }

      setActiveFile(fileName);
      setConsoleOutput("");
    },
    [room.files]
  );

  /* ------------------------------------------------------------------------ */
  /* Editor change                                                            */
  /* ------------------------------------------------------------------------ */

  const handleEditorChange = useCallback(
    (value: string | undefined) => {
      const nextValue = value ?? "";

      /*
       * Update local editor immediately.
       */
      setFileContents((previous) => ({
        ...previous,
        [activeFile]: nextValue,
      }));

      /*
       * Broadcast the code change to all other clients
       * through Socket.IO.
       *
       * This is the part that was previously missing.
       */
      if (
        socket &&
        socket.connected &&
        room.roomId &&
        room.userName
      ) {
        socket.emit("file:update", {
          roomId: room.roomId,
          fileName: activeFile,
          language: currentFile.language,
          content: nextValue,
          username: room.userName,
        });
      }
    },
    [
      activeFile,
      currentFile.language,
      room.roomId,
      room.userName,
      socket,
    ]
  );

  /* ------------------------------------------------------------------------ */
  /* Run code                                                                 */
  /* ------------------------------------------------------------------------ */

  const handleRun = useCallback(
    async (code: string) => {
      if (!code.trim()) {
        setConsoleOutput(
          "> Nothing to execute.\n"
        );

        return;
      }

      if (isRunning) {
        return;
      }

      setIsRunning(true);

      setConsoleOutput(
        [
          "> Preparing execution environment...",
          `> File: ${activeFile}`,
          `> Language: ${currentFile.language}`,
          "> Starting Docker sandbox...",
          "",
        ].join("\n")
      );

      try {
        /*
         * Docker execution endpoint.
         *
         * The backend is running on port 5000.
         *
         * Therefore do not use:
         *
         * fetch("/api/execute")
         *
         * because that targets the Next.js server.
         *
         * Use the backend server instead.
         */
        const backendUrl =
          process.env.NEXT_PUBLIC_API_URL ||
          "http://localhost:5000";

        const response = await fetch(
          `${backendUrl}/api/execute`,
          {
            method: "POST",

            headers: {
              "Content-Type": "application/json",
            },

            credentials: "include",

            body: JSON.stringify({
              roomId: room.roomId,
              fileName: activeFile,
              language: currentFile.language,
              code,
            }),
          }
        );

        let data: {
          error?: string;
          exitCode?: number;
          stdout?: string;
          stderr?: string;
        };

        try {
          data = await response.json();
        } catch {
          throw new Error(
            `Invalid response from execution server (${response.status})`
          );
        }

        if (!response.ok) {
          throw new Error(
            data?.error ||
              `Execution failed (${response.status})`
          );
        }

        const outputParts: string[] = [];

        outputParts.push(
          `> Docker execution completed`
        );

        if (
          typeof data.exitCode === "number"
        ) {
          outputParts.push(
            `> Exit code: ${data.exitCode}`
          );
        }

        if (data.stdout) {
          outputParts.push(
            data.stdout
          );
        }

        if (data.stderr) {
          outputParts.push(
            `[Error] ${data.stderr}`
          );
        }

        if (outputParts.length === 1) {
          outputParts.push(
            "> Code executed successfully with no output."
          );
        }

        setConsoleOutput(
          outputParts.join("\n")
        );
      } catch (error) {
        console.error(
          "Code execution error:",
          error
        );

        setConsoleOutput(
          [
            "> Runtime Error:",
            error instanceof Error
              ? error.message
              : String(error),
          ].join("\n")
        );
      } finally {
        setIsRunning(false);
      }
    },
    [
      activeFile,
      currentFile.language,
      isRunning,
      room.roomId,
    ]
  );

  /* ------------------------------------------------------------------------ */
  /* Console                                                                  */
  /* ------------------------------------------------------------------------ */

  const handleClearConsole = useCallback(() => {
    setConsoleOutput("");
  }, []);

  /* ------------------------------------------------------------------------ */
  /* Loading                                                                  */
  /* ------------------------------------------------------------------------ */

  if (roomLoading) {
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
              Loading your workspace...
            </p>
          </div>
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------------------------ */
  /* Main IDE                                                                 */
  /* ------------------------------------------------------------------------ */

  return (
    <div
      className={`
        h-screen w-screen overflow-hidden
        bg-[#0a0a0a] text-white
        flex flex-col
        transition-opacity duration-500
        ${mounted ? "opacity-100" : "opacity-0"}
      `}
    >
      {/* ------------------------------------------------------------------ */}
      {/* Header                                                             */}
      {/* ------------------------------------------------------------------ */}

      <Header
        roomId={room.roomId}
        userName={room.userName}
        userCount={room.userCount}
        isOnline={room.isOnline}
      />

      {/* ------------------------------------------------------------------ */}
      {/* Development warning                                                */}
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
      {/* IDE Toolbar                                                         */}
      {/* ------------------------------------------------------------------ */}

      <div className="h-9 flex-shrink-0 flex items-center justify-between px-2 border-b border-[#27272a] bg-[#0f0f0f]">
        <div className="flex items-center gap-1">
          {/* Explorer toggle */}
          <button
            onClick={() =>
              setShowExplorer(
                (previous) => !previous
              )
            }
            className={`
              flex items-center gap-1.5 px-2.5 h-7
              rounded-md text-[11px] font-medium
              transition-all duration-200
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

          {/* Console toggle */}
          <button
            onClick={() =>
              setShowConsole(
                (previous) => !previous
              )
            }
            className={`
              flex items-center gap-1.5 px-2.5 h-7
              rounded-md text-[11px] font-medium
              transition-all duration-200
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
        </div>

        {/* Current workspace information */}
        <div className="hidden sm:flex items-center gap-3">
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

          <div className="flex items-center gap-1.5 text-[10px] text-[#71717a]">
            <Users className="w-3 h-3 text-[#fa8c00]" />

            <span>
              {room.userCount}{" "}
              {room.userCount === 1
                ? "client"
                : "clients"}
            </span>
          </div>

          <div className="w-px h-3 bg-[#27272a]" />

          <span className="font-mono text-[10px] text-[#52525b]">
            {room.roomId}
          </span>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Main Workspace                                                     */}
      {/* ------------------------------------------------------------------ */}

      <div className="flex-1 min-h-0 min-w-0 flex overflow-hidden relative">
        {/* ================================================================ */}
        {/* File Explorer                                                     */}
        {/* ================================================================ */}

        {showExplorer && (
          <aside className="w-56 flex-shrink-0 border-r border-[#27272a] bg-[#0f0f0f] overflow-hidden">
            <FileExplorer
              onFileSelect={handleFileSelect}
              activeFile={activeFile}
            />
          </aside>
        )}

        {/* ================================================================ */}
        {/* Editor + Console Center                                           */}
        {/* ================================================================ */}

        <main className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
          {/* Editor */}
          <div
            className={`
              min-w-0
              ${
                showConsole
                  ? "flex-1 min-h-0"
                  : "flex-1 min-h-0"
              }
            `}
          >
            <EditorPanel
              fileName={currentFile.name}
              language={currentFile.language}
              value={currentCode}
              onChange={handleEditorChange}
              onRun={handleRun}
              isRunning={isRunning}
            />
          </div>

          {/* Console */}
          {showConsole && (
            <div className="flex-shrink-0 min-w-0">
              <ConsolePanel
                output={consoleOutput}
                onClear={handleClearConsole}
              />
            </div>
          )}
        </main>

        {/* ================================================================ */}
        {/* Chat Panel                                                        */}
        {/* ================================================================ */}

        <ChatPanel
          roomId={room.roomId}
          userName={room.userName}
        />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Bottom Status Bar                                                  */}
      {/* ------------------------------------------------------------------ */}

      <footer className="h-6 flex-shrink-0 flex items-center justify-between px-3 border-t border-[#27272a] bg-[#111111]">
        <div className="flex items-center gap-3 text-[10px] font-mono text-[#52525b]">
          <span className="flex items-center gap-1">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                room.isOnline
                  ? "bg-[#22c55e]"
                  : "bg-[#ef4444]"
              }`}
            />

            {room.isOnline
              ? "Live"
              : "Offline"}
          </span>

          <span>{currentFile.language}</span>

          <span>
            {currentCode.length.toLocaleString()} chars
          </span>
        </div>

        <div className="flex items-center gap-3 text-[10px] font-mono text-[#52525b]">
          <span>{activeFile}</span>

          <span className="text-[#3f3f46]">
            {room.roomId}
          </span>
        </div>
      </footer>
    </div>
  );
}