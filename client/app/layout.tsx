import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Code Buddy - Collaborative Code Editor",
  description:
    "Real-time collaborative code editing. Create or join a room in seconds.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark min-h-screen">
      <body className="antialiased min-h-screen w-full bg-[#0a0a0a] text-white overflow-auto">
        {children}
      </body>
    </html>
  );
}