"use client";

import { useRef, useCallback, useState, useEffect } from "react";
import Editor from "@monaco-editor/react";
import { editor } from "monaco-editor";
import { Play, Copy, Check, Settings, Zap, Loader2 } from "lucide-react";
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
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
  const [isFocused, setIsFocused] = useState(false);
  const [charCount, setCharCount] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    setCharCount(value?.length || 0);
  }, [value]);

  const handleEditorDidMount = useCallback(
    (editorInstance: editor.IStandaloneCodeEditor) => {
      editorRef.current = editorInstance;
      setEditorReady(true);

      editorInstance.onDidChangeCursorPosition((e) => {
        setCursorPos({ line: e.position.lineNumber, col: e.position.column });
      });

      editorInstance.onDidFocusEditorText(() => setIsFocused(true));
      editorInstance.onDidBlurEditorText(() => setIsFocused(false));
    },
    []
  );

  const handleCopy = () => {
    const code = editorRef.current?.getValue() || "";
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRunClick = () => {
    onRun(editorRef.current?.getValue() || "");
  };

  const getLanguageColor = (lang: string) => {
    const colors: Record<string, string> = {
      typescript: "#3178c6",
      javascript: "#f0db4f",
      python: "#3572A5",
      json: "#f0db4f",
      markdown: "#38bdf8",
      html: "#e44d26",
      css: "#264de4",
    };
    return colors[lang] || "#a1a1aa";
  };

  const langColor = getLanguageColor(language);

  return (
    <div
      className={`
        flex flex-col h-full bg-[#0f0f0f] overflow-hidden relative
        transition-all duration-700 ease-out
        ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"}
      `}
    >
      {/* Ambient edge glow */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#fa8c00]/20 to-transparent pointer-events-none z-20" />
      <div
        className={`
          absolute inset-0 pointer-events-none z-10 transition-opacity duration-500
          ${isFocused ? "opacity-100" : "opacity-0"}
        `}
      >
        <div className="absolute inset-0 shadow-[inset_0_0_60px_-20px_rgba(240,70,0,0.08)]" />
      </div>

      {/* ═══════ Header Bar ═══════ */}
      <div
        className={`
          relative flex items-center justify-between px-4 py-2.5 
          border-b border-[#27272a]/80 bg-[#111111]/95 backdrop-blur-sm
          transition-all duration-500
          ${mounted ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2"}
        `}
        style={{ transitionDelay: "100ms" }}
      >
        {/* Left: File Info */}
        <div className="flex items-center gap-3">
          {/* Language Badge */}
          <Badge
            variant="outline"
            className="
              border-[#27272a] text-[#a1a1aa] text-xs font-mono 
              hover:border-[#fa8c00]/40 hover:bg-[#fa8c00]/5
              transition-all duration-300 cursor-default
              relative overflow-hidden group/badge
            "
          >
            <span
              className="w-2 h-2 rounded-full mr-1.5 transition-all duration-300 group-hover/badge:scale-125 group-hover/badge:shadow-[0_0_6px_currentColor]"
              style={{ backgroundColor: langColor, color: langColor }}
            />
            <span className="relative z-10">{language}</span>
          </Badge>

          {/* Filename */}
          <span className="text-sm text-[#a1a1aa] font-mono tracking-tight">
            {fileName}
          </span>

          {/* Cursor Position */}
          <span
            className={`
              text-[10px] text-[#52525b] font-mono hidden sm:inline-block
              transition-opacity duration-300
              ${editorReady ? "opacity-100" : "opacity-0"}
            `}
          >
            Ln {cursorPos.line}, Col {cursorPos.col}
          </span>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          {/* Copy Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            className={`
              h-8 px-3 text-xs text-[#a1a1aa] hover:text-white 
              hover:bg-[#27272a]/80 border border-transparent hover:border-[#3f3f46]/50
              transition-all duration-200 active:scale-95
              ${copied ? "text-[#22c55e]" : ""}
            `}
          >
            <span className="relative flex items-center">
              {copied ? (
                <Check className="w-3.5 h-3.5 mr-1.5 animate-bounce" />
              ) : (
                <Copy className="w-3.5 h-3.5 mr-1.5 transition-transform duration-200 group-hover:scale-110" />
              )}
              <span className="transition-all duration-200">
                {copied ? "Copied" : "Copy"}
              </span>
            </span>
          </Button>

          {/* Settings Button */}
          <Button
            variant="ghost"
            size="sm"
            className="
              h-8 w-8 p-0 text-[#a1a1aa] hover:text-white hover:bg-[#27272a]/80
              border border-transparent hover:border-[#3f3f46]/50
              transition-all duration-200 active:scale-95
              group/settings
            "
          >
            <Settings className="w-3.5 h-3.5 transition-transform duration-500 group-hover/settings:rotate-90" />
          </Button>

          {/* Run Button */}
          <Button
            onClick={handleRunClick}
            disabled={isRunning}
            size="sm"
            className={`
              relative h-8 px-4 text-xs font-semibold text-white overflow-hidden
              bg-gradient-to-r from-[#f04600] to-[#fa8c00]
              hover:from-[#d93d00] hover:to-[#e67d00]
              shadow-lg shadow-orange-500/20 hover:shadow-orange-500/40
              disabled:opacity-60 disabled:cursor-not-allowed disabled:shadow-none
              active:scale-95 transition-all duration-200
              group/run
            `}
          >
            {/* Shimmer overlay */}
            <div className="absolute inset-0 -translate-x-full group-hover/run:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/15 to-transparent" />

            <span className="relative z-10 flex items-center">
              {isRunning ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  <span>Running</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 mr-1.5 fill-white transition-transform duration-200 group-hover/run:scale-110" />
                  <span>Run</span>
                </>
              )}
            </span>

            {/* Pulse ring when idle */}
            {!isRunning && (
              <span className="absolute inset-0 rounded-md opacity-0 group-hover/run:opacity-100 transition-opacity duration-300">
                <span className="absolute inset-0 rounded-md animate-ping bg-orange-500/20" />
              </span>
            )}
          </Button>
        </div>
      </div>

      {/* ═══════ Editor Body ═══════ */}
      <div className="flex-1 min-h-0 relative">
        {/* Loading Skeleton */}
        <div
          className={`
            absolute inset-0 bg-[#0f0f0f] z-10 flex flex-col gap-2 p-6
            transition-opacity duration-500
            ${editorReady ? "opacity-0 pointer-events-none" : "opacity-100"}
          `}
        >
          <div className="flex items-center gap-3 mb-4">
            <Zap className="w-5 h-5 text-[#fa8c00] animate-pulse" />
            <span className="text-sm text-[#52525b] animate-pulse">Loading editor...</span>
          </div>
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="h-4 rounded bg-[#1a1a1a] animate-pulse"
              style={{
                width: `${60 + Math.random() * 35}%`,
                animationDelay: `${i * 80}ms`,
                animationDuration: "1.5s",
              }}
            />
          ))}
        </div>

        <Editor
          height="100%"
          language={language}
          value={value}
          theme="vs-dark"
          onChange={onChange}
          onMount={handleEditorDidMount}
          options={{
            minimap: { enabled: true, scale: 1 },
            fontSize: 14,
            fontFamily:
              "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
            lineNumbers: "on",
            roundedSelection: false,
            scrollBeyondLastLine: false,
            automaticLayout: true,
            padding: { top: 16, bottom: 16 },
            folding: true,
            renderLineHighlight: "all",
            matchBrackets: "always",
            tabSize: 2,
            wordWrap: "on",
            bracketPairColorization: { enabled: true },
            guides: { bracketPairs: true, indentation: true },
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
          }}
          loading={
            <div className="h-full bg-[#0f0f0f] flex items-center justify-center">
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 border-2 border-[#fa8c00]/30 border-t-[#fa8c00] rounded-full animate-spin" />
                <span className="text-sm text-[#52525b]">Initializing...</span>
              </div>
            </div>
          }
        />
      </div>

      {/* ═══════ Footer Status Bar ═══════ */}
      <div
        className={`
          h-6 flex items-center justify-between px-4 
          border-t border-[#27272a]/60 bg-[#111111]/80
          transition-all duration-500
          ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1"}
          ${editorReady ? "opacity-100" : "opacity-0"}
        `}
        style={{ transitionDelay: "300ms" }}
      >
        <div className="flex items-center gap-3 text-[10px] text-[#52525b] font-mono">
          <span className="flex items-center gap-1">
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: langColor }}
            />
            {language}
          </span>
          <span>UTF-8</span>
          <span>{charCount.toLocaleString()} chars</span>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-[#52525b] font-mono">
          <span>Ln {cursorPos.line}, Col {cursorPos.col}</span>
          <span>Spaces: 2</span>
        </div>
      </div>
    </div>
  );
}