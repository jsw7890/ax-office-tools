import { parseOfficeIntent, bookingIso, type OfficeAction } from "@/lib/chat/intent";
import { localLlmModel, polishOfficeWithLocalLlm, probeLocalLlm } from "@/lib/chat/ollama";
import { AppError } from "@/lib/errors";
import { categoryLabel, statusLabel } from "@/lib/labels";
import { createReservation, listReservations, listRooms } from "@/lib/services/reservations";
import { setRoomReminder } from "@/lib/services/notifications";
import { createTicket, getTicket, listAllTickets, listMyTickets } from "@/lib/services/tickets";
import { clock, seoulToday } from "@/lib/time";

export type OfficeReply = {
  answer: string;
  citations: [];
  suggestHelpdesk: boolean;
  handled: true;
};

function roundSlot(minutes: number): number {
  return Math.floor(minutes / 30) * 30;
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

export async function handleOfficeQuestion(userId: string, question: string, role: "staff" | "admin"): Promise<OfficeReply | null> {
  const intent = parseOfficeIntent(question);
  if (intent.action === "none") return null;
  try {
    let answer = await runAction(userId, role, intent);
    const llm = await probeLocalLlm();
    if (llm.available) {
      const polished = await polishOfficeWithLocalLlm(question, answer, localLlmModel());
      if (polished) answer = polished;
    }
    return { answer, citations: [], suggestHelpdesk: false, handled: true };
  } catch (error) {
    if (error instanceof AppError) {
      return { answer: error.message, citations: [], suggestHelpdesk: intent.action === "create_ticket", handled: true };
    }
    throw error;
  }
}

async function runAction(userId: string, role: "staff" | "admin", intent: OfficeAction): Promise<string> {
  if (intent.action === "list_reservations") {
    const rows = await listReservations(userId, seoulToday(), true);
    const active = rows.filter((row) => row.status === "active");
    if (active.length === 0) return "지금 잡힌 내 예약이 없습니다.";
    return active
      .map((row) => `${formatWhen(row.startAt)} ~ ${formatWhen(row.endAt)} · ${row.title}`)
      .join("\n");
  }

  if (intent.action === "enable_reminder") {
    await setRoomReminder(userId, true);
    return "회의 시작 10분 전 알림을 켰습니다. 이 창을 열어 두면 알림이 뜹니다.";
  }

  if (intent.action === "book_room") {
    if (!intent.date || intent.startMinutes == null || intent.endMinutes == null) {
      return "예약을 넣으려면 날짜(오늘/내일)와 시작 시각을 알려 주세요. 예: 오늘 2시 빈 회의실 예약해줘 인원은 4명이야";
    }
    const rooms = (await listRooms(userId)).filter((item) => item.active);
    const startMinutes = roundSlot(intent.startMinutes);
    const endMinutes = roundSlot(intent.endMinutes);
    if (endMinutes <= startMinutes) return "종료 시각이 시작보다 늦어야 합니다. 30분 단위로 말해 주세요.";
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
      return `인원 ${people}명을 넣을 회의실이 없습니다. 최대 수용은 ${max}명입니다.`;
    }
    if (named && people != null && named.capacity < people) {
      return `${named.name}은 ${named.capacity}명까지입니다. ${people}명이면 더 큰 빈 회의실을 지정해 주세요.`;
    }
    if (named && !intent.anyEmpty && !free(named.id)) {
      return `${named.name}은 그 시간에 이미 예약되어 있습니다. 빈 회의실로 말해 주시면 다른 방을 잡습니다.`;
    }
    const room =
      named && (!intent.anyEmpty || free(named.id))
        ? named
        : sized.find((item) => free(item.id));
    if (!room) return `${formatWhen(when.startAt)}부터 ${clock(endMinutes)}까지 비어 있는 회의실이 없습니다.`;
    const saved = await createReservation(userId, {
      roomId: room.id,
      title: intent.title ?? "예약",
      startAt: when.startAt,
      endAt: when.endAt,
    });
    const who = people ? ` · ${people}명` : "";
    return `비어 있는 ${room.name}(${room.capacity}명)을 ${formatWhen(saved.startAt)}부터 ${clock(endMinutes)}까지 예약했습니다${who}. 제목: ${saved.title}`;
  }

  if (intent.action === "create_ticket") {
    const ticket = await createTicket(userId, {
      category: intent.category ?? "etc",
      title: intent.title ?? "IT 문의",
      description: intent.description ?? "챗봇으로 등록한 문의",
      urgency: intent.urgency ?? "normal",
    });
    return `IT helpdesk에 등록했습니다. 번호 ${ticket.id.slice(0, 8)} · ${categoryLabel[ticket.category]} · 상태 ${statusLabel[ticket.status]} · ${ticket.title}`;
  }

  if (intent.action === "list_tickets") {
    const tickets = role === "admin" ? await listAllTickets(userId, null, null) : await listMyTickets(userId);
    if (tickets.length === 0) return "등록된 IT 문의가 없습니다.";
    return tickets
      .slice(0, 10)
      .map((ticket) => `${ticket.id.slice(0, 8)} · ${statusLabel[ticket.status]} · ${ticket.title}`)
      .join("\n");
  }

  if (intent.action === "ticket_detail") {
    const tickets = role === "admin" ? await listAllTickets(userId, null, null) : await listMyTickets(userId);
    const latest = tickets[0];
    if (!latest) return "볼 문의가 없습니다.";
    const detail = await getTicket(userId, latest.id);
    const comments = detail.comments.map((item) => `- ${item.authorName}: ${item.body}`).join("\n");
    return [
      `${detail.ticket.title}`,
      `상태 ${statusLabel[detail.ticket.status]} · ${categoryLabel[detail.ticket.category]}`,
      detail.ticket.description,
      comments ? `댓글\n${comments}` : "댓글 없음",
    ].join("\n");
  }

  return "처리할 업무를 찾지 못했습니다.";
}
