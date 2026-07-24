"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import {
  createClassifyOrchestrator,
  type ClassifyOrchestrator,
  type RunSnapshot,
} from "../lib/classify-orchestrator";
import { DecisionCache } from "../lib/decision-cache";
import { toTaxonomy, type Bucket } from "../../lib/taxonomy";
import type { FeedbackHint, ThreadSummary } from "../../lib/types";

type Store = {
  orchestrator: ClassifyOrchestrator;
  subscribe: (onStoreChange: () => void) => () => void;
  getSnapshot: () => RunSnapshot;
};

function createStore(): Store | null {
  if (typeof window === "undefined") return null;
  const orchestrator = createClassifyOrchestrator({
    cache: new DecisionCache(window.localStorage),
  });
  let latest = orchestrator.getSnapshot();
  return {
    orchestrator,
    subscribe: (onStoreChange) =>
      orchestrator.subscribe((snapshot) => {
        latest = snapshot;
        onStoreChange();
      }),
    getSnapshot: () => latest,
  };
}

const noSubscribe = () => () => {};
const nullSnapshot = () => null;

/** Bridges the framework-free orchestrator into React state. */
export function useClassifier(
  buckets: Bucket[],
  taxonomyVersion: string | null,
  threads: ThreadSummary[],
  feedback: FeedbackHint[],
) {
  const [store] = useState(createStore);

  const snapshot = useSyncExternalStore(
    store?.subscribe ?? noSubscribe,
    store?.getSnapshot ?? nullSnapshot,
    nullSnapshot,
  );

  useEffect(() => {
    if (!taxonomyVersion || !store) return;
    store.orchestrator.setTaxonomy(toTaxonomy(buckets), taxonomyVersion);
  }, [buckets, store, taxonomyVersion]);

  useEffect(() => {
    if (threads.length && store) store.orchestrator.enqueue(threads);
  }, [store, threads]);

  useEffect(() => {
    store?.orchestrator.setFeedback(feedback);
  }, [feedback, store]);

  useEffect(() => {
    if (!store) return;
    return () => store.orchestrator.stop();
  }, [store]);

  const retryFailed = useCallback(
    (threadIds?: string[]) => store?.orchestrator.retryFailed(threadIds),
    [store],
  );
  const pause = useCallback(() => store?.orchestrator.pause(), [store]);
  const resume = useCallback(() => store?.orchestrator.resume(), [store]);

  return { snapshot, retryFailed, pause, resume };
}
