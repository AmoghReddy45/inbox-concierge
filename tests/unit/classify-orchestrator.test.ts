import assert from "node:assert/strict";
import { test } from "node:test";
import { createClassifyOrchestrator } from "../../app/lib/classify-orchestrator";
import { DecisionCache } from "../../app/lib/decision-cache";
import type { RunSnapshot } from "../../app/lib/classify-orchestrator";
import type { Decision, ThreadSummary, TriageMeta, TriageResponse } from "../../lib/types";

function makeThread(id: string, latestMessageId = `${id}-m1`): ThreadSummary {
  return {
    id,
    sender: "Sender",
    email: "sender@example.com",
    subject: `Subject ${id}`,
    preview: "preview",
    excerpt: `Excerpt for ${id}`,
    date: "2026-07-23T09:00:00.000Z",
    unread: false,
    gmailLabels: [],
    listUnsubscribe: false,
    messageCount: 1,
    latestMessageId,
  };
}

const TAXONOMY = [
  { id: "important", name: "Important", description: "d" },
  { id: "wait", name: "Can wait", description: "d" },
];

function makeDecision(bucketId = "important"): Decision {
  return {
    bucketId,
    runnerUpBucketId: null,
    rationale: "because",
    evidence: ["Excerpt"],
    ambiguityReasons: [],
    needsReview: false,
  };
}

function makeMeta(taxonomyVersion: string, costMicros: number | null = 100): TriageMeta {
  return {
    source: "llm",
    model: "kimi-k3",
    promptVersion: "triage-v5",
    latencyMs: 500,
    usage: { inputTokens: 100, cachedInputTokens: 0, outputTokens: 20 },
    costMicros,
    taxonomyVersion,
  };
}

function okResponse(threadId: string, taxonomyVersion: string): Response {
  const body: TriageResponse = {
    threadId,
    decision: makeDecision(),
    meta: makeMeta(taxonomyVersion),
  };
  return new Response(JSON.stringify(body), { status: 200 });
}

function errorResponse(status: number, code: string, retryAfter?: string): Response {
  return new Response(
    JSON.stringify({ error: { code, message: code, retryable: status !== 400 } }),
    { status, headers: retryAfter ? { "Retry-After": retryAfter } : undefined },
  );
}

function makeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

const instantSleep = () => Promise.resolve();

test("classifies enqueued threads and reports telemetry", async () => {
  const calls: string[] = [];
  const orchestrator = createClassifyOrchestrator({
    fetchFn: async (_url, init) => {
      const request = JSON.parse(String(init?.body));
      calls.push(request.thread.id);
      return okResponse(request.thread.id, request.taxonomyVersion);
    },
    sleep: instantSleep,
    cache: null,
  });
  orchestrator.setTaxonomy(TAXONOMY, "tax-1");
  orchestrator.enqueue([makeThread("t1"), makeThread("t2")]);
  await orchestrator.whenIdle();

  const snapshot = orchestrator.getSnapshot();
  assert.equal(snapshot.counts.classified, 2);
  assert.equal(snapshot.counts.failed, 0);
  assert.equal(snapshot.total, 2);
  assert.deepEqual(calls.sort(), ["t1", "t2"]);
  assert.equal(snapshot.telemetry.inputTokens, 200);
  assert.equal(snapshot.telemetry.outputTokens, 40);
  assert.equal(snapshot.telemetry.costMicros, 200);
  assert.equal(snapshot.telemetry.meanLatencyMs, 500);
  assert.equal(snapshot.tasks.get("t1")?.decision?.bucketId, "important");
});

test("respects the concurrency cap", async () => {
  let inFlight = 0;
  let peak = 0;
  const orchestrator = createClassifyOrchestrator({
    concurrency: 3,
    sleep: instantSleep,
    cache: null,
    fetchFn: async (_url, init) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      const request = JSON.parse(String(init?.body));
      return okResponse(request.thread.id, request.taxonomyVersion);
    },
  });
  orchestrator.setTaxonomy(TAXONOMY, "tax-1");
  orchestrator.enqueue(Array.from({ length: 10 }, (_, i) => makeThread(`t${i}`)));
  await orchestrator.whenIdle();
  assert.equal(orchestrator.getSnapshot().counts.classified, 10);
  assert.equal(peak, 3);
});

