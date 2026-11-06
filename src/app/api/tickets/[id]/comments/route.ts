import { requireUser } from "@/lib/current-user";
import { assertSameOrigin, handle, readJson } from "@/lib/http";
import { addComment } from "@/lib/services/tickets";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    assertSameOrigin(request);
    const user = await requireUser(request);
    const { id } = await context.params;
    const body = await readJson(request);
    const comment = await addComment(user.id, id, body.body);
    return { comment };
  });
}
