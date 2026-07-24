"use client";

import { Inbox } from "lucide-react";
import { Fragment } from "react";
import type { Bucket } from "../../lib/taxonomy";
import type { ThreadSummary } from "../../lib/types";
import type { RunSnapshot } from "../lib/classify-orchestrator";
import { DATE_GROUP_ORDER, dateGroupOf } from "../lib/format";
import { ThreadRow } from "./ThreadRow";

type Props = {
  threads: ThreadSummary[];
  snapshot: RunSnapshot | null;
  buckets: Bucket[];
  effectiveBucketId: (threadId: string) => string | null;
  needsReview: (threadId: string) => boolean;
  isCorrected: (threadId: string) => boolean;
  activeTab: string;
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onOpenThread: (id: string) => void;
  onWhy: (correcting: boolean) => void;
  onRetryFailed: () => void;
};

const SKELETON_ROWS = 8;

export function ThreadList({
  threads,
  snapshot,
  buckets,
  effectiveBucketId,
  needsReview,
  isCorrected,
  activeTab,
  loading,
  selectedId,
  onSelect,
  onOpenThread,
  onWhy,
  onRetryFailed,
}: Props) {
  const bucketById = new Map(buckets.map((bucket) => [bucket.id, bucket]));
  const failedCount = snapshot?.counts.failed ?? 0;

  if (!threads.length && loading) {
    return (
      <div className="thread-list" aria-busy="true">
        {Array.from({ length: SKELETON_ROWS }, (_, index) => (
          <div className="thread-row is-skeleton" key={index} aria-hidden="true">
            <span className="skeleton-block" style={{ width: 140 }} />
            <span className="skeleton-block" style={{ flex: 1 }} />
            <span className="skeleton-block" style={{ width: 48 }} />
          </div>
        ))}
      </div>
    );
  }

  if (!threads.length) {
    const total = snapshot?.total ?? 0;
    const terminal = snapshot ? snapshot.counts.classified + snapshot.counts.failed : 0;
    const classifying = total > 0 && terminal < total;
    // While a run is live, an empty tab means "not sorted yet", not "empty" —
    // saying otherwise would be dishonest for the first ~10 seconds.
    if (classifying) {
      return (
        <div className="thread-list" aria-busy="true">
          <div className="empty-state">
            <span className="sorting-spinner" aria-hidden="true" />
            <strong>Sorting the inbox…</strong>
            <span>
              {terminal} of {total} threads classified — each lands here the moment its
              model decision arrives.
            </span>
          </div>
        </div>
      );
    }
    return (
      <div className="thread-list">
        <div className="empty-state">
          <Inbox size={22} aria-hidden="true" />
          <strong>Nothing needs your attention.</strong>
          <span>
            {activeTab === "review"
              ? "No abstentions — every decision had strong evidence."
              : "This bucket is empty."}
          </span>
        </div>
      </div>
    );
  }

  const groups = DATE_GROUP_ORDER.map((group) => ({
    group,
    items: threads.filter((thread) => dateGroupOf(thread.date) === group),
  })).filter(({ items }) => items.length > 0);

  return (
    <div className="thread-list">
      {activeTab === "unsorted" && failedCount > 0 && (
        <div className="unsorted-banner">
          <span>
            {failedCount} thread{failedCount === 1 ? "" : "s"} could not be classified.
          </span>
          <button type="button" onClick={onRetryFailed}>
            Retry failed ({failedCount})
          </button>
        </div>
      )}
      {groups.map(({ group, items }) => (
        <Fragment key={group}>
          <div className="date-group mono">{group}</div>
          {items.map((thread) => {
            const task = snapshot?.tasks.get(thread.id);
            const bucketId = effectiveBucketId(thread.id);
            return (
              <ThreadRow
                key={thread.id}
                thread={thread}
                bucket={bucketId ? (bucketById.get(bucketId) ?? null) : null}
                taskState={task?.state}
                needsReview={needsReview(thread.id)}
                corrected={isCorrected(thread.id)}
                showBucketChip={activeTab === "all" || activeTab === "unsorted"}
                selected={selectedId === thread.id}
                onSelect={() => onSelect(thread.id)}
                onOpenThread={() => onOpenThread(thread.id)}
                onWhy={onWhy}
              />
            );
          })}
        </Fragment>
      ))}
    </div>
  );
}
