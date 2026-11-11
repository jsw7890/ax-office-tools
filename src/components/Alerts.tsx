"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/browser";

type Notice = { id: string; title: string; body: string; href: string | null; readAt: string | null };
type Reminder = { id: string; title: string; roomName: string; startAt: string };

export function Alerts() {
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [banner, setBanner] = useState("");
  const seenReminders = useRef(new Set<string>());

  async function refresh() {
    try {
      const inbox = await api<{ notices: Notice[]; unread: number }>("/api/notifications");
      setNotices(inbox.notices);
      setUnread(inbox.unread);
      const due = await api<{ reminders: Reminder[] }>("/api/reminders/due");
      const next = due.reminders.find((item) => !seenReminders.current.has(item.id));
      if (next) {
        seenReminders.current.add(next.id);
        const text = `${next.roomName} 예약이 10분 안입니다. ${next.title}`;
        setBanner(text);
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          new Notification("회의 알림", { body: text });
        }
      }
    } catch {
      /* not signed in */
    }
  }

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 15000);
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      void Notification.requestPermission();
    }
    return () => window.clearInterval(timer);
  }, []);

  async function openBox() {
    setOpen((value) => !value);
    if (!open && unread > 0) {
      await api("/api/notifications", { method: "POST" });
      setUnread(0);
    }
  }

  return (
    <div className="alerts">
      {banner && <p className="notice">{banner}</p>}
      <button className="secondary" type="button" onClick={() => void openBox()}>
        알림{unread > 0 ? ` ${unread}` : ""}
      </button>
      {open && (
        <ul className="alert-list">
          {notices.length === 0 && <li>새 알림이 없습니다.</li>}
          {notices.map((item) => (
            <li key={item.id}>
              {item.href ? <a href={item.href}>{item.title}</a> : item.title}
              <span className="muted"> {item.body}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
