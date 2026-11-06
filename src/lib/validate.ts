import { AppError } from "@/lib/errors";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;

export function requiredText(value: unknown, max: number, label: string): string {
  if (typeof value !== "string") throw new AppError(400, `${label}을(를) 입력해 주세요.`, "invalid");
  const text = value.replace(/\u0000/g, "").replace(/[\u0001-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim();
  if (!text) throw new AppError(400, `${label}을(를) 입력해 주세요.`, "invalid");
  if (text.length > max) throw new AppError(400, `${label}이(가) 너무 깁니다.`, "invalid");
  return text;
}

export function requiredUuid(value: unknown, label: string): string {
  if (typeof value !== "string" || !UUID_RE.test(value)) {
    throw new AppError(400, `${label}이(가) 올바르지 않습니다.`, "invalid");
  }
  return value.toLowerCase();
}

export function requiredDate(value: unknown): string {
  if (typeof value !== "string" || !DATE_RE.test(value)) {
    throw new AppError(400, "날짜를 선택해 주세요.", "invalid");
  }
  const [year, month, day] = value.split("-").map(Number);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    throw new AppError(400, "날짜를 선택해 주세요.", "invalid");
  }
  return value;
}

export function requiredEmail(value: unknown): string {
  if (typeof value !== "string" || !EMAIL_RE.test(value.trim()) || value.trim().length > 200) {
    throw new AppError(400, "이메일을 확인해 주세요.", "invalid");
  }
  return value.trim().toLowerCase();
}

export function requiredInstant(value: unknown): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new AppError(400, "시간을 선택해 주세요.", "invalid");
  }
  return new Date(value).toISOString();
}

export function oneOf<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new AppError(400, `${label}을(를) 선택해 주세요.`, "invalid");
  }
  return value as T;
}

export function requiredInt(value: unknown, min: number, max: number, label: string): number {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new AppError(400, `${label}을(를) 확인해 주세요.`, "invalid");
  }
  return number;
}

export function requiredBoolean(value: unknown): boolean {
  if (typeof value !== "boolean") throw new AppError(400, "사용 여부를 선택해 주세요.", "invalid");
  return value;
}
