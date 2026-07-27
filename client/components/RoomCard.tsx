"use client";

import React, { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import Logo from "./Logo";

type Mode = "create" | "join";

export default function RoomCard() {
  const router = useRouter();

  const [mode, setMode] = useState<Mode>("create");
  const [roomName, setRoomName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [userName, setUserName] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // Handle Create Room API Request
  const handleCreate = async () => {
    if (!roomName.trim() || !userName.trim() || loading) return;

    setLoading(true);
    setErrorMessage("");

    try {
      const res = await fetch("http://localhost:5000/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomName: roomName.trim(),
          yourName: userName.trim(),
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || "Failed to create room.");
      }

      // Safely check if data exists, otherwise use result directly
      const roomData = result.data || result; 
      localStorage.setItem("codeBuddy_currentRoom", JSON.stringify(roomData));

      // Use roomCode or roomId depending on what your server sends
      const code = roomData.roomCode || roomData.roomId;
      router.push(`/room/${code}?name=${encodeURIComponent(userName.trim())}`);
    } catch (err: any) {
      setErrorMessage(err.message || "An error occurred");
      setLoading(false);
    }
  };

  // Handle Join Room API Request
  const handleJoin = async () => {
    if (!roomCode.trim() || !userName.trim() || loading) return;

    setLoading(true);
    setErrorMessage("");

    try {
      // Format code to remove hyphens if user types "X7K9-M2P4"
      const cleanCode = roomCode.replace(/-/g, "").toUpperCase();

      const res = await fetch("http://localhost:5000/api/rooms/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomCode: cleanCode,
          yourName: userName.trim(),
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || "Invalid room code.");
      }

      // Redirect to the dynamic code room route
      router.push(`/room/${cleanCode}?name=${encodeURIComponent(userName.trim())}`);
    } catch (err: any) {
      setErrorMessage(err.message || "An error occurred");
      setLoading(false);
    }
  };

  const handleJoinWithLink = () => {
    const link = prompt("Paste the room link:");
    if (link) {
      const code = link.split("/").pop() || "";
      setRoomCode(code.toUpperCase());
      setMode("join");
    }
  };

  return (
    <div className="relative w-full max-w-md">
      <div className="relative bg-[#141414] border border-[#27272a] rounded-3xl p-8 card-top-line transition-all duration-500 hover:border-[#f04600]/30 hover:shadow-[0_0_40px_rgba(240,70,0,0.15)]">

        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <div className="flex-shrink-0 shadow-lg shadow-orange-500/30 rounded-xl overflow-hidden">
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

        {/* Form Inputs */}
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
                disabled={loading}
                className="w-full bg-[#1e1e1e] border border-[#27272a] rounded-xl px-4 py-3 text-white placeholder:text-[#71717a] outline-none transition-all input-glow disabled:opacity-50"
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
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
                placeholder="e.g., SQ5XDM6J"
                maxLength={9}
                disabled={loading}
                className="w-full bg-[#1e1e1e] border border-[#27272a] rounded-xl px-4 py-3 text-white placeholder:text-[#71717a] outline-none transition-all input-glow disabled:opacity-50 font-mono"
                onKeyDown={(e) => e.key === "Enter" && handleJoin()}
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
              disabled={loading}
              className="w-full bg-[#1e1e1e] border border-[#27272a] rounded-xl px-4 py-3 text-white placeholder:text-[#71717a] outline-none transition-all input-glow disabled:opacity-50"
              onKeyDown={(e) => e.key === "Enter" && (mode === "create" ? handleCreate() : handleJoin())}
            />
          </div>

          {/* Inline Error Message */}
          {errorMessage && (
            <p className="text-xs text-red-500 bg-red-500/10 border border-red-500/20 p-2.5 rounded-lg text-center font-medium">
              {errorMessage}
            </p>
          )}

          {/* Primary Action Button */}
          <button
            onClick={mode === "create" ? handleCreate : handleJoin}
            disabled={loading}
            className="relative w-full bg-gradient-to-r from-[#f04600] via-[#fa8c00] to-[#faa000] text-white font-semibold py-3.5 rounded-xl overflow-hidden btn-shimmer transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_30px_rgba(240,70,0,0.4)] active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading
              ? mode === "create"
                ? "Creating Room..."
                : "Joining Room..."
              : mode === "create"
              ? "🚀 Create Room"
              : "🚪 Join Room"}
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
              disabled={loading}
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
              onClick={() => { setMode("join"); setErrorMessage(""); }}
              className="w-full text-center text-sm text-[#a1a1aa] hover:text-[#fa8c00] transition-colors"
            >
              Already have a room?{" "}
              <span className="text-[#fa8c00] font-medium">Join existing room</span>
            </button>
          ) : (
            <button
              onClick={() => { setMode("create"); setErrorMessage(""); }}
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