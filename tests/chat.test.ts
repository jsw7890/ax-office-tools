import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { NOT_FOUND_ANSWER, OFF_TOPIC_ANSWER } from "../src/lib/chat/answer";
import { isOllamaRequest } from "../src/lib/chat/ollama";
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
    assert.equal(result.llm.used, false);
    assert.equal(result.llm.mode, "article_search");
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

  test("로컬 LLM이 꺼져 있으면 조문 검색으로 돌아간다", async () => {
    await db.asOwner((sql) => sql("delete from chat_logs where user_id = $1", [staffId]));
    process.env.LLM_PROVIDER = "ollama";
    const original = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      if (isOllamaRequest(input)) throw new Error("ollama down");
      return original(input, init);
    };
    try {
      const result = await askQuestion(staffId, "1주 근로시간은 최대 몇 시간인가요?");
      assert.equal(result.llm.used, false);
      assert.equal(result.llm.mode, "article_search");
      assert.match(result.answer, /제50조/);
      assert.match(result.answer, /40시간/);
    } finally {
      globalThis.fetch = original;
      process.env.LLM_PROVIDER = "mock";
    }
  });

  test("로컬 LLM이 켜져 있으면 조문을 근거로 답을 다듬는다", async () => {
    await db.asOwner((sql) => sql("delete from chat_logs where user_id = $1", [staffId]));
    process.env.LLM_PROVIDER = "ollama";
    process.env.OLLAMA_MODEL = "qwen2.5:0.5b";
    const original = globalThis.fetch;
    let chatCalled = false;
    globalThis.fetch = async (input, init) => {
      if (!isOllamaRequest(input)) return original(input, init);
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/api/tags")) {
        return new Response(JSON.stringify({ models: [{ name: "qwen2.5:0.5b" }] }), { status: 200 });
      }
      if (url.includes("/api/chat")) {
        chatCalled = true;
        const body = JSON.stringify({
          message: {
            content: "1주 소정근로시간은 40시간입니다. 근로기준법 제50조, 기준일 2026-10-08.",
          },
        });
        return new Response(body, { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response("not found", { status: 404 });
    };
    try {
      const result = await askQuestion(staffId, "1주 근로시간은 최대 몇 시간인가요?");
      assert.equal(chatCalled, true);
      assert.equal(result.llm.used, true);
      assert.equal(result.llm.mode, "local_llm");
      assert.equal(result.llm.model, "qwen2.5:0.5b");
      assert.match(result.answer, /40시간/);
      assert.match(result.answer, /제50조/);
      assert.match(result.answer, /2026-10-08/);
      assert.equal(result.citations[0]?.articleNo, "제50조");
      assert.equal(result.citations.length, 1);
    } finally {
      globalThis.fetch = original;
      process.env.LLM_PROVIDER = "mock";
    }
  });

  test("조문에 없는 숫자를 넣으면 조문 검색으로 돌아간다", async () => {
    await db.asOwner((sql) => sql("delete from chat_logs where user_id = $1", [staffId]));
    process.env.LLM_PROVIDER = "ollama";
    process.env.OLLAMA_MODEL = "qwen2.5:0.5b";
    const original = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      if (!isOllamaRequest(input)) return original(input, init);
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/api/tags")) {
        return new Response(JSON.stringify({ models: [{ name: "qwen2.5:0.5b" }] }), { status: 200 });
      }
      if (url.includes("/api/chat")) {
        return new Response(
          JSON.stringify({
            message: { content: "1주는 52시간입니다. 근로기준법 제50조, 기준일 2026-10-08." },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response("not found", { status: 404 });
    };
    try {
      const result = await askQuestion(staffId, "1주 근로시간은 최대 몇 시간인가요?");
      assert.equal(result.llm.used, false);
      assert.equal(result.llm.mode, "article_search");
      assert.match(result.answer, /제50조/);
      assert.match(result.answer, /40시간/);
      assert.doesNotMatch(result.answer, /52시간/);
    } finally {
      globalThis.fetch = original;
      process.env.LLM_PROVIDER = "mock";
    }
  });

  test("근거 없는 질문은 로컬 LLM을 부르지 않는다", async () => {
    await db.asOwner((sql) => sql("delete from chat_logs where user_id = $1", [staffId]));
    process.env.LLM_PROVIDER = "ollama";
    const original = globalThis.fetch;
    let chatCalled = false;
    globalThis.fetch = async (input, init) => {
      if (!isOllamaRequest(input)) return original(input, init);
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/api/tags")) {
        return new Response(JSON.stringify({ models: [{ name: "qwen2.5:0.5b" }] }), { status: 200 });
      }
      chatCalled = true;
      return new Response("{}", { status: 200 });
    };
    try {
      const result = await askQuestion(staffId, "오늘 서울 날씨 알려줘");
      assert.equal(chatCalled, false);
      assert.equal(result.answer, OFF_TOPIC_ANSWER);
      assert.equal(result.llm.used, false);
    } finally {
      globalThis.fetch = original;
      process.env.LLM_PROVIDER = "mock";
    }
  });
});
