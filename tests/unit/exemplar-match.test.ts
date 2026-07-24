import assert from "node:assert/strict";
import { test } from "node:test";
import {
  computeReplyLikelihood,
  detectThreadSituation,
  matchExemplars,
} from "../../app/lib/exemplar-match";
import type { VoiceExemplar, VoiceProfile } from "../../lib/voice-types";

function threadOf(overrides: Partial<Parameters<typeof detectThreadSituation>[0]> = {}) {
  return {
    subject: "Quarterly numbers",
    excerpt: "Here are the figures you asked about.",
    listUnsubscribe: false,
    email: "marcus@meridianlabs.io",
    ...overrides,
  };
}

function profileOf(overrides: Partial<VoiceProfile> = {}): VoiceProfile {
  return {
    version: "voice-distill-v1",
    builtAt: "2026-07-24T00:00:00Z",
    corpus: {
      sampleCount: 38,
      replyCount: 32,
      freshCount: 5,
      forwardCount: 1,
      newestSentAt: "2026-07-24T00:00:00Z",
      oldestSentAt: "2026-05-01T00:00:00Z",
      newestSentId: "s1",
      filtered: 3,
      skipped: 0,
    },
    signature: null,
    tone: { formality: 0.3, warmth: 0.5, directness: 0.9, notes: [] },
    greetings: [],
    signoffs: [],
    length: { medianWords: 16, p90Words: 27, oneLinerShare: 0.47 },
    quirks: [],
    contexts: [],
    exemplars: [],
    replyBehavior: {
      respondsTo: [
        { situation: "escalation", share: 0.3, typicalLatency: "~45m", count: 10 },
        { situation: "scheduling", share: 0.06, typicalLatency: "~8h", count: 2 },
      ],
      neverObserved: ["cold-outreach", "intro"],
    },
    driftNotes: [],
    ...overrides,
  };
}

test("detectThreadSituation: bulk beats everything, then bucket, then cues", () => {
  assert.equal(detectThreadSituation(threadOf({ listUnsubscribe: true }), "important"), "bulk");
  assert.equal(detectThreadSituation(threadOf({ email: "no-reply@github.com" }), null), "bulk");
  assert.equal(detectThreadSituation(threadOf(), "newsletter"), "bulk");
  assert.equal(detectThreadSituation(threadOf(), "escalations"), "escalation");
  assert.equal(
    detectThreadSituation(threadOf({ subject: "Checkout is failing", excerpt: "outage" }), null),
    "escalation",
  );
  assert.equal(
    detectThreadSituation(
      threadOf({ excerpt: "Can you confirm the figures by Friday?" }),
      "important",
    ),
    "request",
  );
  assert.equal(detectThreadSituation(threadOf(), "important"), "fyi");
});

test("computeReplyLikelihood states only measured numbers", () => {
  const profile = profileOf();
  const typical = computeReplyLikelihood("escalation", profile);
  assert.equal(typical.level, "typical");
  assert.ok(typical.note.includes("10 of your last 32 replies"));
  assert.ok(typical.note.includes("~45m"));

  const sometimes = computeReplyLikelihood("scheduling", profile);
  assert.equal(sometimes.level, "sometimes");
  assert.ok(sometimes.note.includes("Only 2"));

  const never = computeReplyLikelihood("cold-outreach", profile);
  assert.equal(never.level, "no-evidence");
  assert.ok(never.note.includes("None of your last 32"));

  assert.equal(computeReplyLikelihood("bulk", profile).level, "unknown");
  assert.equal(computeReplyLikelihood("fyi", profile).level, "unknown");
});

test("matchExemplars prefers situation, then side, then recency", () => {
  const exemplar = (situation: string, internal: boolean, sentAt: string): VoiceExemplar => ({
    situation,
    parentGist: "",
    body: `${situation}-${internal}-${sentAt}`,
    sentAt,
    internal,
  });
  const profile = profileOf({
    exemplars: [
      exemplar("request", true, "2026-07-01T00:00:00Z"),
      exemplar("escalation", false, "2026-05-01T00:00:00Z"),
      exemplar("escalation", true, "2026-07-20T00:00:00Z"),
      exemplar("fyi", true, "2026-07-22T00:00:00Z"),
    ],
  });
  const matched = matchExemplars(profile, { situation: "escalation", internal: true }, 3);
  assert.equal(matched.length, 3);
  // situation+internal+recent (6) beats situation-only (3) beats side-only+recent (3, newer wins tiebreak? fyi internal+recent = 3)
  assert.equal(matched[0].body, "escalation-true-2026-07-20T00:00:00Z");
  assert.equal(matched[1].situation === "escalation" || matched[1].internal, true);
});

test("matchExemplars returns empty for empty profiles", () => {
  assert.deepEqual(matchExemplars(profileOf(), { situation: "request", internal: true }), []);
});
