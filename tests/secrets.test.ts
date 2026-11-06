import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";

const SKIP = new Set(["node_modules", ".next", ".data", ".git"]);
const SECRET = new RegExp(
  [
    ["sk", "ant"].join("-"),
    "AKIA[0-9A-Z]{16}",
    ["SUPABASE_SERVICE_ROLE_KEY", "ANTHROPIC_API_KEY"].map((name) => `${name}=\\S`).join("|"),
    ["eyJ", "hbGciOi"].join(""),
  ].join("|"),
);

function files(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const full = path.join(dir, entry);
    const info = statSync(full);
    if (info.isDirectory()) found.push(...files(full));
    else if (/\.(ts|tsx|js|mjs|sql|md|json|example|css)$/.test(entry) || entry.startsWith(".env")) found.push(full);
  }
  return found;
}

describe("비밀키", () => {
  test("저장소 파일에 API 키가 없다", () => {
    const hits: string[] = [];
    for (const file of files(process.cwd())) {
      const text = readFileSync(file, "utf8");
      if (SECRET.test(text)) hits.push(path.relative(process.cwd(), file));
    }
    assert.deepEqual(hits, []);
  });
});
