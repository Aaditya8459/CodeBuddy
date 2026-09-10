"use client";

import React from "react";

export default function Background() {
  return (
    <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none bg-[#0a0a0a]">
      {/* Animated gradient */}
      <div
        className="absolute -top-1/2 -left-1/2 w-[200%] h-[200%] animate-float"
        style={{
          background: `
            radial-gradient(ellipse at 20% 80%, rgba(240, 70, 0, 0.1) 0%, transparent 50%),
            radial-gradient(ellipse at 80% 20%, rgba(250, 140, 0, 0.08) 0%, transparent 50%),
            radial-gradient(ellipse at 50% 50%, rgba(250, 160, 0, 0.06) 0%, transparent 60%)
          `
        }}
      />
      {/* Grid */}
      <div className="absolute inset-0 bg-grid" />
      {/* Orbs */}
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />
    </div>
  );
}
