import { requireUser } from "@/lib/current-user";
import { assertSameOrigin, handle, readJson } from "@/lib/http";
import { createReservation, listReservations } from "@/lib/services/reservations";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return handle(async () => {
    const user = await requireUser(request);
    const url = new URL(request.url);
    const mine = url.searchParams.get("mine") === "1";
    const reservations = await listReservations(user.id, url.searchParams.get("date"), mine);
    return { reservations };
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const user = await requireUser(request);
    const body = await readJson(request);
    const reservation = await createReservation(user.id, {
      roomId: body.roomId,
      title: body.title,
      startAt: body.startAt,
      endAt: body.endAt,
    });
    return { reservation };
  });
}
