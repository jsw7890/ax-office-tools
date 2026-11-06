import { requireUser } from "@/lib/current-user";
import { assertSameOrigin, handle } from "@/lib/http";
import { cancelReservation } from "@/lib/services/reservations";

export const runtime = "nodejs";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    assertSameOrigin(request);
    const user = await requireUser(request);
    const { id } = await context.params;
    await cancelReservation(user.id, id);
    return { ok: true };
  });
}
