import type { Citation, ProvidedChunk } from "@/lib/chat/answer";
import { embedModelName } from "@/lib/chat/ollama";
import type { OfficeDatabase } from "@/lib/db";

const PER_ARTICLE = 1_200;
const TOTAL = 3_000;

function headerOf(chunk: ProvidedChunk): string {
  return `${chunk.title} ${chunk.articleNo}(${chunk.heading})`;
}

function clip(text: string, limit: number): string {
  const compact = text.replace(/\s+\n/g, "\n").trim();
  if (compact.length <= limit) return compact;
  return compact.slice(0, limit).trim();
}

async function nearestParts(
  db: OfficeDatabase,
  userId: string,
  chunkId: string,
  questionVector: number[],
  model: string,
): Promise<string | null> {
  try {
    const rows = await db.withUser(userId, (sql) =>
      sql(
        `select part_text
         from regulation_embeddings
         where chunk_id = $1 and model = $2
         order by embedding <=> $3::vector
         limit 8`,
        [chunkId, model, JSON.stringify(questionVector)],
      ),
    );
    if (rows.length === 0) return null;
    let text = "";
    for (const row of rows) {
      const part = String(row.part_text ?? "").trim();
      if (!part) continue;
      if (text.length + part.length + 1 > PER_ARTICLE) {
        const room = PER_ARTICLE - text.length;
        if (room > 40) text += (text ? "\n" : "") + part.slice(0, room);
        break;
      }
      text += (text ? "\n" : "") + part;
    }
    return text || null;
  } catch {
    return null;
  }
}

export async function buildEvidenceText(
  db: OfficeDatabase,
  userId: string,
  citations: Citation[],
  chunks: ProvidedChunk[],
  questionVector?: number[] | null,
): Promise<string> {
  const picked = citations
    .map((citation) => chunks.find((chunk) => chunk.id === citation.chunkId))
    .filter((chunk): chunk is ProvidedChunk => Boolean(chunk))
    .slice(0, 3);
  if (picked.length === 0) return "";

  const model = embedModelName();
  const vector = questionVector && questionVector.length > 0 ? questionVector : null;
  const blocks: string[] = [];
  let used = 0;
  for (const chunk of picked) {
    const room = Math.min(PER_ARTICLE, TOTAL - used);
    if (room < 40) break;
    let body = clip(chunk.content, room);
    if (chunk.content.length > PER_ARTICLE && vector) {
      const near = await nearestParts(db, userId, chunk.id, vector, model);
      if (near) body = clip(near, room);
    }
    const block = `${headerOf(chunk)}\n${body}`;
    blocks.push(block);
    used += block.length;
  }
  return blocks.join("\n\n");
}
