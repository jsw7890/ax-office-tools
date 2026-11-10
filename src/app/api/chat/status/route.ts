import { handle } from "@/lib/http";
import { chatLlmStatus } from "@/lib/services/chat";

export const runtime = "nodejs";

export async function GET() {
  return handle(async () => chatLlmStatus());
}
