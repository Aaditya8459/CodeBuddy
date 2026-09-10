"use client";

import { useState } from "react";
import {
  Sparkles,
  Minus,
  Maximize2,
  X,
  Send,
} from "lucide-react";

interface AIChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AIChatPanel({
  isOpen,
  onClose,
}: AIChatPanelProps) {
  const [isMinimized, setIsMinimized] = useState(false);
  const [input, setInput] = useState("");

  if (!isOpen) {
    return null;
  }

  const handleSend = () => {
    const message = input.trim();

    if (!message) {
      return;
    }

    console.log("AI message:", message);

    setInput("");
  };

  return (
    <div
      className={`
        fixed
        right-4
        top-[72px]
        bottom-4
        z-[200]
        flex
        flex-col
        w-[320px]
        xl:w-[360px]
        max-w-[calc(100vw-2rem)]
        rounded-xl
        border
        border-white/10
        bg-[#111111]
        shadow-2xl
        shadow-black/40
        overflow-hidden
        transition-all
        duration-200
        ${
          isMinimized
            ? "h-12 w-12"
            : ""
        }
      `}
    >
      {/* Header */}
      <div
        className="
          flex
          h-12
          shrink-0
          items-center
          justify-between
          border-b
          border-white/10
          bg-[#181818]
          px-3
        "
      >
        <div className="flex items-center gap-2">
          <div
            className="
              flex
              h-7
              w-7
              items-center
              justify-center
              rounded-lg
              bg-gradient-to-r
              from-[#f04600]
              to-[#fa8c00]
            "
          >
            <Sparkles className="h-4 w-4 text-white" />
          </div>

          <span className="text-sm font-semibold text-white">
            CodeBuddy AI
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() =>
              setIsMinimized(
                (previous) => !previous
              )
            }
            className="
              rounded-md
              p-1.5
              text-gray-400
              hover:bg-white/10
              hover:text-white
            "
          >
            {isMinimized ? (
              <Maximize2 className="h-4 w-4" />
            ) : (
              <Minus className="h-4 w-4" />
            )}
          </button>

          <button
            type="button"
            onClick={onClose}
            className="
              rounded-md
              p-1.5
              text-gray-400
              hover:bg-red-500/20
              hover:text-red-400
            "
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      {!isMinimized && (
        <div className="flex min-h-0 flex-1 flex-col">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4">
            <div className="rounded-lg border border-white/10 bg-[#1a1a1a] p-3">
              <p className="text-sm text-gray-300">
                👋 Hi! I'm CodeBuddy AI.
              </p>

              <p className="mt-2 text-xs text-gray-500">
                Ask me about your code, errors,
                debugging, or improvements.
              </p>
            </div>
          </div>

          {/* Input */}
          <div className="shrink-0 border-t border-white/10 p-3">
            <div className="flex items-center gap-2">
              <input
                value={input}
                onChange={(event) =>
                  setInput(event.target.value)
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    handleSend();
                  }
                }}
                placeholder="Ask AI..."
                className="
                  min-w-0
                  flex-1
                  rounded-lg
                  border
                  border-white/10
                  bg-[#1a1a1a]
                  px-3
                  py-2
                  text-sm
                  text-white
                  outline-none
                  placeholder:text-gray-500
                  focus:border-orange-500/50
                "
              />

              <button
                type="button"
                onClick={handleSend}
                className="
                  flex
                  h-9
                  w-9
                  shrink-0
                  items-center
                  justify-center
                  rounded-lg
                  bg-gradient-to-r
                  from-[#f04600]
                  to-[#fa8c00]
                  text-white
                  transition
                  hover:opacity-90
                  active:scale-95
                "
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}