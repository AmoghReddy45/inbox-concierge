import {
  GOOGLE_SESSION_COOKIE,
  serializeCookie,
} from "../../../../lib/google-session";

export async function POST(request: Request) {
  const url = new URL(request.url);
  return Response.json(
    { disconnected: true },
    {
      headers: {
        "Cache-Control": "no-store",
        "Set-Cookie": serializeCookie(GOOGLE_SESSION_COOKIE, "", {
          maxAge: 0,
          secure: url.protocol === "https:",
        }),
      },
    },
  );
}

