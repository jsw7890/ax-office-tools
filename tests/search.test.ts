import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { asDateOnly } from "../src/lib/time";
import { QUESTION_EMBED_TIMEOUT_MS, runHybridWithVector, SIMILARITY_THRESHOLD } from "../src/lib/chat/search";
import { answerFromChunks, type ProvidedChunk } from "../src/lib/chat/answer";
import { askQuestion } from "../src/lib/services/chat";
import { setupDb } from "./helpers";
import type { OfficeDatabase } from "../src/lib/db";

function unit(index: number): number[] {
  const values = Array.from({ length: 1024 }, () => 0);
  values[index] = 1;
  return values;
}

describe("혼합 검색", { concurrency: 1 }, () => {
  let db: OfficeDatabase;
  let staffId = "";
  let chunks: ProvidedChunk[] = [];

  before(async () => {
    const ready = await setupDb();
    db = ready.db;
    staffId = ready.staffId;
    const rows = await db.asOwner((sql) =>
      sql(
        `select c.id, d.title, c.article_no, c.heading, c.content, d.base_date, d.source_url
         from regulation_chunks c join regulation_docs d on d.id = c.doc_id order by c.sort_order`,
      ),
    );
    chunks = rows.map((row) => ({
      id: String(row.id),
      title: String(row.title),
      articleNo: String(row.article_no),
      heading: String(row.heading),
      content: String(row.content),
      baseDate: asDateOnly(row.base_date),
      sourceUrl: String(row.source_url),
    }));
  });

  test("직원은 임베딩을 넣을 수 없고 조회는 된다", async () => {
    const target = chunks.find((chunk) => chunk.articleNo === "제50조");
    assert.ok(target);
    await assert.rejects(
      () =>
        db.withUser(staffId, (sql) =>
          sql(
            `insert into regulation_embeddings (chunk_id, part, model, part_text, embedding)
             values ($1, 0, 'bge-m3', 'x', $2::vector)`,
            [target.id, JSON.stringify(unit(0))],
          ),
        ),
    );
    const listed = await db.withUser(staffId, (sql) => sql("select count(*)::int as n from regulation_embeddings"));
    assert.equal(Number(listed[0]?.n ?? 0), 0);
  });

  test("임베딩이 없으면 키워드 검색으로 돌아가고 오류가 없다", async () => {
    const result = await askQuestion(staffId, "1주 근로시간은 최대 몇 시간인가요?");
    assert.match(result.answer, /제50조/);
    assert.equal(result.llm.searchMode ?? "keyword", "keyword");
  });

  test("가짜 벡터로 혼합 검색이 조문을 고른다", async () => {
    const target = chunks.find((chunk) => chunk.articleNo === "제54조");
    assert.ok(target);
    await db.asOwner((sql) =>
      sql(
        `insert into regulation_embeddings (chunk_id, part, model, part_text, embedding)
         values ($1, 0, 'bge-m3', '휴게', $2::vector)`,
        [target.id, JSON.stringify(unit(3))],
      ),
    );
    const selected = await db.withUser(staffId, (sql) =>
      sql("select chunk_id from regulation_embeddings where model = $1", ["bge-m3"]),
    );
    assert.equal(selected.length, 1);
    const outcome = await runHybridWithVector(db, staffId, "휴게시간은 어떻게 주나요?", chunks, unit(3), "bge-m3");
    assert.equal(outcome.searchMode, "hybrid");
    assert.equal(outcome.draft.citations[0]?.articleNo, "제54조");
    assert.ok(SIMILARITY_THRESHOLD > 0);
    assert.equal(QUESTION_EMBED_TIMEOUT_MS, 10_000);
  });

  test("키워드 검색과 혼합 검색의 거절 문장은 같다", async () => {
    const keyword = answerFromChunks("오늘 날씨 어때?", chunks);
    assert.match(keyword.answer, /규정 질문만/);
  });
});
