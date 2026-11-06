import { requireUser } from "@/lib/current-user";
import { assertSameOrigin, handle, readJson } from "@/lib/http";
import { listRooms, saveRoom } from "@/lib/services/reservations";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return handle(async () => {
    const user = await requireUser(request);
    return { rooms: await listRooms(user.id) };
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const user = await requireUser(request);
    const body = await readJson(request);
    const room = await saveRoom(user.id, body);
    return { room };
  });
}
