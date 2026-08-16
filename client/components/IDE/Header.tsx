"use client";

import Link from "next/link";
import Logo from "@/components/Logo";
import {
  Users,
  User,
  Copy,
  Check,
  Share2,
  Sparkles,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";

interface RoomClient {
  id: string;
  name: string;
  isOnline?: boolean;
}

interface HeaderProps {
  roomId?: string;
  userName?: string;
  userCount?: number;
  clients?: RoomClient[];
  isOnline?: boolean;
  onShare?: () => void;
}

/* ─────────────────────────────────────────────
   Animated Number
───────────────────────────────────────────── */

function useAnimatedNumber(target: number, duration = 500) {
  const [display, setDisplay] = useState(target);

  useEffect(() => {
    const start = display;
    const difference = target - start;

    if (difference === 0) return;

    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      const eased = 1 - Math.pow(1 - progress, 3);

      setDisplay(Math.round(start + difference * eased));

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, [target]);

  return display;
}

/* ─────────────────────────────────────────────
   Header
───────────────────────────────────────────── */

export default function Header({
  roomId,
  userName = "You",
  userCount = 1,
  clients = [],
  isOnline = true,
  onShare,
}: HeaderProps) {
  const [copied, setCopied] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [hoveredNav, setHoveredNav] = useState<string | null>(null);

  const animatedCount = useAnimatedNumber(userCount);

  useEffect(() => {
    setMounted(true);
  }, []);

  /* ─────────────────────────────────────────
     Copy Room ID
  ───────────────────────────────────────── */

  const handleCopyRoom = useCallback(async () => {
    if (!roomId) return;

    try {
      await navigator.clipboard.writeText(roomId);

      setCopied(true);

      setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch (error) {
      console.error("Failed to copy room ID:", error);
    }
  }, [roomId]);

  /* ─────────────────────────────────────────
     Share Room
  ───────────────────────────────────────── */

  const handleShare = useCallback(async () => {
    if (!roomId) return;

    const shareUrl = `${window.location.origin}/room/${roomId}`;

    try {
      if (navigator.share) {
        await navigator.share({
          title: "Code Buddy Room",
          text: `Join my Code Buddy room: ${roomId}`,
          url: shareUrl,
        });
      } else {
        await navigator.clipboard.writeText(shareUrl);
      }

      onShare?.();
    } catch {
      // User cancelled native share dialog.
    }
  }, [roomId, onShare]);

  const navItems = ["Features", "Pricing", "Docs", "About"];

  return (
    <header
      className={`
        relative h-[58px]
        flex items-center justify-between
        px-4 md:px-6
        border-b border-[#27272a]/70
        bg-[#090909]/90 backdrop-blur-2xl
        z-50
        transition-all duration-700
        ${mounted ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-3"}
      `}
    >
      {/* ─────────────────────────────────────
          Ambient Background
      ───────────────────────────────────── */}

      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div
          className="
            absolute -top-20 left-[15%]
            w-72 h-20
            bg-[#f04600]/5
            blur-3xl rounded-full
          "
        />

        <div
          className="
            absolute -top-20 right-[20%]
            w-64 h-20
            bg-[#fa8c00]/5
            blur-3xl rounded-full
          "
        />
      </div>

      {/* ─────────────────────────────────────
          LEFT — LOGO
      ───────────────────────────────────── */}

      <Link
        href="/"
        className="
          relative z-10
          flex items-center gap-3
          group
          flex-shrink-0
        "
      >
        <div className="relative">
          {/* Glow */}
          <div
            className="
              absolute inset-0
              bg-gradient-to-r from-[#f04600] to-[#fa8c00]
              rounded-xl blur-md
              opacity-0
              group-hover:opacity-40
              transition-opacity duration-500
            "
          />

          <div
            className="
              relative
              rounded-xl
              overflow-hidden
              ring-1 ring-white/5
              shadow-lg shadow-orange-500/20
              group-hover:ring-orange-500/30
              group-hover:scale-105
              transition-all duration-300
            "
          >
            <Logo className="w-9 h-9" />
          </div>
        </div>

        <div className="hidden sm:flex flex-col">
          <span className="font-space text-lg font-bold leading-none">
            <span
              className="
                bg-gradient-to-r
                from-[#f04600]
                via-[#fa8c00]
                to-[#f04600]
                bg-[length:200%_auto]
                text-transparent
                bg-clip-text
                animate-shimmer
              "
            >
              CODE BUDDY
            </span>
          </span>

          {!roomId && (
            <span
              className="
                text-[9px]
                tracking-[2px]
                uppercase
                text-[#52525b]
                mt-1
              "
            >
              Collaborative Code Editor
            </span>
          )}
        </div>
      </Link>

      {/* ─────────────────────────────────────
          CENTER — ROOM INFORMATION
      ───────────────────────────────────── */}

      {roomId && (
        <div
          className={`
            absolute
            left-1/2
            -translate-x-1/2
            hidden lg:flex
            items-center
            gap-2
            transition-all duration-500
            ${
              mounted
                ? "opacity-100 scale-100"
                : "opacity-0 scale-95"
            }
          `}
        >
          {/* Live status */}

          <div
            className="
              flex items-center gap-2
              px-2.5 py-1.5
              rounded-lg
              bg-[#111111]
              border border-[#27272a]
            "
          >
            <div className="relative">
              <span
                className={`
                  block
                  w-1.5 h-1.5
                  rounded-full
                  ${
                    isOnline
                      ? "bg-[#22c55e]"
                      : "bg-[#ef4444]"
                  }
                `}
              />

              {isOnline && (
                <span
                  className="
                    absolute inset-0
                    w-1.5 h-1.5
                    rounded-full
                    bg-[#22c55e]
                    animate-ping
                    opacity-40
                  "
                />
              )}
            </div>

            <span
              className={`
                text-[10px]
                font-semibold
                uppercase
                tracking-wider
                ${
                  isOnline
                    ? "text-[#22c55e]"
                    : "text-[#ef4444]"
                }
              `}
            >
              {isOnline ? "Live" : "Offline"}
            </span>
          </div>

          <div className="w-px h-5 bg-[#27272a]" />

          {/* Current User */}

          <div
            className="
              flex items-center gap-2
              px-2.5 py-1.5
              rounded-lg
              bg-[#111111]
              border border-[#27272a]
            "
          >
            <div className="relative">
              <User className="w-3.5 h-3.5 text-[#fa8c00]" />

              <span
                className="
                  absolute
                  -top-1
                  -right-1
                  w-1.5 h-1.5
                  rounded-full
                  bg-[#22c55e]
                  border border-[#111111]
                "
              />
            </div>

            <span className="text-xs font-medium text-white max-w-[100px] truncate">
              {userName}
            </span>
          </div>

          <div className="w-px h-5 bg-[#27272a]" />

          {/* Room */}

          <button
            onClick={handleCopyRoom}
            title="Copy room ID"
            className="
              group/room
              flex items-center gap-2
              px-2.5 py-1.5
              rounded-lg
              bg-[#111111]
              border border-[#27272a]
              hover:border-[#fa8c00]/40
              hover:bg-[#151515]
              transition-all duration-200
            "
          >
            <span
              className="
                text-[9px]
                uppercase
                tracking-wider
                text-[#52525b]
                font-medium
              "
            >
              Room
            </span>

            <span
              className="
                text-xs
                font-mono
                font-bold
                text-[#fa8c00]
                group-hover/room:text-[#ffb347]
              "
            >
              {roomId}
            </span>

            {copied ? (
              <Check className="w-3 h-3 text-[#22c55e]" />
            ) : (
              <Copy
                className="
                  w-3 h-3
                  text-[#52525b]
                  group-hover/room:text-[#fa8c00]
                "
              />
            )}
          </button>

          {/* Client Count */}

          <div
            className="
              flex items-center gap-2
              px-2.5 py-1.5
              rounded-lg
              bg-[#111111]
              border border-[#27272a]
              hover:border-[#fa8c00]/30
              transition-all
            "
          >
            <Users className="w-3.5 h-3.5 text-[#fa8c00]" />

            <span className="text-xs font-semibold text-white tabular-nums">
              {animatedCount}
            </span>

            <span className="text-[9px] text-[#52525b] uppercase tracking-wide">
              {animatedCount === 1 ? "client" : "clients"}
            </span>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────
          RIGHT
      ───────────────────────────────────── */}

      {roomId ? (
        <div className="relative z-10 flex items-center gap-2 ml-auto">
          {/* Mobile live indicator */}

          <div
            className="
              lg:hidden
              flex items-center gap-1.5
              px-2 py-1.5
              rounded-lg
              bg-[#111111]
              border border-[#27272a]
            "
          >
            <span
              className={`
                w-1.5 h-1.5 rounded-full
                ${
                  isOnline
                    ? "bg-[#22c55e]"
                    : "bg-[#ef4444]"
                }
              `}
            />

            <span className="text-[10px] text-[#a1a1aa]">
              {animatedCount}
            </span>
          </div>

          {/* Share */}

          <button
            onClick={handleShare}
            className="
              hidden sm:flex
              items-center gap-1.5
              px-3 py-1.5
              rounded-lg
              text-xs
              font-semibold
              text-white
              bg-gradient-to-r
              from-[#f04600]
              to-[#fa8c00]
              hover:from-[#d93d00]
              hover:to-[#e67d00]
              shadow-lg
              shadow-orange-500/20
              hover:shadow-orange-500/40
              active:scale-95
              transition-all duration-200
              group/share
            "
          >
            <Share2
              className="
                w-3 h-3
                transition-transform duration-300
                group-hover/share:rotate-12
              "
            />

            <span>Share</span>
          </button>
        </div>
      ) : (
        /* ─────────────────────────────────────
           LANDING PAGE NAV
        ───────────────────────────────────── */

        <nav className="relative z-10 hidden md:flex items-center gap-1">
          {navItems.map((item, index) => (
            <a
              key={item}
              href={`#${item.toLowerCase()}`}
              onMouseEnter={() => setHoveredNav(item)}
              onMouseLeave={() => setHoveredNav(null)}
              className={`
                relative
                px-3 py-1.5
                rounded-lg
                text-sm
                font-medium
                transition-all duration-300
                ${
                  hoveredNav === item
                    ? "text-white bg-white/5"
                    : "text-[#a1a1aa]"
                }
                ${
                  mounted
                    ? "opacity-100 translate-y-0"
                    : "opacity-0 translate-y-2"
                }
              `}
              style={{
                transitionDelay: `${300 + index * 80}ms`,
              }}
            >
              {item}

              <span
                className={`
                  absolute
                  bottom-0
                  left-1/2
                  -translate-x-1/2
                  h-0.5
                  rounded-full
                  bg-gradient-to-r
                  from-[#f04600]
                  to-[#fa8c00]
                  transition-all duration-300
                  ${
                    hoveredNav === item
                      ? "w-3/4 opacity-100"
                      : "w-0 opacity-0"
                  }
                `}
              />
            </a>
          ))}

          <Link
            href="/room"
            className="
              ml-4
              relative
              overflow-hidden
              flex items-center gap-1.5
              px-5 py-2
              rounded-lg
              text-sm
              font-semibold
              text-white
              bg-gradient-to-r
              from-[#f04600]
              to-[#fa8c00]
              shadow-lg
              shadow-orange-500/20
              hover:shadow-orange-500/40
              hover:scale-105
              active:scale-95
              transition-all duration-300
              group/cta
            "
          >
            <Sparkles
              className="
                w-3.5 h-3.5
                transition-transform duration-300
                group-hover/cta:rotate-12
              "
            />

            <span>Get Started</span>

            <div
              className="
                absolute inset-0
                -translate-x-full
                group-hover/cta:translate-x-full
                transition-transform duration-700
                bg-gradient-to-r
                from-transparent
                via-white/20
                to-transparent
              "
            />
          </Link>
        </nav>
      )}

      {/* ─────────────────────────────────────
          MOBILE MENU
      ───────────────────────────────────── */}

      {!roomId && (
        <button
          className="
            relative z-10
            md:hidden
            flex flex-col
            gap-1
            p-2
            group
          "
        >
          <span className="w-5 h-0.5 bg-[#a1a1aa] rounded-full group-hover:bg-white transition-all" />
          <span className="w-5 h-0.5 bg-[#a1a1aa] rounded-full group-hover:bg-white transition-all" />
          <span className="w-3 h-0.5 bg-[#a1a1aa] rounded-full group-hover:bg-white transition-all" />
        </button>
      )}
    </header>
  );
}