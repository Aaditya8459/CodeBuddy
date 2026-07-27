"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RoomManager() {
  const router = useRouter();
  const API_URL = "http://localhost:5000"; // Define this once

  const [mode, setMode] = useState<"create" | "join">("create");
  const [yourName, setYourName] = useState("");
  const [roomName, setRoomName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [generatedCode, setGeneratedCode] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage("Creating room...");
    setLoading(true);

    try {
      // Use the unified API_URL
      const res = await fetch(`${API_URL}/api/rooms`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer fake_token_for_now",
        },
        body: JSON.stringify({ roomName, yourName }),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to create room");

      // Ensure this matches the structure your backend returns
      const code = result.data.roomCode; 
      setGeneratedCode(code);
      setMessage("Room created! Redirecting...");

      router.push(`/room/${code}?name=${encodeURIComponent(yourName)}`);
    } catch (err: any) {
      setMessage(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage("Joining room...");
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/api/rooms/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // LINE 60 IS HERE:
        body: JSON.stringify({ roomCode, name: yourName }), 
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Invalid room code");

      setMessage(`Successfully joined! Redirecting...`);
      router.push(`/room/${result.data.roomCode}?name=${encodeURIComponent(yourName)}`);
    } catch (err: any) {
      setMessage(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-md mx-auto border rounded-xl shadow-md bg-background text-foreground">
      {/* ... (Rest of your JSX remains exactly the same as before) ... */}
      <div className="flex gap-4 mb-4">
        <button
          type="button"
          onClick={() => setMode("create")}
          className={`flex-1 py-2 rounded font-medium transition-colors ${
            mode === "create" ? "bg-black text-white" : "bg-gray-100 text-gray-800"
          }`}
        >
          Create Room
        </button>
        <button
          type="button"
          onClick={() => setMode("join")}
          className={`flex-1 py-2 rounded font-medium transition-colors ${
            mode === "join" ? "bg-black text-white" : "bg-gray-100 text-gray-800"
          }`}
        >
          Join Room
        </button>
      </div>

      {mode === "create" ? (
        <form onSubmit={handleCreateRoom} className="flex flex-col gap-3">
          <input
            type="text"
            placeholder="Your Name"
            value={yourName}
            onChange={(e) => setYourName(e.target.value)}
            className="border p-2 rounded text-black dark:text-white dark:bg-gray-900"
            required
          />
          <input
            type="text"
            placeholder="Room Name"
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            className="border p-2 rounded text-black dark:text-white dark:bg-gray-900"
            required
          />
          <button
            type="submit"
            disabled={loading}
            className="bg-green-600 hover:bg-green-700 text-white p-2 rounded font-medium transition-colors disabled:opacity-50"
          >
            {loading ? "Creating..." : "Create Room & Enter Editor"}
          </button>
        </form>
      ) : (
        <form onSubmit={handleJoinRoom} className="flex flex-col gap-3">
          <input
            type="text"
            placeholder="Your Name"
            value={yourName}
            onChange={(e) => setYourName(e.target.value)}
            className="border p-2 rounded text-black dark:text-white dark:bg-gray-900"
            required
          />
          <input
            type="text"
            placeholder="8-Digit Code (e.g. A9B8X7Z2)"
            value={roomCode}
            maxLength={8}
            onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
            className="border p-2 rounded uppercase font-mono text-black dark:text-white dark:bg-gray-900"
            required
          />
          <button
            type="submit"
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 text-white p-2 rounded font-medium transition-colors disabled:opacity-50"
          >
            {loading ? "Joining..." : "Join Room & Enter Editor"}
          </button>
        </form>
      )}

      {generatedCode && (
        <div className="mt-4 p-3 bg-gray-100 dark:bg-gray-800 text-center rounded">
          <p className="text-sm">Your 8-Digit Room Code:</p>
          <p className="text-2xl font-bold font-mono text-blue-600 dark:text-blue-400">
            {generatedCode}
          </p>
        </div>
      )}

      {message && <p className="mt-3 text-sm text-center font-medium">{message}</p>}
    </div>
  );
  
}
