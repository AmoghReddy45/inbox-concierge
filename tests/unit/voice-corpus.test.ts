import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyTierBudget,
  dedupeSamples,
  detectSignature,
  lengthStats,
  measurePatterns,
  replyStats,
  situationOfParent,
  stripSignature,
} from "../../app/lib/voice-corpus";
import type { SentSample } from "../../lib/voice-types";

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

test("detectSignature finds the dominant trailing block and stripSignature removes it", () => {
  const signed = Array.from({ length: 6 }, (_, index) =>
    sample(`Reply number ${index} with content.\n\nBest,\nA.`),
  );
  const unsigned = Array.from({ length: 4 }, (_, index) => sample(`Hey — quick note ${index}.`));
  const signature = detectSignature([...signed, ...unsigned]);
  assert.equal(signature, "Best,\nA.");
  assert.equal(
    stripSignature("Approved — ship it.\n\nBest,\nA.", signature),
    "Approved — ship it.",
  );
  assert.equal(stripSignature("No signature here.", signature), "No signature here.");
});

test("detectSignature returns null when no block dominates", () => {
  const varied = Array.from({ length: 8 }, (_, index) => sample(`Body ${index}.\nCheers ${index}`));
  assert.equal(detectSignature(varied), null);
});

test("measurePatterns counts real occurrences with {first} placeholder and context split", () => {
  const internals = Array.from({ length: 5 }, (_, index) =>
    sample(`Hey Priya — item ${index} approved.`, { internal: true }),
  );
  const externals = Array.from({ length: 3 }, (_, index) =>
    sample(`Marcus — update ${index} attached.`, { internal: false }),
  );
  const patterns = measurePatterns(
    [...internals, ...externals],
    ["Hey {first} —", "{first} —", "Yo {first}"],
    "greeting",
    null,
  );
  const hey = patterns.find((pattern) => pattern.text === "Hey {first} —");
  assert.ok(hey);
  assert.equal(hey.context, "internal");
  assert.equal(hey.share, 0.63); // 5 of 8
  assert.ok(!patterns.some((pattern) => pattern.text === "Yo {first}"), "unmatched candidate dropped");
});

test("measurePatterns finds sign-offs above a trailing name line", () => {
  const externals = Array.from({ length: 4 }, (_, index) =>
    sample(`Update ${index} attached.\n\nBest,\nA.`, { internal: false }),
  );
  const bare = Array.from({ length: 2 }, (_, index) => sample(`Works ${index}.`, { internal: true }));
  const signoffs = measurePatterns([...externals, ...bare], ["Best,", "Thanks,"], "signoff", null);
  const best = signoffs.find((pattern) => pattern.text === "Best,");
  assert.ok(best, "Best, detected despite name line below it");
  assert.equal(best.context, "external");
  assert.equal(best.share, 0.67); // 4 of 6
});

test("lengthStats measures median/p90/one-liner share excluding the signature", () => {
  const bodies = [
    "Yes.",
    "Done — swapped.",
    "Hey — three words here now.",
    "This reply has exactly eight words in it total.",
    "This considerably longer reply keeps going with many more words than the others because someone asked a complicated question needing detail.",
  ];
  const stats = lengthStats(bodies.map((body) => sample(`${body}\n\nBest,\nA.`)), "Best,\nA.");
  assert.equal(stats.medianWords, 6);
  assert.equal(stats.oneLinerShare, 0.8);
  assert.ok(stats.p90Words >= 15);
});

test("replyStats groups by situation with honest composition shares", () => {
  const samples = [
    sample("On it.", { parent: { sender: "M", email: "m@x.com", excerpt: "URGENT: checkout is failing for all users", receivedAt: "" }, replyLatencyMinutes: 30 }),
    sample("Driving this.", { parent: { sender: "M", email: "m@x.com", excerpt: "Production outage — need an owner asap", receivedAt: "" }, replyLatencyMinutes: 50 }),
    sample("Approved.", { parent: { sender: "P", email: "p@x.com", excerpt: "Can you sign off on the fallback position?", receivedAt: "" }, replyLatencyMinutes: 60 }),
    sample("FYI noted.", { kind: "fresh" }),
  ];
  const stats = replyStats(samples);
  assert.equal(stats.replyCount, 3);
  const escalation = stats.respondsTo.find((entry) => entry.situation === "escalation");
  assert.equal(escalation?.count, 2);
  assert.equal(escalation?.share, 0.67);
  assert.equal(escalation?.typicalLatency, "~30m");
  assert.ok(stats.neverObserved.includes("cold-outreach"));
});

test("situationOfParent classifies cue phrases deterministically", () => {
  assert.equal(situationOfParent("Payments are failing — outage in EU"), "escalation");
  assert.equal(situationOfParent("Worth a 15-minute call this week? We automate CRM research"), "cold-outreach");
  assert.equal(situationOfParent("Can you confirm the numbers by Friday?"), "request");
  assert.equal(situationOfParent("Are you available Thursday? Sending a calendar invite"), "scheduling");
  assert.equal(situationOfParent("The weekly digest is attached"), "fyi");
});

test("dedupeSamples merges canned replies keeping the newest with a count", () => {
  const first = sample("Approved.");
  const second = sample("Approved.");
  const third = sample("Different body.");
  const deduped = dedupeSamples([first, second, third]);
  assert.equal(deduped.length, 2);
  const canned = deduped.find((entry) => entry.body === "Approved.");
  assert.equal(canned?.duplicateCount, 2);
  assert.equal(canned?.id, first.id, "newest kept");
});

test("applyTierBudget clamps by recency rank", () => {
  const tiers = [
    { upTo: 50, bodyChars: 1_000 },
    { upTo: 120, bodyChars: 500 },
    { upTo: 200, bodyChars: 300 },
  ];
  const long = "x".repeat(2_000);
  assert.equal(applyTierBudget(long, 0, tiers).length, 1_000);
  assert.equal(applyTierBudget(long, 80, tiers).length, 500);
  assert.equal(applyTierBudget(long, 150, tiers).length, 300);
  assert.equal(applyTierBudget(long, 500, tiers).length, 300);
});
