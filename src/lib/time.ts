export function seoulToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

export function seoulDateTime(dayOffset: number, hour: number, minute: number): string {
  const today = seoulToday();
  const date = addDays(today, dayOffset);
  return seoulToIso(date, hour * 60 + minute);
}

export function seoulToIso(date: string, minutes: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return new Date(Date.UTC(year, month - 1, day, hour - 9, minute, 0)).toISOString();
}

export function seoulParts(value: string | Date): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value instanceof Date ? value : new Date(value));
  const read = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return {
    date: `${read("year")}-${read("month")}-${read("day")}`,
    minutes: Number(read("hour")) * 60 + Number(read("minute")),
  };
}

function isDateObject(value: unknown): value is Date {
  return (
    Object.prototype.toString.call(value) === "[object Date]" &&
    typeof (value as Date).getTime === "function" &&
    !Number.isNaN((value as Date).getTime())
  );
}

export function asDateOnly(value: unknown): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  if (isDateObject(value)) return seoulParts(new Date(value.getTime())).date;
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return seoulParts(parsed).date;
  }
  return String(value ?? "").slice(0, 10);
}

export function clock(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}
