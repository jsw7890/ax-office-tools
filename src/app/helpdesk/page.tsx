"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/browser";
import { categoryLabel, statusLabel, urgencyLabel } from "@/lib/labels";

type Ticket = { id: string; title: string; category: string; urgency: string; status: string; createdAt: string };

export default function HelpdeskPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ tickets: Ticket[] }>("/api/tickets")
      .then((result) => setTickets(result.tickets))
      .catch((caught) => setError(caught instanceof Error ? caught.message : "목록을 불러오지 못했습니다."));
  }, []);

  return (
    <section className="panel">
      <div className="page-head">
        <h1>IT helpdesk</h1>
        <Link className="button" href="/helpdesk/new">문의 등록</Link>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {tickets.length === 0 ? <p>접수한 문의가 없습니다.</p> : (
        <table>
          <thead><tr><th>제목</th><th>분류</th><th>긴급도</th><th>상태</th><th>접수일</th></tr></thead>
          <tbody>
            {tickets.map((ticket) => (
              <tr key={ticket.id}>
                <td><Link href={`/helpdesk/${ticket.id}`}>{ticket.title}</Link></td>
                <td>{categoryLabel[ticket.category]}</td>
                <td>{urgencyLabel[ticket.urgency]}</td>
                <td>{statusLabel[ticket.status]}</td>
                <td>{new Date(ticket.createdAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
