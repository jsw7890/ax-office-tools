import { requireUser } from "@/lib/current-user";
import { assertSameOrigin, handle } from "@/lib/http";
import { collapseDuplicateTickets } from "@/lib/services/tickets";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const user = await requireUser(request);
    const removed = await collapseDuplicateTickets(user.id);
    return { removed };
  });
}
