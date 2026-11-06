import { getDb } from "@/lib/bootstrap";
import { AppError, mapDbError } from "@/lib/errors";
import { requiredEmail } from "@/lib/validate";

export type Profile = {
  id: string;
  name: string;
  email: string;
  role: "staff" | "admin";
};

const SAMPLE_EMAILS = new Set(["staff@example.com", "admin@example.com"]);
const attempts = new Map<string, { count: number; resetAt: number }>();

function assertLoginAllowed(key: string) {
  const now = Date.now();
  const current = attempts.get(key);
  if (current && current.resetAt > now && current.count >= 8) {
    throw new AppError(429, "로그인을 잠시 후 다시 시도해 주세요.", "rate_limit");
  }
}

function recordLoginFailure(key: string) {
  const now = Date.now();
  const current = attempts.get(key);
  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + 10 * 60 * 1000 });
    return;
  }
  current.count += 1;
}

export function resetLoginAttempts() {
  attempts.clear();
}

function asProfile(row: Record<string, unknown>): Profile {
  return {
    id: String(row.id),
    name: String(row.name),
    email: String(row.email),
    role: row.role === "admin" ? "admin" : "staff",
  };
}

export async function findProfileByEmail(email: string): Promise<Profile | null> {
  const db = await getDb();
  try {
    const rows = await db.asOwner((sql) =>
      sql("select id, name, email, role from profiles where email = $1", [email]),
    );
    return rows[0] ? asProfile(rows[0]) : null;
  } catch (error) {
    throw mapDbError(error);
  }
}

export async function loginWithSampleEmail(emailInput: unknown, rateKey: string): Promise<Profile> {
  assertLoginAllowed(rateKey);
  const email = requiredEmail(emailInput);
  if (!SAMPLE_EMAILS.has(email)) {
    recordLoginFailure(rateKey);
    throw new AppError(401, "샘플 계정이 아닙니다. 직원 또는 관리자 샘플로 들어가 주세요.", "unauthorized");
  }
  const profile = await findProfileByEmail(email);
  if (!profile) {
    recordLoginFailure(rateKey);
    throw new AppError(401, "샘플 계정이 아닙니다. 직원 또는 관리자 샘플로 들어가 주세요.", "unauthorized");
  }
  attempts.delete(rateKey);
  return profile;
}

export async function getProfile(userId: string): Promise<Profile> {
  const db = await getDb();
  try {
    const rows = await db.withUser(userId, (sql) =>
      sql("select id, name, email, role from profiles where id = auth.uid()"),
    );
    if (!rows[0]) throw new AppError(401, "로그인이 필요합니다.", "unauthorized");
    return asProfile(rows[0]);
  } catch (error) {
    throw mapDbError(error);
  }
}
