import {
  GOOGLE_SESSION_COOKIE,
  GOOGLE_STATE_COOKIE,
  parseCookie,
  seal,
  serializeCookie,
  unseal,
  type GoogleOAuthState,
  type GoogleSession,
} from "../../../../../lib/google-session";

function redirectWithError(origin: string, code: string) {
  const target = new URL("/", origin);
  target.searchParams.set("google_error", code);
  return Response.redirect(target, 302);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");
  if (oauthError) return redirectWithError(url.origin, oauthError);
  if (!code || !returnedState) return redirectWithError(url.origin, "missing_code");

  const encryptedState = parseCookie(request, GOOGLE_STATE_COOKIE);
  const state = await unseal<GoogleOAuthState>(encryptedState);
  if (
    !state ||
    state.state !== returnedState ||
    Date.now() - state.createdAt > 10 * 60 * 1000
  ) {
    return redirectWithError(url.origin, "invalid_state");
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return redirectWithError(url.origin, "not_configured");

  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        code_verifier: state.verifier,
        grant_type: "authorization_code",
        redirect_uri: state.redirectUri,
      }),
    });
    if (!tokenResponse.ok) return redirectWithError(url.origin, "token_exchange_failed");
    const tokens = (await tokenResponse.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
    };
    if (!tokens.access_token) return redirectWithError(url.origin, "missing_access_token");

    let email: string | undefined;
    const profileResponse = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/profile",
      { headers: { Authorization: `Bearer ${tokens.access_token}` } },
    );
    if (profileResponse.ok) {
      const profile = (await profileResponse.json()) as { emailAddress?: string };
      email = profile.emailAddress;
    }

    const session = await seal<GoogleSession>({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + Math.max(60, tokens.expires_in ?? 3600) * 1000,
      email,
      scope: tokens.scope,
    });
    const target = new URL("/", url.origin);
    target.searchParams.set("connected", "1");
    const headers = new Headers({
      Location: target.toString(),
      "Cache-Control": "no-store",
    });
    headers.append(
      "Set-Cookie",
      serializeCookie(GOOGLE_SESSION_COOKIE, session, {
        maxAge: 7 * 24 * 60 * 60,
        secure: url.protocol === "https:",
      }),
    );
    headers.append(
      "Set-Cookie",
      serializeCookie(GOOGLE_STATE_COOKIE, "", {
        maxAge: 0,
        secure: url.protocol === "https:",
        path: "/api/auth/callback/google",
      }),
    );
    return new Response(null, { status: 302, headers });
  } catch {
    return redirectWithError(url.origin, "oauth_failed");
  }
}

