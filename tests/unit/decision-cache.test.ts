import assert from "node:assert/strict";
import { test } from "node:test";
import { DecisionCache } from "../../app/lib/decision-cache";
import type { Decision, TriageMeta } from "../../lib/types";

function makeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    _map: map,
  };
}

const decision: Decision = {
  bucketId: "important",
  runnerUpBucketId: null,
  rationale: "r",
  evidence: ["q"],
  ambiguityReasons: [],
  needsReview: false,
};

const meta: TriageMeta = {
  source: "llm",
  model: "kimi-k3",
  promptVersion: "triage-v5",
  latencyMs: 1000,
  usage: { inputTokens: 10, cachedInputTokens: 0, outputTokens: 5 },
  costMicros: 105,
  taxonomyVersion: "v",
};

test("cache key includes all four identity parts", () => {
  const cache = new DecisionCache(makeStorage());
  const key = cache.key("triage-v5", "tax1", "thread1", "msg9");
  assert.ok(key.includes("triage-v5"));
  assert.ok(key.includes("tax1"));
  assert.ok(key.includes("thread1"));
  assert.ok(key.includes("msg9"));
});

test("set/get roundtrip and miss on any identity change", () => {
  const cache = new DecisionCache(makeStorage());
  const key = cache.key("triage-v5", "tax1", "t1", "m1");
  cache.set(key, { decision, meta, storedAt: 111 });
  assert.deepEqual(cache.get(key)?.decision, decision);
  assert.equal(cache.get(cache.key("triage-v5", "tax2", "t1", "m1")), null);
  assert.equal(cache.get(cache.key("triage-v5", "tax1", "t1", "m2")), null);
});

test("evicts oldest storedAt beyond maxEntries", () => {
  const cache = new DecisionCache(makeStorage(), 3);
  for (let i = 1; i <= 4; i++) {
    cache.set(cache.key("p", "t", `thread${i}`, "m"), { decision, meta, storedAt: i });
  }
  assert.equal(cache.get(cache.key("p", "t", "thread1", "m")), null);
  for (let i = 2; i <= 4; i++) {
    assert.ok(cache.get(cache.key("p", "t", `thread${i}`, "m")), `thread${i} survives`);
  }
});

test("corrupted storage is treated as empty, then recovers on write", () => {
  const storage = makeStorage();
  storage.setItem("tenex.triage.v1", "{not json");
  const cache = new DecisionCache(storage);
  const key = cache.key("p", "t", "t1", "m1");
  assert.equal(cache.get(key), null);
  cache.set(key, { decision, meta, storedAt: 5 });
  assert.ok(cache.get(key));
});
