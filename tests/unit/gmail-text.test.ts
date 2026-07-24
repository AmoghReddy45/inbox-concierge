import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildExcerpt,
  decodeBase64Url,
  extractMessageContent,
  extractMessageText,
  htmlToStructuredText,
  htmlToText,
  stripQuotedTail,
} from "../../lib/gmail-text";

function b64url(text: string) {
  return Buffer.from(text, "utf-8").toString("base64url");
}

test("decodeBase64Url handles url-safe alphabet and UTF-8", () => {
  assert.equal(decodeBase64Url(b64url("Café ✓ ~~>?")), "Café ✓ ~~>?");
  assert.equal(decodeBase64Url(""), "");
});

test("htmlToText strips tags, style/script blocks, decodes entities", () => {
  const html = `
    <html><head><style>.a { color: red; }</style></head>
    <body>
      <script>var x = "<evil>";</script>
      <p>Payments&nbsp;are <b>failing</b> &amp; customers are blocked.</p>
      <div>Need an ETA &#39;today&#39; &lt;before 4PM&gt;</div>
    </body></html>`;
  const text = htmlToText(html);
  assert.equal(
    text,
    `Payments are failing & customers are blocked. Need an ETA 'today' <before 4PM>`,
  );
  assert.ok(!text.includes("color"));
  assert.ok(!text.includes("evil"));
});

test("stripQuotedTail removes 'On ... wrote:' tails and > quoted lines", () => {
  const text = [
    "Thanks, that works for me.",
    "",
    "On Tue, Jul 22, 2026 at 9:14 AM Priya Shah <priya@tenex.co> wrote:",
    "> Can you confirm the fallback position?",
    "> It needs sign-off today.",
  ].join("\n");
  assert.equal(stripQuotedTail(text), "Thanks, that works for me.");

  const bare = ["Sounds good.", "> earlier quoted line", "regular trailing line"].join("\n");
  assert.equal(stripQuotedTail(bare), "Sounds good.\nregular trailing line");
});

test("extractMessageText prefers text/plain leaf in multipart/alternative", () => {
  const payload = {
    mimeType: "multipart/alternative",
    parts: [
      { mimeType: "text/html", body: { data: b64url("<p>HTML version</p>") } },
      { mimeType: "text/plain", body: { data: b64url("Plain version") } },
    ],
  };
  assert.equal(extractMessageText(payload), "Plain version");
});

test("extractMessageText walks nested multiparts and falls back to html", () => {
  const nested = {
    mimeType: "multipart/mixed",
    parts: [
      {
        mimeType: "multipart/alternative",
        parts: [{ mimeType: "text/html", body: { data: b64url("<p>Only <i>html</i> here</p>") } }],
      },
      { mimeType: "application/pdf", body: { data: "ignored" } },
    ],
  };
  assert.equal(extractMessageText(nested), "Only html here");
});

test("extractMessageText reads simple top-level text/plain body", () => {
  const payload = { mimeType: "text/plain", body: { data: b64url("Top level body") } };
  assert.equal(extractMessageText(payload), "Top level body");
});

test("buildExcerpt budgets latest 900 / previous 300 within 1200 total", () => {
  const latest = "L".repeat(2_000);
  const previous = "P".repeat(2_000);
  const { excerpt, usedSnippetFallback } = buildExcerpt(latest, previous, "snippet");
  assert.equal(usedSnippetFallback, false);
  assert.ok(excerpt.length <= 1_200);
  const latestPart = (excerpt.match(/L/g) ?? []).length;
  const previousPart = (excerpt.match(/P/g) ?? []).length;
  assert.equal(latestPart, 900);
  assert.equal(previousPart, 300 - "\n\n[earlier] ".length);
});

test("buildExcerpt falls back to snippet for near-empty extraction", () => {
  const { excerpt, usedSnippetFallback } = buildExcerpt("  ", null, "A useful snippet from Gmail");
  assert.equal(usedSnippetFallback, true);
  assert.equal(excerpt, "A useful snippet from Gmail");
});

test("htmlToStructuredText keeps block structure and bullets", () => {
  const html =
    "<div><p>First paragraph.</p><p>Second one.</p><ul><li>Alpha</li><li>Beta</li></ul>Line one<br>Line two</div>";
  assert.equal(
    htmlToStructuredText(html),
    "First paragraph.\nSecond one.\n\n• Alpha\n• Beta\nLine one\nLine two",
  );
});

test("extractMessageContent preserves text/plain newlines and returns html part", () => {
  const b64 = (value: string) => Buffer.from(value, "utf-8").toString("base64url");
  const payload = {
    mimeType: "multipart/alternative",
    parts: [
      {
        mimeType: "text/plain",
        body: { data: b64("Hi team,\n\nShipping today.\nDetails below.\n\nThanks") },
      },
      { mimeType: "text/html", body: { data: b64("<p>Hi team,</p><p>Shipping today.</p>") } },
    ],
  };
  const content = extractMessageContent(payload);
  assert.equal(content.text, "Hi team,\n\nShipping today.\nDetails below.\n\nThanks");
  assert.ok(content.html?.includes("<p>Hi team,</p>"));
});

test("extractMessageContent derives structured text from html-only mail", () => {
  const b64 = (value: string) => Buffer.from(value, "utf-8").toString("base64url");
  const payload = {
    mimeType: "text/html",
    body: { data: b64("<p>Para one.</p><p>Para two.</p>") },
  };
  const content = extractMessageContent(payload);
  assert.equal(content.text, "Para one.\nPara two.");
  assert.ok(content.html);
});
