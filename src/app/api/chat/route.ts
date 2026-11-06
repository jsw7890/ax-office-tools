import { requireUser } from "@/lib/current-user";
import { assertSameOrigin, handle, readJson } from "@/lib/http";
import { askQuestion } from "@/lib/services/chat";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const user = await requireUser(request);
    const body = await readJson(request);
    return askQuestion(user.id, body.question);
  });
}
