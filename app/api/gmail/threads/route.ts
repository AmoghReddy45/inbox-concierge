import {
  GOOGLE_SESSION_COOKIE,
  parseCookie,
  seal,
  serializeCookie,
  unseal,
  type GoogleSession,
} from "../../../../lib/google-session";

type GmailHeader = { name?: string; value?: string };
type GmailMessage = {
  id?: string;
  internalDate?: string;
  snippet?: string;
  labelIds?: string[];
  payload?: { headers?: GmailHeader[] };
};
type GmailThread = { id?: string; messages?: GmailMessage[] };

function headerValue(headers: GmailHeader[] | undefined, name: string) {
  return headers?.find((header) => header.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function parseSender(value: string) {
  const match = value.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>/);
  if (match) return { sender: match[1].trim() || match[2].split("@")[0], email: match[2] };
  const emailMatch = value.match(/[\w.+-]+@[\w.-]+/);
  return {
    sender: value.replace(/<[^>]+>/g, "").trim() || "Unknown sender",
    email: emailMatch?.[0] ?? value,
  };
}

function cleanSnippet(value: string) {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

async function refreshSession(session: GoogleSession) {
  if (session.expiresAt > Date.now() + 60_000) return session;
  if (!session.refreshToken) return null;
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: session.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok) return null;
  const tokens = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
    scope?: string;
  };
  if (!tokens.access_token) return null;
  return {
    ...session,
    accessToken: tokens.access_token,
    expiresAt: Date.now() + Math.max(60, tokens.expires_in ?? 3600) * 1000,
    scope: tokens.scope ?? session.scope,
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const encryptedSession = parseCookie(request, GOOGLE_SESSION_COOKIE);
  const storedSession = await unseal<GoogleSession>(encryptedSession);
  if (!storedSession) {
    return Response.json({ error: "Google is not connected" }, { status: 401 });
  }

  const session = await refreshSession(storedSession);
  if (!session) {
    return Response.json({ error: "Google authorization expired" }, { status: 401 });
  }

  const listUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/threads");
  listUrl.searchParams.set("maxResults", "20");
  listUrl.searchParams.set("q", "newer_than:30d -in:spam -in:trash");
  const listResponse = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${session.accessToken}` },
  });
  if (!listResponse.ok) {
    return Response.json({ error: "Gmail snapshot could not be loaded" }, { status: 502 });
  }
  const list = (await listResponse.json()) as { threads?: Array<{ id?: string }> };
  const ids = (list.threads ?? []).map((thread) => thread.id).filter((id): id is string => Boolean(id));

  const details: GmailThread[] = [];
  for (let index = 0; index < ids.length; index += 5) {
    const chunk = ids.slice(index, index + 5);
    const responses = await Promise.all(
      chunk.map(async (id) => {
        const detailUrl = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${id}`);
        detailUrl.searchParams.set("format", "metadata");
        for (const header of ["From", "To", "Subject", "Date"]) {
          detailUrl.searchParams.append("metadataHeaders", header);
        }
        const response = await fetch(detailUrl, {
          headers: { Authorization: `Bearer ${session.accessToken}` },
        });
        return response.ok ? ((await response.json()) as GmailThread) : null;
      }),
    );
    details.push(...responses.filter((thread): thread is GmailThread => Boolean(thread)));
  }

  const normalized = details.map((thread) => {
    const messages = [...(thread.messages ?? [])].sort(
      (a, b) => Number(a.internalDate ?? 0) - Number(b.internalDate ?? 0),
    );
    const latest = messages[messages.length - 1] ?? {};
    const headers = latest.payload?.headers;
    const from = parseSender(headerValue(headers, "From"));
    const timestamp = Number(latest.internalDate ?? Date.now());
    const date = new Date(timestamp);
    const snippet = cleanSnippet(latest.snippet ?? "No preview available");
    const initials = from.sender
      .split(/\s+/)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
    return {
      id: thread.id,
      sender: from.sender,
      email: from.email,
      initials: initials || "?",
      subject: headerValue(headers, "Subject") || "(No subject)",
      preview: snippet,
      date: date.toISOString(),
      unread: latest.labelIds?.includes("UNREAD") ?? false,
      labels: latest.labelIds ?? [],
      messageCount: messages.length,
      latestMessageId: latest.id,
    };
  });

  const headers = new Headers({ "Cache-Control": "no-store" });
  if (session.accessToken !== storedSession.accessToken) {
    headers.append(
      "Set-Cookie",
      serializeCookie(GOOGLE_SESSION_COOKIE, await seal(session), {
        maxAge: 7 * 24 * 60 * 60,
        secure: url.protocol === "https:",
      }),
    );
  }
  return Response.json({ threads: normalized, email: session.email }, { headers });
}

