import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "热点观测台 · News Signal Flow",
  description: "兴趣只负责过滤；具体节点、关联与进展时间线构成观测图谱。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
