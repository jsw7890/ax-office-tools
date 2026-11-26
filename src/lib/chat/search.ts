import {
  NOT_FOUND_ANSWER,
  OFF_TOPIC_ANSWER,
  answerFromChunks,
  rankKeywordHits,
  type Citation,
  type DraftAnswer,
  type ProvidedChunk,
} from "@/lib/chat/answer";
import { embedModelName, embedTexts, type SearchMode } from "@/lib/chat/ollama";
import type { OfficeDatabase } from "@/lib/db";
import type { Sql } from "@/lib/db";

export const SIMILARITY_THRESHOLD = 0.45;
export const QUESTION_EMBED_TIMEOUT_MS = 10_000;

const OFF_TOPIC =
  /날씨|맛집|점심\s*메뉴|농담|스포츠|영화|게임|주식|코인|연예|번역해|코드\s*짜|노래|운세/;

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
select c.id, c.article_no, c.heading, d.title, c.content, d.base_date, d.source_url,
       v.similarity,
       coalesce(1.0/(60+v.rn), 0) + coalesce(1.0/(60+k.rn), 0) as score
from v
full outer join k on v.chunk_id = k.chunk_id
join regulation_chunks c on c.id = coalesce(v.chunk_id, k.chunk_id)
join regulation_docs d on d.id = c.doc_id
order by score desc, c.sort_order
limit 6`;

function excerpt(content: string): string {
  const compact = content.replace(/\s+\n/g, "\n").trim();
  if (compact.length <= 700) return compact;
  return `${compact.slice(0, 700).trim()}…`;
}

function rejectHybrid(question: string): DraftAnswer {
  const normalized = question.replace(/\s+/g, " ").trim();
  if (OFF_TOPIC.test(normalized) && !/제\d+조/.test(normalized)) {
    return { answer: OFF_TOPIC_ANSWER, citations: [], suggestHelpdesk: false };
  }
  return { answer: NOT_FOUND_ANSWER, citations: [], suggestHelpdesk: true };
}

function filterMinorArticles(question: string, chunks: ProvidedChunk[]): ProvidedChunk[] {
  const asksAboutMinors = /연소|미성년|18세|15세|고등|청소년/.test(question.replace(/\s+/g, " ").trim());
  return chunks.filter((chunk) => {
    const minorOnly = /15세 이상 18세 미만/.test(chunk.content) || chunk.articleNo === "제69조";
    return !(minorOnly && !asksAboutMinors);
  });
}

function draftFromChunks(question: string, picked: ProvidedChunk[]): DraftAnswer {
  const citations: Citation[] = picked.map((chunk) => ({
    chunkId: chunk.id,
    docTitle: chunk.title,
    articleNo: chunk.articleNo,
    heading: chunk.heading,
    baseDate: chunk.baseDate,
    sourceUrl: chunk.sourceUrl,
  }));
  const answer = picked
    .map((chunk) => {
      return `${chunk.articleNo}(${chunk.heading})\n${excerpt(chunk.content)}\n출처: ${chunk.title} ${chunk.articleNo} (기준일 ${chunk.baseDate})`;
    })
    .join("\n\n");
  return { answer, citations, suggestHelpdesk: false };
}

async function embeddingCount(sql: Sql, model: string): Promise<number> {
  const rows = await sql("select count(*)::int as count from regulation_embeddings where model = $1", [model]);
  return Number(rows[0]?.count ?? 0);
}

export async function embedQuestion(question: string, model = embedModelName()): Promise<number[] | null> {
  const vectors = await embedTexts(model, [question], QUESTION_EMBED_TIMEOUT_MS);
  return vectors?.[0] ?? null;
}

export type HybridSearchOutcome = { draft: DraftAnswer; searchMode: SearchMode };

export async function hybridSearch(
  db: OfficeDatabase,
  userId: string,
  question: string,
  chunks: ProvidedChunk[],
): Promise<HybridSearchOutcome> {
  const model = embedModelName();
  const provider = (process.env.LLM_PROVIDER ?? "ollama").trim().toLowerCase();
  if (provider === "mock" || provider === "claude") {
    return { draft: answerFromChunks(question, chunks), searchMode: "keyword" };
  }

  let hasEmbeddings = false;
  try {
    hasEmbeddings = (await db.withUser(userId, (sql) => embeddingCount(sql, model))) > 0;
  } catch {
    return { draft: answerFromChunks(question, chunks), searchMode: "keyword" };
  }
  if (!hasEmbeddings) {
    return { draft: answerFromChunks(question, chunks), searchMode: "keyword" };
  }

  const questionVector = await embedQuestion(question, model);
  if (!questionVector) {
    return { draft: answerFromChunks(question, chunks), searchMode: "keyword" };
  }

  return runHybridWithVector(db, userId, question, chunks, questionVector, model);
}

export async function runHybridWithVector(
  db: OfficeDatabase,
  userId: string,
  question: string,
  chunks: ProvidedChunk[],
  questionVector: number[],
  model = embedModelName(),
  keywordHits = rankKeywordHits(question, chunks).slice(0, 20),
): Promise<HybridSearchOutcome> {
  const keywordIds = keywordHits.map((hit) => hit.id);
  try {
    const rows = await db.withUser(userId, (sql) =>
      sql(RRF_SQL, [JSON.stringify(questionVector), model, keywordIds]),
    );

    const picked: { chunk: ProvidedChunk; similarity: number }[] = [];
    for (const row of rows) {
      const found = chunks.find((chunk) => chunk.id === String(row.id));
      if (found) picked.push({ chunk: found, similarity: Number(row.similarity ?? 0) });
    }
    const filtered = filterMinorArticles(
      question,
      picked.map((item) => item.chunk),
    ).slice(0, 3);
    const topSimilarity = picked.find((item) => filtered.some((chunk) => chunk.id === item.chunk.id))?.similarity ?? 0;
    const keywordAnswered = answerFromChunks(question, chunks).citations.length > 0;

    if (filtered.length === 0 || (!keywordAnswered && topSimilarity < SIMILARITY_THRESHOLD)) {
      return { draft: rejectHybrid(question), searchMode: "hybrid" };
    }

    return { draft: draftFromChunks(question, filtered), searchMode: "hybrid" };
  } catch (error) {
    console.error("hybrid search failed", error);
    return { draft: answerFromChunks(question, chunks), searchMode: "keyword" };
  }
}