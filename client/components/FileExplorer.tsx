"use client";

import { useState } from "react";
import {
  Folder,
  FolderOpen,
  FileCode,
  FileJson,
  FileType,
  File,
  ChevronRight,
  ChevronDown,
  Plus,
  Trash2,
  MoreVertical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface FileNode {
  id: string;
  name: string;
  type: "file" | "folder";
  language?: string;
  children?: FileNode[];
  isOpen?: boolean;
}

const initialFiles: FileNode[] = [
  {
    id: "1",
    name: "src",
    type: "folder",
    isOpen: true,
    children: [
      {
        id: "2",
        name: "components",
        type: "folder",
        isOpen: true,
        children: [
          { id: "3", name: "Button.tsx", type: "file", language: "typescript" },
          { id: "4", name: "Header.tsx", type: "file", language: "typescript" },
        ],
      },
      {
        id: "5",
        name: "app",
        type: "folder",
        isOpen: false,
        children: [
          { id: "6", name: "page.tsx", type: "file", language: "typescript" },
          { id: "7", name: "layout.tsx", type: "file", language: "typescript" },
        ],
      },
      { id: "8", name: "utils.ts", type: "file", language: "typescript" },
    ],
  },
  {
    id: "9",
    name: "public",
    type: "folder",
    isOpen: false,
    children: [{ id: "10", name: "logo.svg", type: "file", language: "xml" }],
  },
  { id: "11", name: "package.json", type: "file", language: "json" },
  { id: "12", name: "tsconfig.json", type: "file", language: "json" },
  { id: "13", name: "README.md", type: "file", language: "markdown" },
];

function getFileIcon(name: string, type: string, isOpen?: boolean) {
  if (type === "folder") {
    return isOpen ? (
      <FolderOpen className="w-4 h-4 text-[#fa8c00]" />
    ) : (
      <Folder className="w-4 h-4 text-[#fa8c00]" />
    );
  }
  if (name.endsWith(".tsx") || name.endsWith(".ts")) {
    return <FileCode className="w-4 h-4 text-[#3178c6]" />;
  }
  if (name.endsWith(".json")) {
    return <FileJson className="w-4 h-4 text-[#f0db4f]" />;
  }
  if (name.endsWith(".css")) {
    return <FileType className="w-4 h-4 text-[#264de4]" />;
  }
  return <File className="w-4 h-4 text-[#a1a1aa]" />;
}

interface FileExplorerProps {
  onFileSelect: (file: FileNode) => void;
  activeFileId: string | null;
}

export default function FileExplorer({ onFileSelect, activeFileId }: FileExplorerProps) {
  const [files, setFiles] = useState<FileNode[]>(initialFiles);

  const toggleFolder = (nodes: FileNode[], id: string): FileNode[] => {
    return nodes.map((node) => {
      if (node.id === id && node.type === "folder") {
        return { ...node, isOpen: !node.isOpen };
      }
      if (node.children) {
        return { ...node, children: toggleFolder(node.children, id) };
      }
      return node;
    });
  };

  const handleToggle = (id: string) => {
    setFiles((prev) => toggleFolder(prev, id));
  };

  const renderTree = (nodes: FileNode[], depth = 0) => {
    return nodes.map((node) => (
      <div key={node.id}>
        <div
          className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-all group ${
            activeFileId === node.id
              ? "bg-[#f04600]/10 border-r-2 border-[#f04600]"
              : "hover:bg-[#1a1a1a] border-r-2 border-transparent"
          }`}
          style={{ paddingLeft: `${12 + depth * 16}px` }}
          onClick={() => {
            if (node.type === "folder") {
              handleToggle(node.id);
            } else {
              onFileSelect(node);
            }
          }}
        >
          {node.type === "folder" ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleToggle(node.id);
              }}
              className="p-0.5 hover:bg-[#27272a] rounded transition-colors"
            >
              {node.isOpen ? (
                <ChevronDown className="w-3 h-3 text-[#71717a]" />
              ) : (
                <ChevronRight className="w-3 h-3 text-[#71717a]" />
              )}
            </button>
          ) : (
            <span className="w-4" />
          )}
          {getFileIcon(node.name, node.type, node.isOpen)}
          <span
            className={`text-sm truncate ${
              activeFileId === node.id ? "text-[#fa8c00] font-medium" : "text-[#a1a1aa] group-hover:text-white"
            }`}
          >
            {node.name}
          </span>
          {node.type === "file" && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="ml-auto opacity-0 group-hover:opacity-100 p-1 hover:bg-[#27272a] rounded transition-all"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreVertical className="w-3 h-3 text-[#71717a]" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-[#1a1a1a] border-[#27272a]">
                <DropdownMenuItem className="text-[#a1a1aa] hover:text-white hover:bg-[#27272a] cursor-pointer text-xs">
                  <Trash2 className="w-3 h-3 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        {node.type === "folder" && node.isOpen && node.children && (
          <div>{renderTree(node.children, depth + 1)}</div>
        )}
      </div>
    ));
  };

  return (
    <div className="h-full flex flex-col bg-[#0f0f0f] border-r border-[#27272a]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#27272a]">
        <span className="text-xs font-semibold text-[#71717a] uppercase tracking-wider">Explorer</span>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="w-6 h-6 hover:bg-[#27272a] text-[#71717a] hover:text-white"
          >
            <Plus className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto py-2">{renderTree(files)}</div>
    </div>
  );
}