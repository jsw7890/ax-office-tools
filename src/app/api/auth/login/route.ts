import { clientKey } from "@/lib/current-user";
import { assertSameOrigin, handle, readJson } from "@/lib/http";
import { loginWithSampleEmail } from "@/lib/services/account";
import { createSessionToken, sessionCookie } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const body = await readJson(request);
    const profile = await loginWithSampleEmail(body.email, clientKey(request));
    const token = createSessionToken(profile.id);
    return new Response(JSON.stringify({ user: profile }), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "set-cookie": sessionCookie(token),
      },
    });
  });
}
