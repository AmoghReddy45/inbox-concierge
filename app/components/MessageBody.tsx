"use client";

import { Fragment, useCallback, useMemo, useRef, useState } from "react";

/**
 * Email body rendering, following the mail-client standard (as shipped by
 * Inbox Zero and Superhuman): rich HTML runs inside a sandboxed iframe —
 * scripts are impossible (no allow-scripts in the sandbox AND a script-src
 * 'none' CSP inside the document), links open in new tabs, images are
 * width-constrained. Plain text renders as paragraphs with linkified URLs.
 */

const FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif';

const IFRAME_CSP = [
  "default-src 'none'",
  "style-src 'unsafe-inline'",
  "img-src data: https:",
  "script-src 'none'",
  "frame-src 'none'",
  "object-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
].join("; ");

function buildSrcDoc(html: string): string {
  const head = [
    `<meta http-equiv="Content-Security-Policy" content="${IFRAME_CSP}">`,
    '<base target="_blank" rel="noopener noreferrer">',
    "<style>",
    ":root { color-scheme: light; }",
    `body { margin: 0; background: #ffffff; color: rgba(0,0,0,.85); font-family: ${FONT_STACK}; font-size: 13.5px; line-height: 1.6; overflow-wrap: break-word; }`,
    "img { max-width: 100% !important; height: auto; }",
    "table { max-width: 100% !important; }",
    "a { color: #0b62a4; }",
    "blockquote { color: rgba(0,0,0,.5); border-left: 2px solid rgba(0,0,0,.16); margin: 0 0 0 2px; padding-left: 12px; }",
    "</style>",
  ].join("");
  if (!/<html[\s>]/i.test(html)) {
    return `<html><head>${head}</head><body>${html}</body></html>`;
  }
  if (!/<head[\s>]/i.test(html)) {
    return html.replace(/<html([^>]*)>/i, `<html$1><head>${head}</head>`);
  }
  return html.replace(/<head([^>]*)>/i, `<head$1>${head}`);
}

function HtmlBody({ html }: { html: string }) {
  const [height, setHeight] = useState(120);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const srcDoc = useMemo(() => buildSrcDoc(html), [html]);

  const measure = useCallback(() => {
    try {
      const documentElement = iframeRef.current?.contentWindow?.document.documentElement;
      const next = documentElement?.scrollHeight;
      if (next && next > 0) setHeight(next);
    } catch {
      // Cross-origin surprises — keep the fallback height.
    }
  }, []);

  const onLoad = useCallback(() => {
    measure();
    // Images without dimensions settle late; re-measure a few times.
    window.setTimeout(measure, 250);
    window.setTimeout(measure, 1_000);
  }, [measure]);

  return (
    <iframe
      ref={iframeRef}
      className="message-html-frame"
      title="Email content"
      srcDoc={srcDoc}
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      referrerPolicy="no-referrer"
      style={{ height: `${height + 4}px` }}
      onLoad={onLoad}
    />
  );
}

const URL_PATTERN = /(https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)])/g;

function linkify(line: string, keyPrefix: string) {
  const segments = line.split(URL_PATTERN);
  return segments.map((segment, index) =>
    index % 2 === 1 ? (
      <a
        key={`${keyPrefix}-${index}`}
        href={segment}
        target="_blank"
        rel="noopener noreferrer"
      >
        {segment}
      </a>
    ) : (
      <Fragment key={`${keyPrefix}-${index}`}>{segment}</Fragment>
    ),
  );
}

function TextBody({ text }: { text: string }) {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  return (
    <div className="message-body">
      {paragraphs.map((paragraph, paragraphIndex) => {
        const lines = paragraph.split("\n");
        return (
          <p key={paragraphIndex}>
            {lines.map((line, lineIndex) => (
              <Fragment key={lineIndex}>
                {lineIndex > 0 && <br />}
                {linkify(line, `${paragraphIndex}-${lineIndex}`)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}

export function MessageBody({ html, text }: { html: string | null; text: string }) {
  if (html) return <HtmlBody html={html} />;
  return <TextBody text={text} />;
}
