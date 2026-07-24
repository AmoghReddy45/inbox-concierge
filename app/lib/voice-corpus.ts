import type { SentSample } from "../../lib/voice-types";

/**
 * Deterministic corpus measurement. Every NUMBER in the voice profile
 * comes from here; the LLM only describes and selects. No fabricated
 * statistics, ever.
 */

function normalizeBlock(text: string) {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Merge exact-duplicate bodies (canned replies), keeping the newest. */
export function dedupeSamples(samples: SentSample[]): SentSample[] {
  const byBody = new Map<string, SentSample>();
  const ordered = [...samples].sort(
    (a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime(),
  );
  for (const sample of ordered) {
    const key = normalizeBlock(sample.body);
    const existing = byBody.get(key);
    if (existing) {
      byBody.set(key, { ...existing, duplicateCount: existing.duplicateCount + 1 });
    } else {
      byBody.set(key, sample);
    }
  }
  return [...byBody.values()].sort(
    (a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime(),
  );
}

/**
 * Most common trailing block (last 1–4 lines) appearing in >40% of
 * samples. Returned verbatim from its newest occurrence.
 */
export function detectSignature(samples: SentSample[]): string | null {
  if (samples.length < 5) return null;
  const counts = new Map<string, { count: number; verbatim: string }>();
  for (const sample of samples) {
    const lines = sample.body.split("\n").map((line) => line.trim()).filter(Boolean);
    for (let take = 1; take <= Math.min(4, lines.length - 1); take++) {
      const block = lines.slice(-take).join("\n");
      if (block.length > 80 || block.split(/\s+/).length > 12) continue;
      const key = normalizeBlock(block);
      const entry = counts.get(key);
      if (entry) entry.count += 1;
      else counts.set(key, { count: 1, verbatim: block });
    }
  }
  let best: { count: number; verbatim: string } | null = null;
  for (const entry of counts.values()) {
    if (!best || entry.count > best.count || (entry.count === best.count && entry.verbatim.length > best.verbatim.length)) {
      best = entry;
    }
  }
  return best && best.count / samples.length > 0.4 ? best.verbatim : null;
}

export function stripSignature(body: string, signature: string | null): string {
  if (!signature) return body.trim();
  const normalizedSig = normalizeBlock(signature);
  const lines = body.split("\n");
  const sigLineCount = signature.split("\n").length;
  for (let take = sigLineCount; take <= sigLineCount + 1; take++) {
    const tail = lines.slice(-take).map((line) => line.trim()).filter(Boolean).join("\n");
    if (normalizeBlock(tail) === normalizedSig) {
      return lines.slice(0, lines.length - take).join("\n").trim();
    }
  }
  return body.trim();
}

/**
 * Count real occurrences of candidate greeting/sign-off patterns.
 * Candidates may contain "{first}" (matches one capitalized word).
 * Only patterns matching >= 2 samples survive.
 */
export function measurePatterns(
  samples: SentSample[],
  candidates: string[],
  position: "greeting" | "signoff",
  signature: string | null,
): Array<{ text: string; share: number; context: "internal" | "external" | "any" }> {
  const results: Array<{ text: string; share: number; context: "internal" | "external" | "any" }> = [];
  for (const candidate of candidates.slice(0, 12)) {
    const escaped = candidate
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\\\{first\\\}/g, "[A-Z][\\w'-]+");
    // Sign-offs sit above a name line ("Best,\nA.") — scan the last 3 lines, not just the last.
    const pattern = new RegExp(`^\\s*${escaped}`, position === "signoff" ? "im" : "i");
    let matches = 0;
    let internalMatches = 0;
    for (const sample of samples) {
      const body = stripSignature(sample.body, signature);
      const lines = body.split("\n").map((line) => line.trim()).filter(Boolean);
      const target = position === "greeting" ? lines[0] : lines.slice(-3).join("\n");
      if (target && pattern.test(target)) {
        matches += 1;
        if (sample.internal) internalMatches += 1;
      }
    }
    if (matches < 2) continue;
    const internalShare = matches ? internalMatches / matches : 0;
    results.push({
      text: candidate,
      share: Math.round((100 * matches) / samples.length) / 100,
      context: internalShare >= 0.8 ? "internal" : internalShare <= 0.2 ? "external" : "any",
    });
  }
  return results.sort((a, b) => b.share - a.share);
}

export function lengthStats(samples: SentSample[], signature: string | null) {
  const wordCounts = samples
    .map((sample) => stripSignature(sample.body, signature).split(/\s+/).filter(Boolean).length)
    .filter((count) => count > 0)
    .sort((a, b) => a - b);
  if (!wordCounts.length) return { medianWords: 0, p90Words: 0, oneLinerShare: 0 };
  const at = (fraction: number) =>
    wordCounts[Math.min(wordCounts.length - 1, Math.floor(fraction * wordCounts.length))];
  return {
    medianWords: at(0.5),
    p90Words: at(0.9),
    oneLinerShare: Math.round((100 * wordCounts.filter((count) => count <= 15).length) / wordCounts.length) / 100,
  };
}

/** Standard situation set used across measurement and matching. */
export const SITUATIONS = [
  "escalation",
  "request",
  "scheduling",
  "intro",
  "cold-outreach",
  "fyi",
] as const;
export type Situation = (typeof SITUATIONS)[number];

/** Deterministic situation classification of what a reply answered. */
export function situationOfParent(excerpt: string): Situation {
  const lower = excerpt.toLowerCase();
  if (/urgent|outage|blocking|failing|escalat|refund|down\b|broken|asap|incident/.test(lower)) return "escalation";
  if (/intro|connect(ing)? you|meet .{0,20}(each other|both)/.test(lower)) return "intro";
  // Cold-outreach cues before scheduling: "worth a quick call" is a pitch, not a meeting.
  if (/worth a .{0,12}call|quick question about (your|the) (stack|tools)|we (help|plug|automate)|book a demo|free trial/.test(lower)) return "cold-outreach";
  if (/reschedul|calendar|meeting|call (this|next|on)|available|what time|schedule|slot|invite/.test(lower)) return "scheduling";
  if (/can you|could you|please|sign off|confirm|approve|need (your|an?) |due |by (end of|eod|friday|thursday|tomorrow)|\?/.test(lower)) return "request";
  return "fyi";
}

function humanLatency(minutes: number): string {
  if (minutes < 60) return `~${Math.max(1, Math.round(minutes / 5) * 5)}m`;
  if (minutes < 60 * 24) return `~${Math.round(minutes / 60)}h`;
  return `~${Math.round(minutes / (60 * 24))}d`;
}

/**
 * What the user's replies answer, and how fast. `share` is the fraction
 * of the user's REPLIES in each situation (composition of their reply
 * behavior — not a response rate, which sent mail alone cannot measure).
 */
export function replyStats(samples: SentSample[]) {
  const replies = samples.filter((sample) => sample.kind === "reply" && sample.parent);
  const groups = new Map<Situation, { count: number; latencies: number[] }>();
  for (const reply of replies) {
    const situation = situationOfParent(reply.parent!.excerpt);
    const group = groups.get(situation) ?? { count: 0, latencies: [] };
    group.count += 1;
    if (typeof reply.replyLatencyMinutes === "number") group.latencies.push(reply.replyLatencyMinutes);
    groups.set(situation, group);
  }
  const respondsTo = [...groups.entries()]
    .map(([situation, group]) => {
      const sorted = [...group.latencies].sort((a, b) => a - b);
      const median = sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : null;
      return {
        situation,
        share: replies.length ? Math.round((100 * group.count) / replies.length) / 100 : 0,
        typicalLatency: median !== null ? humanLatency(median) : "n/a",
        count: group.count,
      };
    })
    .sort((a, b) => b.count - a.count);
  const neverObserved = SITUATIONS.filter((situation) => !groups.has(situation));
  return { respondsTo, neverObserved, replyCount: replies.length };
}

/** Apply recency-tier body budgets (rank 0 = newest). */
export function applyTierBudget(body: string, rank: number, tiers: ReadonlyArray<{ upTo: number; bodyChars: number }>): string {
  for (const tier of tiers) {
    if (rank < tier.upTo) return body.slice(0, tier.bodyChars);
  }
  return body.slice(0, tiers[tiers.length - 1]?.bodyChars ?? 300);
}
