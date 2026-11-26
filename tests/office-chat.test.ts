import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, describe, test } from "node:test";
import { bookingIso, parseOfficeIntent } from "../src/lib/chat/intent";
import { askQuestion } from "../src/lib/services/chat";
import { listReservations, createReservation, cancelReservation } from "../src/lib/services/reservations";
import { addComment, changeTicketStatus, createTicket, listMyTickets } from "../src/lib/services/tickets";
import { dueRoomReminders, listNotices } from "../src/lib/services/notifications";
import { addDays, seoulToday } from "../src/lib/time";
import { setupDb } from "./helpers";

const PIN = "2026-11-26";

describe("업무 챗봇", { concurrency: 1 }, () => {
  let staffId = "";
  let adminId = "";

  before(async () => {
    const ready = await setupDb();
    staffId = ready.staffId;
    adminId = ready.adminId;
  });

  test("예약 내역이 없으면 그 사실을 말한다", async () => {
    const result = await askQuestion(staffId, "내 예약 내역 보여줘");
    assert.match(result.answer, /예약이 없습니다/);
    assert.equal((result.pendingActions ?? []).length, 0);
  });

  test("내일 11시 빈 회의실과 인원만 말해도 예약을 제안한다", async () => {
    const date = addDays(seoulToday(), 1);
    const parsed = parseOfficeIntent("내일 11시 빈 회의실 예약해줘 인원은 4명이야", seoulToday());
    assert.equal(parsed.action, "book_room");
    if (parsed.action === "book_room") {
      assert.equal(parsed.date, date);
      assert.equal(parsed.startMinutes, 11 * 60);
      assert.equal(parsed.endMinutes, 12 * 60);
      assert.equal(parsed.people, 4);
      assert.equal(parsed.anyEmpty, true);
    }
    const result = await askQuestion(staffId, "내일 11시 빈 회의실 예약해줘 인원은 4명이야");
    assert.match(result.answer, /회의실/);
    assert.match(result.answer, /제안/);
    assert.match(result.answer, /4명/);
    assert.equal(result.pendingActions?.length, 1);
    assert.equal(result.pendingActions?.[0]?.type, "reservation.create");
    const mine = await listReservations(staffId, date, true);
    assert.equal(mine.filter((row) => row.status === "active" && row.title.includes("4명")).length, 0);
    const payload = result.pendingActions![0];
    if (payload.type === "reservation.create") {
      await createReservation(staffId, payload.payload);
    }
    const after = await listReservations(staffId, date, true);
    assert.ok(after.some((row) => row.status === "active" && row.title.includes("4명")));
  });

  test("챗봇으로 회의실을 예약한다", async () => {
    const date = addDays(seoulToday(), 2);
    const text = `모레 회의실 A 14시부터 15시 팀 미팅 예약`;
    const result = await askQuestion(staffId, text);
    assert.match(result.answer, /회의실 A/);
    assert.match(result.answer, /제안/);
    assert.equal(result.pendingActions?.length, 1);
    const before = await listReservations(staffId, date, true);
    const countBefore = before.filter((row) => row.status === "active").length;
    const payload = result.pendingActions![0];
    if (payload.type === "reservation.create") {
      assert.equal(payload.payload.title, "팀 미팅");
      await createReservation(staffId, payload.payload);
    }
    const after = await listReservations(staffId, date, true);
    assert.equal(after.filter((row) => row.status === "active").length, countBefore + 1);
  });

  test("예약 취소는 확인 전에는 DB에 반영되지 않는다", async () => {
    const date = addDays(seoulToday(), 3);
    const rooms = (await listReservations(staffId, date, false)).length;
    void rooms;
    const booked = await askQuestion(staffId, `글피 회의실 B 10시부터 11시 점검 예약해줘`);
    const create = booked.pendingActions?.[0];
    assert.equal(create?.type, "reservation.create");
    if (create?.type !== "reservation.create") return;
    const saved = await createReservation(staffId, create.payload);
    const asked = await askQuestion(staffId, "내 예약 취소해줘");
    assert.match(asked.answer, /취소/);
    assert.ok((asked.pendingActions ?? []).some((item) => item.type === "reservation.cancel"));
    const still = await listReservations(staffId, date, true);
    assert.equal(still.find((row) => row.id === saved.id)?.status, "active");
    const cancel = asked.pendingActions!.find((item) => item.type === "reservation.cancel" && item.payload.reservationId === saved.id);
    assert.ok(cancel);
    if (cancel?.type === "reservation.cancel") {
      await cancelReservation(staffId, cancel.payload.reservationId);
    }
    const after = await listReservations(staffId, date, true);
    assert.equal(after.find((row) => row.id === saved.id)?.status, "cancelled");
  });

  test("10분 전 알림을 켠다", async () => {
    const result = await askQuestion(staffId, "회의 예약 10분 전 알람 켜줘");
    assert.match(result.answer, /10분 전 알림을 켰습니다/);
    const due = await dueRoomReminders(staffId);
    assert.equal(Array.isArray(due), true);
  });

  test("챗봇으로 IT 문의를 등록하고 목록이 갱신된다", async () => {
    const created = await askQuestion(staffId, "모니터가 켜지지 않아요. IT 문의 등록해줘");
    assert.match(created.answer, /등록을 제안/);
    assert.equal(created.pendingActions?.length, 1);
    const ticketsBefore = await listMyTickets(staffId);
    const countBefore = ticketsBefore.filter((item) => item.title.includes("모니터")).length;
    const payload = created.pendingActions![0];
    if (payload.type === "ticket.create") {
      await createTicket(staffId, payload.payload);
    }
    const listed = await askQuestion(staffId, "내 문의 목록");
    assert.match(listed.answer, /모니터/);
    const tickets = await listMyTickets(staffId);
    assert.equal(tickets.filter((item) => item.title.includes("모니터")).length, countBefore + 1);
  });

  test("같은 IT 문의를 연속으로 서비스에 보내도 한 건만 등록된다", async () => {
    const text = "키보드가 작동하지 않아요. IT 문의 등록해줘";
    const first = await askQuestion(staffId, text);
    const second = await askQuestion(staffId, text);
    assert.equal(first.pendingActions?.length, 1);
    assert.equal(second.pendingActions?.length, 1);
    const payload = first.pendingActions![0];
    if (payload.type === "ticket.create") {
      await createTicket(staffId, payload.payload);
      await createTicket(staffId, payload.payload);
    }
    const tickets = await listMyTickets(staffId);
    assert.equal(tickets.filter((item) => item.title.includes("키보드")).length, 1);
  });

  test("관리자 답변과 상태 변경이 알림과 저장소에 남는다", async () => {
    const created = await askQuestion(staffId, "프린터 고장입니다. 헬프데스크 문의 등록");
    const payload = created.pendingActions![0];
    if (payload.type === "ticket.create") {
      await createTicket(staffId, payload.payload);
    }
    const tickets = await listMyTickets(staffId);
    const ticket = tickets.find((item) => item.title.includes("프린터"));
    assert.ok(ticket);
    await addComment(adminId, ticket.id, "기사 방문 예정입니다.");
    const started = await changeTicketStatus(adminId, ticket.id, "in_progress");
    assert.equal(started.status, "in_progress");
    const notices = await listNotices(staffId);
    assert.ok(notices.some((item) => item.kind === "helpdesk_reply"));
    assert.ok(notices.some((item) => item.kind === "helpdesk_status"));
    const detail = await askQuestion(staffId, "프린터 문의 상태 알려줘");
    assert.match(detail.answer, /기사 방문/);
    assert.match(detail.answer, /처리중/);
  });
});