test("cache hits classify immediately without fetch and add zero cost", async () => {
  const storage = makeStorage();
  const cache = new DecisionCache(storage);
  cache.set(cache.key("triage-v5", "tax-1", "t1", "t1-m1"), {
    decision: makeDecision("wait"),
    meta: makeMeta("tax-1", 999),
    storedAt: 1,
  });
  let fetchCount = 0;
  const orchestrator = createClassifyOrchestrator({
    cache,
    sleep: instantSleep,
    fetchFn: async (_url, init) => {
      fetchCount += 1;
      const request = JSON.parse(String(init?.body));
      return okResponse(request.thread.id, request.taxonomyVersion);
    },
  });
  orchestrator.setTaxonomy(TAXONOMY, "tax-1");
  orchestrator.enqueue([makeThread("t1"), makeThread("t2")]);
  await orchestrator.whenIdle();

  const snapshot = orchestrator.getSnapshot();
  assert.equal(fetchCount, 1);
  assert.equal(snapshot.counts.classified, 2);
  assert.equal(snapshot.counts.cached, 1);
  assert.equal(snapshot.tasks.get("t1")?.meta?.cached, true);
  assert.equal(snapshot.tasks.get("t1")?.decision?.bucketId, "wait");
  assert.equal(snapshot.telemetry.costMicros, 100);
});

test("retries 502 then succeeds; attempts recorded", async () => {
  let calls = 0;
  const orchestrator = createClassifyOrchestrator({
    sleep: instantSleep,
    cache: null,
    fetchFn: async (_url, init) => {
      calls += 1;
      const request = JSON.parse(String(init?.body));
      if (calls === 1) return errorResponse(502, "upstream_error");
      return okResponse(request.thread.id, request.taxonomyVersion);
    },
  });
  orchestrator.setTaxonomy(TAXONOMY, "tax-1");
  orchestrator.enqueue([makeThread("t1")]);
  await orchestrator.whenIdle();

  const task = orchestrator.getSnapshot().tasks.get("t1");
  assert.equal(task?.state, "classified");
  assert.equal(task?.attempts, 2);
});

test("400 fails immediately without retry; retryFailed requeues it", async () => {
  let calls = 0;
  let failNext = true;
  const orchestrator = createClassifyOrchestrator({
    sleep: instantSleep,
    cache: null,
    fetchFn: async (_url, init) => {
      calls += 1;
      const request = JSON.parse(String(init?.body));
      if (failNext) return errorResponse(400, "bad_request");
      return okResponse(request.thread.id, request.taxonomyVersion);
    },
  });
  orchestrator.setTaxonomy(TAXONOMY, "tax-1");
  orchestrator.enqueue([makeThread("t1")]);
  await orchestrator.whenIdle();
  assert.equal(calls, 1);
  assert.equal(orchestrator.getSnapshot().tasks.get("t1")?.state, "failed");
  assert.equal(orchestrator.getSnapshot().tasks.get("t1")?.error?.code, "bad_request");

  failNext = false;
  orchestrator.retryFailed();
  await orchestrator.whenIdle();
  assert.equal(orchestrator.getSnapshot().tasks.get("t1")?.state, "classified");
});

test("429 pauses the pool globally then resumes", async () => {
  let calls = 0;
  const sleeps: number[] = [];
  const orchestrator = createClassifyOrchestrator({
    cache: null,
    sleep: (ms) => {
      sleeps.push(ms);
      return Promise.resolve();
    },
    fetchFn: async (_url, init) => {
      calls += 1;
      const request = JSON.parse(String(init?.body));
      if (calls === 1) return errorResponse(429, "rate_limited", "7");
      return okResponse(request.thread.id, request.taxonomyVersion);
    },
  });
  orchestrator.setTaxonomy(TAXONOMY, "tax-1");
  orchestrator.enqueue([makeThread("t1")]);

  let sawPause = false;
  const unsubscribe = orchestrator.subscribe((snap: RunSnapshot) => {
    if (snap.pausedUntil !== null) sawPause = true;
  });
  await orchestrator.whenIdle();
  unsubscribe();

  assert.equal(orchestrator.getSnapshot().tasks.get("t1")?.state, "classified");
  assert.ok(sawPause, "snapshot exposed pausedUntil during the pause");
  assert.ok(sleeps.some((ms) => ms === 7_000), `pool slept for Retry-After (saw ${sleeps})`);
});

