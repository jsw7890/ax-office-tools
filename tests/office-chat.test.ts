import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { parseOfficeIntent } from "../src/lib/chat/intent";
import { askQuestion } from "../src/lib/services/chat";
import { addComment, changeTicketStatus, listMyTickets } from "../src/lib/services/tickets";
import { dueRoomReminders, listNotices } from "../src/lib/services/notifications";
import { seoulToday } from "../src/lib/time";
import { setupDb } from "./helpers";

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
  });

  test("오늘 2시 빈 회의실과 인원만 말해도 예약한다", async () => {
    const parsed = parseOfficeIntent("오늘 2시 빈 회의실 예약해줘 인원은 4명이야");
    assert.equal(parsed.action, "book_room");
    if (parsed.action === "book_room") {
      assert.equal(parsed.date, seoulToday());
      assert.equal(parsed.startMinutes, 14 * 60);
      assert.equal(parsed.endMinutes, 15 * 60);
      assert.equal(parsed.people, 4);
      assert.equal(parsed.anyEmpty, true);
    }
    const result = await askQuestion(staffId, "오늘 2시 빈 회의실 예약해줘 인원은 4명이야");
    assert.match(result.answer, /회의실/);
    assert.match(result.answer, /예약했습니다/);
    assert.match(result.answer, /4명/);
  });

  test("챗봇으로 회의실을 예약한다", async () => {
    const result = await askQuestion(staffId, `내일 회의실 A 14시부터 15시 팀 미팅 예약`);
    assert.match(result.answer, /회의실 A/);
    assert.match(result.answer, /예약했습니다/);
  });

  test("10분 전 알림을 켠다", async () => {
    const result = await askQuestion(staffId, "회의 예약 10분 전 알람 켜줘");
    assert.match(result.answer, /10분 전 알림을 켰습니다/);
    const due = await dueRoomReminders(staffId);
    assert.equal(Array.isArray(due), true);
  });

  test("챗봇으로 IT 문의를 등록하고 목록이 갱신된다", async () => {
    const created = await askQuestion(staffId, "모니터가 켜지지 않아요. IT 문의 등록해줘");
    assert.match(created.answer, /IT helpdesk에 등록/);
    const listed = await askQuestion(staffId, "내 문의 목록");
    assert.match(listed.answer, /모니터/);
    const tickets = await listMyTickets(staffId);
    assert.ok(tickets.some((item) => item.title.includes("모니터")));
  });

  test("같은 IT 문의를 연속으로 보내도 한 건만 등록된다", async () => {
    const text = "키보드가 작동하지 않아요. IT 문의 등록해줘";
    await askQuestion(staffId, text);
    await askQuestion(staffId, text);
    const tickets = await listMyTickets(staffId);
    assert.equal(tickets.filter((item) => item.title.includes("키보드")).length, 1);
  });

  test("관리자 답변과 상태 변경이 알림과 저장소에 남는다", async () => {
    const created = await askQuestion(staffId, "프린터 고장입니다. 헬프데스크 문의 등록");
    const tickets = await listMyTickets(staffId);
    const ticket = tickets.find((item) => item.title.includes("프린터"));
    assert.ok(ticket);
    await addComment(adminId, ticket.id, "기사 방문 예정입니다.");
    const started = await changeTicketStatus(adminId, ticket.id, "in_progress");
    assert.equal(started.status, "in_progress");
    const notices = await listNotices(staffId);
    assert.ok(notices.some((item) => item.kind === "helpdesk_reply"));
    assert.ok(notices.some((item) => item.kind === "helpdesk_status"));
    const detail = await askQuestion(staffId, "문의 상세 보여줘");
    assert.match(detail.answer, /기사 방문/);
    assert.match(detail.answer, /처리중/);
  });
});
