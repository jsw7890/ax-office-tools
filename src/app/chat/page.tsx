"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/browser";
import { DISCLAIMER } from "@/lib/labels";

type Citation = { docTitle: string; articleNo: string; heading: string; baseDate: string; sourceUrl: string };
type LlmStatus = { available: boolean; used?: boolean; model: string; mode: "local_llm" | "article_search"; detail: string };
type Result = { answer: string; citations: Citation[]; suggestHelpdesk: boolean; llm: LlmStatus };
type Turn = { question: string; result: Result };

export default function ChatPage() {
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<LlmStatus | null>(null);

  useEffect(() => {
    api<LlmStatus>("/api/chat/status")
      .then(setStatus)
      .catch(() =>
        setStatus({
          available: false,
          model: "",
          mode: "article_search",
          detail: "로컬 LLM 꺼짐 · 회의실·IT는 규칙으로, 규정은 조문 검색으로 답합니다.",
        }),
      );
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const result = await api<Result>("/api/chat", { method: "POST", body: JSON.stringify({ question }) });
      setTurns((prev) => [...prev, { question, result }]);
      setStatus(result.llm);
      setQuestion("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "답하지 못했습니다.");
    }
  }

  const notice = status?.detail ?? "로컬 LLM 상태를 확인하는 중입니다.";

  return (
    <div className="grid">
      <section className="panel">
        <h1>업무 챗봇</h1>
        <p className="notice">{DISCLAIMER}</p>
        <p className="notice">{notice}</p>
        <p className="muted">예: 오늘 2시 빈 회의실 예약해줘 인원은 4명이야. 회의실 이름 없이 빈 방을 잡습니다. 내역·10분 전 알림, IT 문의도 됩니다. 유료 AI는 쓰지 않습니다. 하루 20회까지입니다.</p>
        <form className="form" onSubmit={submit}>
          <label>질문<textarea value={question} onChange={(event) => setQuestion(event.target.value)} required maxLength={500} rows={4} /></label>
          <button type="submit">보내기</button>
        </form>
        {error && <p className="error" role="alert">{error}</p>}
      </section>
      {turns.map((turn, index) => (
        <section className="panel" key={`${turn.question}-${index}`}>
          <h2>질문</h2>
          <p>{turn.question}</p>
          <h2>답변</h2>
          <p className="muted">{turn.result.llm.used ? `로컬 LLM 사용 (${turn.result.llm.model})` : turn.result.citations.length ? "조문 검색으로 답함" : "업무 처리"}</p>
          <p className="answer">{turn.result.answer}</p>
          {turn.result.citations.length > 0 && (
            <ul>
              {turn.result.citations.map((citation) => (
                <li key={`${citation.articleNo}-${citation.baseDate}`}>
                  {citation.docTitle} {citation.articleNo} {citation.heading} · 기준일 {citation.baseDate} · {citation.sourceUrl}
                </li>
              ))}
            </ul>
          )}
          {turn.result.suggestHelpdesk && <p><Link href="/helpdesk/new">헬프데스크에 문의하기</Link></p>}
        </section>
      ))}
    </div>
  );
}
