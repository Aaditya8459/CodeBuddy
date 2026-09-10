export default function Footer() {
  return (
    <footer className="px-4 py-3 md:px-6 border-t border-[#27272a] flex flex-col md:flex-row items-center justify-between gap-3 bg-[#0a0a0a]/80 backdrop-blur-xl z-50">
      <span className="text-xs text-[#71717a]">
        © 2026 Code Buddy. All rights reserved.
      </span>
      <div className="flex items-center gap-5">
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
  );
}