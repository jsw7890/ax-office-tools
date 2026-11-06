import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { AppError } from "../src/lib/errors";
import { cancelReservation, createReservation } from "../src/lib/services/reservations";
import { seoulDateTime } from "../src/lib/time";
import { OTHER_ID, roomId, setupDb } from "./helpers";
import type { OfficeDatabase } from "../src/lib/db";

describe("회의실 예약", { concurrency: 1 }, () => {
  let db: OfficeDatabase;
  let staffId = "";
  let adminId = "";
  let roomA = "";

  before(async () => {
    const ready = await setupDb();
    db = ready.db;
    staffId = ready.staffId;
    adminId = ready.adminId;
    roomA = await roomId(db, "회의실 A");
  });

  test("겹치는 예약은 한 건만 저장된다", async () => {
    const startAt = seoulDateTime(4, 10, 0);
    const endAt = seoulDateTime(4, 11, 0);
    const results = await Promise.allSettled([
      createReservation(staffId, { roomId: roomA, title: "동시 1", startAt, endAt }),
      createReservation(adminId, { roomId: roomA, title: "동시 2", startAt, endAt }),
    ]);
    const saved = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");
    assert.equal(saved.length, 1);
    assert.equal(rejected.length, 1);
    const reason = rejected[0].status === "rejected" ? rejected[0].reason : null;
    assert.ok(reason instanceof AppError);
    assert.equal(reason.code, "overlap");
    const rows = await db.asOwner((sql) =>
      sql("select id from reservations where room_id = $1 and start_at = $2 and status = 'active'", [roomA, startAt]),
    );
    assert.equal(rows.length, 1);
  });

  test("이어지는 시간은 둘 다 예약된다", async () => {
    const first = await createReservation(staffId, {
      roomId: roomA,
      title: "앞 시간",
      startAt: seoulDateTime(5, 10, 0),
      endAt: seoulDateTime(5, 10, 30),
    });
    const second = await createReservation(adminId, {
      roomId: roomA,
      title: "뒷 시간",
      startAt: seoulDateTime(5, 10, 30),
      endAt: seoulDateTime(5, 11, 0),
    });
    assert.notEqual(first.id, second.id);
  });

  test("지난 시간, 운영 시간 밖, 30분이 아닌 시간은 거절된다", async () => {
    await assert.rejects(
      () => createReservation(staffId, { roomId: roomA, title: "과거", startAt: seoulDateTime(-1, 10, 0), endAt: seoulDateTime(-1, 10, 30) }),
      (error: unknown) => error instanceof AppError && error.code === "past" && true,
    );
    await assert.rejects(
      () => createReservation(staffId, { roomId: roomA, title: "이른 시간", startAt: seoulDateTime(6, 8, 0), endAt: seoulDateTime(6, 8, 30) }),
      (error: unknown) => error instanceof AppError && error.code === "hours" && true,
    );
    await assert.rejects(
      () => createReservation(staffId, { roomId: roomA, title: "15분", startAt: seoulDateTime(6, 10, 15), endAt: seoulDateTime(6, 10, 45) }),
      (error: unknown) => error instanceof AppError && error.code === "slot" && true,
    );
  });

  test("다른 사람의 예약은 취소할 수 없고 관리자는 취소할 수 있다", async () => {
    const reservation = await createReservation(staffId, {
      roomId: roomA,
      title: "본인 예약",
      startAt: seoulDateTime(7, 14, 0),
      endAt: seoulDateTime(7, 15, 0),
    });
    await assert.rejects(
      () => cancelReservation(OTHER_ID, reservation.id),
      (error: unknown) => error instanceof AppError && error.code === "forbidden" && true,
    );
    const still = await db.asOwner((sql) => sql("select status from reservations where id = $1", [reservation.id]));
    assert.equal(still[0]?.status, "active");
    await cancelReservation(adminId, reservation.id);
    const cancelled = await db.asOwner((sql) => sql("select status from reservations where id = $1", [reservation.id]));
    assert.equal(cancelled[0]?.status, "cancelled");
  });

  test("직원은 다른 사람 이름으로 예약할 수 없다", async () => {
    await assert.rejects(() =>
      db.withUser(staffId, (sql) =>
        sql(
          `insert into reservations (room_id, user_id, title, start_at, end_at)
           values ($1, $2, '대리 예약', $3, $4)`,
          [roomA, adminId, seoulDateTime(8, 11, 0), seoulDateTime(8, 11, 30)],
        ),
      ),
    );
  });

  test("중복 방지 제약이 데이터베이스에 있다", async () => {
    const rows = await db.asOwner((sql) =>
      sql("select conname from pg_constraint where conname = 'reservations_no_overlap'"),
    );
    assert.equal(rows.length, 1);
  });
});
