"use client";

import { CircleAlert, LoaderCircle } from "lucide-react";
import { memo } from "react";
import type { Bucket } from "../../lib/taxonomy";
import type { ThreadSummary } from "../../lib/types";
import type { ThreadTaskState } from "../lib/classify-orchestrator";
import { formatRowTime } from "../lib/format";

type Props = {
  thread: ThreadSummary;
  bucket: Bucket | null;
  taskState: ThreadTaskState | undefined;
  needsReview: boolean;
  corrected: boolean;
  showBucketChip: boolean;
  selected: boolean;
  /** Stable callbacks taking the thread id — rows stay memoizable. */
  onSelect: (id: string) => void;
  onOpenThread: (id: string) => void;
  onWhy: (id: string, correcting: boolean) => void;
};

/**
 * Memoized: during a live classification run only rows whose decision
 * (or selection) changed re-render, not all 200.
 */
export const ThreadRow = memo(function ThreadRow({
  thread,
  bucket,
  taskState,
  needsReview,
  corrected,
  showBucketChip,
  selected,
  onSelect,
  onOpenThread,
  onWhy,
}: Props) {
  const pending = taskState === "queued" || taskState === "classifying" || taskState === undefined;
  const failed = taskState === "failed";

  return (
    <div
      className={`thread-row ${selected ? "is-selected" : ""} ${thread.unread ? "is-unread" : ""}`}
      data-thread-id={thread.id}
    >
      <button
        type="button"
        className="thread-row-main"
        onClick={() => {
          onSelect(thread.id);
          onOpenThread(thread.id);
        }}
        onFocus={() => onSelect(thread.id)}
        aria-label={`${thread.sender}: ${thread.subject}`}
      >
        <span className="row-dot" aria-hidden="true" />
        <span className="row-sender">{thread.sender}</span>
        {failed && (
          <span className="row-chip chip-failed">
            <CircleAlert size={11} aria-hidden="true" /> Unsorted
          </span>
        )}
        {!failed && pending && taskState === "classifying" && (
          <span className="row-chip chip-pending" aria-label="Classifying">
            <LoaderCircle size={11} className="spin" aria-hidden="true" />
          </span>
        )}
        {!failed && !pending && showBucketChip && bucket && (
          <span className={`row-chip tone-${bucket.tone}`}>{bucket.name}</span>
        )}
        {!failed && !pending && needsReview && !corrected && bucket?.id !== "review" && (
          <span className="row-chip tone-amber">Review</span>
        )}
        <span className="row-text">
          <span className="row-subject">{thread.subject}</span>
          <span className="row-preview"> — {thread.preview}</span>
        </span>
        <time className="row-meta" dateTime={thread.date}>
          {formatRowTime(thread.date)}
        </time>
      </button>
      <span className="row-actions">
        <button
          type="button"
          onClick={() => {
            onSelect(thread.id);
            onWhy(thread.id, true);
          }}
        >
          Correct
        </button>
        <button
          type="button"
          onClick={() => {
            onSelect(thread.id);
            onWhy(thread.id, false);
          }}
        >
          Why
        </button>
      </span>
    </div>
  );
});
