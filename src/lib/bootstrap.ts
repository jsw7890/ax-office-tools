import { mkdirSync } from "node:fs";
import path from "node:path";
import { createDatabase, type OfficeDatabase } from "@/lib/db";
import { ensureRegulations } from "@/lib/regulations";

let current: OfficeDatabase | null = null;
let opening: Promise<OfficeDatabase> | null = null;

export function getDb(): Promise<OfficeDatabase> {
  if (!opening) {
    opening = open().catch((error) => {
      opening = null;
      current = null;
      throw error;
    });
  }
  return opening;
}

async function open(): Promise<OfficeDatabase> {
  const memory = process.env.DATABASE_PATH === "memory";
  let dataDir: string | undefined;
  if (!memory) {
    dataDir = path.join(process.cwd(), ".data", "pglite");
    mkdirSync(dataDir, { recursive: true });
  }
  const db = await createDatabase(dataDir);
  await ensureRegulations(db);
  current = db;
  return db;
}

export async function resetDbForTests(): Promise<OfficeDatabase> {
  if (current) await current.close().catch(() => undefined);
  current = null;
  opening = null;
  process.env.DATABASE_PATH = "memory";
  return getDb();
}
