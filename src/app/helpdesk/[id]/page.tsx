"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/browser";
import { categoryLabel, statusLabel, urgencyLabel } from "@/lib/labels";

type Ticket = {
  id: string;
  title: string;
  description: string;
  category: string;
  urgency: string;
  status: string;
  requesterName: string;
  doneAt: string | null;
};
type Comment = { id: string; authorName: string; body: string; createdAt: string };
type Me = { role: "staff" | "admin" };

const nextStatus: Record<string, string | undefined> = {
  received: "in_progress",
  in_progress: "done",
};

export default function TicketDetailPage() {
  const params = useParams<{ id: string }>();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [body, setBody] = useState("");
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState("");

  async function load() {
    try {
      const result = await api<{ ticket: Ticket; comments: Comment[] }>(`/api/tickets/${params.id}`);
      setTicket(result.ticket);
      setComments(result.comments);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "문의를 불러오지 못했습니다.");
    }
  }

  useEffect(() => {
    void load();
    api<{ user: Me }>("/api/auth/me").then((result) => setMe(result.user)).catch(() => setMe(null));
  }, [params.id]);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await api(`/api/tickets/${params.id}/comments`, { method: "POST", body: JSON.stringify({ body }) });
      setBody("");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "댓글을 남기지 못했습니다.");
    }
  }

  async function advance() {
    if (!ticket) return;
    const status = nextStatus[ticket.status];
    if (!status) return;
    setError("");
    try {
      await api(`/api/tickets/${ticket.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "상태를 바꾸지 못했습니다.");
    }
  }

  if (!ticket) return <section className="panel">{error ? <p className="error">{error}</p> : <p>불러오는 중...</p>}</section>;

  return (
    <div className="grid">
      <section className="panel">
        <h1>{ticket.title}</h1>
        <p className="muted">{categoryLabel[ticket.category]} · {urgencyLabel[ticket.urgency]} · {statusLabel[ticket.status]} · {ticket.requesterName}</p>
        <p>{ticket.description}</p>
        {ticket.doneAt && <p className="muted">완료 시각 {new Date(ticket.doneAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</p>}
        {me?.role === "admin" && nextStatus[ticket.status] && (
          <button type="button" onClick={advance}>{statusLabel[nextStatus[ticket.status] ?? ""]}으로 변경</button>
        )}
      </section>
      <section className="panel">
        <h2>댓글</h2>
        {comments.length === 0 && <p>댓글이 없습니다.</p>}
        {comments.map((comment) => (
          <article key={comment.id}>
            <strong>{comment.authorName}</strong>
            <span className="muted"> {new Date(comment.createdAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</span>
            <p>{comment.body}</p>
          </article>
        ))}
        <form className="form" onSubmit={send}>
          <label>댓글<textarea value={body} onChange={(event) => setBody(event.target.value)} required maxLength={1000} rows={3} /></label>
          {error && <p className="error" role="alert">{error}</p>}
          <button type="submit">댓글 남기기</button>
        </form>
      </section>
    </div>
  );
}
