import { requireUser } from "@/lib/current-user";
import { assertSameOrigin, handle, readJson } from "@/lib/http";
import { saveRoom } from "@/lib/services/reservations";

export const runtime = "nodejs";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    assertSameOrigin(request);
    const user = await requireUser(request);
    const { id } = await context.params;
    const body = await readJson(request);
    const room = await saveRoom(user.id, { ...body, id });
    return { room };
  });
}
