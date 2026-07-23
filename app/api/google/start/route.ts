import {
  GOOGLE_STATE_COOKIE,
  randomToken,
  seal,
  serializeCookie,
  sha256Base64Url,
  type GoogleOAuthState,
} from "../../../../lib/google-session";

const SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/gmail.readonly",
];

export async function GET(request: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return Response.json({ error: "Google OAuth is not configured" }, { status: 503 });
  }

  const requestUrl = new URL(request.url);
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI ??
    new URL("/api/auth/callback/google", requestUrl.origin).toString();
  const state = randomToken(24);
  const verifier = randomToken(48);
  const challenge = await sha256Base64Url(verifier);
  const stateCookie = await seal<GoogleOAuthState>({
    state,
    verifier,
    redirectUri,
    createdAt: Date.now(),
  });

  const authorizationUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authorizationUrl.searchParams.set("client_id", clientId);
  authorizationUrl.searchParams.set("redirect_uri", redirectUri);
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("scope", SCOPES.join(" "));
  authorizationUrl.searchParams.set("access_type", "offline");
  authorizationUrl.searchParams.set("include_granted_scopes", "true");
  authorizationUrl.searchParams.set("prompt", "consent");
  authorizationUrl.searchParams.set("state", state);
  authorizationUrl.searchParams.set("code_challenge", challenge);
  authorizationUrl.searchParams.set("code_challenge_method", "S256");

  return new Response(null, {
    status: 302,
    headers: {
      Location: authorizationUrl.toString(),
      "Cache-Control": "no-store",
      "Set-Cookie": serializeCookie(GOOGLE_STATE_COOKIE, stateCookie, {
        maxAge: 600,
        secure: requestUrl.protocol === "https:",
        path: "/api/auth/callback/google",
      }),
    },
  });
}

