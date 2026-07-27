"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { Terminal, RotateCcw, Trash2, Download, Copy, Check, AlertCircle, AlertTriangle, Info, ChevronDown, ChevronUp, Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ConsolePanelProps {
  output: string;
  onClear: () => void;
}

/* ─── Parse output lines for styling ─── */
function parseLine(line: string): { text: string; type: "log" | "error" | "warn" | "info" | "success" } {
  if (line.startsWith("> Runtime Error:") || line.startsWith("[Error]")) {
    return { text: line, type: "error" };
  }
  if (line.startsWith("[Warn]")) {
    return { text: line, type: "warn" };
  }
  if (line.startsWith("> Code executed successfully")) {
    return { text: line, type: "success" };
  }
  if (line.startsWith("> ")) {
    return { text: line, type: "log" };
  }
  return { text: line, type: "info" };
}

function getLineColor(type: string) {
  switch (type) {
    case "error": return "text-[#f48771]";
    case "warn": return "text-[#cca700]";
    case "success": return "text-[#89d185]";
    case "log": return "text-[#4ec9b0]";
    default: return "text-[#ce9178]";
  }
}

function getLineIcon(type: string) {
  switch (type) {
    case "error": return <AlertCircle className="w-3 h-3 text-[#f48771] flex-shrink-0 mt-0.5" />;
    case "warn": return <AlertTriangle className="w-3 h-3 text-[#cca700] flex-shrink-0 mt-0.5" />;
    case "success": return <Check className="w-3 h-3 text-[#89d185] flex-shrink-0 mt-0.5" />;
    default: return null;
  }
}

