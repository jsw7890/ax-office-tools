import { getDb } from "@/lib/bootstrap";
import { mapDbError } from "@/lib/errors";

export type Notice = {
  id: string;
  kind: string;
  title: string;
  body: string;
  href: string | null;
  readAt: string | null;
  createdAt: string;
};

function asNotice(row: Record<string, unknown>): Notice {
  return {
    id: String(row.id),
    kind: String(row.kind),
    title: String(row.title),
    body: String(row.body),
    href: row.href == null ? null : String(row.href),
    readAt: row.read_at == null ? null : String(row.read_at),
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  };
}

export async function addNotice(
  actorId: string,
  input: { userId: string; kind: string; title: string; body: string; href?: string },
): Promise<void> {
  const db = await getDb();
  try {
    await db.withUser(actorId, (sql) =>
      sql(
        `insert into notifications (user_id, kind, title, body, href)
         values ($1, $2, $3, $4, $5)`,
        [input.userId, input.kind, input.title, input.body, input.href ?? null],
      ),
    );
  } catch (error) {
    throw mapDbError(error);
  }
}

export async function listNotices(userId: string): Promise<Notice[]> {
  const db = await getDb();
  try {
    const rows = await db.withUser(userId, (sql) =>
      sql(
        `select id, kind, title, body, href, read_at, created_at
         from notifications
         where user_id = auth.uid()
         order by created_at desc
         limit 30`,
      ),
    );
    return rows.map(asNotice);
  } catch (error) {
    throw mapDbError(error);
  }
}

export async function markNoticesRead(userId: string): Promise<void> {
  const db = await getDb();
  try {
    await db.withUser(userId, (sql) =>
      sql("update notifications set read_at = now() where user_id = auth.uid() and read_at is null"),
    );
  } catch (error) {
    throw mapDbError(error);
  }
}

export async function setRoomReminder(userId: string, enabled: boolean): Promise<void> {
  const db = await getDb();
  try {
    await db.withUser(userId, (sql) =>
      sql(
        `insert into user_prefs (user_id, room_reminder_10m, updated_at)
         values (auth.uid(), $1, now())
         on conflict (user_id) do update set room_reminder_10m = $1, updated_at = now()`,
        [enabled],
      ),
    );
  } catch (error) {
    throw mapDbError(error);
  }
}

export async function roomReminderEnabled(userId: string): Promise<boolean> {
  const db = await getDb();
  try {
    const rows = await db.withUser(userId, (sql) =>
      sql("select room_reminder_10m from user_prefs where user_id = auth.uid()"),
    );
    if (!rows[0]) return true;
    return rows[0].room_reminder_10m === true || rows[0].room_reminder_10m === "t";
  } catch (error) {
    throw mapDbError(error);
  }
}

export type DueReminder = {
  id: string;
  title: string;
  roomName: string;
  startAt: string;
};

export async function dueRoomReminders(userId: string): Promise<DueReminder[]> {
  const db = await getDb();
  try {
    const enabled = await roomReminderEnabled(userId);
    if (!enabled) return [];
    const rows = await db.withUser(userId, (sql) =>
      sql(
        `select r.id, r.title, rm.name as room_name, r.start_at
         from reservations r
         join rooms rm on rm.id = r.room_id
         where r.user_id = auth.uid()
           and r.status = 'active'
           and r.start_at > now()
           and r.start_at <= now() + interval '10 minutes'`,
      ),
    );
    return rows.map((row) => ({
      id: String(row.id),
      title: String(row.title),
      roomName: String(row.room_name),
      startAt: row.start_at instanceof Date ? row.start_at.toISOString() : String(row.start_at),
    }));
  } catch (error) {
    throw mapDbError(error);
  }
}
