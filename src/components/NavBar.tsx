"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Alerts } from "@/components/Alerts";
import { api } from "@/lib/browser";

type User = { name: string; role: "staff" | "admin" };

export function NavBar() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    api<{ user: User }>("/api/auth/me")
      .then((result) => setUser(result.user))
      .catch(() => setUser(null))
      .finally(() => setReady(true));
  }, []);

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    location.href = "/login";
  }

  return (
    <header className="top">
      <div className="shell top-row">
        <Link className="brand" href="/">사내 업무 도구</Link>
        <div>
          {ready && user ? (
            <>
              <Alerts />
              <span>{user.name} · {user.role === "admin" ? "관리자" : "직원"}</span>
              <button className="secondary" type="button" onClick={logout}>로그아웃</button>
            </>
          ) : ready ? (
            <Link className="header-login" href="/login">로그인</Link>
          ) : null}
        </div>
      </div>
      <div className="shell nav">
        {ready && user?.role === "admin" ? (
          <>
            <Link href="/helpdesk">IT helpdesk</Link>
            <Link href="/admin/rooms">회의실 관리</Link>
            <Link href="/admin/tickets">IT helpdesk 현황</Link>
            <Link href="/chat">챗봇</Link>
          </>
        ) : ready ? (
          <>
            <Link href="/rooms">회의실</Link>
            <Link href="/rooms/mine">내 예약</Link>
            <Link href="/helpdesk">IT helpdesk</Link>
            <Link href="/chat">챗봇</Link>
          </>
        ) : null}
      </div>
    </header>
  );
}
