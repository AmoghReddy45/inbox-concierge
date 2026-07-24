import {
  GOOGLE_SESSION_COOKIE,
  parseCookie,
  refreshGoogleSession,
  seal,
  serializeCookie,
  unseal,
  type GoogleSession,
} from "../../../../lib/google-session";
import { buildExcerpt, extractMessageText, type GmailMessagePart } from "../../../../lib/gmail-text";
import { demoThreadsPage } from "../../../../lib/demo-threads";
import {
  GMAIL_FETCH_CONCURRENCY,
  PAGE_SIZE,
  type ApiErrorBody,
  type ApiErrorCode,
  type ThreadSummary,
  type ThreadsResponse,
} from "../../../../lib/types";

type GmailHeader = { name?: string; value?: string };
type GmailMessage = {
  id?: string;
  internalDate?: string;
  snippet?: string;
  labelIds?: string[];
  payload?: GmailMessagePart & { headers?: GmailHeader[] };
};
type GmailThread = { id?: string; messages?: GmailMessage[] };

function errorResponse(code: ApiErrorCode, message: string, status: number, retryable = false) {
  const body: ApiErrorBody = { error: { code, message, retryable } };
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function headerValue(headers: GmailHeader[] | undefined, name: string) {
  return (
    headers?.find((header) => header.name?.toLowerCase() === name.toLowerCase())?.value ?? ""
  );
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

/** Fetch thread details with a bounded promise pool and one retry each. */
async function fetchThreadDetails(ids: string[], accessToken: string) {
  const results = new Map<string, GmailThread>();
  let skipped = 0;
  let cursor = 0;

  async function fetchOne(id: string, attempt: number): Promise<void> {
    const detailUrl = new URL(
      `https://gmail.googleapis.com/gmail/v1/users/me/threads/${id}`,
    );
    detailUrl.searchParams.set("format", "full");
    const response = await fetch(detailUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (response.ok) {
      results.set(id, (await response.json()) as GmailThread);
      return;
    }
    if (attempt === 0 && (response.status === 429 || response.status >= 500)) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      return fetchOne(id, 1);
    }
    skipped += 1;
  }

  async function worker() {
    while (cursor < ids.length) {
      const id = ids[cursor++];
      await fetchOne(id, 0);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(GMAIL_FETCH_CONCURRENCY, ids.length) }, worker),
  );
  return { results, skipped };
}

function normalizeThread(thread: GmailThread): ThreadSummary | null {
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
    .map(normalizeThread)
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
