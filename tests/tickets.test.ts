import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { AppError } from "../src/lib/errors";
import { addComment, changeTicketStatus, createTicket, getTicket, listAllTickets } from "../src/lib/services/tickets";
import { OTHER_ID, setupDb } from "./helpers";

describe("헬프데스크", { concurrency: 1 }, () => {
  let staffId = "";
  let adminId = "";

  before(async () => {
    const ready = await setupDb();
    staffId = ready.staffId;
    adminId = ready.adminId;
  });

  test("상태는 접수, 처리중, 완료 순서로만 바뀌고 완료 시각이 남는다", async () => {
    const ticket = await createTicket(staffId, {
      category: "pc",
      title: "모니터가 켜지지 않음",
      description: "샘플 문의입니다.",
      urgency: "normal",
    });
    assert.equal(ticket.status, "received");
    await assert.rejects(
      () => changeTicketStatus(staffId, ticket.id, "in_progress"),
      (error: unknown) => error instanceof AppError && error.code === "forbidden",
    );
    const started = await changeTicketStatus(adminId, ticket.id, "in_progress");
    assert.equal(started.status, "in_progress");
    await assert.rejects(
      () => changeTicketStatus(adminId, ticket.id, "received"),
      (error: unknown) => error instanceof AppError && error.code === "status" && true,
    );
    const done = await changeTicketStatus(adminId, ticket.id, "done");
    assert.equal(done.status, "done");
    assert.ok(done.doneAt);
    await assert.rejects(
      () => changeTicketStatus(adminId, ticket.id, "in_progress"),
      (error: unknown) => error instanceof AppError && error.code === "status" && true,
    );
  });

  test("다른 직원의 문의는 보거나 댓글을 달 수 없다", async () => {
    const ticket = await createTicket(staffId, {
      category: "account",
      title: "비밀번호 초기화",
      description: "샘플 계정 문의입니다.",
      urgency: "urgent",
    });
    await assert.rejects(
      () => getTicket(OTHER_ID, ticket.id),
      (error: unknown) => error instanceof AppError && error.code === "not_found" && true,
    );
    await assert.rejects(
      () => addComment(OTHER_ID, ticket.id, "남의 문의에 댓글"),
      (error: unknown) => error instanceof AppError && error.status === 403 && true,
    );
    const comment = await addComment(staffId, ticket.id, "추가로 오후에도 안 됩니다.");
    assert.equal(comment.body, "추가로 오후에도 안 됩니다.");
    const adminComment = await addComment(adminId, ticket.id, "접수했습니다.");
    assert.equal(adminComment.authorName, "박관리");
    await assert.rejects(
      () => listAllTickets(staffId, null, null),
      (error: unknown) => error instanceof AppError && error.code === "forbidden",
    );
    const all = await listAllTickets(adminId, "received", "account");
    assert.ok(all.some((item) => item.id === ticket.id));
  });

  test("스크립트 문장은 그대로 저장된다", async () => {
    const title = "<script>alert(1)</script>";
    const ticket = await createTicket(staffId, {
      category: "etc",
      title,
      description: "'); drop table tickets; --",
      urgency: "normal",
    });
    const loaded = await getTicket(staffId, ticket.id);
    assert.equal(loaded.ticket.title, title);
    assert.equal(loaded.ticket.description, "'); drop table tickets; --");
  });
});
