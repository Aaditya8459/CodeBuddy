// client/lib/socket.ts

import { io, Socket } from "socket.io-client";

/**
 * Socket.IO backend URL.
 *
 * Development:
 * NEXT_PUBLIC_SOCKET_URL=http://localhost:5000
 *
 * Production:
 * NEXT_PUBLIC_SOCKET_URL=https://your-backend-domain.com
 */
const SOCKET_URL =
  process.env.NEXT_PUBLIC_SOCKET_URL ||
  "http://localhost:5000";

/**
 * Create the Socket.IO client.
 *
 * autoConnect is disabled so the connection is
 * established when the user actually enters a room.
 */
export const socket: Socket = io(SOCKET_URL, {
  autoConnect: false,

  /**
   * Automatically attempt to reconnect if the
   * connection is temporarily lost.
   */
  reconnection: true,

  /**
   * Number of reconnection attempts.
   */
  reconnectionAttempts: 5,

  /**
   * Delay between reconnection attempts.
   */
  reconnectionDelay: 1000,

  /**
   * Use WebSocket when possible while still allowing
   * Socket.IO's fallback transport.
   */
  transports: ["websocket", "polling"],
});

/**
 * --------------------------------------------------------------------------
 * Video Call Signaling Events
 * --------------------------------------------------------------------------
 *
 * These events are used by VideoCall.tsx for WebRTC signaling.
 *
 * The Socket.IO server must relay these events between users
 * in the same CodeBuddy room.
 */

/**
 * A user joins the video call.
 *
 * Payload:
 * {
 *   roomId: string;
 * }
 */
export const VIDEO_CALL_JOIN = "video-call-join";

/**
 * WebRTC offer sent from the caller to the other participant.
 *
 * Payload:
 * {
 *   targetSocketId: string;
 *   offer: RTCSessionDescriptionInit;
 * }
 */
export const VIDEO_OFFER = "video-offer";

/**
 * WebRTC answer sent from the receiving participant
 * back to the caller.
 *
 * Payload:
 * {
 *   targetSocketId: string;
 *   answer: RTCSessionDescriptionInit;
 * }
 */
export const VIDEO_ANSWER = "video-answer";

/**
 * ICE candidate exchanged between WebRTC peers.
 *
 * Payload:
 * {
 *   targetSocketId: string;
 *   candidate: RTCIceCandidateInit;
 * }
 */
export const ICE_CANDIDATE = "ice-candidate";

/**
 * A user leaves the video call.
 *
 * Payload:
 * {
 *   roomId: string;
 * }
 */
export const VIDEO_CALL_LEAVE = "video-call-leave";