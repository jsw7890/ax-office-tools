// 평가 질문을 LLM 없이 업무 분류 + 조문 검색(키워드·혼합)에 넣어 채점한다. 실행: npm run eval
import { readFileSync } from "node:fs";
import { answerFromChunks, NOT_FOUND_ANSWER, OFF_TOPIC_ANSWER, rankKeywordHits } from "../src/lib/chat/answer";
import { parseOfficeIntent } from "../src/lib/chat/intent";
import { embedModelName, embedTexts } from "../src/lib/chat/ollama";
import { SIMILARITY_THRESHOLD } from "../src/lib/chat/search";
import { getDb } from "../src/lib/bootstrap";

type Question = { id: string; type: string; q: string; ok: string[] };
type Chunk = { articleNo: string; heading: string; content: string };

const data = JSON.parse(readFileSync("data/regulations/labor-standards-act.json", "utf8"));
const jsonChunks = (data.chunks as Chunk[]).map((c, i) => ({
  id: String(i),
  title: data.title,
  articleNo: c.articleNo,
  heading: c.heading,
  content: c.content,
  baseDate: data.baseDate,
  sourceUrl: data.sourceUrl,
}));
const questions: Question[] = JSON.parse(readFileSync("tests/eval/questions.json", "utf8"));

function scoreCited(item: Question, cited: string[], rejected: boolean) {
  if (parseOfficeIntent(item.q).action !== "none") return `업무로 오분류(${parseOfficeIntent(item.q).action})`;
  if (item.ok.length === 0) return rejected ? "정상 거절" : "엉뚱한 조문";
  if (cited.length > 0 && item.ok.includes(cited[0])) return "1순위 정답";
  if (cited.some((article) => item.ok.includes(article))) return "2~3순위 정답";
  return cited.length > 0 ? "틀린 조문" : "답 못 함";
}

function tally(summary: Record<string, Record<string, number>>, type: string, verdict: string) {
  summary[type] ??= {};
  summary[type][verdict] = (summary[type][verdict] ?? 0) + 1;
}

const keywordSummary: Record<string, Record<string, number>> = {};
let keywordDailyTop3 = 0;
let keywordFormalTop3 = 0;
let keywordOob = 0;
console.log("=== 키워드 검색 ===");
for (const item of questions) {
  const draft = answerFromChunks(item.q, jsonChunks);
  const cited = draft.citations.map((c) => c.articleNo).slice(0, 3);
  const rejected =
    cited.length === 0 || draft.answer === NOT_FOUND_ANSWER || draft.answer === OFF_TOPIC_ANSWER;
  const verdict = scoreCited(item, cited, rejected);
  tally(keywordSummary, item.type, verdict);
  if (item.type === "일상어" && item.ok.some((article) => cited.includes(article))) keywordDailyTop3 += 1;
  if (item.type === "조문 표현" && item.ok.some((article) => cited.includes(article))) keywordFormalTop3 += 1;
  if (item.type === "범위 밖" && rejected) keywordOob += 1;
  console.log([item.id, verdict, cited.join(",") || "-", item.ok.join("/") || "-", item.q].join(" | "));
}
console.log("\n=== 키워드 검색 요약 ===");
console.log(JSON.stringify(keywordSummary, null, 2));
console.log(
  `키워드 지표: 일상어 상위3 정답 ${keywordDailyTop3}/24, 조문표현 상위3 ${keywordFormalTop3}/6, 범위밖 거절 ${keywordOob}/4`,
);

const RRF_SQL = `
with v as (
  select chunk_id,
         row_number() over (order by min(embedding <=> $1::vector)) as rn,
         1 - min(embedding <=> $1::vector) as similarity
  from regulation_embeddings
  where model = $2
  group by chunk_id
  order by rn limit 20
),
k as (
  select chunk_id, rn
  from unnest($3::uuid[]) with ordinality as t(chunk_id, rn)
)
select c.article_no, v.similarity,
       coalesce(1.0/(60+v.rn), 0) + coalesce(1.0/(60+k.rn), 0) as score
from v
full outer join k on v.chunk_id = k.chunk_id
join regulation_chunks c on c.id = coalesce(v.chunk_id, k.chunk_id)
order by score desc, c.sort_order
limit 3`;

