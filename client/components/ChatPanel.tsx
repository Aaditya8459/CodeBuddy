"use client";

import { useState, useRef, useEffect } from "react";
import { Send, X, Minimize2, Maximize2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

export interface Message {
  id: string;
  user: string;
  text: string;
  timestamp: Date | string;
  isMe?: boolean;
}

interface ChatPanelProps {
  roomId?: string;
  userName?: string;
  messages?: Message[];
  onSendMessage?: (text: string) => void;
}

const initialMessages: Message[] = [
  {
    id: "1",
    user: "Alex",
    text: "Hey! Just joined the room. Working on the Button component.",
    timestamp: new Date(Date.now() - 1000 * 60 * 5),
    isMe: false,
  },
  {
    id: "2",
    user: "Sarah",
    text: "Nice! I'll handle the Header styling. Let's sync up in 10 mins?",
    timestamp: new Date(Date.now() - 1000 * 60 * 3),
    isMe: false,
  },
  {
    id: "3",
    user: "You",
    text: "Sounds good! I'll set up the file structure.",
    timestamp: new Date(Date.now() - 1000 * 60 * 1),
    isMe: true,
  },
];

const userColors: Record<string, string> = {
  Alex: "bg-blue-500",
  Sarah: "bg-purple-500",
  You: "bg-[#f04600]",
};

export default function ChatPanel({
  userName = "You",
  messages: externalMessages,
  onSendMessage,
}: ChatPanelProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [isMinimized, setIsMinimized] = useState(false);
  const [localMessages, setLocalMessages] = useState<Message[]>(initialMessages);
  const [inputValue, setInputValue] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const activeMessages = externalMessages || localMessages;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [activeMessages]);

  const handleSend = () => {
    if (!inputValue.trim()) return;

    if (onSendMessage) {
      onSendMessage(inputValue.trim());
    } else {
      const newMessage: Message = {
        id: Date.now().toString(),
        user: userName,
        text: inputValue.trim(),
        timestamp: new Date(),
        isMe: true,
      };
      setLocalMessages((prev) => [...prev, newMessage]);
    }

    setInputValue("");
  };

  const formatTime = (dateInput: Date | string) => {
    const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed right-4 top-20 z-50 w-10 h-10 bg-gradient-to-r from-[#f04600] to-[#fa8c00] rounded-full shadow-lg shadow-orange-500/25 flex items-center justify-center hover:scale-110 transition-transform"
      >
        <span className="text-white text-xs font-bold">{activeMessages.length}</span>
      </button>
    );
  }

  return (
    <div
      className={`fixed right-0 top-[57px] bottom-[49px] z-40 bg-[#111111]/95 backdrop-blur-xl border-l border-[#27272a] flex flex-col transition-all duration-300 ${
        isMinimized ? "w-12" : "w-80"
      }`}
    >
      {/* Header Bar */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-[#27272a]">
        {!isMinimized && (
          <>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[#a1a1aa] uppercase tracking-wider">
                Chat
              </span>
              <Badge
                variant="secondary"
                className="bg-[#f04600]/20 text-[#fa8c00] text-[10px] border-none"
              >
                {activeMessages.length}
              </Badge>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsMinimized(true)}
                className="w-6 h-6 hover:bg-[#27272a] text-[#71717a] hover:text-white"
              >
                <Minimize2 className="w-3 h-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsOpen(false)}
                className="w-6 h-6 hover:bg-[#27272a] text-[#71717a] hover:text-white"
              >
                <X className="w-3 h-3" />
              </Button>
            </div>
          </>
        )}
        {isMinimized && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsMinimized(false)}
            className="w-8 h-8 hover:bg-[#27272a] text-[#71717a] hover:text-white mx-auto"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>

      {!isMinimized && (
        <>
          {/* Scrollable Message List */}
          <ScrollArea className="flex-1 p-3" ref={scrollRef}>
            <div className="space-y-3">
              {activeMessages.map((msg) => {
                const isMe = msg.isMe !== undefined ? msg.isMe : msg.user === userName;
                return (
                  <div
                    key={msg.id}
                    className={`flex gap-2 ${isMe ? "flex-row-reverse" : "flex-row"}`}
                  >
                    <Avatar className={`w-6 h-6 ${userColors[msg.user] || "bg-[#27272a]"}`}>
                      <AvatarFallback className="text-[10px] text-white font-bold">
                        {msg.user ? msg.user[0].toUpperCase() : "U"}
                      </AvatarFallback>
                    </Avatar>
                    <div
                      className={`max-w-[75%] ${
                        isMe ? "items-end" : "items-start"
                      } flex flex-col`}
                    >
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-[10px] font-medium text-[#a1a1aa]">
                          {msg.user}
                        </span>
                        <span className="text-[9px] text-[#52525b] flex items-center gap-0.5">
                          <Clock className="w-2.5 h-2.5" />
                          {formatTime(msg.timestamp)}
                        </span>
                      </div>
                      <div
                        className={`px-2.5 py-1.5 rounded-lg text-xs leading-relaxed ${
                          isMe
                            ? "bg-gradient-to-r from-[#f04600] to-[#fa8c00] text-white"
                            : "bg-[#1a1a1a] text-[#e4e4e7] border border-[#27272a]"
                        }`}
                      >
                        {msg.text}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>

          {/* Input Footer */}
          <div className="p-3 border-t border-[#27272a]">
            <div className="flex gap-2">
              <Input
                placeholder="Type a message..."
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                className="flex-1 bg-[#1a1a1a] border-[#27272a] text-white text-xs placeholder:text-[#52525b] h-8 focus:border-[#f04600] focus:ring-[#f04600]/20"
              />
              <Button
                onClick={handleSend}
                disabled={!inputValue.trim()}
                size="icon"
                className="w-8 h-8 bg-gradient-to-r from-[#f04600] to-[#fa8c00] hover:from-[#d93d00] hover:to-[#e67d00] text-white shadow-lg shadow-orange-500/25 disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}