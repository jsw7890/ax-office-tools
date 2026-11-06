"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/browser";
import { DISCLAIMER } from "@/lib/labels";

type Citation = { docTitle: string; articleNo: string; heading: string; baseDate: string; sourceUrl: string };
type Result = { answer: string; citations: Citation[]; suggestHelpdesk: boolean };

export default function ChatPage() {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const answer = await api<Result>("/api/chat", { method: "POST", body: JSON.stringify({ question }) });
      setResult(answer);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "답하지 못했습니다.");
    }
  }

  return (
    <div className="grid">
      <section className="panel">
        <h1>규정 챗봇</h1>
        <p className="notice">{DISCLAIMER}</p>
        <p className="notice">향후 LLM 추가를 통해 답변 방식 개선 예정</p>
        <p className="muted">질문은 한 번에 하나씩 답합니다. 이전 대화는 기억하지 않습니다. 외부 AI는 호출하지 않고, 저장된 법령 조문만 보여 줍니다. 하루 20회까지 물을 수 있습니다.</p>
        <form className="form" onSubmit={submit}>
          <label>질문<textarea value={question} onChange={(event) => setQuestion(event.target.value)} required maxLength={500} rows={4} /></label>
          <button type="submit">답변 보기</button>
        </form>
        {error && <p className="error" role="alert">{error}</p>}
      </section>
      {result && (
        <section className="panel">
          <h2>답변</h2>
          <p className="answer">{result.answer}</p>
          {result.citations.length > 0 && (
            <ul>
              {result.citations.map((citation) => (
                <li key={`${citation.articleNo}-${citation.baseDate}`}>
                  {citation.docTitle} {citation.articleNo} {citation.heading} · 기준일 {citation.baseDate} · {citation.sourceUrl}
                </li>
              ))}
            </ul>
          )}
          {result.suggestHelpdesk && <p><Link href="/helpdesk/new">헬프데스크에 문의하기</Link></p>}
        </section>
      )}
    </div>
  );
}
