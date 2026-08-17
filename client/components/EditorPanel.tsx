"use client";

import { useRef, useCallback } from "react";
import Editor from "@monaco-editor/react";
import { editor } from "monaco-editor";
import { Play, Copy, Check, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface EditorPanelProps {
  fileName: string;
  language: string;
  value: string;
  onChange: (value: string | undefined) => void;
  onRun: (code: string) => void;
  isRunning: boolean;
  onCopy: () => void;
  copied: boolean;
}

export default function EditorPanel({ 
  fileName, language, value, onChange, onRun, isRunning, onCopy, copied 
}: EditorPanelProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);

  const getLanguageColor = (lang: string) => {
    const colors: Record<string, string> = {
      typescript: "#3178c6", javascript: "#f0db4f", python: "#3572A5",
      json: "#f0db4f", markdown: "#38bdf8", html: "#e44d26", css: "#264de4"
    };
    return colors[lang.toLowerCase()] || "#a1a1aa";
  };

  return (
    <div className="flex flex-col h-full bg-[#0f0f0f] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#27272a] bg-[#111111]">
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="border-[#27272a] text-[#a1a1aa] text-xs font-mono flex items-center">
            <span className="w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: getLanguageColor(language) }} />
            {language}
          </Badge>
          <span className="text-sm text-[#a1a1aa] font-mono">{fileName}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onCopy} className="h-7 text-xs text-[#a1a1aa] hover:text-white hover:bg-[#27272a]">
            {copied ? <Check className="w-3.5 h-3.5 mr-1" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button onClick={() => onRun(editorRef.current?.getValue() || "")} disabled={isRunning} size="sm" className="h-7 bg-gradient-to-r from-[#f04600] to-[#fa8c00] text-white text-xs shadow-lg shadow-orange-500/25">
            {isRunning ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin mr-1.5" /> : <Play className="w-3.5 h-3.5 mr-1.5 fill-white" />}
            Run
          </Button>
        </div>
      </div>
      <div className="flex-1 min-h-0 relative">
        <Editor
          height="100%"
          language={language}
          value={value}
          theme="vs-dark"
          onChange={onChange}
          onMount={(instance) => { editorRef.current = instance; }}
          options={{ minimap: { enabled: false }, fontSize: 14, automaticLayout: true, tabSize: 2, wordWrap: "on" }}
        />
      </div>
    </div>
  );
}