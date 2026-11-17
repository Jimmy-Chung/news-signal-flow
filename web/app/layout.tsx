import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "实体雷达 · TrendRadar",
  description: "兴趣只负责过滤；具体实体、关系与事件时间线构成观察图谱。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
