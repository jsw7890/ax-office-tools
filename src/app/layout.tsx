import type { Metadata } from "next";
import { NavBar } from "@/components/NavBar";
import "./globals.css";

export const metadata: Metadata = {
  title: "사내 업무 도구",
  description: "회의실 예약, 헬프데스크, 규정 챗봇 샘플",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <NavBar />
        <main className="shell">{children}</main>
      </body>
    </html>
  );
}
