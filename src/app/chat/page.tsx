"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/browser";
import type { PendingAction } from "@/lib/chat/pending";
import { DISCLAIMER } from "@/lib/labels";

type Citation = {
  docTitle: string;
  articleNo: string;
  heading: string;
  baseDate: string;
  sourceUrl: string;
  excerpt?: string;
};
type LlmStatus = {
  available: boolean;
  used?: boolean;
  model: string;
  mode: "local_llm" | "article_search" | "hybrid";
  searchMode?: "hybrid" | "keyword";
  detail: string;
};
type Result = { answer: string; citations: Citation[]; suggestHelpdesk: boolean; pendingActions?: PendingAction[]; llm: LlmStatus };
type Turn = { question: string; askedAt: string; result: Result; confirmed: Record<number, "done" | "error">; confirmError: Record<number, string> };

function formatAskedAt(when: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(when);
  const read = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${read("year")}년 ${Number(read("month"))}월 ${Number(read("day"))}일 ${Number(read("hour"))}시 ${read("minute")}분`;
}

async function confirmAction(action: PendingAction): Promise<void> {
  if (action.type === "reservation.create") {
    await api("/api/reservations", { method: "POST", body: JSON.stringify(action.payload) });
    return;
  }
  if (action.type === "reservation.cancel") {
    await api(`/api/reservations/${action.payload.reservationId}`, { method: "DELETE" });
    return;
  }
  await api("/api/tickets", { method: "POST", body: JSON.stringify(action.payload) });
}

export default function ChatPage() {
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<LlmStatus | null>(null);
  const [sending, setSending] = useState(false);

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
    if (sending) return;
    const text = question.trim();
    if (!text) return;
    setSending(true);
    setError("");
    try {
      const result = await api<Result>("/api/chat", { method: "POST", body: JSON.stringify({ question: text }) });
      setTurns((prev) => [
        { question: text, askedAt: formatAskedAt(new Date()), result, confirmed: {}, confirmError: {} },
        ...prev,
      ]);
      setStatus(result.llm);
      setQuestion("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "답하지 못했습니다.");
    } finally {
      setSending(false);
    }
  }

  async function onConfirm(turnIndex: number, actionIndex: number, action: PendingAction) {
    setTurns((prev) => {
      const copy = [...prev];
      const turn = { ...copy[turnIndex], confirmed: { ...copy[turnIndex].confirmed }, confirmError: { ...copy[turnIndex].confirmError } };
      if (turn.confirmed[actionIndex]) return prev;
      turn.confirmed[actionIndex] = "done";
      copy[turnIndex] = turn;
      return copy;
    });
    try {
      await confirmAction(action);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "저장하지 못했습니다.";
      setTurns((prev) => {
        const copy = [...prev];
        const turn = { ...copy[turnIndex], confirmed: { ...copy[turnIndex].confirmed }, confirmError: { ...copy[turnIndex].confirmError } };
        turn.confirmed[actionIndex] = "error";
        turn.confirmError[actionIndex] = message;
        copy[turnIndex] = turn;
        return copy;
      });
    }
  }

  const notice = status?.detail ?? "로컬 LLM 상태를 확인하는 중입니다.";

  return (
    <div className="grid">
      <section className="panel">
        <h1>업무 챗봇</h1>
        <p className="notice">{DISCLAIMER}</p>
        <p className="notice">{notice}</p>
        <p className="muted">
          예: 내일 11시 빈 회의실 예약해줘 인원은 4명이야. 예약·문의·취소는 제안만 하고 아래 확인을 누르면 저장됩니다. 내역·10분 전 알림, IT 문의도 됩니다. 유료 AI는 쓰지 않습니다. 하루 20회까지입니다.
        </p>
        <form className="form" onSubmit={submit}>
          <label>
            질문
            <textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  if (!sending) event.currentTarget.form?.requestSubmit();
                }
              }}
              required
              maxLength={500}
              rows={4}
              disabled={sending}
            />
          </label>
          <button type="submit" disabled={sending}>
            {sending ? "보내는 중" : "보내기"}
          </button>
        </form>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </section>
      {turns.map((turn, turnIndex) => (
        <section className="panel" key={`${turn.askedAt}-${turn.question}-${turnIndex}`}>
          <h2>질문</h2>
          <p className="muted">{turn.askedAt}</p>
          <p>{turn.question}</p>
          <h2>답변</h2>
          <p className="muted">
            {turn.result.llm.used
              ? `로컬 LLM 사용 (${turn.result.llm.model}) · ${turn.result.llm.searchMode === "hybrid" ? "혼합 검색" : "키워드 검색"}`
              : turn.result.citations.length
                ? turn.result.llm.searchMode === "hybrid" || turn.result.llm.mode === "hybrid"
                  ? "혼합 검색(벡터+키워드)으로 답함"
                  : "키워드 검색(조문 검색)으로 답함"
                : "업무 처리(규칙)"}
          </p>
          <p className="answer">{turn.result.answer}</p>
          {(turn.result.pendingActions ?? []).map((action, actionIndex) => {
            const locked = turn.confirmed[actionIndex] === "done" || turn.confirmed[actionIndex] === "error";
            return (
              <div className="form" key={`${action.type}-${action.summary}-${actionIndex}`}>
                <p>{action.summary}</p>
                <button type="button" disabled={locked} onClick={() => onConfirm(turnIndex, actionIndex, action)}>
                  {turn.confirmed[actionIndex] === "done" ? "확인됨" : "확인"}
                </button>
                {turn.confirmError[actionIndex] && (
                  <p className="error" role="alert">
                    {turn.confirmError[actionIndex]}
                  </p>
                )}
              </div>
            );
          })}
          {turn.result.citations.length > 0 && (
            <div>
              {turn.result.citations.map((citation) => (
                <details key={`${citation.articleNo}-${citation.baseDate}`}>
                  <summary>근거 조문 보기 · {citation.articleNo} {citation.heading}</summary>
                  <p className="answer">{citation.excerpt ?? ""}</p>
                  <p className="muted">
                    출처: {citation.docTitle} {citation.articleNo} (기준일 {citation.baseDate}) · {citation.sourceUrl}
                  </p>
                </details>
              ))}
            </div>
          )}
          {turn.result.suggestHelpdesk && (
            <p>
              <Link href="/helpdesk/new">헬프데스크에 문의하기</Link>
            </p>
          )}
        </section>
      ))}
    </div>
  );
}