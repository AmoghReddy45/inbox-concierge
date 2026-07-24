"use client";

import { useEffect, useState } from "react";
import { isApiErrorBody, type ThreadDetail } from "../../lib/types";
import type { ThreadSource } from "./useThreads";

export type ThreadDetailState = {
  detail: ThreadDetail | null;
  loading: boolean;
  error: string | null;
};

type Result = { detail?: ThreadDetail; error?: string };

/**
 * Lazy per-thread messages. Results (including errors) cache in state for
 * the session; loading is derived, never stored.
 */
export function useThreadDetail(
  threadId: string | null,
  source: ThreadSource | null,
): ThreadDetailState {
  const [results, setResults] = useState<Map<string, Result>>(new Map());

  useEffect(() => {
    if (!threadId || !source || results.has(threadId)) return;
    let cancelled = false;
    const params = new URLSearchParams({ id: threadId });
    if (source === "demo") params.set("demo", "1");
    void fetch(`/api/gmail/thread?${params}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json()) as ThreadDetail | unknown;
        if (cancelled) return;
        const result: Result =
          !response.ok || isApiErrorBody(payload)
            ? {
                error: isApiErrorBody(payload)
                  ? payload.error.message
                  : `Thread fetch failed (HTTP ${response.status})`,
              }
            : { detail: payload as ThreadDetail };
        setResults((previous) => new Map(previous).set(threadId, result));
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setResults((previous) =>
          new Map(previous).set(threadId, {
            error: error instanceof Error ? error.message : "Thread fetch failed",
          }),
        );
      });
    return () => {
      cancelled = true;
    };
  }, [results, source, threadId]);

  const entry = threadId ? results.get(threadId) : undefined;
  return {
    detail: entry?.detail ?? null,
    loading: Boolean(threadId && source && !entry),
    error: entry?.error ?? null,
  };
}
