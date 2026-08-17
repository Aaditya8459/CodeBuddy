"use client";

import { Terminal, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ConsolePanelProps {
  output: string;
  onClear: () => void;
}

export default function ConsolePanel({ output, onClear }: ConsolePanelProps) {
  return (
    <div className="h-48 border-t border-[#27272a] bg-[#0a0a0a] flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#27272a]">
        <div className="flex items-center gap-2">
          <Terminal className="w-3.5 h-3.5 text-[#fa8c00]" />
          <span className="text-xs font-semibold text-[#a1a1aa] uppercase tracking-wider">Console Output</span>
        </div>
        <Button variant="ghost" size="sm" onClick={onClear} className="h-6 text-xs text-[#71717a] hover:text-white hover:bg-[#27272a]">
          <RotateCcw className="w-3 h-3 mr-1" /> Clear
        </Button>
      </div>
      <div className="flex-1 p-4 overflow-auto">
        {output ? (
          <pre className="text-sm font-mono text-[#4ade80] whitespace-pre-wrap leading-relaxed">{output}</pre>
        ) : (
          <div className="flex items-center justify-center h-full text-[#52525b] text-sm">Click "Run" to execute your code</div>
        )}
      </div>
    </div>
  );
}