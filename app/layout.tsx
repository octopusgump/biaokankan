import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "标看看｜监理标讯助手",
  description: "帮监理企业更早发现值得跟进的标讯。每天巡检 7 个已接入来源，整理真实项目、截止时间和原公告入口。",
  icons: {
    icon: "/favicon.svg",
  },
  openGraph: {
    title: "标看看｜监理标讯助手",
    description: "帮监理企业更早发现值得跟进的标讯。",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "标看看｜监理标讯助手",
    description: "帮监理企业更早发现值得跟进的标讯。",
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