async function runHybridEval() {
  const model = embedModelName();
  const probe = await embedTexts(model, ["test"]);
  if (!probe) {
    console.log("\nhybrid: 미실행 (Ollama 임베딩 불가)");
    return;
  }

  let db;
  try {
    db = await getDb();
  } catch {
    console.log("\nhybrid: 미실행 (DB 없음)");
    return;
  }

  const count = await db.asOwner((sql) =>
    sql("select count(*)::int as count from regulation_embeddings where model = $1", [model]),
  );
  if (Number(count[0]?.count ?? 0) === 0) {
    console.log("\nhybrid: 미실행 (regulation_embeddings 비어 있음)");
    await db.close().catch(() => undefined);
    return;
  }

  const chunkRows = await db.asOwner((sql) =>
    sql(
      `select c.id, c.article_no, c.heading, c.content, d.title, d.base_date, d.source_url
       from regulation_chunks c join regulation_docs d on d.id = c.doc_id order by c.sort_order`,
    ),
  );
  const dbChunks = chunkRows.map((row) => ({
    id: String(row.id),
    title: String(row.title),
    articleNo: String(row.article_no),
    heading: String(row.heading),
    content: String(row.content),
    baseDate: String(row.base_date),
    sourceUrl: String(row.source_url),
  }));

  const hybridSummary: Record<string, Record<string, number>> = {};
  console.log("\n=== 혼합 검색 ===");
  let dailyTop3 = 0;
  let formalTop3 = 0;
  let oobReject = 0;

  for (const item of questions) {
    const route = parseOfficeIntent(item.q).action;
    let cited: string[] = [];
    let verdict = "답 못 함";
    if (route !== "none") {
      verdict = `업무로 오분류(${route})`;
    } else {
      const vectors = await embedTexts(model, [item.q]);
      const vector = vectors?.[0];
      if (!vector) {
        console.log("\nhybrid: 미실행 (질문 임베딩 실패)");
        await db.close().catch(() => undefined);
        return;
      }
      const keywordIds = rankKeywordHits(item.q, dbChunks)
        .slice(0, 20)
        .map((hit) => hit.id);
      const rows = await db.asOwner((sql) => sql(RRF_SQL, [JSON.stringify(vector), model, keywordIds]));
      const asksMinors = /연소|미성년|18세|15세|고등|청소년/.test(item.q);
      cited = rows
        .map((row) => String(row.article_no))
        .filter((article) => asksMinors || article !== "제69조");
      const topSimilarity = Number(rows[0]?.similarity ?? 0);
      const rejected =
        cited.length === 0 || (keywordIds.length === 0 && topSimilarity < SIMILARITY_THRESHOLD);
      if (rejected) cited = [];
      verdict = scoreCited(item, cited, rejected);
      if (item.type === "일상어" && item.ok.some((article) => cited.includes(article))) dailyTop3 += 1;
      if (item.type === "조문 표현" && item.ok.some((article) => cited.includes(article))) formalTop3 += 1;
      if (item.type === "범위 밖" && rejected) oobReject += 1;
    }
    tally(hybridSummary, item.type, verdict);
    console.log([item.id, verdict, cited.join(",") || "-", item.ok.join("/") || "-", item.q].join(" | "));
  }

  console.log("\n=== 혼합 검색 요약 ===");
  console.log(JSON.stringify(hybridSummary, null, 2));
  console.log(
    `혼합 지표: 일상어 상위3 정답 ${dailyTop3}/24, 조문표현 상위3 ${formalTop3}/6, 범위밖 거절 ${oobReject}/4, 유사도 기준값 ${SIMILARITY_THRESHOLD}`,
  );
  await db.close().catch(() => undefined);
}

runHybridEval().catch((error) => {
  console.error(error);
  process.exit(1);
});
