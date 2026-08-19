import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "监理招标信息雷达",
  description: "面向建筑监理公司投标经理的招标信息工作台",
  openGraph: {
    title: "监理招标信息雷达",
    description: "发现项目 · 看清截止 · 及时提醒",
    type: "website",
    images: [{ url: "/og.png", width: 1733, height: 908, alt: "监理招标信息雷达" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "监理招标信息雷达",
    description: "发现项目 · 看清截止 · 及时提醒",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
