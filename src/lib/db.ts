import { PGlite, type PGliteInterface, type Results, type Transaction } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { AppError } from "@/lib/errors";

export type Row = Record<string, unknown>;
export type Sql = (text: string, params?: unknown[]) => Promise<Row[]>;

export type OfficeDatabase = {
  withUser<T>(userId: string, fn: (sql: Sql) => Promise<T>): Promise<T>;
  asOwner<T>(fn: (sql: Sql) => Promise<T>): Promise<T>;
  close(): Promise<void>;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function rowsOf(result: Results): Row[] {
  return result.rows as Row[];
}

function sqlOf(tx: PGliteInterface | Transaction): Sql {
  return async (text, params = []) => rowsOf(await tx.query(text, params));
}

async function execFile(db: PGliteInterface, filePath: string) {
  await db.exec(readFileSync(filePath, "utf8"));
}

async function applyMigrations(db: PGliteInterface) {
  const dir = path.join(process.cwd(), "supabase", "migrations");
  const files = readdirSync(dir)
    .filter((file) => file.endsWith(".sql"))
    .sort();
  for (const file of files) {
    await execFile(db, path.join(dir, file));
  }
}

export async function createDatabase(dataDir?: string): Promise<OfficeDatabase> {
  const db = await PGlite.create(dataDir ?? "memory://", { extensions: { btree_gist } });
  await db.waitReady;
  await db.exec("set time zone 'Asia/Seoul'");

  const existing = await db.query<{ name: string | null }>("select to_regclass('public.rooms') as name");
  if (!existing.rows[0]?.name) {
    const localDir = path.join(process.cwd(), "supabase", "local");
    await execFile(db, path.join(localDir, "00_auth_stub.sql"));
    await applyMigrations(db);
    await execFile(db, path.join(localDir, "10_sample_users.sql"));
  } else {
    const extras = await db.query<{ name: string | null }>("select to_regclass('public.notifications') as name");
    if (!extras.rows[0]?.name) {
      await execFile(db, path.join(process.cwd(), "supabase", "migrations", "0004_office_chat.sql"));
    }
  }

  return {
    async withUser(userId, fn) {
      if (!UUID_RE.test(userId)) throw new AppError(401, "로그인이 필요합니다.", "unauthorized");
      return db.transaction(async (tx) => {
        await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
        await tx.exec("set local role authenticated");
        await tx.exec("set local time zone 'Asia/Seoul'");
        return fn(sqlOf(tx));
      });
    },
    async asOwner(fn) {
      return db.transaction(async (tx) => {
        await tx.exec("set local time zone 'Asia/Seoul'");
        return fn(sqlOf(tx));
      });
    },
    close: () => db.close(),
  };
}
