"use client";

import { useEffect, useRef, useState } from "react";
import {
  MAX_THREADS,
  isApiErrorBody,
  type ThreadSummary,
  type ThreadsResponse,
} from "../../lib/types";

export type ThreadSource = "gmail" | "demo";

export type ThreadsState = {
  threads: ThreadSummary[];
  loading: boolean;
  /** Pages fetched so far (for skeleton logic). */
  pagesLoaded: number;
  skipped: number;
  email: string | null;
  error: string | null;
};

const INITIAL: ThreadsState = {
  threads: [],
  loading: false,
  pagesLoaded: 0,
  skipped: 0,
  email: null,
  error: null,
};

/**
 * Sequential page loop over /api/gmail/threads. Pages render as they land;
 * classification enqueues from an effect watching `threads`.
 */
export function useThreads(source: ThreadSource | null) {
  const [state, setState] = useState<ThreadsState>(INITIAL);
  const generation = useRef(0);

  useEffect(() => {
    if (!source) {
      setState(INITIAL);
      return;
    }
    generation.current += 1;
    const runGeneration = generation.current;
    let cancelled = false;
    setState({ ...INITIAL, loading: true });

    void (async () => {
      const collected: ThreadSummary[] = [];
      let pageToken: string | null = null;
      let pages = 0;
      let skippedTotal = 0;
      try {
        do {
          const params = new URLSearchParams();
          if (source === "demo") params.set("demo", "1");
          if (pageToken) params.set("pageToken", pageToken);
          const response = await fetch(`/api/gmail/threads?${params}`, { cache: "no-store" });
          const payload = (await response.json()) as ThreadsResponse | unknown;
          if (cancelled || runGeneration !== generation.current) return;
          if (!response.ok || isApiErrorBody(payload)) {
            const message = isApiErrorBody(payload)
              ? payload.error.message
              : `Thread fetch failed (HTTP ${response.status})`;
            setState((current) => ({ ...current, loading: false, error: message }));
            return;
          }
          const page = payload as ThreadsResponse;
          collected.push(...page.threads);
          skippedTotal += page.skipped;
          pages += 1;
          pageToken = collected.length >= MAX_THREADS ? null : page.nextPageToken;
          setState({
            threads: [...collected.slice(0, MAX_THREADS)],
            loading: pageToken !== null,
            pagesLoaded: pages,
            skipped: skippedTotal,
            email: page.email,
            error: null,
          });
        } while (pageToken !== null && !cancelled);
      } catch (error) {
        if (cancelled || runGeneration !== generation.current) return;
        setState((current) => ({
          ...current,
          loading: false,
          error: error instanceof Error ? error.message : "Thread fetch failed",
        }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [source]);

  return state;
}
