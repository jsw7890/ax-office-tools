import { requireUser } from "@/lib/current-user";
import { handle } from "@/lib/http";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return handle(async () => ({ user: await requireUser(request) }));
}
