"use client";

import {
  useState,
  useRef,
  useEffect,
  useCallback,
} from "react";

import {
  Send,
  X,
  Minimize2,
  Maximize2,
  Clock,
  MessageSquare,
  Sparkles,
  Wifi,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

import {
  useChatSocket,
  Message,
} from "@/hooks/useChatSocket";

interface ChatPanelProps {
  roomId: string;
  userName?: string;
}

const userColors: Record<string, string> = {
  Alex: "bg-blue-500",
  Sarah: "bg-purple-500",
  You: "bg-[#f04600]",
};

export default function ChatPanel({
  roomId,
  userName = "You",
}: ChatPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [isFocused, setIsFocused] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { messages, sendMessage } = useChatSocket(
    roomId,
    userName
  );

  /* =========================================================
     AUTO SCROLL
  ========================================================= */

  useEffect(() => {
    const viewport =
      scrollRef.current?.querySelector(
        "[data-radix-scroll-area-viewport]"
      );

    if (!viewport) return;

    requestAnimationFrame(() => {
      viewport.scrollTop = viewport.scrollHeight;
    });
  }, [messages]);

  /* =========================================================
     SEND MESSAGE
  ========================================================= */

  const handleSend = useCallback(() => {
    const message = inputValue.trim();

    if (!message) return;

    sendMessage(message);
    setInputValue("");

    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }, [inputValue, sendMessage]);

  /* =========================================================
     KEYBOARD
  ========================================================= */

  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleSend();
    }
  };

  /* =========================================================
     TIME FORMAT
  ========================================================= */

  const formatTime = (dateInput: Date | string) => {
    const date = new Date(dateInput);

    if (Number.isNaN(date.getTime())) {
      return "";
    }

    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  /* =========================================================
     AVATAR
  ========================================================= */

  const getAvatarColor = (user: string) => {
    return (
      userColors[user] ||
      "bg-gradient-to-br from-[#27272a] to-[#18181b]"
    );
  };

  const getInitial = (user: string) => {
    return user?.trim()?.[0]?.toUpperCase() || "U";
  };

  /* =========================================================
     FLOATING CHAT BUTTON

     IMPORTANT:
     This button is fixed to the viewport.
     It does NOT occupy any layout space.
  ========================================================= */

  if (!isOpen) {
    return (
      <button
        onClick={() => {
          setIsOpen(true);
          setIsMinimized(false);
        }}
        aria-label="Open chat"
        title="Open team chat"
        className="
          fixed
          right-5
          bottom-5
          z-[100]
          flex
          h-14
          w-14
          items-center
          justify-center
          rounded-full
          border
          border-orange-400/40
          bg-gradient-to-br
          from-[#f04600]
          to-[#fa8c00]
          text-white
          shadow-2xl
          shadow-orange-500/40
          transition-all
          duration-300
          hover:scale-110
          hover:shadow-orange-500/60
          active:scale-95
        "
      >
        <div className="relative flex items-center justify-center">
          <MessageSquare
            className="
              h-6
              w-6
              stroke-[2]
            "
          />

          {messages.length > 0 && (
            <span
              className="
                absolute
                -right-4
                -top-4
                flex
                h-5
                min-w-5
                items-center
                justify-center
                rounded-full
                border
                border-[#111111]
                bg-white
                px-1
                text-[9px]
                font-bold
                text-[#f04600]
                shadow-lg
              "
            >
              {messages.length > 99
                ? "99+"
                : messages.length}
            </span>
          )}
        </div>
      </button>
    );
  }

  /* =========================================================
     CHAT PANEL

     IMPORTANT:
     This is FIXED and FLOATING.
     It does not reserve any width in the IDE layout.
  ========================================================= */

  return (
    <>
      {/* =====================================================
          BACKDROP

          Only visible on smaller screens.
      ===================================================== */}

      <div
        className="
          fixed
          inset-0
          z-[90]
          bg-black/30
          backdrop-blur-[1px]
          xl:hidden
        "
        onClick={() => setIsOpen(false)}
        aria-hidden="true"
      />

      {/* =====================================================
          CHAT WINDOW
      ===================================================== */}

      <div
        className={`
          fixed
          right-4
          top-[72px]
          bottom-4
          z-[100]
          flex
          flex-col
          overflow-hidden
          rounded-xl
          border
          border-[#27272a]
          bg-[#111111]/98
          shadow-2xl
          shadow-black/60
          backdrop-blur-xl
          transition-all
          duration-300

          ${
            isMinimized
              ? "h-12 w-12"
              : "w-[320px] xl:w-[360px]"
          }
        `}
      >
        {/* =====================================================
            TOP ACCENT
        ===================================================== */}

        <div
          className="
            pointer-events-none
            absolute
            left-0
            right-0
            top-0
            z-10
            h-px
            bg-gradient-to-r
            from-transparent
            via-[#fa8c00]/70
            to-transparent
          "
        />

        {/* =====================================================
            HEADER
        ===================================================== */}

        <div
          className="
            flex
            min-h-[48px]
            shrink-0
            items-center
            justify-between
            border-b
            border-[#27272a]
            bg-[#111111]
            px-3
          "
        >
          {!isMinimized ? (
            <>
              {/* =================================================
                  LEFT HEADER
              ================================================= */}

              <div className="flex items-center gap-2.5">
                <div
                  className="
                    flex
                    h-7
                    w-7
                    items-center
                    justify-center
                    rounded-md
                    border
                    border-[#3f3f46]
                    bg-[#1a1a1a]
                  "
                >
                  <MessageSquare
                    className="
                      h-3.5
                      w-3.5
                      text-[#fa8c00]
                    "
                  />
                </div>

                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <span
                      className="
                        text-xs
                        font-semibold
                        uppercase
                        tracking-wider
                        text-[#e4e4e7]
                      "
                    >
                      Team Chat
                    </span>

                    <Badge
                      variant="secondary"
                      className="
                        h-4
                        border-none
                        bg-[#f04600]/10
                        px-1.5
                        text-[9px]
                        text-[#fa8c00]
                      "
                    >
                      {messages.length}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span
                      className="
                        h-1.5
                        w-1.5
                        rounded-full
                        bg-green-500
                        shadow-[0_0_6px_rgba(34,197,94,0.5)]
                      "
                    />

                    <span
                      className="
                        text-[9px]
                        text-[#52525b]
                      "
                    >
                      Connected
                    </span>
                  </div>
                </div>
              </div>

              {/* =================================================
                  RIGHT HEADER
              ================================================= */}

              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    setIsMinimized(true)
                  }
                  aria-label="Minimize chat"
                  title="Minimize chat"
                  className="
                    h-7
                    w-7
                    text-[#71717a]
                    hover:bg-[#27272a]
                    hover:text-white
                  "
                >
                  <Minimize2 className="h-3.5 w-3.5" />
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsOpen(false)}
                  aria-label="Close chat"
                  title="Close chat"
                  className="
                    h-7
                    w-7
                    text-[#71717a]
                    hover:bg-[#27272a]
                    hover:text-white
                  "
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </>
          ) : (
            /* =================================================
               MINIMIZED HEADER
            ================================================= */

            <Button
              variant="ghost"
              size="icon"
              onClick={() =>
                setIsMinimized(false)
              }
              aria-label="Expand chat"
              title="Expand chat"
              className="
                mx-auto
                h-8
                w-8
                text-[#71717a]
                hover:bg-[#27272a]
                hover:text-white
              "
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>

        {/* =====================================================
            MINIMIZED CONTENT
        ===================================================== */}

        {isMinimized && (
          <div
            className="
              flex
              flex-1
              flex-col
              items-center
              pt-4
            "
          >
            <div className="relative">
              <MessageSquare
                className="
                  h-4
                  w-4
                  text-[#71717a]
                "
              />

              {messages.length > 0 && (
                <span
                  className="
                    absolute
                    -right-3
                    -top-3
                    flex
                    h-4
                    min-w-4
                    items-center
                    justify-center
                    rounded-full
                    bg-[#f04600]
                    px-1
                    text-[8px]
                    font-bold
                    text-white
                  "
                >
                  {messages.length > 9
                    ? "9+"
                    : messages.length}
                </span>
              )}
            </div>
          </div>
        )}

        {/* =====================================================
            FULL CHAT
        ===================================================== */}

        {!isMinimized && (
          <>
            {/* =================================================
                CHAT AREA
            ================================================= */}

            <ScrollArea
              ref={scrollRef}
              className="min-h-0 flex-1"
            >
              <div className="space-y-4 p-3">
                {/* =================================================
                    EMPTY STATE
                ================================================= */}

                {messages.length === 0 && (
                  <div
                    className="
                      flex
                      min-h-[300px]
                      h-full
                      flex-col
                      items-center
                      justify-center
                      px-6
                      text-center
                    "
                  >
                    <div
                      className="
                        mb-4
                        flex
                        h-12
                        w-12
                        items-center
                        justify-center
                        rounded-xl
                        border
                        border-[#3f3f46]
                        bg-[#1a1a1a]
                      "
                    >
                      <Sparkles
                        className="
                          h-5
                          w-5
                          text-[#fa8c00]
                        "
                      />
                    </div>

                    <h3
                      className="
                        mb-1
                        text-sm
                        font-semibold
                        text-[#e4e4e7]
                      "
                    >
                      Start collaborating
                    </h3>

                    <p
                      className="
                        max-w-[220px]
                        text-[11px]
                        leading-relaxed
                        text-[#52525b]
                      "
                    >
                      Send a message to your
                      teammates and collaborate
                      while building your project.
                    </p>

                    <div
                      className="
                        mt-4
                        flex
                        items-center
                        gap-1.5
                        text-[9px]
                        text-[#52525b]
                      "
                    >
                      <Users className="h-3 w-3" />

                      <span>
                        Room: {roomId}
                      </span>
                    </div>
                  </div>
                )}

                {/* =================================================
                    MESSAGES
                ================================================= */}

                {messages.map(
                  (
                    msg: Message,
                    index: number
                  ) => {
                    const isMe = msg.isMe;

                    return (
                      <div
                        key={msg.id}
                        className={`
                          flex
                          gap-2
                          animate-in
                          fade-in
                          slide-in-from-bottom-1
                          duration-200
                          ${
                            isMe
                              ? "flex-row-reverse"
                              : "flex-row"
                          }
                        `}
                        style={{
                          animationDelay: `${Math.min(
                            index * 20,
                            200
                          )}ms`,
                        }}
                      >
                        {/* =================================================
                            AVATAR
                        ================================================= */}

                        <Avatar
                          className={`
                            h-7
                            w-7
                            shrink-0
                            ${getAvatarColor(
                              isMe ? "You" : msg.user
                            )}
                          `}
                        >
                          <AvatarFallback
                            className="
                              bg-transparent
                              text-[10px]
                              font-bold
                              text-white
                            "
                          >
                            {getInitial(msg.user)}
                          </AvatarFallback>
                        </Avatar>

                        {/* =================================================
                            MESSAGE CONTENT
                        ================================================= */}

                        <div
                          className={`
                            flex
                            max-w-[78%]
                            flex-col
                            ${
                              isMe
                                ? "items-end"
                                : "items-start"
                            }
                          `}
                        >
                          {/* =================================================
                              META
                          ================================================= */}

                          <div
                            className={`
                              mb-1
                              flex
                              items-center
                              gap-1.5
                              ${
                                isMe
                                  ? "flex-row-reverse"
                                  : ""
                              }
                            `}
                          >
                            <span
                              className="
                                max-w-[140px]
                                truncate
                                text-[10px]
                                font-medium
                                text-[#a1a1aa]
                              "
                              title={
                                isMe
                                  ? userName
                                  : msg.user
                              }
                            >
                              {isMe
                                ? userName
                                : msg.user}
                            </span>

                            <span
                              className="
                                flex
                                items-center
                                gap-0.5
                                text-[9px]
                                text-[#52525b]
                              "
                            >
                              <Clock className="h-2.5 w-2.5" />

                              {formatTime(
                                msg.timestamp
                              )}
                            </span>
                          </div>

                          {/* =================================================
                              MESSAGE BUBBLE
                          ================================================= */}

                          <div
                            className={`
                              break-words
                              rounded-xl
                              px-3
                              py-2
                              text-xs
                              leading-relaxed
                              ${
                                isMe
                                  ? `
                                    rounded-tr-sm
                                    bg-gradient-to-br
                                    from-[#f04600]
                                    to-[#fa8c00]
                                    text-white
                                    shadow-lg
                                    shadow-orange-500/10
                                  `
                                  : `
                                    rounded-tl-sm
                                    border
                                    border-[#27272a]
                                    bg-[#1a1a1a]
                                    text-[#e4e4e7]
                                  `
                              }
                            `}
                          >
                            {msg.text}
                          </div>
                        </div>
                      </div>
                    );
                  }
                )}
              </div>
            </ScrollArea>

            {/* =================================================
                INPUT
            ================================================= */}

            <div
              className="
                shrink-0
                border-t
                border-[#27272a]
                bg-[#111111]
                p-3
              "
            >
              <div
                className={`
                  flex
                  items-center
                  gap-2
                  rounded-lg
                  border
                  bg-[#1a1a1a]
                  px-1
                  transition-all
                  duration-200
                  ${
                    isFocused
                      ? "border-[#f04600]/60 shadow-[0_0_0_2px_rgba(240,70,0,0.08)]"
                      : "border-[#27272a]"
                  }
                `}
              >
                <Input
                  ref={inputRef}
                  value={inputValue}
                  onChange={(event) =>
                    setInputValue(
                      event.target.value
                    )
                  }
                  onKeyDown={handleKeyDown}
                  onFocus={() =>
                    setIsFocused(true)
                  }
                  onBlur={() =>
                    setIsFocused(false)
                  }
                  placeholder="Message your team..."
                  className="
                    h-8
                    flex-1
                    border-0
                    bg-transparent
                    px-2
                    text-xs
                    text-white
                    shadow-none
                    outline-none
                    ring-0
                    placeholder:text-[#52525b]
                    focus-visible:ring-0
                  "
                />

                <Button
                  onClick={handleSend}
                  disabled={!inputValue.trim()}
                  size="icon"
                  aria-label="Send message"
                  title="Send message"
                  className="
                    h-7
                    w-7
                    shrink-0
                    rounded-md
                    bg-gradient-to-r
                    from-[#f04600]
                    to-[#fa8c00]
                    text-white
                    shadow-lg
                    shadow-orange-500/20
                    transition-all
                    duration-200
                    hover:from-[#d93d00]
                    hover:to-[#e67d00]
                    disabled:cursor-not-allowed
                    disabled:opacity-30
                  "
                >
                  <Send className="h-3.5 w-3.5" />
                </Button>
              </div>

              {/* =================================================
                  INPUT HINT
              ================================================= */}

              <div
                className="
                  mt-1.5
                  flex
                  items-center
                  justify-between
                  px-1
                  text-[9px]
                  text-[#3f3f46]
                "
              >
                <span>
                  Press Enter to send
                </span>

                <span
                  className="
                    flex
                    items-center
                    gap-1
                  "
                >
                  <Wifi
                    className="
                      h-2.5
                      w-2.5
                      text-green-500/70
                    "
                  />

                  Live
                </span>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}