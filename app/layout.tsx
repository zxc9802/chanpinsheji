import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { DesignBriefProvider } from "@/components/design-brief-provider";
import "./globals.css";
import "./logo.css";
import "./copy.css";
import "./product.css";
import "./structure-selector.css";
import "./product-quality.css";
import "./product-prompt-workflow.css";
import "./product-copy-layout.css";
import "./product-diversity.css";
import "./packaging.css";
import "./delivery.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PackPilot · 包装设计智能体",
  description: "从品牌定位到质检交付的一站式包装设计工作流。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <DesignBriefProvider>{children}</DesignBriefProvider>
      </body>
    </html>
  );
}
