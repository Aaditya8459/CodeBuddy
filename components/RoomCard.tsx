"use client";

import React, { useState } from "react";
import { ArrowLeft } from "lucide-react";
import Logo from "./Logo";

type Mode = "create" | "join";

export default function RoomCard() {
  const [mode, setMode] = useState<Mode>("create");
  const [roomName, setRoomName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [userName, setUserName] = useState("");

  const generateRoomCode = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "";
    for (let i = 0; i < 8; i++) {
      if (i === 4) code += "-";
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  };

  const handleCreate = () => {
    if (!roomName || !userName) return;
    const code = generateRoomCode();
    const roomData = {
      roomCode: code,
      roomName,
      userName,
      createdAt: new Date().toISOString(),
      isHost: true,
    };
    localStorage.setItem("codeBuddy_currentRoom", JSON.stringify(roomData));
    alert(`Room "${roomName}" created! Code: ${code}`);
  };

  const handleJoin = () => {
    if (!roomCode || !userName) return;
    const roomData = {
      roomCode,
      userName,
      joinedAt: new Date().toISOString(),
      isHost: false,
    };
    localStorage.setItem("codeBuddy_currentRoom", JSON.stringify(roomData));
    alert(`Joining room ${roomCode}...`);
  };

  const handleJoinWithLink = () => {
    const link = prompt("Paste the room link:");
    if (link) {
      const code = link.split("/").pop() || "";
      setRoomCode(code);
      setMode("join");
    }
  };

  return (
    <div className="relative w-full max-w-md">
      {/* Card - DARK background with visible text */}
      <div className="relative bg-[#141414] border border-[#27272a] rounded-3xl p-8 overflow-hidden card-top-line transition-all duration-500 hover:border-[#f04600]/30 hover:shadow-[0_0_40px_rgba(240,70,0,0.15)]">

        {/* Header - Integrating the accurate Butterfly Logo */}
        <div className="flex items-center gap-4 mb-6">
          {/* Top Left Header Logo Block Container */}
          <div className="flex-shrink-0 shadow-lg shadow-orange-500/30 rounded-xl overflow-hidden">
            {/* ADJUSTABLE: Change 'w-14 h-14' to scale the Top Left Header Logo */}
            <Logo className="w-14 h-14" />
          </div>
          <div className="min-w-0">
            <h3 className="font-space text-xl font-semibold text-white">
              {mode === "create" ? "Create a Room" : "Join a Room"}
            </h3>
            <p className="text-sm text-[#a1a1aa] truncate">
              {mode === "create"
                ? "Start a new collaborative session"
                : "Enter a room code to join"}
            </p>
          </div>
        </div>

        {/* Form */}
        <div className="space-y-4">
          {mode === "create" && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-[#71717a] uppercase tracking-wider">
                Room Name
              </label>
              <input
                type="text"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                placeholder="e.g., Project Alpha"
                className="w-full bg-[#1e1e1e] border border-[#27272a] rounded-xl px-4 py-3 text-white placeholder:text-[#71717a] outline-none transition-all input-glow"
                onKeyPress={(e) => e.key === "Enter" && handleCreate()}
              />
            </div>
          )}

          {mode === "join" && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-[#71717a] uppercase tracking-wider">
                Room Code
              </label>
              <input
                type="text"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                placeholder="e.g., X7K9-M2P4"
                className="w-full bg-[#1e1e1e] border border-[#27272a] rounded-xl px-4 py-3 text-white placeholder:text-[#71717a] outline-none transition-all input-glow"
                onKeyPress={(e) => e.key === "Enter" && handleJoin()}
              />
            </div>
          )}

          <div className="space-y-2">
            <label className="text-xs font-medium text-[#71717a] uppercase tracking-wider">
              Your Name
            </label>
            <input
              type="text"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              placeholder="Enter your display name"
              className="w-full bg-[#1e1e1e] border border-[#27272a] rounded-xl px-4 py-3 text-white placeholder:text-[#71717a] outline-none transition-all input-glow"
            />
          </div>

          {/* Primary Button */}
          <button
            onClick={mode === "create" ? handleCreate : handleJoin}
            className="relative w-full bg-gradient-to-r from-[#f04600] via-[#fa8c00] to-[#faa000] text-white font-semibold py-3.5 rounded-xl overflow-hidden btn-shimmer transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_30px_rgba(240,70,0,0.4)] active:translate-y-0"
          >
            {mode === "create" ? "🚀 Create Room" : "🚪 Join Room"}
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3 my-4">
            <div className="flex-1 h-px bg-[#27272a]" />
            <span className="text-xs text-[#71717a]">or</span>
            <div className="flex-1 h-px bg-[#27272a]" />
          </div>

          {/* Secondary Action */}
          {mode === "join" && (
            <button
              onClick={handleJoinWithLink}
              className="w-full bg-transparent border border-[#27272a] text-[#a1a1aa] font-semibold py-3 rounded-xl transition-all hover:border-[#f04600] hover:text-white hover:bg-[#f04600]/5"
            >
              🔗 Join with Link
            </button>
          )}
        </div>

        {/* Bottom Switch Link */}
        <div className="mt-6 pt-4 border-t border-[#27272a]">
          {mode === "create" ? (
            <button
              onClick={() => setMode("join")}
              className="w-full text-center text-sm text-[#a1a1aa] hover:text-[#fa8c00] transition-colors"
            >
              Already have a room?{" "}
              <span className="text-[#fa8c00] font-medium">Join existing room</span>
            </button>
          ) : (
            <button
              onClick={() => setMode("create")}
              className="w-full flex items-center justify-center gap-2 text-sm text-[#a1a1aa] hover:text-[#fa8c00] transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to <span className="text-[#fa8c00] font-medium">Create Room</span></span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}