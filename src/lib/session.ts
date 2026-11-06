import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const COOKIE = "ax_session";
const TWELVE_HOURS = 12 * 60 * 60 * 1000;

function secret(): string {
  const fromEnv = process.env.SESSION_SECRET?.trim();
  if (fromEnv && fromEnv.length >= 16) return fromEnv;
  const file = path.join(process.cwd(), ".data", "session-secret");
  if (existsSync(file)) return readFileSync(file, "utf8").trim();
  mkdirSync(path.dirname(file), { recursive: true });
  const created = randomBytes(32).toString("hex");
  writeFileSync(file, created, { encoding: "utf8", mode: 0o600 });
  return created;
}

export function createSessionToken(userId: string, now = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ sub: userId, exp: now + TWELVE_HOURS })).toString("base64url");
  const sig = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifySessionToken(token: string, now = Date.now()): string | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret()).update(body).digest("base64url");
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { sub?: string; exp?: number };
    if (!payload.sub || typeof payload.exp !== "number" || payload.exp < now) return null;
    return payload.sub;
  } catch {
    return null;
  }
}

export function readCookie(request: Request, name = COOKIE): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export function sessionCookie(token: string): string {
  return `${COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=43200`;
}

export function clearSessionCookie(): string {
  return `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}
