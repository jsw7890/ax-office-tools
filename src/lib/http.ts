import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors";

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (text.length > 100_000) throw new AppError(413, "요청이 너무 큽니다.", "too_large");
  if (!text.trim()) return {};
  try {
    const value = JSON.parse(text) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new AppError(400, "요청 형식이 올바르지 않습니다.", "invalid");
    }
    return value as Record<string, unknown>;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(400, "요청 형식이 올바르지 않습니다.", "invalid");
  }
}

export function assertSameOrigin(request: Request) {
  const host = request.headers.get("host");
  const origin = request.headers.get("origin");
  if (origin) {
    let originHost = "";
    try {
      originHost = new URL(origin).host;
    } catch {
      throw new AppError(403, "요청을 처리할 수 없습니다.", "origin");
    }
    if (!host || originHost !== host) throw new AppError(403, "요청을 처리할 수 없습니다.", "origin");
    return;
  }
  if (request.headers.get("x-requested-with") !== "ax-office") {
    throw new AppError(403, "요청을 처리할 수 없습니다.", "origin");
  }
}

export async function handle(fn: () => Promise<unknown>): Promise<Response> {
  try {
    const data = await fn();
    if (data instanceof Response) return data;
    return NextResponse.json(data ?? {});
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("request failed");
    return NextResponse.json({ error: "요청을 처리하지 못했습니다.", code: "server" }, { status: 500 });
  }
}
