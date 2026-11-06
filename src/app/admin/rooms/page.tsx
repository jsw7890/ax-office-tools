"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/browser";

type Room = { id: string; name: string; capacity: number; location: string; active: boolean };

const empty = { id: "", name: "", capacity: 4, location: "", active: true };

export default function AdminRoomsPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState("");

  async function load() {
    try {
      const result = await api<{ rooms: Room[] }>("/api/rooms");
      setRooms(result.rooms);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "회의실을 불러오지 못했습니다.");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    const payload = { name: form.name, capacity: Number(form.capacity), location: form.location, active: form.active };
    try {
      if (form.id) {
        await api(`/api/rooms/${form.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        await api("/api/rooms", { method: "POST", body: JSON.stringify(payload) });
      }
      setForm(empty);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "저장하지 못했습니다.");
    }
  }

  return (
    <div className="grid">
      <section className="panel">
        <h1>회의실 관리</h1>
        {error && <p className="error" role="alert">{error}</p>}
        <table>
          <thead><tr><th>이름</th><th>인원</th><th>위치</th><th>사용</th><th></th></tr></thead>
          <tbody>
            {rooms.map((room) => (
              <tr key={room.id}>
                <td>{room.name}</td>
                <td>{room.capacity}</td>
                <td>{room.location}</td>
                <td>{room.active ? "사용" : "중지"}</td>
                <td><button className="secondary" type="button" onClick={() => setForm(room)}>수정</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <form className="panel form" onSubmit={save}>
        <h2>{form.id ? "회의실 수정" : "회의실 추가"}</h2>
        <label>이름<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label>
        <label>수용 인원<input type="number" min={1} max={500} value={form.capacity} onChange={(event) => setForm({ ...form, capacity: Number(event.target.value) })} required /></label>
        <label>위치<input value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} required /></label>
        <label>사용 여부
          <select value={form.active ? "yes" : "no"} onChange={(event) => setForm({ ...form, active: event.target.value === "yes" })}>
            <option value="yes">사용</option>
            <option value="no">중지</option>
          </select>
        </label>
        <div className="row-actions">
          <button type="submit">저장</button>
          <button className="secondary" type="button" onClick={() => setForm(empty)}>새로 입력</button>
        </div>
      </form>
    </div>
  );
}
