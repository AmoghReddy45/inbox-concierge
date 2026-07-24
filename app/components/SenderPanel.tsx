"use client";

import { History } from "lucide-react";
import { useMemo } from "react";
import type { Bucket } from "../../lib/taxonomy";
import type { ThreadSummary } from "../../lib/types";
import { formatRowTime } from "../lib/format";

type Props = {
  sender: string;
  email: string;
  /** Every loaded thread from this sender address, newest first. */
  senderThreads: ThreadSummary[];
  currentThreadId: string;
  buckets: Bucket[];
  effectiveBucketId: (threadId: string) => string | null;
  onOpenThread: (threadId: string) => void;
};

/**
 * Superhuman-style contact rail: everything already known about this
 * sender from the loaded corpus — zero extra fetches. The same history
 * the classifier uses as its sender prior, made visible.
 */
export function SenderPanel({
  sender,
  email,
  senderThreads,
  currentThreadId,
  buckets,
  effectiveBucketId,
  onOpenThread,
}: Props) {
  const bucketById = useMemo(() => new Map(buckets.map((bucket) => [bucket.id, bucket])), [buckets]);

  const distribution = useMemo(() => {
    const counts = new Map<string, number>();
    for (const thread of senderThreads) {
      const bucketId = effectiveBucketId(thread.id);
      if (bucketId) counts.set(bucketId, (counts.get(bucketId) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([bucketId, count]) => ({ bucket: bucketById.get(bucketId), count }))
      .filter((entry): entry is { bucket: Bucket; count: number } => Boolean(entry.bucket))
      .sort((a, b) => b.count - a.count);
  }, [bucketById, effectiveBucketId, senderThreads]);

  const unreadCount = senderThreads.filter((thread) => thread.unread).length;
  const initial = (sender || email).trim().charAt(0).toUpperCase() || "?";

  return (
    <aside className="sender-panel" aria-label={`History with ${sender}`}>
      <header className="sender-card">
        <span className="sender-avatar" aria-hidden="true">
          {initial}
        </span>
        <div className="sender-identity">
          <strong>{sender}</strong>
          <span className="sender-email">{email}</span>
        </div>
      </header>

      <p className="sender-facts mono">
        {senderThreads.length} thread{senderThreads.length === 1 ? "" : "s"} in the last 200
        {unreadCount > 0 && ` · ${unreadCount} unread`}
      </p>

      {distribution.length > 0 && (
        <div className="sender-distribution" aria-label="How this sender's mail is classified">
          {distribution.map(({ bucket, count }) => (
            <span className={`row-chip tone-${bucket.tone}`} key={bucket.id}>
              {bucket.name}
              {count > 1 && ` ×${count}`}
            </span>
          ))}
        </div>
      )}

      <div className="sender-history">
        <h3>
          <History size={12} aria-hidden="true" /> Conversations
        </h3>
        {senderThreads.length <= 1 ? (
          <p className="sender-empty">First thread from this sender in the loaded inbox.</p>
        ) : (
          <ul>
            {senderThreads.map((thread) => {
              const current = thread.id === currentThreadId;
              return (
                <li key={thread.id}>
                  <button
                    type="button"
                    className={`sender-thread ${current ? "is-current" : ""}`}
                    disabled={current}
                    onClick={() => onOpenThread(thread.id)}
                  >
                    <span className="sender-thread-top">
                      <span className="sender-thread-subject">
                        {thread.unread && <span className="sender-unread-dot" aria-label="Unread" />}
                        {thread.subject}
                      </span>
                      <time dateTime={thread.date}>{formatRowTime(thread.date)}</time>
                    </span>
                    <span className="sender-thread-preview">{thread.preview}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
