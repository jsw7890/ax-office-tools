import { resetDbForTests } from "../src/lib/bootstrap";
import type { OfficeDatabase } from "../src/lib/db";

export const OTHER_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

export async function setupDb(): Promise<{ db: OfficeDatabase; staffId: string; adminId: string }> {
  process.env.DATABASE_PATH = "memory";
  process.env.SESSION_SECRET = "test-secret-test-secret-test-secret";
  process.env.LLM_PROVIDER = "mock";
  const db = await resetDbForTests();
  const people = await db.asOwner((sql) => sql("select id, email from profiles"));
  const staffId = String(people.find((row) => row.email === "staff@example.com")?.id);
  const adminId = String(people.find((row) => row.email === "admin@example.com")?.id);
  await db.asOwner((sql) =>
    sql(
      `insert into auth.users (id, email) values ($1, 'other@example.com')
       on conflict (id) do nothing`,
      [OTHER_ID],
    ),
  );
  await db.asOwner((sql) =>
    sql(
      `insert into profiles (id, name, email, role) values ($1, '이직원', 'other@example.com', 'staff')
       on conflict (id) do nothing`,
      [OTHER_ID],
    ),
  );
  return { db, staffId, adminId };
}

export async function roomId(db: OfficeDatabase, name: string): Promise<string> {
  const rows = await db.asOwner((sql) => sql("select id from rooms where name = $1", [name]));
  return String(rows[0]?.id);
}
