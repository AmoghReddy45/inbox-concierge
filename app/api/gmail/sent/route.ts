import {
  GOOGLE_SESSION_COOKIE,
  parseCookie,
  refreshGoogleSession,
  seal,
  serializeCookie,
  unseal,
  type GoogleSession,
} from "../../../../lib/google-session";
import {
  fetchThreadDetails,
  headerValue,
  parseSender,
  type GmailMessage,
} from "../../../../lib/gmail-fetch";
import { extractMessageContent, stripQuotedTail } from "../../../../lib/gmail-text";
import { demoSentPage, demoSentProbe } from "../../../../lib/demo-sent";
import type { ApiErrorBody, ApiErrorCode } from "../../../../lib/types";
import type { SentPageResponse, SentProbeResponse, SentSample } from "../../../../lib/voice-types";

const PAGE_SIZE = 25;
const PARENT_EXCERPT_CHARS = 400;
const MAX_BODY_CHARS = 4_000;

function errorResponse(code: ApiErrorCode, message: string, status: number, retryable = false) {
  const body: ApiErrorBody = { error: { code, message, retryable } };
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function emailDomain(address: string) {
  return address.split("@")[1]?.toLowerCase() ?? "";
}

function isCalendarResponse(message: GmailMessage, subject: string) {
  if (/^(accepted|declined|tentative|updated invitation):/i.test(subject)) return true;
  const walk = (part: NonNullable<GmailMessage["payload"]> | undefined): boolean => {
    if (!part) return false;
    if (part.mimeType === "text/calendar") return true;
    return (part.parts ?? []).some((child) => walk(child));
  };
  return walk(message.payload);
}

/** Extract the user's own sent samples from one thread's messages. */
function samplesFromThread(
  threadId: string,
  messages: GmailMessage[],
  selfEmail: string,
): { samples: SentSample[]; filtered: number } {
  const sorted = [...messages].sort(
    (a, b) => Number(a.internalDate ?? 0) - Number(b.internalDate ?? 0),
  );
  const samples: SentSample[] = [];
  let filtered = 0;

  for (let index = 0; index < sorted.length; index++) {
    const message = sorted[index];
    const headers = message.payload?.headers;
    const from = parseSender(headerValue(headers, "From"));
    const isSent =
      (message.labelIds ?? []).includes("SENT") ||
      from.email.toLowerCase() === selfEmail.toLowerCase();
    if (!isSent) continue;

    const subject = headerValue(headers, "Subject") || "(No subject)";
    if (isCalendarResponse(message, subject)) {
      filtered += 1;
      continue;
    }

    const content = message.payload
      ? extractMessageContent(message.payload)
      : { html: null, text: "" };
    const body = stripQuotedTail(content.text).slice(0, MAX_BODY_CHARS).trim();

    const isForward = /^(fwd?|fw):/i.test(subject);
    if (!body) {
      filtered += 1;
      continue;
    }

    // Parent = nearest preceding message not from the user.
    let parentMessage: GmailMessage | null = null;
    for (let back = index - 1; back >= 0; back--) {
      const candidate = sorted[back];
      const candidateFrom = parseSender(headerValue(candidate.payload?.headers, "From"));
      if (candidateFrom.email.toLowerCase() !== selfEmail.toLowerCase()) {
        parentMessage = candidate;
        break;
      }
    }
    const hasInReplyTo = Boolean(headerValue(headers, "In-Reply-To"));
    const kind: SentSample["kind"] = isForward
      ? "forward"
      : parentMessage || hasInReplyTo
        ? "reply"
        : "fresh";

    const toRaw = [headerValue(headers, "To"), headerValue(headers, "Cc")]
      .filter(Boolean)
      .join(", ");
    const toDomains = [
      ...new Set(
        toRaw
          .split(",")
          .map((part) => emailDomain(parseSender(part.trim()).email))
          .filter(Boolean),
      ),
    ];
    const selfDomain = emailDomain(selfEmail);
    const internal = toDomains.length > 0 && toDomains.every((domain) => domain === selfDomain);

    const sentAtMs = Number(message.internalDate ?? 0);
    let parent: SentSample["parent"];
    let replyLatencyMinutes: number | undefined;
    if (kind === "reply" && parentMessage) {
      const parentFrom = parseSender(headerValue(parentMessage.payload?.headers, "From"));
      const parentContent = parentMessage.payload
        ? extractMessageContent(parentMessage.payload)
        : { html: null, text: "" };
      const parentAtMs = Number(parentMessage.internalDate ?? 0);
      parent = {
        sender: parentFrom.sender,
        email: parentFrom.email,
        excerpt: (parentContent.text || parentMessage.snippet || "").slice(0, PARENT_EXCERPT_CHARS),
        receivedAt: new Date(parentAtMs).toISOString(),
      };
      if (parentAtMs > 0 && sentAtMs > parentAtMs) {
        replyLatencyMinutes = Math.round((sentAtMs - parentAtMs) / 60_000);
      }
    }

    samples.push({
      id: message.id ?? `${threadId}-sent-${index}`,
      threadId,
      sentAt: new Date(sentAtMs || Date.now()).toISOString(),
      kind,
      subject,
      body,
      toDomains,
      internal,
      duplicateCount: 1,
      ...(parent ? { parent } : {}),
      ...(replyLatencyMinutes !== undefined ? { replyLatencyMinutes } : {}),
    });
  }
  return { samples, filtered };
}

export async function GET(request: Request) {
  const url = new URL(request.url);

  if (url.searchParams.get("demo") === "1") {
    if (url.searchParams.get("probe") === "1") {
      return Response.json(demoSentProbe(Date.now()), { headers: { "Cache-Control": "no-store" } });
    }
    const payload = demoSentPage(url.searchParams.get("pageToken"), Date.now());
    return Response.json(payload, { headers: { "Cache-Control": "no-store" } });
  }

  const storedSession = await unseal<GoogleSession>(parseCookie(request, GOOGLE_SESSION_COOKIE));
  if (!storedSession) return errorResponse("not_connected", "Google is not connected", 401);
  const session = await refreshGoogleSession(storedSession);
  if (!session?.email) return errorResponse("auth_expired", "Google authorization expired", 401);

  // A refreshed access token must be persisted, or paged learn runs re-refresh
  // on every request (threads route idiom).
  const responseHeaders = new Headers({ "Cache-Control": "no-store" });
  if (session.accessToken !== storedSession.accessToken) {
    responseHeaders.append(
      "Set-Cookie",
      serializeCookie(GOOGLE_SESSION_COOKIE, await seal(session), {
        maxAge: 7 * 24 * 60 * 60,
        secure: url.protocol === "https:",
      }),
    );
  }

  if (url.searchParams.get("probe") === "1") {
    const listUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
    listUrl.searchParams.set("q", "in:sent");
    listUrl.searchParams.set("maxResults", "1");
    const listResponse = await fetch(listUrl, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    });
    if (!listResponse.ok) {
      return errorResponse("gmail_error", `Sent probe failed (HTTP ${listResponse.status})`, 502, true);
    }
    const list = (await listResponse.json()) as { messages?: Array<{ id?: string }> };
    const newestId = list.messages?.[0]?.id ?? null;
    let newestAt: string | null = null;
    if (newestId) {
      const messageResponse = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${newestId}?format=minimal`,
        { headers: { Authorization: `Bearer ${session.accessToken}` } },
      );
      if (messageResponse.ok) {
        const message = (await messageResponse.json()) as { internalDate?: string };
        newestAt = message.internalDate
          ? new Date(Number(message.internalDate)).toISOString()
          : null;
      }
    }
    const payload: SentProbeResponse = { newestSentId: newestId, newestSentAt: newestAt };
    return Response.json(payload, { headers: responseHeaders });
  }

  const listUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/threads");
  listUrl.searchParams.set("q", "in:sent");
  listUrl.searchParams.set("maxResults", String(PAGE_SIZE));
  const pageToken = url.searchParams.get("pageToken");
  if (pageToken) listUrl.searchParams.set("pageToken", pageToken);
  const listResponse = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${session.accessToken}` },
  });
  if (!listResponse.ok) {
    return errorResponse("gmail_error", `Sent list failed (HTTP ${listResponse.status})`, 502, true);
  }
  const list = (await listResponse.json()) as {
    threads?: Array<{ id?: string }>;
    nextPageToken?: string;
  };
  const ids = (list.threads ?? [])
    .map((thread) => thread.id)
    .filter((id): id is string => Boolean(id));

  const { results, skipped } = await fetchThreadDetails(ids, session.accessToken);
  const samples: SentSample[] = [];
  let filtered = 0;
  for (const id of ids) {
    const thread = results.get(id);
    if (!thread?.messages) continue;
    const extracted = samplesFromThread(id, thread.messages, session.email);
    samples.push(...extracted.samples);
    filtered += extracted.filtered;
  }
  samples.sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime());

  const payload: SentPageResponse = {
    samples,
    nextPageToken: list.nextPageToken ?? null,
    scannedThreads: ids.length,
    skipped,
    filtered,
    mode: "gmail",
  };
  return Response.json(payload, { headers: responseHeaders });
}
