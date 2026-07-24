import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildHeuristicProfile,
  computeStats,
  DEFAULT_PATTERN_CANDIDATES,
  enforceRecencyFloor,
  prepareCorpus,
  toDistillChunks,
  toMergeSamples,
} from "../../app/lib/voice-learn";
import { EXEMPLAR_RECENCY_POOL, MAX_SENT_SAMPLES } from "../../lib/voice-types";
import type { PartialObservation, SentSample } from "../../lib/voice-types";

let counter = 0;
function sample(body: string, overrides: Partial<SentSample> = {}): SentSample {
  counter += 1;
  return {
    id: `s${counter}`,
    threadId: `t${counter}`,
    sentAt: new Date(Date.now() - counter * 3_600_000).toISOString(),
    kind: "reply",
    subject: "Re: test",
    body,
    toDomains: ["example.com"],
    internal: false,
    duplicateCount: 1,
    ...overrides,
  };
}

function corpusOf(count: number): SentSample[] {
  return Array.from({ length: count }, (_, index) => sample(`Unique reply body number ${index}.`));
}

test("prepareCorpus dedupes, caps at MAX_SENT_SAMPLES, and assigns ranks and tiers", () => {
  const prepared = prepareCorpus(corpusOf(230));
  assert.equal(prepared.length, MAX_SENT_SAMPLES);
  assert.equal(prepared[0].rank, 0);
  assert.equal(prepared[0].tier, "newest");
  assert.equal(prepared[60].tier, "middle");
  assert.equal(prepared[150].tier, "oldest");
});

test("toDistillChunks splits ~50 per chunk with tier-budgeted bodies", () => {
  const long = `Start. ${"x".repeat(2_000)}`;
  const prepared = prepareCorpus(Array.from({ length: 130 }, (_, index) => sample(`${long} ${index}`)));
  const chunks = toDistillChunks(prepared);
  assert.equal(chunks.length, 3);
  assert.equal(chunks[0].length, 50);
  assert.equal(chunks[2].length, 30);
  assert.ok(chunks[0][0].body.length <= 1_000, "newest tier budget");
  // chunks[2] covers ranks 100-129; rank 125 sits in the oldest tier (>=120).
  assert.ok(chunks[2][25].body.length <= 300, "oldest tier budget");
  assert.ok(chunks[2][5].body.length <= 500, "middle tier budget");
});

test("toMergeSamples pools observe candidates first, backfills newest replies to 40", () => {
  const prepared = prepareCorpus(corpusOf(60));
  const partial: PartialObservation = {
    toneNotes: [],
    greetingCandidates: [],
    signoffCandidates: [],
    quirks: [],
    contextObservations: [],
    exemplarCandidates: [{ sampleId: prepared[55].id, situation: "request", parentGist: "" }],
    driftNotes: [],
  };
  const merged = toMergeSamples(prepared, [partial]);
  assert.equal(merged.length, 40);
  assert.ok(merged.some((entry) => entry.id === prepared[55].id), "candidate included even when old");
  assert.equal(merged.filter((entry) => entry.rank < 40).length, 39, "backfill is newest-first");
});

test("enforceRecencyFloor drops the oldest surplus to keep >=70% recent", () => {
  const rankOf = (id: string) => Number(id.replace("r", ""));
  const exemplars = [
    ...Array.from({ length: 7 }, (_, index) => ({ sampleId: `r${index}` })),
    { sampleId: `r${EXEMPLAR_RECENCY_POOL + 5}` },
    { sampleId: `r${EXEMPLAR_RECENCY_POOL + 50}` },
    { sampleId: `r${EXEMPLAR_RECENCY_POOL + 90}` },
    { sampleId: `r${EXEMPLAR_RECENCY_POOL + 120}` },
  ];
  const kept = enforceRecencyFloor(exemplars, rankOf);
  // 7 recent allow floor(7*3/7)=3 older; the oldest one is dropped.
  assert.equal(kept.length, 10);
  assert.ok(!kept.some((entry) => entry.sampleId === `r${EXEMPLAR_RECENCY_POOL + 120}`));
  const recentCount = kept.filter((entry) => rankOf(entry.sampleId) < EXEMPLAR_RECENCY_POOL).length;
  assert.ok(recentCount / kept.length >= 0.7);
});

test("buildHeuristicProfile is measured-only: neutral tone, no contexts, code-picked exemplars", () => {
  const replies = Array.from({ length: 10 }, (_, index) =>
    sample(`Handled item ${index}.`, {
      parent: {
        sender: "M",
        email: "m@x.com",
        excerpt: `Can you handle item ${index}?`,
        receivedAt: "",
      },
    }),
  );
  const prepared = prepareCorpus(replies);
  const stats = computeStats(
    prepared,
    { filtered: 2, skipped: 1, scannedThreads: 10 },
    DEFAULT_PATTERN_CANDIDATES,
  );
  const profile = buildHeuristicProfile(prepared, stats);
  assert.equal(profile.contexts.length, 0);
  assert.equal(profile.tone.formality, 0.5);
  assert.equal(profile.exemplars.length, 8);
  assert.equal(profile.exemplars[0].situation, "request");
  assert.equal(profile.corpus.filtered, 2);
  assert.equal(profile.corpus.sampleCount, 10);
});
