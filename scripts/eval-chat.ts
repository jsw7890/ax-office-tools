// 평가 질문을 LLM 없이 업무 분류 + 조문 검색(키워드·혼합)에 넣어 채점한다. 실행: npm run eval
import { readFileSync } from "node:fs";
import { answerFromChunks, NOT_FOUND_ANSWER, OFF_TOPIC_ANSWER } from "../src/lib/chat/answer";
import { parseOfficeIntent } from "../src/lib/chat/intent";
import { embedModelName, embedTexts } from "../src/lib/chat/ollama";
import { runHybridWithVector, SIMILARITY_THRESHOLD } from "../src/lib/chat/search";
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
const questionsPath = process.argv[2] ?? "tests/eval/questions.json";
const questions: Question[] = JSON.parse(readFileSync(questionsPath, "utf8"));
console.log(`질문 파일: ${questionsPath} (${questions.length}건)`);

const nDaily = questions.filter((q) => q.type === "일상어").length;
const nFormal = questions.filter((q) => q.type === "조문 표현").length;
const nOob = questions.filter((q) => q.type === "범위 밖").length;
const nHold = questions.filter((q) => q.type === "일상어" || q.type === "오분류 함정").length;

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

function hitTop3(item: Question, cited: string[]): boolean {
  return item.ok.length > 0 && item.ok.some((article) => cited.includes(article));
}

function metricsLine(
  label: string,
  daily: number,
  formal: number,
  oob: number,
  hold: number,
  extra = "",
): string {
  return `${label}: 일상어 상위3 정답 ${daily}/${nDaily}, 조문표현 상위3 ${formal}/${nFormal}, 범위밖 거절 ${oob}/${nOob}, 일상어·오분류 함정 상위3 ${hold}/${nHold}${extra}`;
}

const keywordSummary: Record<string, Record<string, number>> = {};
let keywordDailyTop3 = 0;
let keywordFormalTop3 = 0;
let keywordOob = 0;
let keywordHoldTop3 = 0;
let keywordTrapMisroute = 0;
console.log("=== 키워드 검색 ===");
for (const item of questions) {
  const route = parseOfficeIntent(item.q).action;
  let cited: string[] = [];
  let rejected = false;
  let verdict: string;
  if (route !== "none") {
    verdict = `업무로 오분류(${route})`;
    if (item.type === "오분류 함정") keywordTrapMisroute += 1;
  } else {
    const draft = answerFromChunks(item.q, jsonChunks);
    cited = draft.citations.map((c) => c.articleNo).slice(0, 3);
    rejected =
      cited.length === 0 || draft.answer === NOT_FOUND_ANSWER || draft.answer === OFF_TOPIC_ANSWER;
    verdict = scoreCited(item, cited, rejected);
    if (item.type === "일상어" && hitTop3(item, cited)) keywordDailyTop3 += 1;
    if (item.type === "조문 표현" && hitTop3(item, cited)) keywordFormalTop3 += 1;
    if ((item.type === "일상어" || item.type === "오분류 함정") && hitTop3(item, cited)) keywordHoldTop3 += 1;
    if (item.type === "범위 밖" && rejected) keywordOob += 1;
  }
  tally(keywordSummary, item.type, verdict);
  console.log([item.id, verdict, cited.join(",") || "-", item.ok.join("/") || "-", item.q].join(" | "));
}
console.log("\n=== 키워드 검색 요약 ===");
console.log(JSON.stringify(keywordSummary, null, 2));
console.log(metricsLine("키워드 지표", keywordDailyTop3, keywordFormalTop3, keywordOob, keywordHoldTop3));
console.log(`키워드 오분류 함정 업무 분류: ${keywordTrapMisroute}/3`);

const STAFF_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

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
  let holdTop3 = 0;
  let trapMisroute = 0;

  for (const item of questions) {
    const route = parseOfficeIntent(item.q).action;
    let cited: string[] = [];
    let verdict = "답 못 함";
    if (route !== "none") {
      verdict = `업무로 오분류(${route})`;
      if (item.type === "오분류 함정") trapMisroute += 1;
    } else {
      const vectors = await embedTexts(model, [item.q]);
      const vector = vectors?.[0];
      if (!vector) {
        console.log("\nhybrid: 미실행 (질문 임베딩 실패)");
        await db.close().catch(() => undefined);
        return;
      }
      const outcome = await runHybridWithVector(db, STAFF_ID, item.q, dbChunks, vector, model);
      cited = outcome.draft.citations.map((c) => c.articleNo).slice(0, 3);
      const rejected = cited.length === 0;
      verdict = scoreCited(item, cited, rejected);
      if (item.type === "일상어" && hitTop3(item, cited)) dailyTop3 += 1;
      if (item.type === "조문 표현" && hitTop3(item, cited)) formalTop3 += 1;
      if ((item.type === "일상어" || item.type === "오분류 함정") && hitTop3(item, cited)) holdTop3 += 1;
      if (item.type === "범위 밖" && rejected) oobReject += 1;
    }
    tally(hybridSummary, item.type, verdict);
    console.log([item.id, verdict, cited.join(",") || "-", item.ok.join("/") || "-", item.q].join(" | "));
  }

  console.log("\n=== 혼합 검색 요약 ===");
  console.log(JSON.stringify(hybridSummary, null, 2));
  console.log(
    metricsLine(
      "혼합 지표",
      dailyTop3,
      formalTop3,
      oobReject,
      holdTop3,
      `, 유사도 기준값 ${SIMILARITY_THRESHOLD}`,
    ),
  );
  console.log(`혼합 오분류 함정 업무 분류: ${trapMisroute}/3`);
  await db.close().catch(() => undefined);
}

runHybridEval().catch((error) => {
  console.error(error);
  process.exit(1);
});
