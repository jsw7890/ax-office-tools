import { readFileSync } from "node:fs";
import { answerFromChunks, rankKeywordHits } from "../src/lib/chat/answer";
import { embedModelName, embedTexts } from "../src/lib/chat/ollama";
import { getDb } from "../src/lib/bootstrap";

type Question = { id: string; type: string; q: string; ok: string[] };

const questions: Question[] = JSON.parse(readFileSync("tests/eval/questions.json", "utf8"));
const MINOR = /연소|미성년|18세|15세|고등|청소년/;

const VECTOR_SQL = `
select c.article_no as article,
       1 - min(e.embedding <=> $1::vector) as sim
from regulation_embeddings e
join regulation_chunks c on c.id = e.chunk_id
where e.model = $2
group by c.id, c.article_no, c.sort_order
order by sim desc, c.sort_order
limit 6`;

const RRF_SQL = `
with v as (
  select chunk_id, row_number() over (order by min(embedding <=> $1::vector)) as rn,
         1 - min(embedding <=> $1::vector) as similarity
  from regulation_embeddings where model = $2
  group by chunk_id order by rn limit 20
),
k as (
  select chunk_id, rn from unnest($3::uuid[]) with ordinality as t(chunk_id, rn)
)
select c.article_no as article
from v
full outer join k on v.chunk_id = k.chunk_id
join regulation_chunks c on c.id = coalesce(v.chunk_id, k.chunk_id)
order by coalesce(1.0/(60+v.rn), 0) + coalesce(1.0/(60+k.rn), 0) desc, c.sort_order
limit 6`;

function filterMinor(question: string, articles: string[]): string[] {
  if (MINOR.test(question)) return articles.slice(0, 3);
  return articles.filter((a) => a !== "제69조").slice(0, 3);
}

function hit(item: Question, cited: string[]): boolean {
  if (item.ok.length === 0) return cited.length === 0;
  return item.ok.some((a) => cited.includes(a));
}

