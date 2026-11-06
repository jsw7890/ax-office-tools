import { requireUser } from "@/lib/current-user";
import { assertSameOrigin, handle, readJson } from "@/lib/http";
import { createTicket, listAllTickets, listMyTickets } from "@/lib/services/tickets";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return handle(async () => {
    const user = await requireUser(request);
    const url = new URL(request.url);
    if (url.searchParams.get("scope") === "all") {
      const tickets = await listAllTickets(user.id, url.searchParams.get("status"), url.searchParams.get("category"));
      return { tickets };
    }
    return { tickets: await listMyTickets(user.id) };
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const user = await requireUser(request);
    const body = await readJson(request);
    const ticket = await createTicket(user.id, body);
    return { ticket };
  });
}
