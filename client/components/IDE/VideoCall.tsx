"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  Minus,
  Maximize2,
  X,
  PhoneOff,
} from "lucide-react";

import { socket } from "@/lib/socket";

interface VideoCallProps {
  isOpen: boolean;
  onClose: () => void;
  roomId: string;
}

export default function VideoCall({
  isOpen,
  onClose,
  roomId,
}: VideoCallProps) {
  const [isMinimized, setIsMinimized] =
    useState(false);

  const [isMuted, setIsMuted] =
    useState(false);

  const [isCameraOff, setIsCameraOff] =
    useState(false);

  const [mediaError, setMediaError] =
    useState("");

  const [callStatus, setCallStatus] =
    useState("Waiting for participant...");

  const [hasRemoteStream, setHasRemoteStream] =
    useState(false);

  const localVideoRef =
    useRef<HTMLVideoElement | null>(null);

  const remoteVideoRef =
    useRef<HTMLVideoElement | null>(null);

  const localStreamRef =
    useRef<MediaStream | null>(null);

  const peerConnectionRef =
    useRef<RTCPeerConnection | null>(null);

  const remoteSocketIdRef =
    useRef<string | null>(null);

  const pendingCandidatesRef =
    useRef<RTCIceCandidateInit[]>([]);

  const isCallerRef =
    useRef(false);

  const isMountedRef =
    useRef(false);

  const reconnectingRef =
    useRef(false);

  const rtcConfiguration: RTCConfiguration = {
    iceServers: [
      {
        urls:
          "stun:stun.l.google.com:19302",
      },
      ...(process.env
        .NEXT_PUBLIC_TURN_URL
        ? [
            {
              urls:
                process.env
                  .NEXT_PUBLIC_TURN_URL,
              username:
                process.env
                  .NEXT_PUBLIC_TURN_USERNAME ||
                "",
              credential:
                process.env
                  .NEXT_PUBLIC_TURN_CREDENTIAL ||
                "",
            },
          ]
        : []),
    ],
    iceTransportPolicy:
      "all",
  };

  const stopLocalStream = () => {
    if (localStreamRef.current) {
      localStreamRef.current
        .getTracks()
        .forEach((track) => track.stop());

      localStreamRef.current = null;
    }

    if (localVideoRef.current) {
      localVideoRef.current.srcObject =
        null;
    }
  };

  const closePeerConnection = () => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.onicecandidate =
        null;

      peerConnectionRef.current.onicecandidateerror =
        null;

      peerConnectionRef.current.ontrack =
        null;

      peerConnectionRef.current.onconnectionstatechange =
        null;

      peerConnectionRef.current.oniceconnectionstatechange =
        null;

      peerConnectionRef.current.close();

      peerConnectionRef.current =
        null;
    }

    remoteSocketIdRef.current =
      null;

    pendingCandidatesRef.current =
      [];

    isCallerRef.current =
      false;

    reconnectingRef.current =
      false;

    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject =
        null;
    }

    setHasRemoteStream(false);
  };

  const createPeerConnection = (
    targetSocketId: string
  ) => {
    closePeerConnection();

    const peerConnection =
      new RTCPeerConnection(
        rtcConfiguration
      );

    peerConnectionRef.current =
      peerConnection;

    remoteSocketIdRef.current =
      targetSocketId;

    const localStream =
      localStreamRef.current;

    if (localStream) {
      localStream
        .getTracks()
        .forEach((track) => {
          peerConnection.addTrack(
            track,
            localStream
          );
        });
    }

    peerConnection.onicecandidate =
      (event) => {
        if (
          !event.candidate ||
          !remoteSocketIdRef.current
        ) {
          return;
        }

        socket.emit(
          "ice-candidate",
          {
            roomId,
            targetSocketId:
              remoteSocketIdRef.current,
            candidate:
              event.candidate.toJSON(),
          }
        );
      };

    peerConnection.onicecandidateerror =
      (event) => {
        console.error(
          "[Video] ICE candidate error:",
          {
            url:
              event.url,
            errorCode:
              event.errorCode,
            errorText:
              event.errorText,
          }
        );
      };

    peerConnection.ontrack =
      (event) => {
        const [remoteStream] =
          event.streams;

        if (
          remoteStream &&
          remoteVideoRef.current
        ) {
          remoteVideoRef.current.srcObject =
            remoteStream;

          setHasRemoteStream(true);

          setCallStatus(
            "Connected"
          );
        }
      };

    peerConnection.oniceconnectionstatechange =
      () => {
        const iceState =
          peerConnection.iceConnectionState;

        console.log(
          "[Video] ICE connection state:",
          iceState
        );

        if (
          iceState ===
            "connected" ||
          iceState ===
            "completed"
        ) {
          reconnectingRef.current =
            false;

          setCallStatus(
            "Connected"
          );

          return;
        }

        if (
          iceState ===
          "checking"
        ) {
          setCallStatus(
            "Connecting..."
          );

          return;
        }

        if (
          iceState ===
          "disconnected"
        ) {
          setCallStatus(
            "Reconnecting..."
          );

          return;
        }

        if (
          iceState ===
          "failed"
        ) {
          setCallStatus(
            "Reconnecting..."
          );

          if (
            !reconnectingRef.current &&
            remoteSocketIdRef.current
          ) {
            reconnectingRef.current =
              true;

            setTimeout(
              async () => {
                if (
                  !isMountedRef.current ||
                  !peerConnectionRef.current ||
                  !remoteSocketIdRef.current
                ) {
                  reconnectingRef.current =
                    false;

                  return;
                }

                try {
                  const currentPeerConnection =
                    peerConnectionRef.current;

                  currentPeerConnection.restartIce();

                  const offer =
                    await currentPeerConnection.createOffer(
                      {
                        iceRestart:
                          true,
                      }
                    );

                  await currentPeerConnection.setLocalDescription(
                    offer
                  );

                  const targetSocketId =
                    remoteSocketIdRef.current;

                  if (
                    targetSocketId
                  ) {
                    socket.emit(
                      "video-offer",
                      {
                        roomId,
                        targetSocketId,
                        offer,
                      }
                    );
                  }

                  setCallStatus(
                    "Reconnecting..."
                  );
                } catch (
                  error
                ) {
                  console.error(
                    "[Video] ICE restart failed:",
                    error
                  );

                  setCallStatus(
                    "Connection failed"
                  );

                  reconnectingRef.current =
                    false;
                }
              },
              1000
            );
          }

          return;
        }

        if (
          iceState ===
          "closed"
        ) {
          setCallStatus(
            "Call ended"
          );
        }
      };

    peerConnection.onconnectionstatechange =
      () => {
        const connectionState =
          peerConnection.connectionState;

        console.log(
          "[Video] Peer connection state:",
          connectionState
        );

        if (
          connectionState ===
          "connected"
        ) {
          reconnectingRef.current =
            false;

          setCallStatus(
            "Connected"
          );
        }

        if (
          connectionState ===
          "connecting"
        ) {
          setCallStatus(
            "Connecting..."
          );
        }

        if (
          connectionState ===
          "disconnected"
        ) {
          setCallStatus(
            "Reconnecting..."
          );
        }

        if (
          connectionState ===
          "failed"
        ) {
          setCallStatus(
            "Connection failed"
          );
        }

        if (
          connectionState ===
          "closed"
        ) {
          setCallStatus(
            "Call ended"
          );

          setHasRemoteStream(
            false
          );
        }
      };

    return peerConnection;
  };

  const addPendingIceCandidates =
    async (
      peerConnection: RTCPeerConnection
    ) => {
      if (
        !peerConnection.remoteDescription
      ) {
        return;
      }

      const candidates =
        pendingCandidatesRef.current;

      pendingCandidatesRef.current =
        [];

      for (
        const candidate of candidates
      ) {
        try {
          await peerConnection.addIceCandidate(
            new RTCIceCandidate(
              candidate
            )
          );
        } catch (error) {
          console.error(
            "Could not add pending ICE candidate:",
            error
          );
        }
      }
    };

  const createOffer = async (
    targetSocketId: string,
    iceRestart = false
  ) => {
    try {
      const peerConnection =
        peerConnectionRef.current ||
        createPeerConnection(
          targetSocketId
        );

      remoteSocketIdRef.current =
        targetSocketId;

      isCallerRef.current =
        true;

      setCallStatus(
        iceRestart
          ? "Reconnecting..."
          : "Calling participant..."
      );

      const offer =
        await peerConnection.createOffer(
          iceRestart
            ? {
                iceRestart: true,
              }
            : undefined
        );

      await peerConnection.setLocalDescription(
        offer
      );

      socket.emit(
        "video-offer",
        {
          roomId,
          targetSocketId,
          offer,
        }
      );
    } catch (error) {
      console.error(
        "Could not create WebRTC offer:",
        error
      );

      setCallStatus(
        iceRestart
          ? "Connection failed"
          : "Could not start call"
      );
    }
  };

  const handleVideoCallJoin = async (
    data: {
      socketId?: string;
      participantSocketId?: string;
      targetSocketId?: string;
    }
  ) => {
    const participantSocketId =
      data.participantSocketId ||
      data.socketId ||
      data.targetSocketId;

    if (
      !participantSocketId ||
      participantSocketId === socket.id
    ) {
      return;
    }

    remoteSocketIdRef.current =
      participantSocketId;

    setCallStatus(
      "Participant found. Connecting..."
    );

    const peerConnection =
      createPeerConnection(
        participantSocketId
      );

    isCallerRef.current =
      true;

    try {
      const offer =
        await peerConnection.createOffer();

      await peerConnection.setLocalDescription(
        offer
      );

      socket.emit(
        "video-offer",
        {
          roomId,
          targetSocketId:
            participantSocketId,
          offer,
        }
      );

      setCallStatus(
        "Calling participant..."
      );
    } catch (error) {
      console.error(
        "Could not create WebRTC offer:",
        error
      );

      setCallStatus(
        "Could not start call"
      );
    }
  };

  const handleVideoOffer = async (
    data: {
      socketId?: string;
      senderSocketId?: string;
      offer: RTCSessionDescriptionInit;
    }
  ) => {
    const senderSocketId =
      data.senderSocketId ||
      data.socketId;

    if (
      !senderSocketId ||
      senderSocketId === socket.id ||
      !data.offer
    ) {
      return;
    }

    try {
      remoteSocketIdRef.current =
        senderSocketId;

      setCallStatus(
        "Incoming call..."
      );

      const peerConnection =
        createPeerConnection(
          senderSocketId
        );

      isCallerRef.current =
        false;

      await peerConnection.setRemoteDescription(
        new RTCSessionDescription(
          data.offer
        )
      );

      await addPendingIceCandidates(
        peerConnection
      );

      const answer =
        await peerConnection.createAnswer();

      await peerConnection.setLocalDescription(
        answer
      );

      socket.emit(
        "video-answer",
        {
          roomId,
          targetSocketId:
            senderSocketId,
          answer,
        }
      );

      setCallStatus(
        "Connecting..."
      );
    } catch (error) {
      console.error(
        "Could not handle WebRTC offer:",
        error
      );

      setCallStatus(
        "Could not accept call"
      );
    }
  };

  const handleVideoAnswer = async (
    data: {
      socketId?: string;
      senderSocketId?: string;
      answer: RTCSessionDescriptionInit;
    }
  ) => {
    const senderSocketId =
      data.senderSocketId ||
      data.socketId;

    if (
      !data.answer ||
      senderSocketId === socket.id
    ) {
      return;
    }

    try {
      const peerConnection =
        peerConnectionRef.current;

      if (!peerConnection) {
        return;
      }

      if (
        senderSocketId
      ) {
        remoteSocketIdRef.current =
          senderSocketId;
      }

      await peerConnection.setRemoteDescription(
        new RTCSessionDescription(
          data.answer
        )
      );

      await addPendingIceCandidates(
        peerConnection
      );

      reconnectingRef.current =
        false;

      setCallStatus(
        "Connecting..."
      );
    } catch (error) {
      console.error(
        "Could not handle WebRTC answer:",
        error
      );

      setCallStatus(
        "Could not establish call"
      );
    }
  };

  const handleIceCandidate = async (
    data: {
      senderSocketId?: string;
      socketId?: string;
      candidate: RTCIceCandidateInit;
    }
  ) => {
    if (!data.candidate) {
      return;
    }

    const senderSocketId =
      data.senderSocketId ||
      data.socketId;

    if (
      senderSocketId === socket.id
    ) {
      return;
    }

    if (
      senderSocketId &&
      !remoteSocketIdRef.current
    ) {
      remoteSocketIdRef.current =
        senderSocketId;
    }

    const peerConnection =
      peerConnectionRef.current;

    if (
      !peerConnection ||
      !peerConnection.remoteDescription
    ) {
      pendingCandidatesRef.current.push(
        data.candidate
      );

      return;
    }

    try {
      await peerConnection.addIceCandidate(
        new RTCIceCandidate(
          data.candidate
        )
      );
    } catch (error) {
      console.error(
        "Could not add ICE candidate:",
        error
      );
    }
  };

  const handleVideoCallLeave = (
    data?: {
      socketId?: string;
      senderSocketId?: string;
    }
  ) => {
    const senderSocketId =
      data?.senderSocketId ||
      data?.socketId;

    if (
      senderSocketId &&
      senderSocketId === socket.id
    ) {
      return;
    }

    closePeerConnection();

    setCallStatus(
      "Participant disconnected"
    );
  };

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    isMountedRef.current =
      true;

    const startMedia =
      async () => {
        try {
          setMediaError("");

          const stream =
            await navigator.mediaDevices.getUserMedia(
              {
                video: true,
                audio: true,
              }
            );

          if (
            !isMountedRef.current
          ) {
            stream
              .getTracks()
              .forEach((track) =>
                track.stop()
              );

            return;
          }

          localStreamRef.current =
            stream;

          if (localVideoRef.current) {
            localVideoRef.current.srcObject =
              stream;
          }

          setCallStatus(
            "Joining video call..."
          );

          if (!socket.connected) {
            socket.connect();
          }

          if (socket.connected) {
            socket.emit(
              "video-call-join",
              {
                roomId,
              }
            );
          }
        } catch (error) {
          console.error(
            "Could not access camera/microphone:",
            error
          );

          if (
            isMountedRef.current
          ) {
            setMediaError(
              "Camera or microphone permission was denied."
            );

            setCallStatus(
              "Media unavailable"
            );
          }
        }
      };

    const handleConnect =
      () => {
        if (
          !isMountedRef.current
        ) {
          return;
        }

        socket.emit(
          "video-call-join",
          {
            roomId,
          }
        );
      };

    socket.on(
      "connect",
      handleConnect
    );

    socket.on(
      "video-call-join",
      handleVideoCallJoin
    );

    socket.on(
      "video-offer",
      handleVideoOffer
    );

    socket.on(
      "video-answer",
      handleVideoAnswer
    );

    socket.on(
      "ice-candidate",
      handleIceCandidate
    );

    socket.on(
      "video-call-leave",
      handleVideoCallLeave
    );

    startMedia();

    return () => {
      isMountedRef.current =
        false;

      socket.off(
        "connect",
        handleConnect
      );

      socket.off(
        "video-call-join",
        handleVideoCallJoin
      );

      socket.off(
        "video-offer",
        handleVideoOffer
      );

      socket.off(
        "video-answer",
        handleVideoAnswer
      );

      socket.off(
        "ice-candidate",
        handleIceCandidate
      );

      socket.off(
        "video-call-leave",
        handleVideoCallLeave
      );

      if (socket.connected) {
        socket.emit(
          "video-call-leave",
          {
            roomId,
            targetSocketId:
              remoteSocketIdRef.current,
          }
        );
      }

      closePeerConnection();
      stopLocalStream();

      setIsMuted(false);
      setIsCameraOff(false);
      setMediaError("");
      setHasRemoteStream(false);
      setCallStatus(
        "Waiting for participant..."
      );
    };
  }, [isOpen, roomId]);

  const handleMute = () => {
    const stream =
      localStreamRef.current;

    if (!stream) {
      return;
    }

    const audioTracks =
      stream.getAudioTracks();

    const nextMuted =
      !isMuted;

    audioTracks.forEach(
      (track) => {
        track.enabled =
          !nextMuted;
      }
    );

    setIsMuted(nextMuted);
  };

  const handleCamera = () => {
    const stream =
      localStreamRef.current;

    if (!stream) {
      return;
    }

    const videoTracks =
      stream.getVideoTracks();

    const nextCameraOff =
      !isCameraOff;

    videoTracks.forEach(
      (track) => {
        track.enabled =
          !nextCameraOff;
      }
    );

    setIsCameraOff(
      nextCameraOff
    );
  };

  const handleClose = () => {
    if (socket.connected) {
      socket.emit(
        "video-call-leave",
        {
          roomId,
          targetSocketId:
            remoteSocketIdRef.current,
        }
      );
    }

    closePeerConnection();
    stopLocalStream();

    setIsMuted(false);
    setIsCameraOff(false);
    setMediaError("");
    setHasRemoteStream(false);
    setCallStatus(
      "Waiting for participant..."
    );

    onClose();
  };

  if (!isOpen) {
    return null;
  }

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
            <Video className="h-4 w-4 text-white" />
          </div>

          <span className="text-sm font-semibold text-white">
            Video Call
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() =>
              setIsMinimized(
                (previous) =>
                  !previous
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
            onClick={handleClose}
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
          {/* Video Area */}
          <div className="relative flex min-h-0 flex-1 items-center justify-center bg-black p-3">
            {/* Remote Video */}
            <div
              className="
                relative
                flex
                h-full
                w-full
                items-center
                justify-center
                overflow-hidden
                rounded-lg
                border
                border-white/10
                bg-[#181818]
              "
            >
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="
                  h-full
                  w-full
                  object-cover
                "
              />

              {!hasRemoteStream && (
                <div
                  className="
                    absolute
                    inset-0
                    flex
                    flex-col
                    items-center
                    justify-center
                  "
                >
                  <Video className="h-10 w-10 text-gray-600" />

                  <span
                    className="
                      mt-2
                      rounded-md
                      bg-black/60
                      px-2
                      py-1
                      text-xs
                      text-gray-300
                    "
                  >
                    {callStatus}
                  </span>
                </div>
              )}

              {hasRemoteStream && (
                <span
                  className="
                    absolute
                    bottom-3
                    left-3
                    rounded-md
                    bg-black/60
                    px-2
                    py-1
                    text-xs
                    text-gray-300
                  "
                >
                  Participant
                </span>
              )}
            </div>

            {/* Local Video Preview */}
            <div
              className="
                absolute
                bottom-6
                right-6
                h-24
                w-32
                overflow-hidden
                rounded-lg
                border
                border-white/20
                bg-[#222222]
                shadow-lg
              "
            >
              {isCameraOff ? (
                <div
                  className="
                    flex
                    h-full
                    w-full
                    items-center
                    justify-center
                  "
                >
                  <VideoOff className="h-5 w-5 text-gray-500" />
                </div>
              ) : (
                <video
                  ref={localVideoRef}
                  autoPlay
                  muted
                  playsInline
                  className="
                    h-full
                    w-full
                    object-cover
                  "
                />
              )}

              <span
                className="
                  absolute
                  bottom-1
                  left-1
                  rounded
                  bg-black/60
                  px-1.5
                  py-0.5
                  text-[10px]
                  text-gray-300
                "
              >
                You
              </span>
            </div>

            {/* Media Error */}
            {mediaError && (
              <div
                className="
                  absolute
                  left-6
                  right-6
                  top-6
                  rounded-lg
                  border
                  border-red-500/20
                  bg-red-500/10
                  p-3
                  text-center
                  text-xs
                  text-red-400
                "
              >
                {mediaError}
              </div>
            )}
          </div>

          {/* Controls */}
          <div
            className="
              flex
              shrink-0
              items-center
              justify-center
              gap-3
              border-t
              border-white/10
              bg-[#181818]
              p-3
            "
          >
            {/* Microphone */}
            <button
              type="button"
              onClick={handleMute}
              className={`
                flex
                h-10
                w-10
                items-center
                justify-center
                rounded-full
                transition
                ${
                  isMuted
                    ? "bg-red-500/20 text-red-400"
                    : "bg-white/10 text-gray-300 hover:bg-white/20 hover:text-white"
                }
              `}
            >
              {isMuted ? (
                <MicOff className="h-4 w-4" />
              ) : (
                <Mic className="h-4 w-4" />
              )}
            </button>

            {/* Camera */}
            <button
              type="button"
              onClick={handleCamera}
              className={`
                flex
                h-10
                w-10
                items-center
                justify-center
                rounded-full
                transition
                ${
                  isCameraOff
                    ? "bg-red-500/20 text-red-400"
                    : "bg-white/10 text-gray-300 hover:bg-white/20 hover:text-white"
                }
              `}
            >
              {isCameraOff ? (
                <VideoOff className="h-4 w-4" />
              ) : (
                <Video className="h-4 w-4" />
              )}
            </button>

            {/* End Call */}
            <button
              type="button"
              onClick={handleClose}
              className="
                flex
                h-10
                w-10
                items-center
                justify-center
                rounded-full
                bg-red-600
                text-white
                transition
                hover:bg-red-500
                active:scale-95
              "
            >
              <PhoneOff className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}