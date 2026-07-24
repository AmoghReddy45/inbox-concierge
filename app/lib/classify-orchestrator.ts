import {
  CLASSIFY_CONCURRENCY,
  MAX_FEEDBACK_HINTS,
  PROMPT_VERSION,
  isApiErrorBody,
  type ApiErrorBody,
  type FeedbackHint,
  type TaxonomyBucket,
  type ThreadSummary,
  type TriageRequest,
  type TriageResponse,
} from "../../lib/types";
import { DecisionCache, type StoredDecision } from "./decision-cache";

export type ThreadTaskState = "queued" | "classifying" | "classified" | "failed";

export type ThreadTask = {
  threadId: string;
  state: ThreadTaskState;
  /** Number of classify calls started for this thread in the current run. */
  attempts: number;
  decision?: TriageResponse["decision"];
  meta?: TriageResponse["meta"];
  error?: ApiErrorBody["error"];
};

export type RunSnapshot = {
  runId: string;
  taxonomyVersion: string;
  total: number;
  counts: {
    queued: number;
    classifying: number;
    classified: number;
    failed: number;
    cached: number;
  };
  telemetry: {
    inputTokens: number;
    outputTokens: number;
    costMicros: number | null;
    meanLatencyMs: number;
  };
  /** Non-null while the pool is paused by a provider rate limit. */
  pausedUntil: number | null;
  /** True while the user has paused the run. */
  manuallyPaused: boolean;
  tasks: Map<string, ThreadTask>;
};

export interface ClassifyOrchestrator {
  /** Start (or continue) classifying under a taxonomy. New version supersedes the run. */
  setTaxonomy(taxonomy: TaxonomyBucket[], taxonomyVersion: string): void;
  /** Register threads; already-classified threads with an unchanged latestMessageId are kept. */
  enqueue(threads: ThreadSummary[]): void;
  retryFailed(threadIds?: string[]): void;
  /** Correction hints sent with future classify calls (never overrides). */
  setFeedback(hints: FeedbackHint[]): void;
  /** User-controlled pause: in-flight calls finish, no new ones start. */
  pause(): void;
  resume(): void;
  subscribe(listener: (snapshot: RunSnapshot) => void): () => void;
  getSnapshot(): RunSnapshot;
  /** Resolves when no work is queued, in flight, or waiting on a rate-limit pause. */
  whenIdle(): Promise<void>;
  /** Abort everything; the orchestrator is unusable afterwards. */
  stop(): void;
}

export type OrchestratorDeps = {
  endpoint?: string;
  concurrency?: number;
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** Pass null to disable caching. */
  cache?: DecisionCache | null;
  now?: () => number;
  random?: () => number;
};

const MAX_ATTEMPTS_DEFAULT = 3;
const MAX_ATTEMPTS_TIMEOUT = 2;
const BACKOFF_MS = [1_000, 3_000];
const RATE_LIMIT_PAUSE_DEFAULT_MS = 15_000;

function defaultSleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export function createClassifyOrchestrator(deps: OrchestratorDeps = {}): ClassifyOrchestrator {
  const endpoint = deps.endpoint ?? "/api/ai/triage";
  const concurrency = deps.concurrency ?? CLASSIFY_CONCURRENCY;
  const fetchFn = deps.fetchFn ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const sleep = deps.sleep ?? defaultSleep;
  const cache = deps.cache === undefined ? null : deps.cache;
  const now = deps.now ?? (() => Date.now());
  const random = deps.random ?? Math.random;

  const threads = new Map<string, ThreadSummary>();
  const tasks = new Map<string, ThreadTask>();
  const queue: string[] = [];
  const listeners = new Set<(snapshot: RunSnapshot) => void>();
  const idleResolvers: Array<() => void> = [];

  let taxonomy: TaxonomyBucket[] | null = null;
  let taxonomyVersion = "";
  let runId = "";
  let abortController = new AbortController();
  let inFlight = 0;
  let pausedUntil: number | null = null;
  let pauseEpoch = 0;
  let manuallyPaused = false;
  let feedback: FeedbackHint[] = [];
  let stopped = false;

  const telemetry = {
    inputTokens: 0,
    outputTokens: 0,
    costMicrosSum: 0,
    hasCost: false,
    latencySum: 0,
    latencyCount: 0,
  };

  function resetTelemetry() {
    telemetry.inputTokens = 0;
    telemetry.outputTokens = 0;
    telemetry.costMicrosSum = 0;
    telemetry.hasCost = false;
    telemetry.latencySum = 0;
    telemetry.latencyCount = 0;
  }

  function getSnapshot(): RunSnapshot {
    const counts = { queued: 0, classifying: 0, classified: 0, failed: 0, cached: 0 };
    for (const task of tasks.values()) {
      counts[task.state] += 1;
      if (task.state === "classified" && task.meta?.cached) counts.cached += 1;
    }
    return {
      runId,
      taxonomyVersion,
      total: tasks.size,
      counts,
      telemetry: {
        inputTokens: telemetry.inputTokens,
        outputTokens: telemetry.outputTokens,
        costMicros: telemetry.hasCost ? telemetry.costMicrosSum : null,
        meanLatencyMs:
          telemetry.latencyCount > 0
            ? Math.round(telemetry.latencySum / telemetry.latencyCount)
            : 0,
      },
      pausedUntil,
      manuallyPaused,
      tasks: new Map(tasks),
    };
  }

  function notify() {
    const snapshot = getSnapshot();
    for (const listener of listeners) listener(snapshot);
  }

  function isIdle() {
    if (pausedUntil !== null) return false;
    if (inFlight > 0) return false;
    for (const task of tasks.values()) {
      if (task.state === "queued" || task.state === "classifying") return false;
    }
    return true;
  }

  function maybeResolveIdle() {
    if (!isIdle()) return;
    while (idleResolvers.length) idleResolvers.shift()!();
  }

  function setTask(threadId: string, patch: Partial<ThreadTask>) {
    const previous = tasks.get(threadId);
    if (!previous) return;
    tasks.set(threadId, { ...previous, ...patch });
  }

  function requeue(threadId: string) {
    setTask(threadId, { state: "queued" });
    queue.push(threadId);
  }

  function settleClassified(threadId: string, payload: TriageResponse, cached: boolean) {
    const meta = cached ? { ...payload.meta, cached: true } : payload.meta;
    setTask(threadId, { state: "classified", decision: payload.decision, meta, error: undefined });
    if (!cached) {
      if (payload.meta.usage) {
        telemetry.inputTokens += payload.meta.usage.inputTokens;
        telemetry.outputTokens += payload.meta.usage.outputTokens;
      }
      if (payload.meta.costMicros !== null) {
        telemetry.costMicrosSum += payload.meta.costMicros;
        telemetry.hasCost = true;
      }
      if (payload.meta.source === "llm") {
        telemetry.latencySum += payload.meta.latencyMs;
        telemetry.latencyCount += 1;
      }
      const thread = threads.get(threadId);
      if (cache && thread) {
        cache.set(
          cache.key(PROMPT_VERSION, taxonomyVersion, threadId, thread.latestMessageId),
          { decision: payload.decision, meta: payload.meta, storedAt: now() },
        );
      }
    }
  }

  function settleFailed(threadId: string, error: ApiErrorBody["error"]) {
    setTask(threadId, { state: "failed", error });
  }

  function schedulePause(durationMs: number) {
    const until = now() + durationMs;
    if (pausedUntil !== null && pausedUntil >= until) return;
    pausedUntil = until;
    pauseEpoch += 1;
    const epoch = pauseEpoch;
    notify();
    void (async () => {
      await sleep(durationMs);
      if (stopped || epoch !== pauseEpoch) return;
      pausedUntil = null;
      notify();
      pump();
      maybeResolveIdle();
    })();
  }

  function parseRetryAfterMs(response: Response): number {
    const header = response.headers.get("Retry-After");
    if (!header) return RATE_LIMIT_PAUSE_DEFAULT_MS;
    const seconds = Number(header);
    return Number.isFinite(seconds) && seconds > 0
      ? Math.round(seconds * 1_000)
      : RATE_LIMIT_PAUSE_DEFAULT_MS;
  }

  async function safeErrorBody(response: Response): Promise<ApiErrorBody["error"]> {
    try {
      const body = (await response.json()) as unknown;
      if (isApiErrorBody(body)) return body.error;
    } catch {
      // fall through
    }
    return {
      code: response.status >= 500 ? "upstream_error" : "bad_request",
      message: `Request failed with HTTP ${response.status}`,
      retryable: response.status >= 500,
    };
  }

  async function backoff(attempts: number) {
    const base = BACKOFF_MS[Math.min(attempts - 1, BACKOFF_MS.length - 1)];
    const jittered = Math.round(base * (0.7 + random() * 0.6));
    await sleep(jittered);
  }

  async function runTask(threadId: string, thread: ThreadSummary) {
    const startedRunId = runId;
    const currentTaxonomy = taxonomy!;
    const task = tasks.get(threadId);
    if (!task) return;
    setTask(threadId, { state: "classifying", attempts: task.attempts + 1 });
    inFlight += 1;
    notify();
    try {
      const hints = feedback
        .filter((hint) => hint.subject !== thread.subject)
        .slice(0, MAX_FEEDBACK_HINTS);
      const body: TriageRequest = {
        thread: {
          id: thread.id,
          sender: thread.sender,
          email: thread.email,
          subject: thread.subject,
          date: thread.date,
          gmailLabels: thread.gmailLabels,
          listUnsubscribe: thread.listUnsubscribe,
          excerpt: thread.excerpt,
          messageCount: thread.messageCount,
        },
        taxonomy: currentTaxonomy,
        taxonomyVersion,
        ...(hints.length ? { feedback: hints } : {}),
      };
      const response = await fetchFn(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: abortController.signal,
      });
      if (startedRunId !== runId || stopped) return;

      if (response.ok) {
        const payload = (await response.json()) as TriageResponse;
        if (payload.meta.taxonomyVersion !== taxonomyVersion) return;
        settleClassified(threadId, payload, false);
        return;
      }

      const error = await safeErrorBody(response);
      const attempts = tasks.get(threadId)?.attempts ?? 1;

      if (response.status === 429) {
        schedulePause(parseRetryAfterMs(response));
        if (attempts >= MAX_ATTEMPTS_DEFAULT) settleFailed(threadId, error);
        else requeue(threadId);
        return;
      }

      const maxAttempts =
        response.status === 504
          ? MAX_ATTEMPTS_TIMEOUT
          : response.status === 400 || response.status === 413 || response.status === 401
            ? 1
            : MAX_ATTEMPTS_DEFAULT;
      if (attempts >= maxAttempts) {
        settleFailed(threadId, error);
        return;
      }
      await backoff(attempts);
      if (startedRunId !== runId || stopped) return;
      requeue(threadId);
    } catch (caught) {
      if (stopped || startedRunId !== runId) return;
      if (caught instanceof Error && caught.name === "AbortError") return;
      const attempts = tasks.get(threadId)?.attempts ?? 1;
      if (attempts >= MAX_ATTEMPTS_DEFAULT) {
        settleFailed(threadId, {
          code: "upstream_error",
          message: caught instanceof Error ? caught.message : "Network error",
          retryable: true,
        });
      } else {
        await backoff(attempts);
        if (startedRunId === runId && !stopped) requeue(threadId);
      }
    } finally {
      inFlight -= 1;
      notify();
      pump();
      maybeResolveIdle();
    }
  }

  function pump() {
    if (stopped || !taxonomy || pausedUntil !== null || manuallyPaused) return;
    while (inFlight < concurrency) {
      const threadId = queue.find((id) => tasks.get(id)?.state === "queued");
      if (threadId === undefined) break;
      queue.splice(queue.indexOf(threadId), 1);
      const thread = threads.get(threadId);
      if (!thread) continue;

      if (cache) {
        const key = cache.key(PROMPT_VERSION, taxonomyVersion, threadId, thread.latestMessageId);
        const hit: StoredDecision | null = cache.get(key);
        if (hit) {
          settleClassified(
            threadId,
            { threadId, decision: hit.decision, meta: hit.meta },
            true,
          );
          notify();
          continue;
        }
      }
      void runTask(threadId, thread);
    }
    maybeResolveIdle();
  }

  return {
    setTaxonomy(nextTaxonomy, nextVersion) {
      if (stopped) return;
      if (nextVersion === taxonomyVersion && taxonomy !== null) return;
      taxonomy = nextTaxonomy;
      taxonomyVersion = nextVersion;
      runId = crypto.randomUUID();
      abortController.abort();
      abortController = new AbortController();
      pausedUntil = null;
      pauseEpoch += 1;
      manuallyPaused = false; // a new taxonomy is fresh intent to classify
      resetTelemetry();
      queue.length = 0;
      for (const [threadId] of tasks) {
        tasks.set(threadId, { threadId, state: "queued", attempts: 0 });
        queue.push(threadId);
      }
      notify();
      pump();
    },

    enqueue(newThreads) {
      if (stopped) return;
      for (const thread of newThreads) {
        const known = threads.get(thread.id);
        threads.set(thread.id, thread);
        const existing = tasks.get(thread.id);
        if (existing && known && known.latestMessageId === thread.latestMessageId) {
          continue;
        }
        tasks.set(thread.id, { threadId: thread.id, state: "queued", attempts: 0 });
        queue.push(thread.id);
      }
      notify();
      pump();
    },

    setFeedback(hints) {
      feedback = hints.slice(0, MAX_FEEDBACK_HINTS);
    },

    pause() {
      if (stopped || manuallyPaused) return;
      manuallyPaused = true;
      notify();
    },

    resume() {
      if (stopped || !manuallyPaused) return;
      manuallyPaused = false;
      notify();
      pump();
    },

    retryFailed(threadIds) {
      if (stopped) return;
      const targets =
        threadIds ??
        [...tasks.values()].filter((task) => task.state === "failed").map((t) => t.threadId);
      for (const threadId of targets) {
        const task = tasks.get(threadId);
        if (!task || task.state !== "failed") continue;
        tasks.set(threadId, { threadId, state: "queued", attempts: 0 });
        queue.push(threadId);
      }
      notify();
      pump();
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    getSnapshot,

    whenIdle() {
      if (isIdle()) return Promise.resolve();
      return new Promise((resolve) => idleResolvers.push(resolve));
    },

    stop() {
      stopped = true;
      abortController.abort();
      listeners.clear();
      while (idleResolvers.length) idleResolvers.shift()!();
    },
  };
}
