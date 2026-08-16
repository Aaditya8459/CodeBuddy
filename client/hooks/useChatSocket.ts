// client/hooks/useChatSocket.ts

import { useState, useEffect, useCallback } from "react";
import { socket } from "@/lib/socket";

export interface Message {
  id: string;
  user: string;
  text: string;
  timestamp: Date | string;
  isMe?: boolean;
}

interface ReceiveMessagePayload {
  id: string;
  roomId: string;
  message: string;
  username: string;
  timestamp: string;
}

interface ChatHistoryPayload {
  id: string;
  roomId: string;
  message: string;
  username: string;
  timestamp: string;
}

export const useChatSocket = (
  roomId: string,
  userName: string
) => {
  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => {
    if (!roomId || !userName) {
      return;
    }

    /**
     * Make sure the socket is connected.
     */
    if (!socket.connected) {
      socket.connect();
    }

    /**
     * Convert backend message payload
     * into frontend Message format.
     */
    const convertMessage = (
      data: ChatHistoryPayload | ReceiveMessagePayload
    ): Message => {
      return {
        id:
          data.id ||
          `${Date.now()}-${Math.random()}`,
        user: data.username,
        text: data.message,
        timestamp: data.timestamp,
        isMe: data.username === userName,
      };
    };

    /**
     * Handle successful connection.
     */
    const handleConnect = () => {
      console.log(
        "[Chat Socket] Connected:",
        socket.id
      );

      /**
       * Join the requested room after connection.
       */
      socket.emit("join-room", {
        roomId,
        username: userName,
      });
    };

    /**
     * Handle chat history received from MongoDB.
     *
     * The backend sends this immediately after
     * the client successfully joins the room.
     */
    const handleChatHistory = (
      history: ChatHistoryPayload[]
    ) => {
      console.log(
        "[Chat Socket] Received chat history:",
        history
      );

      if (!Array.isArray(history)) {
        console.error(
          "[Chat Socket] Invalid chat history received."
        );

        return;
      }

      /**
       * Only accept messages belonging to
       * the current room.
       */
      const roomMessages = history.filter(
        (message) =>
          message.roomId === roomId
      );

      /**
       * Convert MongoDB history into the
       * frontend Message structure.
       */
      const restoredMessages =
        roomMessages.map(convertMessage);

      /**
       * Replace the current in-memory messages
       * with the persistent MongoDB history.
       *
       * This is important because ChatPanel is
       * unmounted when it is closed.
       */
      setMessages(restoredMessages);
    };

    /**
     * Handle incoming real-time messages.
     */
    const handleReceiveMessage = (
      data: ReceiveMessagePayload
    ) => {
      console.log(
        "[Chat Socket] Received message:",
        data
      );

      /**
       * Ignore messages belonging to another room.
       */
      if (data.roomId !== roomId) {
        return;
      }

      const newMessage =
        convertMessage(data);

      /**
       * Prevent duplicate messages.
       *
       * This can happen when:
       *
       * 1. The history is restored.
       * 2. A newly sent message is broadcast.
       * 3. Socket reconnects.
       */
      setMessages((prev) => {
        const alreadyExists = prev.some(
          (message) =>
            message.id === newMessage.id
        );

        if (alreadyExists) {
          return prev;
        }

        return [
          ...prev,
          newMessage,
        ];
      });
    };

    /**
     * Handle socket errors.
     */
    const handleSocketError = (
      error: unknown
    ) => {
      console.error(
        "[Chat Socket] Error:",
        error
      );
    };

    /**
     * Register connection listener.
     */
    socket.on(
      "connect",
      handleConnect
    );

    /**
     * Register persistent history listener.
     *
     * THIS WAS MISSING BEFORE.
     */
    socket.on(
      "chat-history",
      handleChatHistory
    );

    /**
     * Register real-time message listener.
     */
    socket.on(
      "receive-message",
      handleReceiveMessage
    );

    /**
     * Register socket error listener.
     */
    socket.on(
      "socket-error",
      handleSocketError
    );

    /**
     * If already connected, join immediately.
     *
     * This is especially important when the
     * ChatPanel is closed and reopened because
     * the shared socket may still be connected.
     */
    if (socket.connected) {
      console.log(
        "[Chat Socket] Already connected:",
        socket.id
      );

      socket.emit("join-room", {
        roomId,
        username: userName,
      });
    }

    /**
     * Cleanup listeners.
     *
     * IMPORTANT:
     *
     * We do NOT disconnect the shared socket here.
     *
     * Closing ChatPanel should only remove this
     * component's listeners.
     *
     * The socket remains available for the rest
     * of the application.
     */
    return () => {
      socket.off(
        "connect",
        handleConnect
      );

      socket.off(
        "chat-history",
        handleChatHistory
      );

      socket.off(
        "receive-message",
        handleReceiveMessage
      );

      socket.off(
        "socket-error",
        handleSocketError
      );
    };
  }, [roomId, userName]);

  /**
   * Send a message to the current room.
   */
  const sendMessage = useCallback(
    (text: string) => {
      const cleanText = text.trim();

      if (!cleanText) {
        return;
      }

      if (!socket.connected) {
        console.error(
          "[Chat Socket] Cannot send message: socket is disconnected."
        );

        return;
      }

      if (!roomId || !userName) {
        console.error(
          "[Chat Socket] Cannot send message: missing room or username."
        );

        return;
      }

      console.log(
        "[Chat Socket] Sending message:",
        cleanText
      );

      socket.emit(
        "send-message",
        {
          roomId,
          message: cleanText,
          username: userName,
        }
      );
    },
    [roomId, userName]
  );

  return {
    messages,
    sendMessage,
  };
};