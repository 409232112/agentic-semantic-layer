import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { readConfig } from "@/lib/config";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Federated Semantic Gateway | 数据联邦与语义网关",
  description: "无头数据语义层与多源数据库联邦查询平台控制台",
};

// 在服务启动时，自动初始化本地 JSON 配置与演示数据
try {
  readConfig();
} catch (err) {
  console.error("Failed to initialize configuration file:", err);
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-slate-950 text-slate-100 selection:bg-emerald-500/30 selection:text-emerald-400">
        {children}
      </body>
    </html>
  );
}
