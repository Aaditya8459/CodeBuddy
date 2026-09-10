"use client";

import Link from "next/link";
import Logo from "./Logo";
import { Users, User } from "lucide-react";

interface HeaderProps {
  roomId?: string;
  userCount?: number;
  userName?: string;
}

export default function Header({ roomId, userCount, userName }: HeaderProps) {
  return (
    <header className="flex items-center justify-between px-4 py-3 md:px-6 border-b border-[#27272a] bg-[#0a0a0a]/80 backdrop-blur-xl z-50">
      <Link href="/" className="flex items-center gap-3 cursor-pointer hover:scale-[1.02] transition-transform">
        <div className="flex-shrink-0 shadow-lg shadow-orange-500/20 rounded-xl overflow-hidden">
          <Logo className="w-9 h-9" />
        </div>
        <div className="flex flex-col">
          <span className="font-space text-xl font-bold gradient-text leading-tight">
            CODE BUDDY
          </span>
          {!roomId && (
            <span className="text-[0.6rem] font-medium tracking-[2px] uppercase text-[#71717a] hidden sm:block">
              Collaborative Code Editor
            </span>
          )}
        </div>
      </Link>

      {roomId && (
        <div className="flex items-center gap-3">
          {userName && (
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-[#1a1a1a] rounded-lg border border-[#27272a]">
              <User className="w-3.5 h-3.5 text-[#fa8c00]" />
              <span className="text-sm font-medium text-white">{userName}</span>
            </div>
          )}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-[#1a1a1a] rounded-lg border border-[#27272a]">
            <span className="text-xs text-[#71717a] uppercase tracking-wider">Room</span>
            <span className="text-sm font-mono font-bold text-[#fa8c00]">{roomId}</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-[#1a1a1a] rounded-lg border border-[#27272a]">
            <Users className="w-3.5 h-3.5 text-[#fa8c00]" />
            <span className="text-sm font-medium text-white">{userCount || 1}</span>
          </div>
        </div>
      )}

      <nav className="hidden md:flex items-center gap-6">
        {["Features", "Pricing", "Docs", "About"].map((item) => (
          <a
            key={item}
            href="#"
            className="relative text-sm font-medium text-[#a1a1aa] hover:text-white transition-colors group"
          >
            {item}
            <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-gradient-to-r from-[#f04600] to-[#faa000] rounded-full transition-all group-hover:w-full" />
          </a>
        ))}
      </nav>
    </header>
  );
}