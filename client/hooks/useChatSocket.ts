// client/hooks/useChatSocket.ts
import { useState, useEffect } from "react";
import { socket } from "@/lib/socket";

export interface Message {
  id: string;
  user: string;
  text: string;
  timestamp: Date | string;
  isMe?: boolean;
}

export const useChatSocket = (roomId: string, userName: string) => {
  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => {
    // Listen for incoming messages
    const handleReceiveMessage = (data: { message: string, username: string, timestamp: string }) => {
      const newMessage: Message = {
        id: Date.now().toString(),
        user: data.username,
        text: data.message,
        timestamp: data.timestamp,
        isMe: data.username === userName,
      };
      setMessages((prev) => [...prev, newMessage]);
    };

    socket.on('receive-message', handleReceiveMessage);

    return () => {
      socket.off('receive-message', handleReceiveMessage);
    };
  }, [roomId, userName]);

  const sendMessage = (text: string) => {
    socket.emit('send-message', { 
      roomId, 
      message: text, 
      username: userName 
    });
  };

  return { messages, sendMessage };
};