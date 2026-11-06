"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/browser";

export default function HomePage() {
  const [session, setSession] = useState<"unknown" | "in" | "out">("unknown");

  useEffect(() => {
    api("/api/auth/me")
      .then(() => setSession("in"))
      .catch(() => setSession("out"));
  }, []);

  return (
    <div className="grid">
      <section className="panel">
        <h1>직원용 샘플 도구</h1>
        <p>회의실 예약, IT helpdesk, 규정 질문 세 가지를 한 화면에서 연습할 수 있습니다. 데이터는 가짜이며 실제 회사 정보가 아닙니다.</p>
        {session === "out" && <p><Link className="button" href="/login">샘플 계정으로 들어가기</Link></p>}
      </section>
      <section className="grid cards">
        <article className="card">
          <h2>회의실</h2>
          <p>날짜를 고르고 빈 시간을 눌러 예약합니다. 같은 시간에 두 건이 겹치면 한 건만 저장됩니다.</p>
          <Link href="/rooms">시간표 보기</Link>
        </article>
        <article className="card">
          <h2>IT helpdesk</h2>
          <p>컴퓨터, 계정, 프린터 문제를 접수합니다. 상태는 접수에서 처리중, 완료로만 이동합니다.</p>
          <Link href="/helpdesk">내 문의</Link>
        </article>
        <article className="card">
          <h2>규정 챗봇</h2>
          <p>공개된 근로기준법 조문을 찾아 보여 줍니다. 조문에 없으면 지어내지 않고, 외부 AI는 호출하지 않습니다.</p>
          <Link href="/chat">질문하기</Link>
        </article>
      </section>
    </div>
  );
}