export default function ConsolePanel({ output, onClear }: ConsolePanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [lines, setLines] = useState<{ text: string; type: string; id: number }[]>([]);
  const idCounter = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const newLines = output.split("\n").filter((l) => l.trim() !== "");
    const parsed = newLines.map((l) => {
      const parsed = parseLine(l);
      return { ...parsed, id: idCounter.current++ };
    });
    setLines(parsed);
  }, [output]);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines, autoScroll]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [output]);

  const handleDownload = useCallback(() => {
    const blob = new Blob([output], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `console-output-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [output]);

  const handleClear = () => {
    setLines([]);
    onClear();
  };

  const lineCount = lines.length;
  const errorCount = lines.filter((l) => l.type === "error").length;
  const warnCount = lines.filter((l) => l.type === "warn").length;

  return (
    <div
      className={`
        flex flex-col border-t border-[#27272a]/80 bg-[#0a0a0a] relative overflow-hidden
        transition-all duration-500 ease-out
        ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}
        ${isExpanded ? "h-[60vh]" : "h-48"}
      `}
    >
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#fa8c00]/15 to-transparent pointer-events-none z-10" />

      {/* ═══════ Header ═══════ */}
      <div
        className={`
          flex items-center justify-between px-4 py-2 
          border-b border-[#27272a]/60 bg-[#111111]/90 backdrop-blur-sm
          transition-all duration-300
          ${mounted ? "opacity-100" : "opacity-0"}
        `}
        style={{ transitionDelay: "100ms" }}
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="relative">
              <Terminal className="w-3.5 h-3.5 text-[#fa8c00]" />
              {lineCount > 0 && (
                <span className="absolute -top-1 -right-1 w-1.5 h-1.5 bg-[#fa8c00] rounded-full animate-pulse" />
              )}
            </div>
            <span className="text-[11px] font-semibold text-[#a1a1aa] uppercase tracking-wider">
              Console
            </span>
          </div>
          {lineCount > 0 && (
            <div className="flex items-center gap-2 text-[10px]">
              <span className="px-1.5 py-0.5 rounded bg-[#1a1a1a] text-[#52525b] font-mono">
                {lineCount} lines
              </span>
              {errorCount > 0 && (
                <span className="px-1.5 py-0.5 rounded bg-[#f48771]/10 text-[#f48771] font-mono flex items-center gap-1">
                  <AlertCircle className="w-2.5 h-2.5" />
                  {errorCount}
                </span>
              )}
              {warnCount > 0 && (
                <span className="px-1.5 py-0.5 rounded bg-[#cca700]/10 text-[#cca700] font-mono flex items-center gap-1">
                  <AlertTriangle className="w-2.5 h-2.5" />
                  {warnCount}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1">
          {lineCount > 0 && (
            <button
              onClick={() => setAutoScroll(!autoScroll)}
              className={`px-2 py-0.5 rounded text-[10px] font-mono transition-all duration-200 ${autoScroll ? "bg-[#89d185]/10 text-[#89d185]" : "bg-[#1a1a1a] text-[#52525b] hover:text-[#a1a1aa]"}`}
            >
              {autoScroll ? "Auto" : "Manual"}
            </button>
          )}
          {lineCount > 0 && (
            <Button variant="ghost" size="sm" onClick={handleCopy} className="h-6 px-2 text-[10px] text-[#71717a] hover:text-white hover:bg-[#27272a]/60">
              {copied ? <Check className="w-3 h-3 text-[#89d185] animate-bounce" /> : <Copy className="w-3 h-3" />}
            </Button>
          )}
          {lineCount > 0 && (
            <Button variant="ghost" size="sm" onClick={handleDownload} className="h-6 px-2 text-[10px] text-[#71717a] hover:text-white hover:bg-[#27272a]/60">
              <Download className="w-3 h-3" />
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => setIsExpanded(!isExpanded)} className="h-6 px-2 text-[10px] text-[#71717a] hover:text-white hover:bg-[#27272a]/60">
            {isExpanded ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
          </Button>
          <Button variant="ghost" size="sm" onClick={handleClear} className="h-6 px-2 text-[10px] text-[#71717a] hover:text-[#f48771] hover:bg-[#f48771]/10">
            <Trash2 className="w-3 h-3 mr-1" />
            <span className="hidden sm:inline">Clear</span>
          </Button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-auto relative custom-scrollbar">
        {lineCount > 0 ? (
          <div className="p-3 space-y-0.5">
            {lines.map((line, index) => (
              <div key={line.id} className="flex items-start gap-2 py-0.5 px-2 rounded hover:bg-white/[0.02] transition-colors duration-150 group/line" style={{ animation: `consoleLineIn 0.3s ease-out ${Math.min(index * 30, 300)}ms both` }}>
                <span className="text-[10px] text-[#3c3c3c] font-mono w-6 text-right flex-shrink-0 select-none pt-0.5">{index + 1}</span>
                {getLineIcon(line.type)}
                <pre className={`text-[13px] font-mono whitespace-pre-wrap leading-relaxed flex-1 ${getLineColor(line.type)}`}>{line.text}</pre>
              </div>
            ))}
            <div className="flex items-center gap-2 py-2 px-2 text-[10px] text-[#3c3c3c] font-mono">
              <span className="w-6 text-right">—</span>
              <span>End of output</span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <div className="relative">
              <Terminal className="w-10 h-10 text-[#27272a]" />
              <div className="absolute inset-0 w-10 h-10 rounded-full bg-[#fa8c00]/5 animate-ping" />
            </div>
            <p className="text-sm text-[#52525b] font-medium">Console is ready</p>
          </div>
        )}
      </div>

      {/* Fixed: Use backticks for multi-line string */}
      {!autoScroll && lineCount > 0 && (
        <button
          onClick={() => {
            setAutoScroll(true);
            scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
          }}
          className={`
            absolute bottom-3 right-4 px-2 py-1 rounded-full
            bg-[#252526] border border-[#3c3c3c] text-[10px] text-[#a1a1aa]
            hover:bg-[#37373d] hover:text-white
            shadow-lg transition-all duration-200
            flex items-center gap-1 animate-bounce
          `}
        >
          <ChevronDown className="w-3 h-3" />
          New output
        </button>
      )}

      <style jsx>{`
        @keyframes consoleLineIn {
          from { opacity: 0; transform: translateX(-8px); }
          to { opacity: 1; transform: translateX(0); }
        }
        .custom-scrollbar::-webkit-scrollbar { width: 8px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #3c3c3c; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #52525b; }
      `}</style>
    </div>
  );
}