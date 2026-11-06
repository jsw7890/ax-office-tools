"use client";

import { useState } from "react";
import { api } from "@/lib/browser";

export default function LoginPage() {
  const [email, setEmail] = useState("staff@example.com");
  const [error, setError] = useState("");

  async function enter(nextEmail: string) {
    setError("");
    try {
      const result = await api<{ user: { role: string } }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: nextEmail }),
      });
      location.href = result.user.role === "admin" ? "/admin/tickets" : "/rooms";
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "들어가지 못했습니다.");
    }
  }

  return (
    <section className="panel form">
      <h1>로그인</h1>
      <p className="notice">연습용이라 비밀번호는 없습니다. 아래 두 샘플 중 하나로만 들어갈 수 있습니다.</p>
      <div className="row-actions">
        <button type="button" onClick={() => enter("staff@example.com")}>직원 김민지로 로그인</button>
        <button type="button" className="secondary" onClick={() => enter("admin@example.com")}>관리자 박관리로 로그인</button>
      </div>
      <form
        className="form"
        onSubmit={(event) => {
          event.preventDefault();
          void enter(email);
        }}
      >
        <label>
          샘플 이메일
          <input value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" />
        </label>
        <button type="submit">이메일로 로그인</button>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}
