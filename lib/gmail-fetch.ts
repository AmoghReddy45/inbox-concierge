import { GMAIL_FETCH_CONCURRENCY } from "./types";
import type { GmailMessagePart } from "./gmail-text";

export type GmailHeader = { name?: string; value?: string };
export type GmailMessage = {
  id?: string;
  internalDate?: string;
  snippet?: string;
  labelIds?: string[];
  payload?: GmailMessagePart & { headers?: GmailHeader[] };
};
export type GmailThread = { id?: string; messages?: GmailMessage[] };

/**
 * Fetch full thread payloads with a bounded promise pool and one retry
 * each; failures are counted, never silently dropped as empty results.
 */
export async function fetchThreadDetails(ids: string[], accessToken: string) {
  const results = new Map<string, GmailThread>();
  let skipped = 0;
  let cursor = 0;

  async function fetchOne(id: string, attempt: number): Promise<void> {
    const detailUrl = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${id}`);
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

  await Promise.all(Array.from({ length: Math.min(GMAIL_FETCH_CONCURRENCY, ids.length) }, worker));
  return { results, skipped };
}

export function headerValue(headers: GmailHeader[] | undefined, name: string) {
  return headers?.find((header) => header.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
}

export function parseSender(value: string) {
  const match = value.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>/);
  if (match) return { sender: match[1].trim() || match[2].split("@")[0], email: match[2] };
  const emailMatch = value.match(/[\w.+-]+@[\w.-]+/);
  return {
    sender: value.replace(/<[^>]+>/g, "").trim() || "Unknown sender",
    email: emailMatch?.[0] ?? value,
  };
}
