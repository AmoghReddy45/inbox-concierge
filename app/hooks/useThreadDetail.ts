"use client";

import { useCallback, useEffect, useState } from "react";
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
 * the session; loading is derived, never stored. The selected-but-unopened
 * thread prefetches after a short debounce, so pressing Enter usually
 * paints from cache instead of waiting on the network.
 */
export function useThreadDetail(
  threadId: string | null,
  source: ThreadSource | null,
  prefetchId: string | null = null,
): ThreadDetailState {
  const [results, setResults] = useState<Map<string, Result>>(new Map());

  const load = useCallback(
    (id: string, currentSource: ThreadSource, isCancelled: () => boolean) => {
      const params = new URLSearchParams({ id });
      if (currentSource === "demo") params.set("demo", "1");
      // High priority: jumps the queue ahead of in-flight classification.
      void fetch(`/api/gmail/thread?${params}`, { cache: "no-store", priority: "high" } as RequestInit)
        .then(async (response) => {
          const payload = (await response.json()) as ThreadDetail | unknown;
          if (isCancelled()) return;
          const result: Result =
            !response.ok || isApiErrorBody(payload)
              ? {
                  error: isApiErrorBody(payload)
                    ? payload.error.message
                    : `Thread fetch failed (HTTP ${response.status})`,
                }
              : { detail: payload as ThreadDetail };
          setResults((previous) => new Map(previous).set(id, result));
        })
        .catch((error: unknown) => {
          if (isCancelled()) return;
          setResults((previous) =>
            new Map(previous).set(id, {
              error: error instanceof Error ? error.message : "Thread fetch failed",
            }),
          );
        });
    },
    [],
  );

  useEffect(() => {
    if (!threadId || !source || results.has(threadId)) return;
    let cancelled = false;
    load(threadId, source, () => cancelled);
    return () => {
      cancelled = true;
    };
  }, [load, results, source, threadId]);

  // Prefetch the selection after 150ms — long enough that holding j/k
  // doesn't fire a request per row, short enough to beat the user's Enter.
  useEffect(() => {
    if (!prefetchId || !source || results.has(prefetchId)) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (!cancelled) load(prefetchId, source, () => cancelled);
    }, 150);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [load, prefetchId, results, source]);

  const entry = threadId ? results.get(threadId) : undefined;
  return {
    detail: entry?.detail ?? null,
    loading: Boolean(threadId && source && !entry),
    error: entry?.error ?? null,
  };
}
