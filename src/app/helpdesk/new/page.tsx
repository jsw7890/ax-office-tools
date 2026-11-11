"use client";

import { useState } from "react";
import { api } from "@/lib/browser";

export default function NewTicketPage() {
  const [category, setCategory] = useState("pc");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [urgency, setUrgency] = useState("normal");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (sending) return;
    setSending(true);
    setError("");
    try {
      const result = await api<{ ticket: { id: string } }>("/api/tickets", {
        method: "POST",
        body: JSON.stringify({ category, title, description, urgency }),
      });
      location.href = `/helpdesk/${result.ticket.id}`;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "등록하지 못했습니다.");
      setSending(false);
    }
  }

  return (
    <form className="panel form" onSubmit={submit}>
      <h1>문의 등록</h1>
      <label>분류
        <select value={category} onChange={(event) => setCategory(event.target.value)}>
          <option value="pc">컴퓨터</option>
          <option value="account">계정</option>
          <option value="printer_network">프린터·네트워크</option>
          <option value="etc">기타</option>
        </select>
      </label>
      <label>제목<input value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={80} /></label>
      <label>내용<textarea value={description} onChange={(event) => setDescription(event.target.value)} required rows={6} maxLength={4000} /></label>
      <label>긴급도
        <select value={urgency} onChange={(event) => setUrgency(event.target.value)}>
          <option value="normal">보통</option>
          <option value="urgent">긴급</option>
        </select>
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <button type="submit" disabled={sending}>{sending ? "접수 중" : "접수하기"}</button>
    </form>
  );
}
