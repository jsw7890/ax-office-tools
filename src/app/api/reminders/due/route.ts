import { requireUser } from "@/lib/current-user";
import { handle } from "@/lib/http";
import { dueRoomReminders } from "@/lib/services/notifications";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return handle(async () => {
    const user = await requireUser(request);
    const reminders = await dueRoomReminders(user.id);
    return { reminders };
  });
}
