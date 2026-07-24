import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Code Buddy - Collaborative Code Editor",
  description: "Real-time collaborative code editing. Create or join a room in seconds.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
