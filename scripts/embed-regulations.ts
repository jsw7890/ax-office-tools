import { getDb } from "../src/lib/bootstrap";
import { embedTexts } from "../src/lib/chat/ollama";

const MODEL = process.env.EMBED_MODEL ?? "bge-m3";

function splitParts(content: string): string[] {
  if (content.length <= 700) return [content];
  return content
    .split(/(?=^\s*[①-⑳])/m)
    .map((part) => part.trim())
    .filter(Boolean);
}

async function main() {
  const db = await getDb();
  const rows = await db.asOwner((sql) =>
    sql("select id, article_no, heading, content from regulation_chunks order by sort_order"),
  );
  for (const row of rows) {
    const parts = splitParts(String(row.content)).map(
      (part) => `근로기준법 ${row.article_no}(${row.heading})\n${part}`,
    );
    const vectors = await embedTexts(MODEL, parts);
    if (!vectors) {
      console.error("임베딩을 만들지 못했습니다. Ollama가 켜져 있고 bge-m3가 있는지 확인하세요.");
      await db.close();
      process.exit(1);
    }
    await db.asOwner(async (sql) => {
      await sql("delete from regulation_embeddings where chunk_id = $1 and model = $2", [row.id, MODEL]);
      for (let index = 0; index < parts.length; index += 1) {
        await sql(
          `insert into regulation_embeddings (chunk_id, part, model, part_text, embedding)
           values ($1, $2, $3, $4, $5::vector)`,
          [row.id, index, MODEL, parts[index], JSON.stringify(vectors[index])],
        );
      }
    });
  }
  const done = await db.asOwner((sql) =>
    sql(
      `select count(*)::int as parts, count(distinct chunk_id)::int as chunks,
              max(char_length(part_text))::int as longest
       from regulation_embeddings where model = $1`,
      [MODEL],
    ),
  );
  console.log(done[0]);
  console.log("규정을 다시 넣으면(load-regulations) 임베딩이 함께 지워지므로 npm run embed-regulations 를 다시 실행하세요.");
  await db.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});