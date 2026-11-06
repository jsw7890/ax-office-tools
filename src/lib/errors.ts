export class AppError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, message: string, code: string) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
  }
}

export function mapDbError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  const message = error instanceof Error ? error.message : "";
  const code =
    typeof error === "object" && error && "code" in error
      ? String((error as { code?: string }).code ?? "")
      : "";

  if (code === "23P01" || message.includes("reservations_no_overlap")) {
    return new AppError(409, "이미 예약된 시간입니다.", "overlap");
  }
  if (message.includes("past time")) {
    return new AppError(400, "지난 시간은 예약할 수 없습니다.", "past");
  }
  if (message.includes("outside office hours")) {
    return new AppError(400, "운영 시간(09:00–18:00) 안에서만 예약할 수 있습니다.", "hours");
  }
  if (message.includes("30 minute")) {
    return new AppError(400, "30분 단위로만 예약할 수 있습니다.", "slot");
  }
  if (message.includes("within one day")) {
    return new AppError(400, "예약은 같은 날 안에서만 할 수 있습니다.", "same_day");
  }
  if (message.includes("end must be after start")) {
    return new AppError(400, "끝나는 시간이 시작보다 뒤여야 합니다.", "range");
  }
  if (message.includes("room is not available")) {
    return new AppError(400, "사용할 수 없는 회의실입니다.", "room");
  }
  if (message.includes("invalid status transition") || message.includes("completed tickets") || message.includes("new tickets start")) {
    return new AppError(400, "문의 상태는 접수, 처리중, 완료 순서로만 바꿀 수 있습니다.", "status");
  }
  if (message.includes("daily question limit")) {
    return new AppError(429, "오늘 질문 횟수(20회)를 모두 사용했습니다.", "limit");
  }
  if (message.includes("row-level security") || code === "42501") {
    return new AppError(403, "권한이 없습니다.", "forbidden");
  }
  if (process.env.DATABASE_PATH === "memory") {
    return new AppError(500, `요청을 처리하지 못했습니다. (${code} ${message.slice(0, 240)})`, "server");
  }
  console.error("database error", code);
  return new AppError(500, "요청을 처리하지 못했습니다.", "server");
}
