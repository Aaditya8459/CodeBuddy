"use client";

import { useState } from "react";
import EditorPanel from "./EditorPanel";
import ConsolePanel from "./ConsolePanel";

export default function IDEContainer({ language = "javascript", fileName = "main.js" }) {
  const [code, setCode] = useState("// Start coding...");
  const [output, setOutput] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleRun = (code: string) => {
    setIsRunning(true);
    setOutput("");
    
    // Simulate execution (Replace with your worker-service fetch later)
    setTimeout(() => {
      try {
        // Simple logic for JS/TS
        const logs: string[] = [];
        const originalLog = console.log;
        console.log = (...args: any[]) => logs.push("> " + args.join(" "));
        
        new Function(code)();
        
        console.log = originalLog;
        setOutput(logs.length > 0 ? logs.join("\n") : "> Code executed successfully.");
      } catch (err: any) {
        setOutput(`> Runtime Error: ${err.message}`);
      }
      setIsRunning(false);
    }, 400);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1">
        <EditorPanel 
          fileName={fileName}
          language={language}
          value={code}
          onChange={(v) => setCode(v || "")}
          onRun={handleRun}
          isRunning={isRunning}
          onCopy={handleCopy}
          copied={copied}
        />
      </div>
      <ConsolePanel 
        output={output} 
        onClear={() => setOutput("")} 
      />
    </div>
  );
}