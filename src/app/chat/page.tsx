"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/browser";
import { DISCLAIMER } from "@/lib/labels";

type Citation = { docTitle: string; articleNo: string; heading: string; baseDate: string; sourceUrl: string };
type LlmStatus = { available: boolean; used?: boolean; model: string; mode: "local_llm" | "article_search"; detail: string };
type Result = { answer: string; citations: Citation[]; suggestHelpdesk: boolean; llm: LlmStatus };

export default function ChatPage() {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<Result | null>(null);
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
          detail: "로컬 LLM 꺼짐 · 꺼져 있으면 조문 검색으로 답합니다.",
        }),
      );
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const answer = await api<Result>("/api/chat", { method: "POST", body: JSON.stringify({ question }) });
      setResult(answer);
      setStatus(answer.llm);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "답하지 못했습니다.");
    }
  }

  const notice = status?.detail ?? "로컬 LLM 상태를 확인하는 중입니다. 꺼져 있으면 조문 검색으로 답합니다.";

  return (
    <div className="grid">
      <section className="panel">
        <h1>규정 챗봇</h1>
        <p className="notice">{DISCLAIMER}</p>
        <p className="notice">{notice}</p>
        <p className="muted">질문은 한 번에 하나씩 답합니다. 이전 대화는 기억하지 않습니다. 유료 AI는 쓰지 않고, 이 컴퓨터의 로컬 LLM이 켜져 있으면 저장된 조문을 근거로 답을 다듬습니다. 하루 20회까지 물을 수 있습니다.</p>
        <form className="form" onSubmit={submit}>
          <label>질문<textarea value={question} onChange={(event) => setQuestion(event.target.value)} required maxLength={500} rows={4} /></label>
          <button type="submit">답변 보기</button>
        </form>
        {error && <p className="error" role="alert">{error}</p>}
      </section>
      {result && (
        <section className="panel">
          <h2>답변</h2>
          <p className="muted">{result.llm.used ? `로컬 LLM 사용 (${result.llm.model})` : "조문 검색으로 답함"}</p>
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
