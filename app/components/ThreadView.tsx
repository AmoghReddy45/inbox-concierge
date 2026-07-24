"use client";

import { ArrowLeft, ChevronDown, ChevronUp, CircleAlert, Eye } from "lucide-react";
import { useState } from "react";
import type { Bucket } from "../../lib/taxonomy";
import type { ThreadSummary } from "../../lib/types";
import { formatRowTime } from "../lib/format";
import type { ThreadDetailState } from "../hooks/useThreadDetail";
import { MessageBody } from "./MessageBody";

type Props = {
  thread: ThreadSummary;
  detailState: ThreadDetailState;
  bucket: Bucket | null;
  needsReview: boolean;
  onOpenWhy: () => void;
  onClose: () => void;
  onNavigate: (direction: 1 | -1) => void;
};

/**
 * Superhuman ThreadPane posture: the thread replaces the list surface.
 * All messages collapse to one-line rows except the latest (and any the
 * user expands); the reasoning lives behind the "Why" button only.
 */
export function ThreadView({
  thread,
  detailState,
  bucket,
  needsReview,
  onOpenWhy,
  onClose,
  onNavigate,
}: Props) {
  // Parent keys this component by thread id, so expansion state resets via
  // remount instead of a prop-sync effect.
  const { detail, loading, error } = detailState;
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const messages = detail?.messages ?? [];
  const lastId = messages[messages.length - 1]?.id;
  const isExpanded = (id: string) => id === lastId || expanded.has(id);

  return (
    <div className="thread-view" aria-label={`Thread: ${thread.subject}`}>
      <header className="thread-view-header">
        <button type="button" className="icon-button" aria-label="Back to inbox" onClick={onClose}>
          <ArrowLeft size={17} aria-hidden="true" />
        </button>
        <div className="thread-view-title">
          <h1>{detail?.subject ?? thread.subject}</h1>
        </div>
        <div className="thread-view-actions">
          <button type="button" className="why-button" onClick={onOpenWhy}>
            <Eye size={13} aria-hidden="true" />
            Why
            {bucket && <span className={`why-bucket tone-text-${bucket.tone}`}>{bucket.name}</span>}
            {needsReview && (
              <span className="row-chip tone-amber" style={{ marginLeft: 2 }}>
                review
              </span>
            )}
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Previous thread"
            onClick={() => onNavigate(-1)}
          >
            <ChevronUp size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Next thread"
            onClick={() => onNavigate(1)}
          >
            <ChevronDown size={16} aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className="thread-view-scroll">
        <div className="thread-view-column">
          {loading && (
            <div className="message-card is-skeleton-card" aria-hidden="true">
              <span className="skeleton-block" style={{ width: 180 }} />
              <span className="skeleton-block" style={{ width: "100%" }} />
              <span className="skeleton-block" style={{ width: "92%" }} />
              <span className="skeleton-block" style={{ width: "65%" }} />
            </div>
          )}
          {error && (
            <div className="thread-view-error" role="alert">
              <CircleAlert size={14} aria-hidden="true" /> {error}
            </div>
          )}
          {messages.map((message) =>
            isExpanded(message.id) ? (
              <article className="message-card" key={message.id}>
                <header>
                  <strong>
                    {message.sender}
                    {message.recipients ? ` ${message.recipients}` : ""}
                  </strong>
                  <time dateTime={message.date}>{formatRowTime(message.date)}</time>
                </header>
                <MessageBody html={message.html} text={message.text} />
              </article>
            ) : (
              <button
                type="button"
                className="message-collapsed"
                key={message.id}
                onClick={() =>
                  setExpanded((current) => new Set(current).add(message.id))
                }
              >
                <span className="collapsed-from">{message.sender}</span>
                <span className="collapsed-snippet">
                  {message.text.replace(/\s+/g, " ").slice(0, 140)}
                </span>
                <time className="collapsed-date" dateTime={message.date}>
                  {formatRowTime(message.date)}
                </time>
              </button>
            ),
          )}
        </div>
      </div>
    </div>
  );
}
