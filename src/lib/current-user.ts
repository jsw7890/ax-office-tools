import { AppError } from "@/lib/errors";
import { getProfile, type Profile } from "@/lib/services/account";
import { readCookie, verifySessionToken } from "@/lib/session";

export async function requireUser(request: Request): Promise<Profile> {
  const token = readCookie(request);
  const userId = token ? verifySessionToken(token) : null;
  if (!userId) throw new AppError(401, "로그인이 필요합니다.", "unauthorized");
  return getProfile(userId);
}

export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || "local";
}
