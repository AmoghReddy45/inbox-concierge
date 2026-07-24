import {
  GOOGLE_SESSION_COOKIE,
  parseCookie,
  refreshGoogleSession,
  seal,
  serializeCookie,
  unseal,
  type GoogleSession,
} from "../../../../lib/google-session";
import { buildExcerpt, extractMessageText } from "../../../../lib/gmail-text";
import { demoThreadsPage } from "../../../../lib/demo-threads";
import {
  fetchThreadDetails,
  headerValue,
  parseSender,
  type GmailThread,
} from "../../../../lib/gmail-fetch";
import {
  PAGE_SIZE,
  type ApiErrorBody,
  type ApiErrorCode,
  type ThreadSummary,
  type ThreadsResponse,
} from "../../../../lib/types";

function errorResponse(code: ApiErrorCode, message: string, status: number, retryable = false) {
  const body: ApiErrorBody = { error: { code, message, retryable } };
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
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

/** Map raw Gmail label ids to the few human-meaningful ones. */
function friendlyLabels(labelIds: string[] | undefined): string[] {
  const labels: string[] = [];
  for (const id of labelIds ?? []) {
    if (id === "IMPORTANT") labels.push("Important");
    else if (id === "STARRED") labels.push("Starred");
    else if (id.startsWith("CATEGORY_")) {
      const name = id.slice("CATEGORY_".length).toLowerCase();
      if (name !== "personal") labels.push(name[0].toUpperCase() + name.slice(1));
    }
  }
  return [...new Set(labels)];
}

function emailDomain(address: string) {
  return address.split("@")[1]?.toLowerCase() ?? "";
}

function normalizeThread(thread: GmailThread, selfEmail: string | undefined): ThreadSummary | null {
  if (!thread.id) return null;
  const messages = [...(thread.messages ?? [])].sort(
    (a, b) => Number(a.internalDate ?? 0) - Number(b.internalDate ?? 0),
  );
  const latest = messages[messages.length - 1];
  if (!latest) return null;
  const previous = messages.length > 1 ? messages[messages.length - 2] : null;
  const headers = latest.payload?.headers;
  const from = parseSender(headerValue(headers, "From"));
  const timestamp = Number(latest.internalDate ?? Date.now());
  const snippet = cleanSnippet(latest.snippet ?? "");

  const self = selfEmail?.toLowerCase();
  const userReplied = Boolean(
    self &&
      messages.some((message) => {
        const sender = parseSender(headerValue(message.payload?.headers, "From"));
        return sender.email.toLowerCase() === self;
      }),
  );
  const senderDomainRelation =
    self && emailDomain(from.email) === emailDomain(self) ? "same-domain" : "external";

  const latestText = latest.payload ? extractMessageText(latest.payload) : "";
  const previousText = previous?.payload ? extractMessageText(previous.payload) : null;
  const { excerpt } = buildExcerpt(latestText, previousText, snippet);

  return {
    id: thread.id,
    sender: from.sender,
    email: from.email,
    subject: headerValue(headers, "Subject") || "(No subject)",
    preview: snippet || excerpt.slice(0, 140),
    excerpt,
    date: new Date(timestamp).toISOString(),
    unread: latest.labelIds?.includes("UNREAD") ?? false,
    gmailLabels: friendlyLabels(latest.labelIds),
    listUnsubscribe: Boolean(headerValue(headers, "List-Unsubscribe")),
    messageCount: messages.length,
    latestMessageId: latest.id ?? `${thread.id}-latest`,
    userReplied,
    senderDomainRelation,
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);

  if (url.searchParams.get("demo") === "1") {
    const payload = demoThreadsPage(url.searchParams.get("pageToken"), Date.now());
    return Response.json(payload, { headers: { "Cache-Control": "no-store" } });
  }

  const encryptedSession = parseCookie(request, GOOGLE_SESSION_COOKIE);
  const storedSession = await unseal<GoogleSession>(encryptedSession);
  if (!storedSession) {
    return errorResponse("not_connected", "Google is not connected", 401);
  }
  const session = await refreshGoogleSession(storedSession);
  if (!session) {
    return errorResponse("auth_expired", "Google authorization expired", 401);
  }

  const pageSize = Math.min(
    Math.max(Number(url.searchParams.get("pageSize")) || PAGE_SIZE, 1),
    PAGE_SIZE,
  );
  const listUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/threads");
  listUrl.searchParams.set("maxResults", String(pageSize));
  listUrl.searchParams.set("q", "-in:spam -in:trash");
  const pageToken = url.searchParams.get("pageToken");
  if (pageToken) listUrl.searchParams.set("pageToken", pageToken);

  const listResponse = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${session.accessToken}` },
  });
  if (!listResponse.ok) {
    return errorResponse(
      "gmail_error",
      `Gmail thread list failed (HTTP ${listResponse.status})`,
      502,
      true,
    );
  }
  const list = (await listResponse.json()) as {
    threads?: Array<{ id?: string }>;
    nextPageToken?: string;
  };
  const ids = (list.threads ?? [])
    .map((thread) => thread.id)
    .filter((id): id is string => Boolean(id));

  const { results, skipped } = await fetchThreadDetails(ids, session.accessToken);
  const threads = ids
    .map((id) => results.get(id))
    .filter((thread): thread is GmailThread => Boolean(thread))
    .map((thread) => normalizeThread(thread, session.email))
    .filter((thread): thread is ThreadSummary => Boolean(thread));

  const payload: ThreadsResponse = {
    threads,
    nextPageToken: list.nextPageToken ?? null,
    email: session.email ?? null,
    mode: "gmail",
    skipped,
  };

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
  return Response.json(payload, { headers });
}
