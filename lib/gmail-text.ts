import { EXCERPT_BUDGET } from "./types";

export type GmailMessagePart = {
  mimeType?: string;
  body?: { data?: string; size?: number };
  parts?: GmailMessagePart[];
};

const LATEST_BUDGET = 900;
const PREVIOUS_BUDGET = EXCERPT_BUDGET - LATEST_BUDGET;
const MIN_USEFUL_CHARS = 40;
const PREVIOUS_PREFIX = "\n\n[earlier] ";

/** Gmail body data is base64url-encoded UTF-8. */
export function decodeBase64Url(data: string): string {
  if (!data) return "";
  const padded = data
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(data.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder("utf-8").decode(bytes);
}

const ENTITY_MAP: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name) => ENTITY_MAP[name.toLowerCase()] ?? match);
}

/** Reduce an HTML body to readable plain text. */
export function htmlToText(html: string): string {
  const text = html
    .replace(/<(style|script|head)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6]|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return collapseWhitespace(decodeEntities(text));
}

function collapseWhitespace(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" ")
    .trim();
}

/**
 * Remove quoted-reply tails: everything from an "On ... wrote:" marker on,
 * and any individual lines quoted with ">".
 */
export function stripQuotedTail(text: string): string {
  const lines = text.split("\n");
  const kept: string[] = [];
  for (const line of lines) {
    if (/^\s*On .{0,200}wrote:\s*$/.test(line)) break;
    if (/^\s*>/.test(line)) continue;
    kept.push(line);
  }
  while (kept.length && kept[kept.length - 1].trim() === "") kept.pop();
  return kept.join("\n").trim();
}

function findPart(
  parts: GmailMessagePart[],
  mimeType: string,
): GmailMessagePart | undefined {
  for (const part of parts) {
    if (part.mimeType === mimeType && part.body?.data) return part;
    if (part.parts) {
      const nested = findPart(part.parts, mimeType);
      if (nested) return nested;
    }
  }
  return undefined;
}

/**
 * Extract readable text from a Gmail message payload: prefer a text/plain
 * leaf anywhere in the part tree, fall back to stripped text/html, then to
 * a top-level body.
 */
export function extractMessageText(payload: GmailMessagePart): string {
  const parts = payload.parts ?? [];
  const plain = payload.mimeType === "text/plain" && payload.body?.data
    ? payload
    : findPart(parts, "text/plain");
  if (plain?.body?.data) {
    return collapseWhitespace(stripQuotedTail(decodeBase64Url(plain.body.data)));
  }
  const html = payload.mimeType === "text/html" && payload.body?.data
    ? payload
    : findPart(parts, "text/html");
  if (html?.body?.data) {
    return stripQuotedTail(htmlToText(decodeBase64Url(html.body.data)));
  }
  if (payload.body?.data) {
    return collapseWhitespace(stripQuotedTail(decodeBase64Url(payload.body.data)));
  }
  return "";
}

/**
 * HTML → structure-preserving plain text for READING (unlike htmlToText,
 * which collapses everything to one line for classification excerpts).
 * Block elements and <br> become newlines; list items get bullets.
 */
export function htmlToStructuredText(html: string): string {
  const text = html
    .replace(/<(style|script|head)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n• ")
    .replace(/<\/(p|div|tr|ul|ol|h[1-6]|blockquote|table)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(text)
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Extract a message for the reading view: raw HTML when the message has a
 * text/html part (rendered in a sandboxed iframe client-side), plus
 * structure-preserving text (newlines kept) as the fallback body.
 */
export function extractMessageContent(payload: GmailMessagePart): {
  html: string | null;
  text: string;
} {
  const parts = payload.parts ?? [];
  const htmlPart =
    payload.mimeType === "text/html" && payload.body?.data
      ? payload
      : findPart(parts, "text/html");
  const html = htmlPart?.body?.data ? decodeBase64Url(htmlPart.body.data) : null;

  const plainPart =
    payload.mimeType === "text/plain" && payload.body?.data
      ? payload
      : findPart(parts, "text/plain");
  let text = "";
  if (plainPart?.body?.data) {
    text = stripQuotedTail(decodeBase64Url(plainPart.body.data))
      .replace(/\r\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  } else if (html) {
    text = stripQuotedTail(htmlToStructuredText(html));
  } else if (payload.body?.data) {
    text = stripQuotedTail(decodeBase64Url(payload.body.data)).trim();
  }
  return { html, text };
}

/**
 * Compose the classification excerpt: newest message up to 900 chars plus
 * up to ~300 chars of the previous one. Falls back to the Gmail snippet
 * when extraction yields almost nothing (image-only mail).
 */
export function buildExcerpt(
  latestText: string,
  previousText: string | null,
  snippet: string,
): { excerpt: string; usedSnippetFallback: boolean } {
  const latest = latestText.trim().slice(0, LATEST_BUDGET);
  if (latest.length < MIN_USEFUL_CHARS) {
    const fallback = snippet.trim();
    if (fallback.length >= latest.length) {
      return { excerpt: fallback.slice(0, EXCERPT_BUDGET), usedSnippetFallback: true };
    }
  }
  let excerpt = latest;
  const previous = previousText?.trim();
  if (previous) {
    const room = Math.min(PREVIOUS_BUDGET, EXCERPT_BUDGET - excerpt.length);
    const available = room - PREVIOUS_PREFIX.length;
    if (available > MIN_USEFUL_CHARS) {
      excerpt += PREVIOUS_PREFIX + previous.slice(0, available);
    }
  }
  return { excerpt: excerpt.slice(0, EXCERPT_BUDGET), usedSnippetFallback: false };
}
