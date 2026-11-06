import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { OfficeDatabase } from "@/lib/db";

type RegulationFile = {
  title: string;
  publisher: string;
  sourceUrl: string;
  baseDate: string;
  isSample: boolean;
  chunks: Array<{
    articleNo: string;
    heading: string;
    content: string;
    sortOrder: number;
  }>;
};

function readRegulationFiles(): RegulationFile[] {
  const dir = path.join(process.cwd(), "data", "regulations");
  return readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .map((file) => JSON.parse(readFileSync(path.join(dir, file), "utf8")) as RegulationFile);
}

export async function ensureRegulations(db: OfficeDatabase) {
  const rows = await db.asOwner((sql) => sql("select count(*)::int as count from regulation_docs"));
  if (Number(rows[0]?.count ?? 0) > 0) return;
  await reloadRegulations(db);
}

export async function reloadRegulations(db: OfficeDatabase) {
  const docs = readRegulationFiles();
  await db.asOwner(async (sql) => {
    await sql("delete from regulation_chunks");
    await sql("delete from regulation_docs");
    for (const doc of docs) {
      const inserted = await sql(
        `insert into regulation_docs (title, publisher, source_url, base_date, is_sample)
         values ($1, $2, $3, $4, $5)
         returning id`,
        [doc.title, doc.publisher, doc.sourceUrl, doc.baseDate, doc.isSample],
      );
      const docId = inserted[0]?.id;
      for (const chunk of doc.chunks) {
        await sql(
          `insert into regulation_chunks (doc_id, article_no, heading, content, sort_order)
           values ($1, $2, $3, $4, $5)`,
          [docId, chunk.articleNo, chunk.heading, chunk.content, chunk.sortOrder],
        );
      }
    }
  });
}
