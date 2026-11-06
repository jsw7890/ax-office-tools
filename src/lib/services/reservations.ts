import { getDb } from "@/lib/bootstrap";
import { AppError, mapDbError } from "@/lib/errors";
import { asDateOnly } from "@/lib/time";
import { requiredBoolean, requiredDate, requiredInstant, requiredInt, requiredText, requiredUuid } from "@/lib/validate";

export type Room = {
  id: string;
  name: string;
  capacity: number;
  location: string;
  active: boolean;
};

export type Reservation = {
  id: string;
  roomId: string;
  userId: string;
  title: string;
  startAt: string;
  endAt: string;
  status: string;
  reserverName: string;
};

function asRoom(row: Record<string, unknown>): Room {
  return {
    id: String(row.id),
    name: String(row.name),
    capacity: Number(row.capacity),
    location: String(row.location),
    active: row.active === true || row.active === "t" || row.active === "true",
  };
}

function asReservation(row: Record<string, unknown>): Reservation {
  const start = row.start_at instanceof Date ? row.start_at.toISOString() : String(row.start_at);
  const end = row.end_at instanceof Date ? row.end_at.toISOString() : String(row.end_at);
  return {
    id: String(row.id),
    roomId: String(row.room_id),
    userId: String(row.user_id),
    title: String(row.title),
    startAt: start,
    endAt: end,
    status: String(row.status),
    reserverName: String(row.reserver_name ?? ""),
  };
}

async function run<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    throw mapDbError(error);
  }
}

export async function listRooms(userId: string): Promise<Room[]> {
  const db = await getDb();
  return run(async () => {
    const rows = await db.withUser(userId, (sql) =>
      sql("select id, name, capacity, location, active from rooms order by name"),
    );
    return rows.map(asRoom);
  });
}

export async function saveRoom(
  userId: string,
  input: { id?: unknown; name?: unknown; capacity?: unknown; location?: unknown; active?: unknown },
): Promise<Room> {
  const name = requiredText(input.name, 40, "회의실 이름");
  const location = requiredText(input.location, 40, "위치");
  const capacity = requiredInt(input.capacity, 1, 500, "수용 인원");
  const active = requiredBoolean(input.active);
  const db = await getDb();
  return run(async () => {
    const profile = await db.withUser(userId, (sql) => sql("select role from profiles where id = auth.uid()"));
    if (profile[0]?.role !== "admin") throw new AppError(403, "관리자만 회의실을 바꿀 수 있습니다.", "forbidden");
    if (input.id) {
      const id = requiredUuid(input.id, "회의실");
      const rows = await db.withUser(userId, (sql) =>
        sql(
          `update rooms set name = $2, capacity = $3, location = $4, active = $5
           where id = $1
           returning id, name, capacity, location, active`,
          [id, name, capacity, location, active],
        ),
      );
      if (!rows[0]) throw new AppError(404, "회의실을 찾을 수 없습니다.", "not_found");
      return asRoom(rows[0]);
    }
    const rows = await db.withUser(userId, (sql) =>
      sql(
        `insert into rooms (name, capacity, location, active)
         values ($1, $2, $3, $4)
         returning id, name, capacity, location, active`,
        [name, capacity, location, active],
      ),
    );
    return asRoom(rows[0]);
  });
}

export async function listReservations(userId: string, dateInput: unknown, mine: boolean): Promise<Reservation[]> {
  const db = await getDb();
  return run(async () => {
    if (mine) {
      const rows = await db.withUser(userId, (sql) =>
        sql(
          `select r.id, r.room_id, r.user_id, r.title, r.start_at, r.end_at, r.status, p.name as reserver_name
           from reservations r
           join profiles p on p.id = r.user_id
           where r.user_id = auth.uid()
           order by r.start_at desc`,
        ),
      );
      return rows.map(asReservation);
    }
    const date = requiredDate(dateInput);
    const rows = await db.withUser(userId, (sql) =>
      sql(
        `select r.id, r.room_id, r.user_id, r.title, r.start_at, r.end_at, r.status, p.name as reserver_name
         from reservations r
         join profiles p on p.id = r.user_id
         where r.status = 'active'
           and (r.start_at at time zone 'Asia/Seoul')::date = $1::date
         order by r.start_at`,
        [date],
      ),
    );
    return rows.map(asReservation);
  });
}

export async function createReservation(
  userId: string,
  input: { roomId: unknown; title: unknown; startAt: unknown; endAt: unknown },
): Promise<Reservation> {
  const roomId = requiredUuid(input.roomId, "회의실");
  const title = requiredText(input.title, 80, "제목");
  const startAt = requiredInstant(input.startAt);
  const endAt = requiredInstant(input.endAt);
  const db = await getDb();
  return run(async () => {
    const rows = await db.withUser(userId, (sql) =>
      sql(
        `insert into reservations (room_id, user_id, title, start_at, end_at, status)
         values ($1, auth.uid(), $2, $3, $4, 'active')
         returning id, room_id, user_id, title, start_at, end_at, status`,
        [roomId, title, startAt, endAt],
      ),
    );
    return asReservation({ ...rows[0], reserver_name: "" });
  });
}

export async function cancelReservation(userId: string, reservationId: unknown): Promise<void> {
  const id = requiredUuid(reservationId, "예약");
  const db = await getDb();
  return run(async () => {
    const rows = await db.withUser(userId, (sql) =>
      sql(
        `update reservations
         set status = 'cancelled'
         where id = $1 and status = 'active'
         returning id`,
        [id],
      ),
    );
    if (!rows[0]) throw new AppError(403, "예약을 취소할 수 없습니다.", "forbidden");
  });
}

export function reservationDate(value: string): string {
  return asDateOnly(value);
}
