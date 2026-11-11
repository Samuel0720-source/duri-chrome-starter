import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Jua } from "next/font/google";
import "./globals.css";

// Rounded Korean display face for headings and the big day count.
const jua = Jua({ weight: "400", subsets: ["latin"], preload: false, display: "swap", variable: "--font-jua" });

export const metadata: Metadata = {
  title: "둘이 | 우리 기념일",
  description: "두 사람이 함께하는 날을 세어요.",
  icons: { apple: "/icons/apple-touch.png" },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#6e304b",
};
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" className={jua.variable}>
      <body>{children}</body>
    </html>
  );
}
