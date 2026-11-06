import { requireUser } from "@/lib/current-user";
import { assertSameOrigin, handle, readJson } from "@/lib/http";
import { changeTicketStatus, getTicket } from "@/lib/services/tickets";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser(request);
    const { id } = await context.params;
    return getTicket(user.id, id);
  });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    assertSameOrigin(request);
    const user = await requireUser(request);
    const { id } = await context.params;
    const body = await readJson(request);
    const ticket = await changeTicketStatus(user.id, id, body.status);
    return { ticket };
  });
}
