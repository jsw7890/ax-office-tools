import { assertSameOrigin, handle } from "@/lib/http";
import { clearSessionCookie } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "set-cookie": clearSessionCookie(),
      },
    });
  });
}
