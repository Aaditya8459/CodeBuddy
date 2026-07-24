import Background from "@/components/Background";
import Logo from "@/components/Logo";
import RoomCard from "@/components/RoomCard";

export default function Home() {
  return (
    <div className="relative min-h-screen flex flex-col bg-[#0a0a0a]">
      <Background />

      {/* Main Content */}
      <div className="relative z-10 flex flex-col min-h-screen">
        {/* Header */}
        <header className="flex items-center justify-between px-6 py-5 md:px-12">
          <div className="flex items-center gap-3 cursor-pointer hover:scale-[1.02] transition-transform">
            <div className="w-14 h-14 rounded-[14px] bg-gradient-to-br flex items-center justify-center shadow-lg shadow-orange-500/40 relative overflow-hidden">
              <div className="absolute inset-[1px] rounded-[12px] bg-gradient-to-br " />
              <div className="relative z-10">
                <Logo className="w-14 h-14" />
              </div>
            </div>
            <div className="flex flex-col">
              <span className="font-space text-2xl font-bold bg-gradient-to-r from-[#f04600] via-[#fa8c00] to-[#faa000] bg-clip-text text-transparent leading-tight">
                CODE BUDDY
              </span>
              <span className="text-[0.65rem] font-medium tracking-[3px] uppercase text-[#71717a]">
                Collaborative Code Editor
              </span>
            </div>
          </div>

          {/* Nav Links */}
          <nav className="hidden md:flex items-center gap-8">
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

        {/* Center Content */}
        <main className="flex-1 flex items-center justify-center px-6 py-12">
          <div className="w-full max-w-md">
            {/* Logo above card */}
            <div className="flex flex-col items-center mb-8">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br flex items-center justify-center shadow-xl shadow-orange-500/30 mb-4">
                <Logo className="w-20 h-20" />
              </div>
              <h1 className="font-space text-3xl md:text-4xl font-bold text-white text-center">
                Welcome to <span className="bg-gradient-to-r from-[#f04600] via-[#fa8c00] to-[#faa000] bg-clip-text text-transparent">Code Buddy</span>
              </h1>
              <p className="text-[#a1a1aa] text-center mt-2 max-w-sm">
                Create or join a room to start collaborating in real-time
              </p>
            </div>

            {/* Room Card */}
            <RoomCard />
          </div>
        </main>

        {/* Footer */}
        <footer className="px-6 py-5 md:px-12 border-t border-[#27272a] flex flex-col md:flex-row items-center justify-between gap-4">
          <span className="text-xs text-[#71717a]">
            © 2026 Code Buddy. All rights reserved.
          </span>
          <div className="flex items-center gap-6">
            {["Privacy", "Terms", "Support", "GitHub"].map((item) => (
              <a
                key={item}
                href="#"
                className="text-xs text-[#71717a] hover:text-[#fa8c00] transition-colors"
              >
                {item}
              </a>
            ))}
          </div>
        </footer>
      </div>
    </div>
  );
}
