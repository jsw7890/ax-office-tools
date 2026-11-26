import { parseOfficeIntent, bookingIso, type OfficeAction } from "@/lib/chat/intent";
import type { PendingAction } from "@/lib/chat/pending";
import { AppError } from "@/lib/errors";
import { categoryLabel, statusLabel } from "@/lib/labels";
import { listReservations, listRooms } from "@/lib/services/reservations";
import { setRoomReminder } from "@/lib/services/notifications";
import { getTicket, listAllTickets, listMyTickets, type Ticket } from "@/lib/services/tickets";
import { clock, seoulParts, seoulToday } from "@/lib/time";

export type { PendingAction } from "@/lib/chat/pending";

export type OfficeReply = {
  answer: string;
  citations: [];
  suggestHelpdesk: boolean;
  handled: true;
  pendingActions: PendingAction[];
};

function roundSlot(minutes: number): number {
  return Math.floor(minutes / 30) * 30;
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

function formatDateLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const stamp = new Date(Date.UTC(y, m - 1, d, 3, 0, 0));
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(stamp);
}

function hoursWarning(date: string, startMinutes: number, endMinutes: number): string | null {
  const now = new Date();
  const today = seoulToday();
  const { minutes: nowMin } = seoulParts(now);
  if (date === today && startMinutes < nowMin) return "지난 시간입니다. 확인을 눌러도 저장이 거절될 수 있습니다.";
  if (startMinutes < 9 * 60 || endMinutes > 18 * 60) {
    return "운영 시간은 09:00–18:00입니다. 확인을 눌러도 저장이 거절될 수 있습니다.";
  }
  return null;
}

function ticketMatches(ticket: Ticket, hint: string): boolean {
  const text = hint.toLowerCase();
  if (/프린터/.test(text) && (ticket.category === "printer_network" || /프린터/i.test(ticket.title))) return true;
  if (/모니터|노트북|컴퓨터|pc/i.test(text) && (ticket.category === "pc" || /모니터|노트북|컴퓨터/i.test(ticket.title)))
    return true;
  if (/계정|비밀번호/.test(text) && (ticket.category === "account" || /비밀번호|계정/.test(ticket.title))) return true;
  if (/네트워크|와이파이|인터넷/.test(text) && ticket.category === "printer_network") return true;
  const stop = new Set(["문의", "상태", "알려줘", "알려", "보여줘", "티켓", "헬프", "helpdesk", "상세", "프린터문의"]);
  const tokens = text.split(/\s+/).filter((part) => part.length > 1 && !stop.has(part));
  return tokens.some((token) => ticket.title.includes(token) || ticket.description.includes(token));
}

export async function handleOfficeQuestion(userId: string, question: string, role: "staff" | "admin"): Promise<OfficeReply | null> {
  const intent = parseOfficeIntent(question);
  if (intent.action === "none") return null;
  try {
    const { answer, pendingActions } = await runAction(userId, role, intent);
    return { answer, citations: [], suggestHelpdesk: false, handled: true, pendingActions };
  } catch (error) {
    if (error instanceof AppError) {
      return {
        answer: error.message,
        citations: [],
        suggestHelpdesk: intent.action === "create_ticket",
        handled: true,
        pendingActions: [],
      };
    }
    throw error;
  }
}

