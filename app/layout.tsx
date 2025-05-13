import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "StudyFellow | AIで受験勉強の新たな境地へ",
  description: "",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <nav className="bg-white dark:bg-gray-800 shadow-sm mb-4">
          <div className="container mx-auto px-6 py-3 flex gap-6">
            <Link href="/" className="font-semibold text-blue-600 dark:text-blue-400 hover:underline">ホーム</Link>
            <Link href="/library" className="font-semibold text-blue-600 dark:text-blue-400 hover:underline">ライブラリ</Link>
            <Link href="/post" className="font-semibold text-blue-600 dark:text-blue-400 hover:underline">投稿</Link>
            <Link href="/report" className="font-semibold text-blue-600 dark:text-blue-400 hover:underline">レポート</Link>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
