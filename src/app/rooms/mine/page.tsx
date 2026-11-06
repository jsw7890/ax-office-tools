"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/browser";

type Reservation = { id: string; title: string; startAt: string; endAt: string; status: string; reserverName: string };

export default function MyReservationsPage() {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [error, setError] = useState("");

  async function load() {
    try {
      const result = await api<{ reservations: Reservation[] }>("/api/reservations?mine=1");
      setReservations(result.reservations);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "목록을 불러오지 못했습니다.");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function cancel(id: string) {
    setError("");
    try {
      await api(`/api/reservations/${id}`, { method: "DELETE" });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "취소하지 못했습니다.");
    }
  }

  return (
    <section className="panel">
      <h1>내 예약</h1>
      {error && <p className="error" role="alert">{error}</p>}
      {reservations.length === 0 ? <p>예약이 없습니다.</p> : (
        <table>
          <thead><tr><th>제목</th><th>시작</th><th>끝</th><th>상태</th><th></th></tr></thead>
          <tbody>
            {reservations.map((reservation) => (
              <tr key={reservation.id}>
                <td>{reservation.title}</td>
                <td>{new Date(reservation.startAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</td>
                <td>{new Date(reservation.endAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</td>
                <td>{reservation.status === "active" ? "예약됨" : "취소됨"}</td>
                <td>
                  {reservation.status === "active" && (
                    <button className="secondary" type="button" onClick={() => cancel(reservation.id)}>취소</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