async function runAction(
  userId: string,
  role: "staff" | "admin",
  intent: OfficeAction,
): Promise<{ answer: string; pendingActions: PendingAction[] }> {
  if (intent.action === "list_reservations") {
    const rows = await listReservations(userId, seoulToday(), true);
    const active = rows.filter((row) => row.status === "active");
    if (active.length === 0) return { answer: "지금 잡힌 내 예약이 없습니다.", pendingActions: [] };
    return {
      answer: active.map((row) => `${formatWhen(row.startAt)} ~ ${formatWhen(row.endAt)} · ${row.title}`).join("\n"),
      pendingActions: [],
    };
  }

  if (intent.action === "enable_reminder") {
    await setRoomReminder(userId, true);
    return {
      answer: "회의 시작 10분 전 알림을 켰습니다. 이 창을 열어 두면 알림이 뜹니다.",
      pendingActions: [],
    };
  }

  if (intent.action === "book_room") {
    if (!intent.date || intent.startMinutes == null || intent.endMinutes == null) {
      return {
        answer:
          "예약을 넣으려면 날짜와 시작 시각을 알려 주세요. 예: 모레 3시, 다음 주 금요일 오후 3시, 12월 3일 14시 회의실 예약해줘",
        pendingActions: [],
      };
    }
    if (intent.date < seoulToday()) {
      return {
        answer: "지난 날짜는 예약할 수 없습니다. 오늘 이후 날짜로 다시 말해 주세요.",
        pendingActions: [],
      };
    }
    const rooms = (await listRooms(userId)).filter((item) => item.active);
    const startMinutes = roundSlot(intent.startMinutes);
    const endMinutes = roundSlot(intent.endMinutes);
    if (endMinutes <= startMinutes) {
      return { answer: "종료 시각이 시작보다 늦어야 합니다. 30분 단위로 말해 주세요.", pendingActions: [] };
    }
    const when = bookingIso(intent.date, startMinutes, endMinutes);
    const day = await listReservations(userId, intent.date, false);
    const free = (roomId: string) =>
      !day.some((row) => row.roomId === roomId && row.status === "active" && row.startAt < when.endAt && row.endAt > when.startAt);

    const people = intent.people;
    const named = intent.roomName ? rooms.find((item) => item.name === intent.roomName) : undefined;
    const sized = rooms
      .filter((item) => people == null || item.capacity >= people)
      .sort((a, b) => a.capacity - b.capacity || a.name.localeCompare(b.name, "ko"));
    if (people != null && sized.length === 0) {
      const max = rooms.reduce((n, item) => Math.max(n, item.capacity), 0);
      return { answer: `인원 ${people}명을 넣을 회의실이 없습니다. 최대 수용은 ${max}명입니다.`, pendingActions: [] };
    }
    if (named && people != null && named.capacity < people) {
      return {
        answer: `${named.name}은 ${named.capacity}명까지입니다. ${people}명이면 더 큰 빈 회의실을 지정해 주세요.`,
        pendingActions: [],
      };
    }
    if (named && !intent.anyEmpty && !free(named.id)) {
      return {
        answer: `${named.name}은 그 시간에 이미 예약되어 있습니다. 빈 회의실로 말해 주시면 다른 방을 잡습니다.`,
        pendingActions: [],
      };
    }
    const room =
      named && (!intent.anyEmpty || free(named.id)) ? named : sized.find((item) => free(item.id));
    if (!room) {
      return {
        answer: `${formatWhen(when.startAt)}부터 ${clock(endMinutes)}까지 비어 있는 회의실이 없습니다.`,
        pendingActions: [],
      };
    }
    const title = intent.title ?? "예약";
    const who = people ? ` · ${people}명` : "";
    const warn = hoursWarning(intent.date, startMinutes, endMinutes);
    const summary = `${room.name} · ${formatDateLabel(intent.date)} ${clock(startMinutes)}~${clock(endMinutes)} · ${title}`;
    const pending: PendingAction = {
      type: "reservation.create",
      summary,
      payload: { roomId: room.id, title, startAt: when.startAt, endAt: when.endAt },
    };
  const body = `비어 있는 ${room.name}(${room.capacity}명) ${formatDateLabel(intent.date)} ${clock(startMinutes)}~${clock(endMinutes)} 예약을 제안합니다${who}. 제목: ${title}. 아래 확인을 누르면 저장됩니다.`;
    return {
      answer: warn ? `${warn}\n${body}` : body,
      pendingActions: [pending],
    };
  }

  if (intent.action === "cancel_reservation") {
    const mine = (await listReservations(userId, seoulToday(), true)).filter((row) => row.status === "active");
    const now = Date.now();
    const upcoming = mine.filter((row) => new Date(row.endAt).getTime() > now);
    const rooms = await listRooms(userId);
    const roomName = (roomId: string) => rooms.find((item) => item.id === roomId)?.name ?? "회의실";

    let candidates = upcoming;
    if (intent.date) {
      candidates = candidates.filter((row) => seoulParts(row.startAt).date === intent.date);
    }
    if (intent.startMinutes != null) {
      const slot = roundSlot(intent.startMinutes);
      candidates = candidates.filter((row) => seoulParts(row.startAt).minutes === slot);
    }
    if (intent.roomName) {
      const room = rooms.find((item) => item.name === intent.roomName);
      if (room) candidates = candidates.filter((row) => row.roomId === room.id);
    }
    if (candidates.length === 0) {
      return { answer: "취소할 앞으로 남은 예약이 없습니다.", pendingActions: [] };
    }
    const pendingActions: PendingAction[] = candidates.map((row) => {
      const date = seoulParts(row.startAt).date;
      const start = seoulParts(row.startAt).minutes;
      const end = seoulParts(row.endAt).minutes;
      const summary = `${roomName(row.roomId)} · ${formatDateLabel(date)} ${clock(start)}~${clock(end)} · ${row.title}`;
      return { type: "reservation.cancel", summary, payload: { reservationId: row.id } };
    });
    const list = pendingActions.map((item) => `- ${item.summary}`).join("\n");
    return {
      answer: `다음 예약 취소를 제안합니다. 아래에서 확인하세요.\n${list}`,
      pendingActions,
    };
  }

  if (intent.action === "create_ticket") {
    const category = intent.category ?? "etc";
    const title = intent.title ?? "IT 문의";
    const description = intent.description ?? questionFallback(title);
    const urgency = intent.urgency ?? "normal";
    const summary = `${categoryLabel[category]} · ${title}`;
    const pending: PendingAction = {
      type: "ticket.create",
      summary,
      payload: { category, title, description, urgency },
    };
    return {
      answer: `IT helpdesk에 등록을 제안합니다. ${summary}. 아래 확인을 누르면 저장됩니다.`,
      pendingActions: [pending],
    };
  }

  if (intent.action === "list_tickets") {
    const tickets = role === "admin" ? await listAllTickets(userId, null, null) : await listMyTickets(userId);
    if (tickets.length === 0) return { answer: "등록된 IT 문의가 없습니다.", pendingActions: [] };
    return {
      answer: tickets
        .slice(0, 10)
        .map((ticket) => `${ticket.id.slice(0, 8)} · ${statusLabel[ticket.status]} · ${ticket.title}`)
        .join("\n"),
      pendingActions: [],
    };
  }

  if (intent.action === "ticket_detail") {
    const tickets = role === "admin" ? await listAllTickets(userId, null, null) : await listMyTickets(userId);
    const hint = intent.hint ?? "";
    const matched = hint ? tickets.filter((ticket) => ticketMatches(ticket, hint)) : tickets;
    if (matched.length === 0) return { answer: "볼 문의가 없습니다.", pendingActions: [] };
    if (matched.length > 1) {
      const list = matched
        .slice(0, 10)
        .map((ticket) => `${ticket.id.slice(0, 8)} · ${statusLabel[ticket.status]} · ${ticket.title}`)
        .join("\n");
      return { answer: `여러 문의가 있습니다. 번호와 상태입니다.\n${list}`, pendingActions: [] };
    }
    const detail = await getTicket(userId, matched[0].id);
    const comments = detail.comments.map((item) => `- ${item.authorName}: ${item.body}`).join("\n");
    return {
      answer: [
        `${detail.ticket.title}`,
        `상태 ${statusLabel[detail.ticket.status]} · ${categoryLabel[detail.ticket.category]}`,
        detail.ticket.description,
        comments ? `댓글\n${comments}` : "댓글 없음",
      ].join("\n"),
      pendingActions: [],
    };
  }

  return { answer: "처리할 업무를 찾지 못했습니다.", pendingActions: [] };
}

function questionFallback(title: string): string {
  return `챗봇으로 등록할 문의: ${title}`;
}