async function main() {
  const model = embedModelName();
  const db = await getDb();
  const chunkRows = await db.asOwner((sql) =>
    sql(
      `select c.id, c.article_no, c.heading, c.content, d.title, d.base_date, d.source_url
       from regulation_chunks c join regulation_docs d on d.id = c.doc_id order by c.sort_order`,
    ),
  );
  const chunks = chunkRows.map((row) => ({
    id: String(row.id),
    title: String(row.title),
    articleNo: String(row.article_no),
    heading: String(row.heading),
    content: String(row.content),
    baseDate: String(row.base_date),
    sourceUrl: String(row.source_url),
  }));

  type Row = {
    id: string;
    type: string;
    sim1: number;
    sim2: number;
    kwCited: boolean;
    overlap: boolean;
    vec: string[];
    kw: string[];
    rrf: string[];
    rrfVecOnly: string[];
    ok: string[];
    q: string;
  };
  const table: Row[] = [];

  let warmup = true;
  for (const item of questions) {
    const vector = (await embedTexts(model, [item.q], warmup ? 120_000 : 15_000))?.[0];
    warmup = false;
    if (!vector) throw new Error(`embed failed ${item.id}`);
    const vecRows = await db.asOwner((sql) => sql(VECTOR_SQL, [JSON.stringify(vector), model]));
    const vec = filterMinor(
      item.q,
      vecRows.map((r) => String(r.article)),
    );
    const sim1 = Number(vecRows[0]?.sim ?? 0);
    const sim2 = Number(vecRows[1]?.sim ?? 0);
    const kwDraft = answerFromChunks(item.q, chunks);
    const kwCited = kwDraft.citations.length > 0;
    const kw = kwDraft.citations.map((c) => c.articleNo).slice(0, 3);
    const kwIds = rankKeywordHits(item.q, chunks)
      .slice(0, 20)
      .map((h) => h.id);
    const rrfRows = await db.asOwner((sql) => sql(RRF_SQL, [JSON.stringify(vector), model, kwIds]));
    const rrf = filterMinor(
      item.q,
      rrfRows.map((r) => String(r.article)),
    );
    const rrfVecOnlyRows = await db.asOwner((sql) => sql(RRF_SQL, [JSON.stringify(vector), model, []]));
    const rrfVecOnly = filterMinor(
      item.q,
      rrfVecOnlyRows.map((r) => String(r.article)),
    );
    const overlap = vec.some((a) => kw.includes(a));
    table.push({
      id: item.id,
      type: item.type,
      sim1,
      sim2,
      kwCited,
      overlap,
      vec,
      kw,
      rrf,
      rrfVecOnly,
      ok: item.ok,
      q: item.q,
    });
  }

  console.log("## R1 문항별");
  console.log("| id | type | sim1 | sim2 | 키워드답 | 겹침 | vec3 | kw3 | rrf3 |");
  console.log("| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const row of table) {
    console.log(
      `| ${row.id} | ${row.type} | ${row.sim1.toFixed(4)} | ${row.sim2.toFixed(4)} | ${row.kwCited ? "Y" : "N"} | ${row.overlap ? "Y" : "N"} | ${row.vec.join(",") || "-"} | ${row.kw.join(",") || "-"} | ${row.rrf.join(",") || "-"} |`,
    );
  }

  function score(useB: boolean, tLow: number, tHigh: number) {
    let daily = 0;
    let formal = 0;
    let oob = 0;
    for (const row of table) {
      const item = questions.find((q) => q.id === row.id)!;
      const citedBase = useB && !row.overlap ? row.rrfVecOnly : row.rrf;
      const reject = row.sim1 < tLow || (!row.kwCited && row.sim1 < tHigh);
      const cited = reject ? [] : citedBase;
      if (item.type === "일상어" && item.ok.some((a) => cited.includes(a))) daily += 1;
      if (item.type === "조문 표현" && item.ok.some((a) => cited.includes(a))) formal += 1;
      if (item.type === "범위 밖" && cited.length === 0) oob += 1;
    }
    return { daily, formal, oob };
  }

  console.log("\n## R2 기준값만 (키워드 인용 없으면 거절, T_high=T)");
  console.log("| T | 일상어 | 범위밖 | 조문 |");
  console.log("| --- | --- | --- | --- |");
  for (let t = 45; t <= 65; t += 1) {
    const T = t / 100;
    const s = score(false, T, T);
    console.log(`| ${T.toFixed(2)} | ${s.daily}/24 | ${s.oob}/4 | ${s.formal}/6 |`);
  }

  console.log("\n## R3 (가) T_low × T_high, 키워드 인용 없음이면 T_high 미만 거절");
  console.log("| T_low | T_high | 일상어 | 범위밖 | 조문 |");
  console.log("| --- | --- | --- | --- | --- |");
  const best: { label: string; daily: number; oob: number; formal: number }[] = [];
  for (let lo = 45; lo <= 55; lo += 1) {
    for (let hi = lo; hi <= 65; hi += 1) {
      const s = score(false, lo / 100, hi / 100);
      const line = `| ${(lo / 100).toFixed(2)} | ${(hi / 100).toFixed(2)} | ${s.daily}/24 | ${s.oob}/4 | ${s.formal}/6 |`;
      if (s.daily >= 20 && s.oob === 4 && s.formal === 6) {
        console.log(`${line} **목표**`);
        best.push({ label: `가 ${lo / 100}/${hi / 100}`, ...s });
      } else if (hi % 5 === 0 || lo % 5 === 0) {
        console.log(line);
      }
    }
  }

  console.log("\n## R3 (나) 겹침 없으면 키워드 제외 후 (가)");
  console.log("| T_low | T_high | 일상어 | 범위밖 | 조문 |");
  console.log("| --- | --- | --- | --- | --- |");
  for (let lo = 45; lo <= 55; lo += 1) {
    for (let hi = lo; hi <= 65; hi += 1) {
      const s = score(true, lo / 100, hi / 100);
      const line = `| ${(lo / 100).toFixed(2)} | ${(hi / 100).toFixed(2)} | ${s.daily}/24 | ${s.oob}/4 | ${s.formal}/6 |`;
      if (s.daily >= 20 && s.oob === 4 && s.formal === 6) {
        console.log(`${line} **목표**`);
        best.push({ label: `나 ${lo / 100}/${hi / 100}`, ...s });
      } else if (hi % 5 === 0 && lo % 5 === 0) {
        console.log(line);
      }
    }
  }

  const ranked: { label: string; daily: number; oob: number; formal: number }[] = [];
  for (const useB of [false, true] as const) {
    for (let lo = 45; lo <= 55; lo += 1) {
      for (let hi = lo; hi <= 65; hi += 1) {
        const s = score(useB, lo / 100, hi / 100);
        ranked.push({
          label: `${useB ? "나" : "가"} ${(lo / 100).toFixed(2)}/${(hi / 100).toFixed(2)}`,
          ...s,
        });
      }
    }
  }
  ranked.sort((a, b) => b.oob - a.oob || b.daily - a.daily || b.formal - a.formal);
  const keepDaily = ranked.filter((s) => s.daily >= 20 && s.formal === 6);
  console.log("\n## 목표 만족 설정");
  console.log(best.length ? JSON.stringify(best, null, 2) : "없음");
  console.log("\n## 일상어>=20·조문=6 중 범위밖 최대 (상위 15)");
  console.log(JSON.stringify(keepDaily.slice(0, 15), null, 2));
  console.log("\n## 전체 최선 5 (범위밖 우선)");
  console.log(JSON.stringify(ranked.slice(0, 5), null, 2));
  await db.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
