import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { POST as login } from "../src/app/api/auth/login/route";
import { GET as listRooms, POST as createRoom } from "../src/app/api/rooms/route";
import { setupDb } from "./helpers";

function call(path: string, method: string, body?: unknown, cookie?: string) {
  const headers = new Headers({
    origin: "http://127.0.0.1:3000",
    host: "127.0.0.1:3000",
    "content-type": "application/json",
  });
  if (cookie) headers.set("cookie", cookie);
  return new Request(`http://127.0.0.1:3000${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("로그인과 권한", { concurrency: 1 }, () => {
  before(async () => {
    await setupDb();
  });

  test("로그인하지 않으면 회의실을 볼 수 없다", async () => {
    const response = await listRooms(call("/api/rooms", "GET"));
    assert.equal(response.status, 401);
  });

  test("샘플 직원은 들어가고, 회의실 추가는 관리자만 한다", async () => {
    const loggedIn = await login(call("/api/auth/login", "POST", { email: "staff@example.com" }));
    assert.equal(loggedIn.status, 200);
    const cookie = (loggedIn.headers.get("set-cookie") ?? "").split(";")[0];
    const rooms = await listRooms(call("/api/rooms", "GET", undefined, cookie));
    assert.equal(rooms.status, 200);
    const body = await rooms.json() as { rooms: Array<{ name: string }> };
    assert.equal(body.rooms.length, 3);
    const denied = await createRoom(call("/api/rooms", "POST", {
      name: "비밀 회의실",
      capacity: 2,
      location: "옥상",
      active: true,
    }, cookie));
    assert.equal(denied.status, 403);
  });

  test("다른 사이트에서 온 로그인 요청은 거절한다", async () => {
    const headers = new Headers({
      origin: "http://evil.example",
      host: "127.0.0.1:3000",
      "content-type": "application/json",
    });
    const response = await login(new Request("http://127.0.0.1:3000/api/auth/login", {
      method: "POST",
      headers,
      body: JSON.stringify({ email: "staff@example.com" }),
    }));
    assert.equal(response.status, 403);
  });
});
