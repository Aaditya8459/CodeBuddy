"use client";

import { useState } from "react";
import { 
  FileCode2, 
  FileJson, 
  FileText, 
  Folder, 
  ChevronRight, 
  ChevronDown, 
  FileType2 
} from "lucide-react";

// 1. Define a clear interface for your file system
interface FileItem {
  name: string;
  type: "file" | "folder";
  icon?: string; // Optional because folders don't use the icon
  children?: FileItem[];
}

interface FileExplorerProps {
  onFileSelect: (fileName: string) => void;
  activeFile: string;
}

// 2. Explicitly type the file system
const fileSystem: FileItem[] = [
  { name: "src", type: "folder", children: [
    { name: "App.tsx", type: "file", icon: "ts" },
    { name: "index.css", type: "file", icon: "css" },
    { name: "utils.ts", type: "file", icon: "ts" },
  ]},
  { name: "package.json", type: "file", icon: "json" },
  { name: "README.md", type: "file", icon: "md" },
];

export default function FileExplorer({ onFileSelect, activeFile }: FileExplorerProps) {
  const [expandedFolders, setExpandedFolders] = useState<string[]>(["src"]);

  const toggleFolder = (name: string) => {
    setExpandedFolders(prev => 
      prev.includes(name) ? prev.filter(f => f !== name) : [...prev, name]
    );
  };

  // 3. Update function signature to accept string | undefined
  const getIcon = (iconType: string | undefined) => {
    switch (iconType) {
      case "ts": return <FileCode2 className="w-4 h-4 text-[#3178c6]" />;
      case "css": return <FileType2 className="w-4 h-4 text-[#264de4]" />;
      case "json": return <FileJson className="w-4 h-4 text-[#f0db4f]" />;
      case "md": return <FileText className="w-4 h-4 text-[#38bdf8]" />;
      default: return <FileCode2 className="w-4 h-4 text-[#a1a1aa]" />;
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#0f0f0f] select-none text-[13px] font-mono animate-in fade-in duration-500">
      <div className="px-4 py-3 text-[10px] font-bold text-[#52525b] uppercase tracking-widest border-b border-[#27272a]/50">
        Explorer
      </div>

      <div className="flex-1 py-2 overflow-y-auto">
        {fileSystem.map((item) => (
          <div key={item.name}>
            {item.type === "folder" ? (
              <>
                <button 
                  onClick={() => toggleFolder(item.name)}
                  className="flex items-center w-full px-4 py-1.5 hover:bg-[#18181b] text-[#a1a1aa] transition-colors"
                >
                  <span className="mr-1.5">
                    {expandedFolders.includes(item.name) ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                  </span>
                  <Folder className="w-4 h-4 mr-2 text-[#52525b]" />
                  {item.name}
                </button>
                {expandedFolders.includes(item.name) && item.children?.map(child => (
                  <button
                    key={child.name}
                    onClick={() => onFileSelect(child.name)}
                    className={`flex items-center w-full px-4 py-1.5 pl-10 transition-all border-l-2 ${activeFile === child.name ? "bg-[#18181b] text-white border-[#fa8c00]" : "text-[#a1a1aa] border-transparent hover:bg-[#18181b]/50"}`}
                  >
                    <span className="mr-2">{getIcon(child.icon)}</span>
                    {child.name}
                  </button>
                ))}
              </>
            ) : (
              <button
                onClick={() => onFileSelect(item.name)}
                className={`flex items-center w-full px-4 py-1.5 transition-all border-l-2 ${activeFile === item.name ? "bg-[#18181b] text-white border-[#fa8c00]" : "text-[#a1a1aa] border-transparent hover:bg-[#18181b]/50"}`}
              >
                <span className="mr-2">{getIcon(item.icon)}</span>
                {item.name}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}