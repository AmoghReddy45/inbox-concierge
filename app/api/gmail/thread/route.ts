import {
  GOOGLE_SESSION_COOKIE,
  parseCookie,
  refreshGoogleSession,
  unseal,
  type GoogleSession,
} from "../../../../lib/google-session";
import { extractMessageContent, type GmailMessagePart } from "../../../../lib/gmail-text";
import { demoThreadDetail } from "../../../../lib/demo-threads";
import type { ApiErrorBody, ApiErrorCode, ThreadDetail, ThreadMessage } from "../../../../lib/types";

const MAX_MESSAGE_CHARS = 50_000;
const MAX_HTML_CHARS = 400_000;

type GmailHeader = { name?: string; value?: string };
type GmailMessage = {
  id?: string;
  internalDate?: string;
  snippet?: string;
  payload?: GmailMessagePart & { headers?: GmailHeader[] };
};

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

/** "a@x.com, Bob <b@y.com>" → "to a, Bob" (short display names only). */
function recipientLine(headers: GmailHeader[] | undefined, selfEmail: string | undefined) {
  const raw = [headerValue(headers, "To"), headerValue(headers, "Cc")]
    .filter(Boolean)
    .join(", ");
  if (!raw) return "";
  const names = raw
    .split(",")
    .map((part) => {
      const { sender, email } = parseSender(part.trim());
      if (selfEmail && email.toLowerCase() === selfEmail.toLowerCase()) return "Me";
      return sender.split(/\s+/)[0] || sender;
    })
    .filter(Boolean);
  const unique = [...new Set(names)].slice(0, 4);
  if (!unique.length) return "";
  const overflow = names.length > unique.length ? ` +${names.length - unique.length}` : "";
  return `to ${unique.join(", ")}${overflow}`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const threadId = url.searchParams.get("id");
  if (!threadId) return errorResponse("bad_request", "Thread id is required", 400);

  if (url.searchParams.get("demo") === "1") {
    const detail = demoThreadDetail(threadId, Date.now());
    if (!detail) return errorResponse("bad_request", "Unknown demo thread", 404);
    return Response.json(detail, { headers: { "Cache-Control": "no-store" } });
  }

  const storedSession = await unseal<GoogleSession>(
    parseCookie(request, GOOGLE_SESSION_COOKIE),
  );
  if (!storedSession) return errorResponse("not_connected", "Google is not connected", 401);
  const session = await refreshGoogleSession(storedSession);
  if (!session) return errorResponse("auth_expired", "Google authorization expired", 401);

  const detailUrl = new URL(
    `https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(threadId)}`,
  );
  detailUrl.searchParams.set("format", "full");
  const response = await fetch(detailUrl, {
    headers: { Authorization: `Bearer ${session.accessToken}` },
  });
  if (!response.ok) {
    return errorResponse(
      "gmail_error",
      `Gmail thread fetch failed (HTTP ${response.status})`,
      response.status === 404 ? 404 : 502,
      response.status !== 404,
    );
  }
  const thread = (await response.json()) as { id?: string; messages?: GmailMessage[] };
  const sorted = [...(thread.messages ?? [])].sort(
    (a, b) => Number(a.internalDate ?? 0) - Number(b.internalDate ?? 0),
  );
  if (!sorted.length) return errorResponse("gmail_error", "Thread has no messages", 502, true);

  const subject =
    headerValue(sorted[sorted.length - 1].payload?.headers, "Subject") || "(No subject)";
  const messages: ThreadMessage[] = sorted.map((message, index) => {
    const headers = message.payload?.headers;
    const from = parseSender(headerValue(headers, "From"));
    const isSelf =
      session.email && from.email.toLowerCase() === session.email.toLowerCase();
    const content = message.payload
      ? extractMessageContent(message.payload)
      : { html: null, text: "" };
    return {
      id: message.id ?? `${threadId}-m${index}`,
      sender: isSelf ? "Me" : from.sender,
      email: from.email,
      date: new Date(Number(message.internalDate ?? Date.now())).toISOString(),
      text: (content.text || message.snippet || "").slice(0, MAX_MESSAGE_CHARS),
      html:
        content.html && content.html.length <= MAX_HTML_CHARS ? content.html : null,
      recipients: recipientLine(headers, session.email),
    };
  });

  const payload: ThreadDetail = { id: thread.id ?? threadId, subject, messages };
  return Response.json(payload, { headers: { "Cache-Control": "no-store" } });
}