describe("업무 분류 날짜 (고정 2026-11-26)", () => {
  test("합격 표", () => {
    const cases: Array<{ q: string; check: (p: ReturnType<typeof parseOfficeIntent>) => void }> = [
      {
        q: "모레 3시 회의실 예약해줘",
        check: (p) => {
          assert.equal(p.action, "book_room");
          if (p.action !== "book_room") return;
          assert.equal(p.date, "2026-11-28");
          assert.equal(p.startMinutes, 15 * 60);
          const iso = bookingIso("2026-11-28", p.startMinutes!, p.endMinutes!);
          assert.match(iso.startAt, /T06:00:00/);
        },
      },
      {
        q: "내일모레 3시 회의실 예약해줘",
        check: (p) => {
          assert.equal(p.action, "book_room");
          if (p.action === "book_room") assert.equal(p.date, "2026-11-28");
        },
      },
      {
        q: "다음 주 금요일 오후 3시 회의실 예약해줘",
        check: (p) => {
          assert.equal(p.action, "book_room");
          if (p.action === "book_room") assert.equal(p.date, "2026-12-04");
        },
      },
      {
        q: "11/30 3시 회의실 예약해줘",
        check: (p) => {
          assert.equal(p.action, "book_room");
          if (p.action === "book_room") assert.equal(p.date, "2026-11-30");
        },
      },
      {
        q: "1월 5일 3시 회의실 예약해줘",
        check: (p) => {
          assert.equal(p.action, "book_room");
          if (p.action === "book_room") assert.equal(p.date, "2027-01-05");
        },
      },
      {
        q: "내일 2시 반 회의실 예약해줘",
        check: (p) => {
          assert.equal(p.action, "book_room");
          if (p.action === "book_room") assert.equal(p.startMinutes, 14 * 60 + 30);
        },
      },
      {
        q: "회의실 예약 취소해줘 오늘 3시",
        check: (p) => assert.equal(p.action, "cancel_reservation"),
      },
      {
        q: "내 예약 취소해줘",
        check: (p) => assert.equal(p.action, "cancel_reservation"),
      },
      {
        q: "프린터 문의 상태 알려줘",
        check: (p) => assert.equal(p.action, "ticket_detail"),
      },
      {
        q: "노트북 반출 안내해줘",
        check: (p) => assert.equal(p.action, "none"),
      },
      {
        q: "컴퓨터 보안 교육은 언제까지 해야 해?",
        check: (p) => assert.equal(p.action, "none"),
      },
      {
        q: "컴퓨터 고장으로 일을 못 하면 임금 받아?",
        check: (p) => assert.equal(p.action, "none"),
      },
      {
        q: "연차 예약은 몇 칠 전에 해야 해?",
        check: (p) => assert.equal(p.action, "none"),
      },
      {
        q: "회의실 예약 규정 알려줘",
        check: (p) => assert.equal(p.action, "none"),
      },
      {
        q: "회의실에서 점심 먹어도 돼?",
        check: (p) => assert.equal(p.action, "none"),
      },
      {
        q: "비밀번호 초기화해줘",
        check: (p) => assert.equal(p.action, "create_ticket"),
      },
      {
        q: "모니터가 안 켜져요",
        check: (p) => assert.equal(p.action, "create_ticket"),
      },
    ];
    for (const item of cases) {
      item.check(parseOfficeIntent(item.q, PIN));
    }
  });
});

describe("평가 질문 업무 분류", () => {
  test("34개 모두 규정 경로(none)", () => {
    const questions = JSON.parse(readFileSync("tests/eval/questions.json", "utf8")) as { q: string }[];
    assert.equal(questions.length, 34);
    for (const item of questions) {
      assert.equal(parseOfficeIntent(item.q).action, "none", item.q);
    }
  });
});