"use client";

import { useState, useRef, useCallback } from "react";
import Editor from "@monaco-editor/react";
import { editor } from "monaco-editor";
import { Play, RotateCcw, Copy, Check, Settings, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface CodeEditorProps {
  fileName: string;
  language: string;
  roomId?: string;
  defaultValue?: string;
  value?: string;
  onChange?: (value: string | undefined) => void;
  readOnly?: boolean;
}

const defaultCode: Record<string, string> = {
  typescript: `// Welcome to Code Buddy!
import React, { useState } from 'react';

interface Props {
  name: string;
}

export default function App({ name }: Props) {
  const [count, setCount] = useState(0);
  
  return (
    <div className="p-4">
      <h1>Hello, {name}!</h1>
      <p>Count: {count}</p>
      <button onClick={() => setCount(c => c + 1)}>
        Increment
      </button>
    </div>
  );
}`,
  javascript: `// Welcome to Code Buddy!
function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

console.log("Fibonacci sequence:");
for (let i = 0; i < 10; i++) {
  console.log('F(' + i + ') = ' + fibonacci(i));
}`,
  json: `{
  "name": "code-buddy",
  "version": "1.0.0",
  "description": "Collaborative code editor",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start"
  }
}`,
  markdown: `# Code Buddy

## Features
- Real-time collaboration
- Virtual file system
- Code execution
- Live chat

## Getting Started
1. Create a room
2. Invite your team
3. Start coding!`,
};

export default function CodeEditor({
  fileName,
  language,
  roomId,
  defaultValue,
  value,
  onChange,
  readOnly = false,
}: CodeEditorProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const [output, setOutput] = useState<string>("");
  const [isRunning, setIsRunning] = useState(false);
  const [copied, setCopied] = useState(false);

  const initialContent =
    value !== undefined
      ? value
      : defaultValue || defaultCode[language] || "// Start coding...";

  const handleEditorDidMount = useCallback(
    (editorInstance: editor.IStandaloneCodeEditor) => {
      editorRef.current = editorInstance;
    },
    []
  );

  const handleEditorChange = (val: string | undefined) => {
    if (onChange) {
      onChange(val);
    }
  };

  const handleRun = () => {
    const code = editorRef.current?.getValue() || "";
    // Safeguard against missing or undefined language strings
    const activeLanguage = (language || "typescript").toLowerCase();
    
    setIsRunning(true);
    setOutput("");

    setTimeout(() => {
      const logs: string[] = [];

      if (activeLanguage === "javascript" || activeLanguage === "typescript") {
        try {
          const originalLog = console.log;
          const originalError = console.error;
          const originalWarn = console.warn;

          console.log = (...args: unknown[]) => {
            logs.push(
              "> " +
                args
                  .map((arg) =>
                    typeof arg === "object"
                      ? JSON.stringify(arg, null, 2)
                      : String(arg)
                  )
                  .join(" ")
            );
          };

          console.error = (...args: unknown[]) => {
            logs.push(
              "[Error] " +
                args
                  .map((arg) =>
                    typeof arg === "object"
                      ? JSON.stringify(arg, null, 2)
                      : String(arg)
                  )
                  .join(" ")
            );
          };

          console.warn = (...args: unknown[]) => {
            logs.push(
              "[Warn] " +
                args
                  .map((arg) =>
                    typeof arg === "object"
                      ? JSON.stringify(arg, null, 2)
                      : String(arg)
                  )
                  .join(" ")
            );
          };

          const executable = new Function(code);
          executable();

          console.log = originalLog;
          console.error = originalError;
          console.warn = originalWarn;
        } catch (err: unknown) {
          if (err instanceof Error) {
            logs.push(`> Runtime Error: ${err.message}`);
          } else {
            logs.push(`> Runtime Error: ${String(err)}`);
          }
        }
      } else {
        logs.push(`> Execution preview is not available for ${activeLanguage}.`);
      }

      if (logs.length === 0) {
        logs.push("> Code executed successfully with no output.");
      }

      setOutput(logs.join("\n"));
      setIsRunning(false);
    }, 400);
  };

  const handleCopy = () => {
    const code = editorRef.current?.getValue() || "";
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getLanguageColor = (lang: string) => {
    const colors: Record<string, string> = {
      typescript: "#3178c6",
      javascript: "#f0db4f",
      json: "#f0db4f",
      markdown: "#38bdf8",
      xml: "#e44d26",
      html: "#e44d26",
      css: "#264de4",
      python: "#3572A5",
    };
    return colors[lang] || "#a1a1aa";
  };

  return (
    <div className="flex flex-col h-full bg-[#0f0f0f] overflow-hidden">
      {/* Top Header Bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#27272a] bg-[#111111]">
        <div className="flex items-center gap-3">
          <Badge
            variant="outline"
            className="border-[#27272a] text-[#a1a1aa] text-xs font-mono flex items-center"
          >
            <span
              className="w-2 h-2 rounded-full mr-1.5"
              style={{ backgroundColor: getLanguageColor(language || "typescript") }}
            />
            {language || "typescript"}
          </Badge>
          <span className="text-sm text-[#a1a1aa] font-mono">{fileName}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            className="h-7 text-xs text-[#a1a1aa] hover:text-white hover:bg-[#27272a]"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 mr-1" />
            ) : (
              <Copy className="w-3.5 h-3.5 mr-1" />
            )}
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-[#a1a1aa] hover:text-white hover:bg-[#27272a]"
          >
            <Settings className="w-3.5 h-3.5" />
          </Button>
          <Button
            onClick={handleRun}
            disabled={isRunning}
            size="sm"
            className="h-7 bg-gradient-to-r from-[#f04600] to-[#fa8c00] hover:from-[#d93d00] hover:to-[#e67d00] text-white text-xs shadow-lg shadow-orange-500/25 disabled:opacity-50"
          >
            {isRunning ? (
              <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin mr-1.5" />
            ) : (
              <Play className="w-3.5 h-3.5 mr-1.5 fill-white" />
            )}
            Run
          </Button>
        </div>
      </div>

      {/* Code Editor Container */}
      <div className="flex-1 min-h-0 relative">
        <Editor
          height="100%"
          language={language || "typescript"}
          value={value}
          defaultValue={initialContent}
          theme="vs-dark"
          onChange={handleEditorChange}
          onMount={handleEditorDidMount}
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            fontFamily: "JetBrains Mono, Fira Code, monospace",
            lineNumbers: "on",
            roundedSelection: false,
            scrollBeyondLastLine: false,
            readOnly,
            automaticLayout: true,
            padding: { top: 16 },
            folding: true,
            renderLineHighlight: "all",
            matchBrackets: "always",
            tabSize: 2,
            wordWrap: "on",
          }}
        />
      </div>

      {/* Console Output Footer */}
      <div className="h-48 border-t border-[#27272a] bg-[#0a0a0a] flex flex-col">
        <div className="flex items-center justify-between px-4 py-2 border-b border-[#27272a]">
          <div className="flex items-center gap-2">
            <Terminal className="w-3.5 h-3.5 text-[#fa8c00]" />
            <span className="text-xs font-semibold text-[#a1a1aa] uppercase tracking-wider">
              Console Output
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setOutput("")}
            className="h-6 text-xs text-[#71717a] hover:text-white hover:bg-[#27272a]"
          >
            <RotateCcw className="w-3 h-3 mr-1" />
            Clear
          </Button>
        </div>
        <div className="flex-1 p-4 overflow-auto">
          {output ? (
            <pre className="text-sm font-mono text-[#4ade80] whitespace-pre-wrap leading-relaxed">
              {output}
            </pre>
          ) : (
            <div className="flex items-center justify-center h-full text-[#52525b] text-sm">
              Click &quot;Run&quot; to execute your code
            </div>
          )}
        </div>
      </div>
    </div>
  );
}