test("setTaxonomy supersedes: stale responses discarded, threads requeued, new version wins", async () => {
  const gates = new Map<string, (response: Response) => void>();
  const orchestrator = createClassifyOrchestrator({
    cache: null,
    sleep: instantSleep,
    fetchFn: (_url, init) =>
      new Promise<Response>((resolve, reject) => {
        const request = JSON.parse(String(init?.body));
        const signal = init?.signal as AbortSignal | undefined;
        signal?.addEventListener("abort", () =>
          reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
        );
        gates.set(`${request.thread.id}:${request.taxonomyVersion}`, resolve);
      }),
  });
  orchestrator.setTaxonomy(TAXONOMY, "tax-1");
  orchestrator.enqueue([makeThread("t1")]);
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(orchestrator.getSnapshot().tasks.get("t1")?.state, "classifying");

  // Supersede while t1 is in flight under tax-1.
  orchestrator.setTaxonomy([...TAXONOMY, { id: "custom", name: "C", description: "d" }], "tax-2");
  // Old response arrives late (its fetch may already be aborted; resolve if the gate exists).
  gates.get("t1:tax-1")?.(okResponse("t1", "tax-1"));
  await new Promise((resolve) => setTimeout(resolve, 5));
  const midTask = orchestrator.getSnapshot().tasks.get("t1");
  assert.notEqual(midTask?.state, "classified");

  gates.get("t1:tax-2")?.(okResponse("t1", "tax-2"));
  await orchestrator.whenIdle();
  const task = orchestrator.getSnapshot().tasks.get("t1");
  assert.equal(task?.state, "classified");
  assert.equal(task?.meta?.taxonomyVersion, "tax-2");
  assert.equal(orchestrator.getSnapshot().taxonomyVersion, "tax-2");
});

test("feedback hints ride along on classify calls, excluding the thread itself", async () => {
  const bodies: Array<Record<string, unknown>> = [];
  const orchestrator = createClassifyOrchestrator({
    cache: null,
    sleep: instantSleep,
    fetchFn: async (_url, init) => {
      const request = JSON.parse(String(init?.body));
      bodies.push(request);
      return okResponse(request.thread.id, request.taxonomyVersion);
    },
  });
  orchestrator.setTaxonomy(TAXONOMY, "tax-1");
  orchestrator.setFeedback([
    { sender: "Sender", subject: "Subject t1", correctedToBucketId: "wait" },
    { sender: "Other", subject: "Unrelated subject", correctedToBucketId: "important" },
  ]);
  orchestrator.enqueue([makeThread("t1")]);
  await orchestrator.whenIdle();

  const request = bodies[0];
  const feedback = request.feedback as Array<{ subject: string }>;
  assert.equal(feedback.length, 1, "own-thread hint filtered out");
  assert.equal(feedback[0].subject, "Unrelated subject");
});

test("manual pause stops new starts; resume continues; new taxonomy auto-resumes", async () => {
  let calls = 0;
  const orchestrator = createClassifyOrchestrator({
    concurrency: 1,
    cache: null,
    sleep: instantSleep,
    fetchFn: async (_url, init) => {
      calls += 1;
      const request = JSON.parse(String(init?.body));
      return okResponse(request.thread.id, request.taxonomyVersion);
    },
  });
  orchestrator.setTaxonomy(TAXONOMY, "tax-1");
  orchestrator.pause();
  orchestrator.enqueue([makeThread("t1"), makeThread("t2")]);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(calls, 0, "nothing starts while paused");
  assert.equal(orchestrator.getSnapshot().manuallyPaused, true);

  orchestrator.resume();
  await orchestrator.whenIdle();
  assert.equal(orchestrator.getSnapshot().counts.classified, 2);

  orchestrator.pause();
  orchestrator.setTaxonomy([...TAXONOMY, { id: "x", name: "X", description: "d" }], "tax-2");
  assert.equal(orchestrator.getSnapshot().manuallyPaused, false, "new taxonomy resumes");
  await orchestrator.whenIdle();
});

test("re-enqueueing a thread with a new latestMessageId reclassifies it", async () => {
  const seen: string[] = [];
  const orchestrator = createClassifyOrchestrator({
    cache: null,
    sleep: instantSleep,
    fetchFn: async (_url, init) => {
      const request = JSON.parse(String(init?.body));
      seen.push(request.thread.id);
      return okResponse(request.thread.id, request.taxonomyVersion);
    },
  });
  orchestrator.setTaxonomy(TAXONOMY, "tax-1");
  orchestrator.enqueue([makeThread("t1", "m1")]);
  await orchestrator.whenIdle();
  orchestrator.enqueue([makeThread("t1", "m1")]);
  await orchestrator.whenIdle();
  assert.equal(seen.length, 1, "same latestMessageId is not refetched");

  orchestrator.enqueue([makeThread("t1", "m2")]);
  await orchestrator.whenIdle();
  assert.equal(seen.length, 2, "new latestMessageId is reclassified");
});
