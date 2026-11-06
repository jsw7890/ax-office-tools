import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { NOT_FOUND_ANSWER, OFF_TOPIC_ANSWER } from "../src/lib/chat/answer";
import { AppError } from "../src/lib/errors";
import { askQuestion } from "../src/lib/services/chat";
import { setupDb } from "./helpers";
import type { OfficeDatabase } from "../src/lib/db";

describe("규정 챗봇", { concurrency: 1 }, () => {
  let db: OfficeDatabase;
  let staffId = "";

  before(async () => {
    const ready = await setupDb();
    db = ready.db;
    staffId = ready.staffId;
  });

  test("근로시간 질문에는 조항과 기준일이 붙는다", async () => {
    const result = await askQuestion(staffId, "1주 근로시간은 최대 몇 시간인가요?");
    assert.match(result.answer, /제50조/);
    assert.match(result.answer, /근로기준법/);
    assert.match(result.answer, /2026-10-08/);
    assert.match(result.answer, /40시간/);
    assert.equal(result.suggestHelpdesk, false);
    assert.equal(result.citations[0]?.articleNo, "제50조");
  });

  test("휴게 질문도 해당 조항을 보여 준다", async () => {
    const result = await askQuestion(staffId, "휴게시간은 어떻게 주나요?");
    assert.match(result.answer, /제54조/);
    assert.match(result.answer, /30분/);
  });

  test("규정에 없는 질문은 확인 불가 문장으로 답한다", async () => {
    const result = await askQuestion(staffId, "회사 동호회 지원금 규정이 어떻게 되나요?");
    assert.equal(result.answer, NOT_FOUND_ANSWER);
    assert.equal(result.suggestHelpdesk, true);
    assert.deepEqual(result.citations, []);
  });

  test("규정과 무관한 질문은 안내 문장으로 답한다", async () => {
    const result = await askQuestion(staffId, "오늘 서울 날씨 알려줘");
    assert.equal(result.answer, OFF_TOPIC_ANSWER);
    assert.equal(result.suggestHelpdesk, false);
  });

  test("하루 20회를 넘기면 거절한다", async () => {
    await db.asOwner((sql) => sql("delete from chat_logs where user_id = $1", [staffId]));
    for (let count = 0; count < 20; count += 1) {
      await askQuestion(staffId, `오늘 서울 날씨 알려줘 ${count}`);
    }
    await assert.rejects(
      () => askQuestion(staffId, "오늘 서울 날씨 알려줘 마지막"),
      (error: unknown) => error instanceof AppError && error.code === "limit" && true,
    );
  });

  test("승인 전에는 외부 AI를 호출하지 않는다", async () => {
    const beforeCount = await db.asOwner((sql) => sql("select count(*)::int as count from chat_logs"));
    process.env.LLM_PROVIDER = "claude";
    let called = false;
    const original = globalThis.fetch;
    globalThis.fetch = async () => {
      called = true;
      throw new Error("network should not be used");
    };
    try {
      await assert.rejects(
        () => askQuestion(staffId, "근로시간은?"),
        (error: unknown) => error instanceof AppError && error.code === "llm_not_approved" && true,
      );
      assert.equal(called, false);
    } finally {
      globalThis.fetch = original;
      process.env.LLM_PROVIDER = "mock";
    }
    const afterCount = await db.asOwner((sql) => sql("select count(*)::int as count from chat_logs"));
    assert.equal(Number(afterCount[0]?.count), Number(beforeCount[0]?.count));
  });
});
