"use client";

import { useRef, useCallback, useState, useEffect } from "react";
import Editor from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import {
  Play,
  Copy,
  Check,
  Settings,
  Zap,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface EditorPanelProps {
  fileName: string;
  language: string;
  value: string;
  onChange: (value: string | undefined) => void;
  onRun: (code: string) => void;
  isRunning: boolean;
}

export default function EditorPanel({
  fileName,
  language,
  value,
  onChange,
  onRun,
  isRunning,
}: EditorPanelProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);

  const [copied, setCopied] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [editorReady, setEditorReady] = useState(false);

  const [cursorPos, setCursorPos] = useState({
    line: 1,
    col: 1,
  });

  const [isFocused, setIsFocused] = useState(false);
  const [charCount, setCharCount] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setMounted(true);
    }, 50);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    setCharCount(value?.length ?? 0);
  }, [value]);

  const handleEditorDidMount = useCallback(
    (editorInstance: editor.IStandaloneCodeEditor) => {
      editorRef.current = editorInstance;
      setEditorReady(true);

      const cursorDisposable =
        editorInstance.onDidChangeCursorPosition((event) => {
          setCursorPos({
            line: event.position.lineNumber,
            col: event.position.column,
          });
        });

      const focusDisposable =
        editorInstance.onDidFocusEditorText(() => {
          setIsFocused(true);
        });

      const blurDisposable =
        editorInstance.onDidBlurEditorText(() => {
          setIsFocused(false);
        });

      return () => {
        cursorDisposable.dispose();
        focusDisposable.dispose();
        blurDisposable.dispose();
      };
    },
    []
  );

  const handleCopy = async () => {
    const code = editorRef.current?.getValue() ?? "";

    try {
      await navigator.clipboard.writeText(code);

      setCopied(true);

      setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch {
      setCopied(false);
    }
  };

  const handleRunClick = () => {
    const code = editorRef.current?.getValue() ?? "";

    if (!code.trim()) {
      return;
    }

    onRun(code);
  };

  const getLanguageColor = (lang: string) => {
    const normalizedLanguage = (lang || "typescript").toLowerCase();

    const colors: Record<string, string> = {
      typescript: "#3178c6",
      javascript: "#f0db4f",
      python: "#3572A5",
      json: "#f0db4f",
      markdown: "#38bdf8",
      html: "#e44d26",
      xml: "#e44d26",
      css: "#264de4",
      scss: "#c6538c",
      jsx: "#61dafb",
      tsx: "#3178c6",
    };

    return colors[normalizedLanguage] ?? "#a1a1aa";
  };

  const normalizedLanguage = (
    language || "typescript"
  ).toLowerCase();

  const langColor = getLanguageColor(normalizedLanguage);

  return (
    <div
      className={`
        relative flex h-full w-full flex-col
        overflow-hidden bg-[#0f0f0f]
        transition-all duration-700 ease-out
        ${
          mounted
            ? "translate-y-0 opacity-100"
            : "translate-y-3 opacity-0"
        }
      `}
    >
      {/* Ambient top glow */}
      <div
        className="
          pointer-events-none absolute
          left-0 right-0 top-0 z-20 h-px
          bg-gradient-to-r
          from-transparent
          via-[#fa8c00]/20
          to-transparent
        "
      />

      {/* Focus glow */}
      <div
        className={`
          pointer-events-none absolute inset-0 z-10
          transition-opacity duration-500
          ${isFocused ? "opacity-100" : "opacity-0"}
        `}
      >
        <div
          className="
            absolute inset-0
            shadow-[inset_0_0_60px_-20px_rgba(240,70,0,0.08)]
          "
        />
      </div>

      {/* =========================================================
          HEADER
      ========================================================= */}

      <div
        className={`
          relative flex items-center justify-between
          border-b border-[#27272a]/80
          bg-[#111111]/95
          px-4 py-2.5
          backdrop-blur-sm
          transition-all duration-500
          ${
            mounted
              ? "translate-y-0 opacity-100"
              : "-translate-y-2 opacity-0"
          }
        `}
        style={{ transitionDelay: "100ms" }}
      >
        {/* File Information */}
        <div className="flex min-w-0 items-center gap-3">
          {/* Language */}
          <Badge
            variant="outline"
            className="
              relative overflow-hidden
              border-[#27272a]
              text-xs font-mono
              text-[#a1a1aa]
              transition-all duration-300
              hover:border-[#fa8c00]/40
              hover:bg-[#fa8c00]/5
            "
          >
            <span
              className="
                mr-1.5 h-2 w-2 rounded-full
                transition-all duration-300
              "
              style={{
                backgroundColor: langColor,
                boxShadow: "0 0 0 transparent",
              }}
            />

            <span className="relative z-10">
              {normalizedLanguage}
            </span>
          </Badge>

          {/* Filename */}
          <span
            className="
              max-w-[240px] truncate
              font-mono text-sm
              tracking-tight
              text-[#a1a1aa]
            "
            title={fileName}
          >
            {fileName}
          </span>

          {/* Cursor */}
          <span
            className={`
              hidden
              font-mono text-[10px]
              text-[#52525b]
              transition-opacity duration-300
              sm:inline-block
              ${
                editorReady
                  ? "opacity-100"
                  : "opacity-0"
              }
            `}
          >
            Ln {cursorPos.line}, Col {cursorPos.col}
          </span>
        </div>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-2">
          {/* Copy */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            className={`
              h-8 px-3 text-xs
              text-[#a1a1aa]
              hover:border-[#3f3f46]/50
              hover:bg-[#27272a]/80
              hover:text-white
              active:scale-95
              transition-all duration-200
              ${copied ? "text-[#22c55e]" : ""}
            `}
          >
            {copied ? (
              <Check className="mr-1.5 h-3.5 w-3.5" />
            ) : (
              <Copy className="mr-1.5 h-3.5 w-3.5" />
            )}

            {copied ? "Copied" : "Copy"}
          </Button>

          {/* Settings */}
          <Button
            variant="ghost"
            size="sm"
            className="
              group/settings
              h-8 w-8
              border border-transparent
              p-0
              text-[#a1a1aa]
              transition-all duration-200
              hover:border-[#3f3f46]/50
              hover:bg-[#27272a]/80
              hover:text-white
              active:scale-95
            "
            title="Editor settings"
          >
            <Settings
              className="
                h-3.5 w-3.5
                transition-transform duration-500
                group-hover/settings:rotate-90
              "
            />
          </Button>

          {/* Run */}
          <Button
            onClick={handleRunClick}
            disabled={isRunning || !editorReady}
            size="sm"
            className="
              group/run
              relative h-8
              overflow-hidden
              bg-gradient-to-r
              from-[#f04600]
              to-[#fa8c00]
              px-4
              text-xs font-semibold
              text-white
              shadow-lg
              shadow-orange-500/20
              transition-all duration-200
              hover:from-[#d93d00]
              hover:to-[#e67d00]
              hover:shadow-orange-500/40
              active:scale-95
              disabled:cursor-not-allowed
              disabled:opacity-60
              disabled:shadow-none
            "
          >
            {/* Shimmer */}
            <div
              className="
                pointer-events-none
                absolute inset-0
                -translate-x-full
                bg-gradient-to-r
                from-transparent
                via-white/15
                to-transparent
                transition-transform duration-700
                group-hover/run:translate-x-full
              "
            />

            <span
              className="
                relative z-10
                flex items-center
              "
            >
              {isRunning ? (
                <>
                  <Loader2
                    className="
                      mr-1.5
                      h-3.5 w-3.5
                      animate-spin
                    "
                  />
                  Running
                </>
              ) : (
                <>
                  <Play
                    className="
                      mr-1.5
                      h-3.5 w-3.5
                      fill-white
                      transition-transform duration-200
                      group-hover/run:scale-110
                    "
                  />
                  Run
                </>
              )}
            </span>

            {/* Hover pulse */}
            {!isRunning && editorReady && (
              <span
                className="
                  pointer-events-none
                  absolute inset-0
                  rounded-md
                  opacity-0
                  transition-opacity duration-300
                  group-hover/run:opacity-100
                "
              >
                <span
                  className="
                    absolute inset-0
                    animate-ping
                    rounded-md
                    bg-orange-500/20
                  "
                />
              </span>
            )}
          </Button>
        </div>
      </div>

      {/* =========================================================
          EDITOR
      ========================================================= */}

      <div
        className="
          relative
          min-h-0
          flex-1
          w-full
        "
      >
        {/* Loading overlay */}
        <div
          className={`
            absolute inset-0 z-10
            flex flex-col gap-2
            bg-[#0f0f0f]
            p-6
            transition-opacity duration-500
            ${
              editorReady
                ? "pointer-events-none opacity-0"
                : "opacity-100"
            }
          `}
        >
          <div className="mb-4 flex items-center gap-3">
            <Zap
              className="
                h-5 w-5
                animate-pulse
                text-[#fa8c00]
              "
            />

            <span
              className="
                animate-pulse
                text-sm
                text-[#52525b]
              "
            >
              Loading editor...
            </span>
          </div>

          {/* Deterministic skeleton widths */}
          {[
            82,
            68,
            91,
            57,
            76,
            64,
            88,
            72,
            94,
            61,
            79,
            70,
          ].map((width, index) => (
            <div
              key={index}
              className="
                h-4
                animate-pulse
                rounded
                bg-[#1a1a1a]
              "
              style={{
                width: `${width}%`,
                animationDelay: `${index * 80}ms`,
                animationDuration: "1.5s",
              }}
            />
          ))}
        </div>

        <Editor
          height="100%"
          width="100%"
          language={normalizedLanguage}
          value={value}
          theme="vs-dark"
          onChange={onChange}
          onMount={handleEditorDidMount}
          options={{
            minimap: {
              enabled: true,
              scale: 1,
            },

            fontSize: 14,

            fontFamily:
              "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",

            lineNumbers: "on",

            roundedSelection: false,

            scrollBeyondLastLine: false,

            automaticLayout: true,

            padding: {
              top: 16,
              bottom: 16,
            },

            folding: true,

            renderLineHighlight: "all",

            matchBrackets: "always",

            tabSize: 2,

            insertSpaces: true,

            wordWrap: "on",

            bracketPairColorization: {
              enabled: true,
            },

            guides: {
              bracketPairs: true,
              indentation: true,
            },

            cursorBlinking: "smooth",

            cursorSmoothCaretAnimation: "on",

            smoothScrolling: true,

            scrollbar: {
              useShadows: false,
              verticalHasArrows: false,
              horizontalHasArrows: false,
              vertical: "auto",
              horizontal: "auto",
              verticalScrollbarSize: 10,
              horizontalScrollbarSize: 10,
            },

            suggest: {
              showMethods: true,
              showFunctions: true,
              showConstructors: true,
              showDeprecated: true,
            },

            quickSuggestions: true,

            parameterHints: {
              enabled: true,
            },
          }}
          loading={
            <div
              className="
                flex h-full
                items-center justify-center
                bg-[#0f0f0f]
              "
            >
              <div className="flex items-center gap-3">
                <div
                  className="
                    h-5 w-5
                    animate-spin
                    rounded-full
                    border-2
                    border-[#fa8c00]/30
                    border-t-[#fa8c00]
                  "
                />

                <span
                  className="
                    text-sm
                    text-[#52525b]
                  "
                >
                  Initializing...
                </span>
              </div>
            </div>
          }
        />
      </div>

      {/* =========================================================
          STATUS BAR
      ========================================================= */}

      <div
        className={`
          flex h-6
          items-center justify-between
          border-t border-[#27272a]/60
          bg-[#111111]/80
          px-4
          transition-all duration-500
          ${
            mounted && editorReady
              ? "translate-y-0 opacity-100"
              : "translate-y-1 opacity-0"
          }
        `}
      >
        {/* Left */}
        <div
          className="
            flex items-center gap-3
            font-mono text-[10px]
            text-[#52525b]
          "
        >
          <span className="flex items-center gap-1">
            <span
              className="
                h-1.5 w-1.5
                rounded-full
              "
              style={{
                backgroundColor: langColor,
              }}
            />

            {normalizedLanguage}
          </span>

          <span>UTF-8</span>

          <span>
            {charCount.toLocaleString()} chars
          </span>
        </div>

        {/* Right */}
        <div
          className="
            flex items-center gap-3
            font-mono text-[10px]
            text-[#52525b]
          "
        >
          <span>
            Ln {cursorPos.line}, Col {cursorPos.col}
          </span>

          <span>Spaces: 2</span>
        </div>
      </div>
    </div>
  );
}