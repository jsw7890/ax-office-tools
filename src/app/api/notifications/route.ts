import { requireUser } from "@/lib/current-user";
import { assertSameOrigin, handle } from "@/lib/http";
import { listNotices, markNoticesRead } from "@/lib/services/notifications";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return handle(async () => {
    const user = await requireUser(request);
    const notices = await listNotices(user.id);
    return { notices, unread: notices.filter((item) => !item.readAt).length };
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const user = await requireUser(request);
    await markNoticesRead(user.id);
    return { ok: true };
  });
}
