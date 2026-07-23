import {
  GOOGLE_SESSION_COOKIE,
  parseCookie,
  unseal,
  type GoogleSession,
} from "../../../../lib/google-session";

export async function GET(request: Request) {
  const session = await unseal<GoogleSession>(
    parseCookie(request, GOOGLE_SESSION_COOKIE),
  );
  return Response.json(
    {
      connected: Boolean(session?.accessToken || session?.refreshToken),
      email: session?.email,
      mode: session ? "gmail" : "demo",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

