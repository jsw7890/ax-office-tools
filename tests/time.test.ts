import assert from "node:assert/strict";
import { describe, test } from "node:test";
import vm from "node:vm";
import { asDateOnly } from "../src/lib/time";

describe("기준일 표시", () => {
  test("Date와 다른 realm Date는 YYYY-MM-DD로 나온다", () => {
    const seoul = new Date("2026-10-07T15:00:00.000Z");
    assert.equal(asDateOnly(seoul), "2026-10-08");
    const foreign = vm.runInNewContext('new Date("2026-10-07T15:00:00.000Z")');
    assert.equal(Object.prototype.toString.call(foreign), "[object Date]");
    assert.equal(asDateOnly(foreign), "2026-10-08");
  });

  test("Date를 문자열로 바꾼 값도 YYYY-MM-DD로 나온다", () => {
    const dumped = String(new Date("2026-10-07T15:00:00.000Z"));
    assert.match(dumped.slice(0, 10), /[A-Za-z]/);
    assert.equal(asDateOnly(dumped), "2026-10-08");
    assert.equal(asDateOnly("2026-10-08T00:00:00.000Z"), "2026-10-08");
  });
});
