"use client";

import Link from "next/link";
import Logo from "@/components/Logo";
import { Users, User, Wifi, WifiOff, Copy, Check, Share2, Sparkles } from "lucide-react";
import { useState, useEffect, useCallback } from "react";

interface HeaderProps {
  roomId?: string;
  userCount?: number;
  userName?: string;
  isOnline?: boolean;
}

/* ─── Animated Counter Hook ─── */
function useAnimatedNumber(target: number, duration = 600) {
  const [display, setDisplay] = useState(target);
  useEffect(() => {
    let start = display;
    const diff = target - start;
    if (diff === 0) return;
    const startTime = performance.now();
    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(start + diff * eased));
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [target]);
  return display;
}

export default function Header({ roomId, userCount = 1, userName, isOnline = true }: HeaderProps) {
  const [copied, setCopied] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [hoveredNav, setHoveredNav] = useState<string | null>(null);
  const animatedCount = useAnimatedNumber(userCount);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleCopyRoom = useCallback(() => {
    if (roomId) {
      navigator.clipboard.writeText(roomId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [roomId]);

  const navItems = ["Features", "Pricing", "Docs", "About"];

  return (
    <header
      className={`
        relative flex items-center justify-between px-4 py-3 md:px-6 
        border-b border-[#27272a]/60 bg-[#0a0a0a]/85 backdrop-blur-2xl z-50
        transition-all duration-700 ease-out
        ${mounted ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-4"}
      `}
    >
      {/* Ambient glow behind header */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-20 left-1/4 w-96 h-20 bg-[#f04600]/5 blur-3xl rounded-full animate-pulse" />
        <div className="absolute -top-20 right-1/4 w-64 h-16 bg-[#fa8c00]/5 blur-3xl rounded-full animate-pulse" style={{ animationDelay: "1s" }} />
      </div>

      {/* ─── Logo Section ─── */}
      <Link
        href="/"
        className={`
          relative flex items-center gap-3 cursor-pointer group
          transition-all duration-500 ease-out
          ${mounted ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-6"}
        `}
        style={{ transitionDelay: "100ms" }}
      >
        {/* Logo glow ring */}
        <div className="relative flex-shrink-0">
          <div className="absolute inset-0 bg-gradient-to-r from-[#f04600] to-[#fa8c00] rounded-xl blur-md opacity-0 group-hover:opacity-40 transition-opacity duration-500" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#f04600] to-[#fa8c00] rounded-xl blur-sm opacity-0 group-hover:opacity-60 transition-opacity duration-300" />
          <div className="relative shadow-lg shadow-orange-500/20 rounded-xl overflow-hidden ring-1 ring-white/5 group-hover:ring-orange-500/30 transition-all duration-300 group-hover:scale-105 group-hover:shadow-orange-500/40">
            <Logo className="w-9 h-9" />
          </div>
        </div>

        <div className="flex flex-col">
          <span className="font-space text-xl font-bold leading-tight relative">
            <span className="bg-gradient-to-r from-[#f04600] via-[#fa8c00] to-[#f04600] bg-[length:200%_auto] text-transparent bg-clip-text animate-shimmer">
              CODE BUDDY
            </span>
          </span>
          {!roomId && (
            <span
              className={`
                text-[0.6rem] font-medium tracking-[2px] uppercase text-[#71717a] hidden sm:block
                transition-all duration-500
                ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1"}
              `}
              style={{ transitionDelay: "200ms" }}
            >
              Collaborative Code Editor
            </span>
          )}
        </div>
      </Link>

      {/* ─── Room Info Section ─── */}
      {roomId && (
        <div
          className={`
            flex items-center gap-3
            transition-all duration-500 ease-out
            ${mounted ? "opacity-100 scale-100" : "opacity-0 scale-95"}
          `}
          style={{ transitionDelay: "200ms" }}
        >
          {/* Connection Status */}
          <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 bg-[#1a1a1a]/80 rounded-lg border border-[#27272a]/60 backdrop-blur-sm">
            <div className="relative">
              <div className={`w-2 h-2 rounded-full ${isOnline ? "bg-[#22c55e]" : "bg-[#ef4444]"}`} />
              {isOnline && (
                <div className="absolute inset-0 w-2 h-2 rounded-full bg-[#22c55e] animate-ping opacity-40" />
              )}
            </div>
            <span className={`text-[11px] font-medium ${isOnline ? "text-[#22c55e]" : "text-[#ef4444]"}`}>
              {isOnline ? "Live" : "Offline"}
            </span>
          </div>

          {/* User Badge */}
          {userName && (
            <div
              className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-[#1a1a1a]/80 rounded-lg border border-[#27272a]/60 backdrop-blur-sm
              hover:border-[#fa8c00]/30 hover:bg-[#1a1a1a] transition-all duration-300 group/user
            "
            >
              <div className="relative">
                <User className="w-3.5 h-3.5 text-[#fa8c00] transition-transform duration-300 group-hover/user:scale-110" />
                <div className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-[#22c55e] rounded-full border border-[#1a1a1a]" />
              </div>
              <span className="text-sm font-medium text-white">{userName}</span>
            </div>
          )}

          {/* Room ID Badge */}
          <button
            onClick={handleCopyRoom}
            className="flex items-center gap-2 px-3 py-1.5 bg-[#1a1a1a]/80 rounded-lg border border-[#27272a]/60 backdrop-blur-sm
              hover:border-[#fa8c00]/40 hover:bg-[#1a1a1a] hover:shadow-lg hover:shadow-orange-500/10
              active:scale-95 transition-all duration-200 group/room cursor-pointer"
          >
            <span className="text-[10px] text-[#71717a] uppercase tracking-wider font-medium">Room</span>
            <span className="text-sm font-mono font-bold text-[#fa8c00] group-hover/room:text-[#ffb347] transition-colors">
              {roomId}
            </span>
            <div className="w-px h-3 bg-[#27272a] mx-0.5" />
            {copied ? (
              <Check className="w-3 h-3 text-[#22c55e] animate-bounce" />
            ) : (
              <Copy className="w-3 h-3 text-[#71717a] group-hover/room:text-[#fa8c00] transition-colors" />
            )}
          </button>

          {/* User Count Badge */}
          <div
            className="flex items-center gap-2 px-3 py-1.5 bg-[#1a1a1a]/80 rounded-lg border border-[#27272a]/60 backdrop-blur-sm
              hover:border-[#fa8c00]/30 transition-all duration-300 group/count"
          >
            <Users className="w-3.5 h-3.5 text-[#fa8c00] transition-transform duration-300 group-hover/count:scale-110" />
            <span
              className="text-sm font-medium text-white tabular-nums"
              key={animatedCount}
            >
              {animatedCount}
            </span>
          </div>

          {/* Share Button */}
          <button
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white
              bg-gradient-to-r from-[#f04600] to-[#fa8c00] hover:from-[#d93d00] hover:to-[#e67d00]
              shadow-lg shadow-orange-500/20 hover:shadow-orange-500/40
              active:scale-95 transition-all duration-200 group/share"
          >
            <Share2 className="w-3 h-3 transition-transform duration-300 group-hover/share:rotate-12" />
            <span>Share</span>
          </button>
        </div>
      )}

      {/* ─── Navigation ─── */}
      {!roomId && (
        <nav className="hidden md:flex items-center gap-1">
          {navItems.map((item, index) => (
            <a
              key={item}
              href="#"
              onMouseEnter={() => setHoveredNav(item)}
              onMouseLeave={() => setHoveredNav(null)}
              className={`
                relative px-3 py-1.5 text-sm font-medium transition-all duration-300 rounded-lg
                ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}
                ${hoveredNav === item ? "text-white" : "text-[#a1a1aa]"}
                hover:text-white hover:bg-white/5
              `}
              style={{ transitionDelay: `${300 + index * 80}ms` }}
            >
              {item}
              {/* Animated underline */}
              <span
                className={`
                  absolute bottom-0 left-1/2 -translate-x-1/2 h-0.5 rounded-full
                  bg-gradient-to-r from-[#f04600] to-[#fa8c00]
                  transition-all duration-300 ease-out
                  ${hoveredNav === item ? "w-3/4 opacity-100" : "w-0 opacity-0"}
                `}
              />
              {/* Glow dot on hover */}
              <span
                className={`
                  absolute -top-0.5 right-1 w-1 h-1 rounded-full bg-[#fa8c00]
                  transition-all duration-300
                  ${hoveredNav === item ? "opacity-100 scale-100" : "opacity-0 scale-0"}
                `}
              />
            </a>
          ))}

          {/* CTA Button */}
          <a
            href="#"
            className={`
              ml-4 relative overflow-hidden px-5 py-2 rounded-lg text-sm font-semibold text-white
              bg-gradient-to-r from-[#f04600] to-[#fa8c00]
              shadow-lg shadow-orange-500/20 hover:shadow-orange-500/40
              hover:scale-105 active:scale-95
              transition-all duration-300 group/cta
              ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}
            `}
            style={{ transitionDelay: "620ms" }}
          >
            <span className="relative z-10 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 transition-transform duration-300 group-hover/cta:rotate-12" />
              Get Started
            </span>
            {/* Shimmer effect */}
            <div className="absolute inset-0 -translate-x-full group-hover/cta:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          </a>
        </nav>
      )}

      {/* Mobile menu indicator (subtle) */}
      <div className="md:hidden flex flex-col gap-1 cursor-pointer group p-2">
        <span className="w-5 h-0.5 bg-[#a1a1aa] rounded-full group-hover:bg-white transition-all duration-300 group-hover:w-4" />
        <span className="w-5 h-0.5 bg-[#a1a1aa] rounded-full group-hover:bg-white transition-all duration-300" />
        <span className="w-5 h-0.5 bg-[#a1a1aa] rounded-full group-hover:bg-white transition-all duration-300 group-hover:w-3" />
      </div>
    </header>
  );
}