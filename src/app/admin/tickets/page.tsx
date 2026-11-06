"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/browser";
import { categoryLabel, statusLabel, urgencyLabel } from "@/lib/labels";

type Ticket = { id: string; title: string; category: string; urgency: string; status: string; requesterName: string };

export default function AdminTicketsPage() {
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [error, setError] = useState("");

  async function load(nextStatus = status, nextCategory = category) {
    const params = new URLSearchParams({ scope: "all" });
    if (nextStatus) params.set("status", nextStatus);
    if (nextCategory) params.set("category", nextCategory);
    try {
      const result = await api<{ tickets: Ticket[] }>(`/api/tickets?${params.toString()}`);
      setTickets(result.tickets);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "목록을 불러오지 못했습니다.");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <section className="panel">
      <h1>IT helpdesk 현황</h1>
      <div className="filters">
        <label>상태
          <select value={status} onChange={(event) => { setStatus(event.target.value); void load(event.target.value, category); }}>
            <option value="">전체</option>
            <option value="received">접수</option>
            <option value="in_progress">처리중</option>
            <option value="done">완료</option>
          </select>
        </label>
        <label>분류
          <select value={category} onChange={(event) => { setCategory(event.target.value); void load(status, event.target.value); }}>
            <option value="">전체</option>
            <option value="pc">컴퓨터</option>
            <option value="account">계정</option>
            <option value="printer_network">프린터·네트워크</option>
            <option value="etc">기타</option>
          </select>
        </label>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <table>
        <thead><tr><th>제목</th><th>요청자</th><th>분류</th><th>긴급도</th><th>상태</th></tr></thead>
        <tbody>
          {tickets.map((ticket) => (
            <tr key={ticket.id}>
              <td><Link href={`/helpdesk/${ticket.id}`}>{ticket.title}</Link></td>
              <td>{ticket.requesterName}</td>
              <td>{categoryLabel[ticket.category]}</td>
              <td>{urgencyLabel[ticket.urgency]}</td>
              <td>{statusLabel[ticket.status]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
