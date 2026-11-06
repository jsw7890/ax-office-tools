"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/browser";
import { addDays, clock, seoulParts, seoulToday, seoulToIso } from "@/lib/time";

type Room = { id: string; name: string; capacity: number; location: string; active: boolean };
type Reservation = { id: string; roomId: string; title: string; startAt: string; endAt: string; reserverName: string };

const START = 9 * 60;
const END = 18 * 60;

export default function RoomsPage() {
  const [date, setDate] = useState(seoulToday());
  const [rooms, setRooms] = useState<Room[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<{ roomId: string; roomName: string; start: string; end: string; title: string } | null>(null);

  async function load(nextDate = date) {
    setError("");
    try {
      const [roomResult, reservationResult] = await Promise.all([
        api<{ rooms: Room[] }>("/api/rooms"),
        api<{ reservations: Reservation[] }>(`/api/reservations?date=${nextDate}`),
      ]);
      setRooms(roomResult.rooms.filter((room) => room.active));
      setReservations(reservationResult.reservations);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "시간표를 불러오지 못했습니다.");
    }
  }

  useEffect(() => {
    void load(date);
  }, [date]);

  const slots: number[] = [];
  for (let minutes = START; minutes < END; minutes += 30) slots.push(minutes);
  const now = Date.now();

  function reservationAt(roomId: string, minutes: number) {
    return reservations.find((reservation) => {
      if (reservation.roomId !== roomId) return false;
      const start = seoulParts(reservation.startAt);
      const end = seoulParts(reservation.endAt);
      return start.date === date && start.minutes <= minutes && end.minutes > minutes;
    });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!draft) return;
    setError("");
    try {
      await api("/api/reservations", {
        method: "POST",
        body: JSON.stringify({ roomId: draft.roomId, title: draft.title, startAt: draft.start, endAt: draft.end }),
      });
      setDraft(null);
      await load(date);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "예약하지 못했습니다.");
    }
  }

  return (
    <div className="grid">
      <section className="panel">
        <h1>회의실 시간표</h1>
        <p className="muted">운영 시간은 09:00–18:00, 30분 단위입니다. 빈 칸을 누르면 예약할 수 있습니다.</p>
        <div className="row-actions">
          <button className="secondary" type="button" onClick={() => setDate(addDays(date, -1))}>이전 날</button>
          <input type="date" aria-label="예약 날짜" value={date} onChange={(event) => setDate(event.target.value)} />
          <button className="secondary" type="button" onClick={() => setDate(addDays(date, 1))}>다음 날</button>
        </div>
      </section>
      {error && <p className="error" role="alert">{error}</p>}
      <div style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>회의실</th>
              {slots.map((minutes) => <th key={minutes}>{clock(minutes)}</th>)}
            </tr>
          </thead>
          <tbody>
            {rooms.map((room) => (
              <tr key={room.id}>
                <th>{room.name}<br /><span className="muted">{room.capacity}명 · {room.location}</span></th>
                {slots.map((minutes) => {
                  const reserved = reservationAt(room.id, minutes);
                  const startIso = seoulToIso(date, minutes);
                  const past = new Date(startIso).getTime() <= now;
                  if (reserved) {
                    return <td key={minutes} className="slot busy">{reserved.title}<br />{reserved.reserverName}</td>;
                  }
                  return (
                    <td key={minutes}>
                      <button
                        className={past ? "slot past" : "slot"}
                        type="button"
                        disabled={past}
                        onClick={() => setDraft({
                          roomId: room.id,
                          roomName: room.name,
                          start: startIso,
                          end: seoulToIso(date, minutes + 30),
                          title: "",
                        })}
                      >
                        {past ? "지남" : "예약"}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {draft && (
        <form className="panel form" onSubmit={submit}>
          <h2>{draft.roomName} 예약</h2>
          <p className="muted">{new Date(draft.start).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })} 시작</p>
          <label>
            제목
            <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} required maxLength={80} />
          </label>
          <label>
            끝나는 시간
            <select value={draft.end} onChange={(event) => setDraft({ ...draft, end: event.target.value })}>
              {slots
                .filter((minutes) => seoulToIso(date, minutes) > draft.start)
                .concat([END])
                .filter((minutes, index, list) => list.indexOf(minutes) === index)
                .map((minutes) => (
                  <option key={minutes} value={seoulToIso(date, minutes)}>{clock(minutes)}</option>
                ))}
            </select>
          </label>
          <div className="row-actions">
            <button type="submit">예약하기</button>
            <button className="secondary" type="button" onClick={() => setDraft(null)}>닫기</button>
          </div>
        </form>
      )}
    </div>
  );
}
