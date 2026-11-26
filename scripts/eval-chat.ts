// 평가 질문을 LLM 없이 업무 분류 + 조문 검색에 넣어 채점한다. 실행: npm run eval
import { readFileSync } from "node:fs";
import { answerFromChunks } from "../src/lib/chat/answer";
import { parseOfficeIntent } from "../src/lib/chat/intent";

type Question = { id: string; type: string; q: string; ok: string[] };
type Chunk = { articleNo: string; heading: string; content: string };

const data = JSON.parse(readFileSync("data/regulations/labor-standards-act.json", "utf8"));
const chunks = (data.chunks as Chunk[]).map((c, i) => ({
  id: String(i),
  title: data.title,
  articleNo: c.articleNo,
  heading: c.heading,
  content: c.content,
  baseDate: data.baseDate,
  sourceUrl: data.sourceUrl,
}));
const questions: Question[] = JSON.parse(readFileSync("tests/eval/questions.json", "utf8"));
const summary: Record<string, Record<string, number>> = {};

for (const item of questions) {
  const route = parseOfficeIntent(item.q).action;
  const cited = answerFromChunks(item.q, chunks).citations.map((c) => c.articleNo).slice(0, 3);
  let verdict: string;
  if (route !== "none") verdict = `업무로 오분류(${route})`;
  else if (item.ok.length === 0) verdict = cited.length === 0 ? "정상 거절" : "엉뚱한 조문";
  else if (cited.length > 0 && item.ok.includes(cited[0])) verdict = "1순위 정답";
  else if (cited.some((a) => item.ok.includes(a))) verdict = "2~3순위 정답";
  else verdict = cited.length > 0 ? "틀린 조문" : "답 못 함";
  summary[item.type] ??= {};
  summary[item.type][verdict] = (summary[item.type][verdict] ?? 0) + 1;
  console.log([item.id, verdict, cited.join(",") || "-", item.ok.join("/") || "-", item.q].join(" | "));
}
console.log(JSON.stringify(summary, null, 2));