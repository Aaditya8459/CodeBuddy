"use client";

import React from "react";

export default function Logo({ className = "w-14 h-14" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        {/* Correct Orange Gradient for the Tile */}
        <linearGradient id="cb-tile" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f77d0a" />
          <stop offset="100%" stopColor="#d94f10" />
        </linearGradient>

        {/* Correct Creamy Wing Gradient (Left) */}
        <linearGradient id="cb-wing-l" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fffaee" />
          <stop offset="100%" stopColor="#ffebd6" />
        </linearGradient>

        {/* Correct Creamy Wing Gradient (Right) */}
        <linearGradient id="cb-wing-r" x1="100%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#fffaee" />
          <stop offset="100%" stopColor="#ffebd6" />
        </linearGradient>
      </defs>

      {/* Main App-Icon Squircle Tile */}
      <rect x="10" y="10" width="80" height="80" rx="24" fill="url(#cb-tile)" />

      {/* Unified Left Wing */}
      <path
        d="M 53 35
           C 40 33, 26 35, 25 45
           C 24 53, 31 56, 35 56
           C 32 62, 28 66, 33 71
           C 38 75, 48 72, 53 62
           Z"
        fill="url(#cb-wing-l)"
        fillOpacity="0.88"
      />

      {/* Unified Right Wing (Mirrored) */}
      <path
        d="M 47 35
           C 60 33, 74 35, 75 45
           C 76 53, 69 56, 65 56
           C 68 62, 72 66, 67 71
           C 62 75, 52 72, 47 62
           Z"
        fill="url(#cb-wing-r)"
        fillOpacity="0.88"
      />
    </svg>
  );
}