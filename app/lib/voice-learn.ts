import {
  EXEMPLAR_RECENCY_POOL,
  MAX_SENT_PAGES,
  MAX_SENT_SAMPLES,
  MIN_USABLE_SAMPLES,
  RECENCY_TIERS,
  VOICE_PROMPT_VERSION,
  type CodeStats,
  type DistillSample,
  type MergeRequest,
  type MergeResponse,
  type MergeSample,
  type ObserveRequest,
  type ObserveResponse,
  type PartialObservation,
  type SentPageResponse,
  type SentSample,
  type StoredVoiceProfile,
  type VoiceCallMeta,
  type VoiceProfile,
  type VoiceProfileMeta,
} from "../../lib/voice-types";
import { isApiErrorBody, type TriageUsage } from "../../lib/types";
import {
  applyTierBudget,
  dedupeSamples,
  detectSignature,
  lengthStats,
  measurePatterns,
  replyStats,
  situationOfParent,
  stripSignature,
} from "./voice-corpus";

/**
 * The voice-learn job: page sent mail, measure everything in code,
 * distill descriptions with the LLM (observe x N -> merge), assemble a
 * profile. Framework-free so the pipeline is unit-testable; the hook is
 * a thin React shell.
 */

export type PreparedSample = SentSample & {
  rank: number;
  tier: "newest" | "middle" | "oldest";
};

export type LearnProgress =
  | { stage: "reading"; samplesRead: number; target: number; filtered: number; skipped: number }
  | { stage: "distilling"; step: number; stepCount: number; costMicros: number }
  | { stage: "done" };

export type LearnCounts = { filtered: number; skipped: number; scannedThreads: number };

/** Checkpoint retained on failure so Resume never re-pays completed calls. */
export type LearnCheckpoint = {
  samples: SentSample[];
  counts: LearnCounts;
  partials: PartialObservation[];
  metas: VoiceCallMeta[];
};

export class LearnFailure extends Error {
  checkpoint: LearnCheckpoint | null;
  constructor(message: string, checkpoint: LearnCheckpoint | null) {
    super(message);
    this.name = "LearnFailure";
    this.checkpoint = checkpoint;
  }
}

function tierOf(rank: number): "newest" | "middle" | "oldest" {
  for (const tier of RECENCY_TIERS) if (rank < tier.upTo) return tier.name;
  return "oldest";
}

export function prepareCorpus(samples: SentSample[]): PreparedSample[] {
  return dedupeSamples(samples)
    .slice(0, MAX_SENT_SAMPLES)
    .map((sample, rank) => ({ ...sample, rank, tier: tierOf(rank) }));
}

/** Baseline candidates so heuristic mode measures real shares without an LLM. */
export const DEFAULT_PATTERN_CANDIDATES = {
  greetings: [
    "Hey {first} —",
    "Hey {first},",
    "Hi {first},",
    "Hello {first},",
    "{first} —",
    "Hi all,",
    "Hi team,",
  ],
  signoffs: ["Best,", "Thanks,", "Thank you,", "Cheers,", "Best regards", "Regards,"],
};

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export function computeStats(
  prepared: PreparedSample[],
  counts: LearnCounts,
  candidates: { greetings: string[]; signoffs: string[] },
  rawProbe?: { newestSentId: string | null; newestSentAt: string | null } | null,
): CodeStats {
  const signature = detectSignature(prepared);
  const reply = replyStats(prepared);
  const newest = prepared[0];
  const oldest = prepared[prepared.length - 1];
  return {
    corpus: {
      sampleCount: prepared.length,
      replyCount: prepared.filter((sample) => sample.kind === "reply").length,
      freshCount: prepared.filter((sample) => sample.kind === "fresh").length,
      forwardCount: prepared.filter((sample) => sample.kind === "forward").length,
      newestSentAt: newest?.sentAt ?? "",
      oldestSentAt: oldest?.sentAt ?? "",
      newestSentId: newest?.id ?? "",
      // Raw (pre-filter) mailbox head — staleness compares probe-to-probe,
      // else a trailing calendar-accept pins the stale chip on forever.
      rawNewestSentId: rawProbe?.newestSentId ?? null,
      rawNewestSentAt: rawProbe?.newestSentAt ?? null,
      filtered: counts.filtered,
      skipped: counts.skipped,
    },
    signature,
    greetings: measurePatterns(
      prepared,
      unique([...candidates.greetings, ...DEFAULT_PATTERN_CANDIDATES.greetings]),
      "greeting",
      signature,
    ).slice(0, 6),
    signoffs: measurePatterns(
      prepared,
      unique([...candidates.signoffs, ...DEFAULT_PATTERN_CANDIDATES.signoffs]),
      "signoff",
      signature,
    ).slice(0, 6),
    length: lengthStats(prepared, signature),
    replyBehavior: {
      respondsTo: reply.respondsTo,
      neverObserved: reply.neverObserved,
      studiedReplies: reply.replyCount,
    },
  };
}

const CHUNK_SIZE = 50;

export function toDistillChunks(prepared: PreparedSample[]): DistillSample[][] {
  const distill: DistillSample[] = prepared.map((sample) => ({
    id: sample.id,
    tier: sample.tier,
    sentAt: sample.sentAt,
    kind: sample.kind,
    subject: sample.subject,
    body: applyTierBudget(sample.body, sample.rank, RECENCY_TIERS),
    internal: sample.internal,
    ...(sample.parent ? { parentSender: sample.parent.sender, parentExcerpt: sample.parent.excerpt } : {}),
  }));
  const chunkCount = Math.max(1, Math.ceil(distill.length / CHUNK_SIZE));
  const chunks: DistillSample[][] = [];
  for (let index = 0; index < chunkCount; index++) {
    chunks.push(distill.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE));
  }
  return chunks;
}

/** Exemplar pool for merge: every observe candidate + newest replies as backfill. */
export function toMergeSamples(
  prepared: PreparedSample[],
  partials: PartialObservation[],
): MergeSample[] {
  const candidateIds = new Set(
    partials.flatMap((partial) => partial.exemplarCandidates.map((candidate) => candidate.sampleId)),
  );
  const pool: PreparedSample[] = prepared.filter((sample) => candidateIds.has(sample.id));
  for (const sample of prepared) {
    if (pool.length >= 40) break;
    if (!candidateIds.has(sample.id) && sample.kind === "reply") pool.push(sample);
  }
  return pool.map((sample) => ({
    id: sample.id,
    rank: sample.rank,
    sentAt: sample.sentAt,
    internal: sample.internal,
    body: sample.body.slice(0, 1_500),
    ...(sample.parent ? { parentSender: sample.parent.sender } : {}),
  }));
}

/**
 * Recency floor: >=70% of exemplars must come from the newest
 * EXEMPLAR_RECENCY_POOL samples. Enforced by dropping the oldest
 * surplus, never by keeping a stale-heavy set.
 */
export function enforceRecencyFloor<T extends { sampleId: string }>(
  exemplars: T[],
  rankOf: (sampleId: string) => number,
): T[] {
  const recent = exemplars.filter((exemplar) => rankOf(exemplar.sampleId) < EXEMPLAR_RECENCY_POOL);
  const older = exemplars
    .filter((exemplar) => rankOf(exemplar.sampleId) >= EXEMPLAR_RECENCY_POOL)
    .sort((a, b) => rankOf(a.sampleId) - rankOf(b.sampleId));
  // share = recent/(recent+older') >= 0.7  =>  older' <= recent * 3/7
  const olderAllowed = Math.floor((recent.length * 3) / 7);
  return [...recent, ...older.slice(0, olderAllowed)];
}

/**
 * Stats-only profile for heuristic (no-key) mode: every field measured,
 * nothing invented. Tone axes stay neutral, contexts empty — the UI says
 * so, and drafting is disabled.
 */
export function buildHeuristicProfile(prepared: PreparedSample[], stats: CodeStats): VoiceProfile {
  const exemplars = prepared
    .filter((sample) => sample.kind === "reply" && sample.parent)
    .slice(0, 8)
    .map((sample) => ({
      situation: situationOfParent(sample.parent!.excerpt),
      parentGist: sample.parent!.excerpt.slice(0, 100),
      body: stripSignature(applyTierBudget(sample.body, sample.rank, RECENCY_TIERS), stats.signature),
      sentAt: sample.sentAt,
      internal: sample.internal,
    }));
  return {
    version: VOICE_PROMPT_VERSION,
    builtAt: new Date().toISOString(),
    corpus: stats.corpus,
    signature: stats.signature,
    tone: { formality: 0.5, warmth: 0.5, directness: 0.5, notes: [] },
    greetings: stats.greetings,
    signoffs: stats.signoffs,
    length: stats.length,
    quirks: [],
    contexts: [],
    exemplars,
    replyBehavior: stats.replyBehavior,
    driftNotes: [],
  };
}

function sumUsage(metas: VoiceCallMeta[]): TriageUsage | null {
  const present = metas.filter((meta) => meta.usage);
  if (!present.length) return null;
  return present.reduce(
    (total, meta) => ({
      inputTokens: total.inputTokens + (meta.usage?.inputTokens ?? 0),
      cachedInputTokens: total.cachedInputTokens + (meta.usage?.cachedInputTokens ?? 0),
      outputTokens: total.outputTokens + (meta.usage?.outputTokens ?? 0),
    }),
    { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 },
  );
}

export function aggregateMeta(metas: VoiceCallMeta[], heuristicOnly: boolean): VoiceProfileMeta {
  const costs = metas.map((meta) => meta.costMicros).filter((cost): cost is number => cost !== null);
  return {
    model: metas[0]?.model ?? "none",
    promptVersion: VOICE_PROMPT_VERSION,
    latencyMs: metas.reduce((total, meta) => total + meta.latencyMs, 0),
    usage: sumUsage(metas),
    costMicros: costs.length ? costs.reduce((total, cost) => total + cost, 0) : null,
    heuristicOnly,
  };
}

async function postPhase<T>(
  payload: ObserveRequest | MergeRequest,
  signal: AbortSignal | undefined,
): Promise<T> {
  let lastMessage = "Voice distillation failed";
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch("/api/ai/voice-profile", {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await response.json()) as T | unknown;
    if (response.ok && !isApiErrorBody(body)) return body as T;
    const retryable = isApiErrorBody(body) ? body.error.retryable : response.status >= 500;
    lastMessage = isApiErrorBody(body)
      ? body.error.message
      : `Voice distillation failed (HTTP ${response.status})`;
    if (!retryable || attempt === 1) break;
    await new Promise((resolve) => setTimeout(resolve, response.status === 429 ? 5_000 : 1_500));
  }
  throw new Error(lastMessage);
}

export type LearnOptions = {
  demo: boolean;
  /** false when no API key is configured — build the measured-only profile. */
  llmConfigured: boolean;
  signal?: AbortSignal;
  onProgress: (progress: LearnProgress) => void;
  resumeFrom?: LearnCheckpoint | null;
};

export async function runVoiceLearn(options: LearnOptions): Promise<StoredVoiceProfile> {
  const { demo, llmConfigured, signal, onProgress } = options;

  // Phase 1 — read the sent corpus (skipped entirely on resume).
  let samples: SentSample[];
  let counts: LearnCounts;
  if (options.resumeFrom) {
    samples = options.resumeFrom.samples;
    counts = options.resumeFrom.counts;
  } else {
    samples = [];
    counts = { filtered: 0, skipped: 0, scannedThreads: 0 };
    let pageToken: string | null = null;
    let pages = 0;
    onProgress({ stage: "reading", samplesRead: 0, target: MAX_SENT_SAMPLES, filtered: 0, skipped: 0 });
    try {
      do {
        const params = new URLSearchParams();
        if (demo) params.set("demo", "1");
        if (pageToken) params.set("pageToken", pageToken);
        const response = await fetch(`/api/gmail/sent?${params}`, { cache: "no-store", signal });
        const payload = (await response.json()) as SentPageResponse | unknown;
        if (!response.ok || isApiErrorBody(payload)) {
          const message = isApiErrorBody(payload)
            ? payload.error.message
            : `Sent mail fetch failed (HTTP ${response.status})`;
          throw new Error(message);
        }
        const page = payload as SentPageResponse;
        samples.push(...page.samples);
        counts.filtered += page.filtered;
        counts.skipped += page.skipped;
        counts.scannedThreads += page.scannedThreads;
        pages += 1;
        pageToken = samples.length >= MAX_SENT_SAMPLES || pages >= MAX_SENT_PAGES ? null : page.nextPageToken;
        onProgress({
          stage: "reading",
          samplesRead: Math.min(samples.length, MAX_SENT_SAMPLES),
          target: MAX_SENT_SAMPLES,
          filtered: counts.filtered,
          skipped: counts.skipped,
        });
      } while (pageToken !== null);
    } catch (error) {
      throw new LearnFailure(error instanceof Error ? error.message : "Sent mail fetch failed", null);
    }
  }

  const prepared = prepareCorpus(samples);
  if (prepared.length < MIN_USABLE_SAMPLES) {
    throw new LearnFailure(
      `Only ${prepared.length} usable sent message${prepared.length === 1 ? "" : "s"} found — at least ${MIN_USABLE_SAMPLES} are needed to learn a voice.`,
      null,
    );
  }
  // Exact-duplicate merges are drops too — surfaced, never silent.
  // (Checkpoint counts already include them, so only count on a fresh read.)
  if (!options.resumeFrom) {
    counts.filtered += Math.max(0, samples.length - prepared.length);
  }

  // Raw mailbox head for probe-to-probe staleness comparison (best-effort).
  let rawProbe: { newestSentId: string | null; newestSentAt: string | null } | null = null;
  try {
    const probeResponse = await fetch(`/api/gmail/sent?${demo ? "demo=1&" : ""}probe=1`, {
      cache: "no-store",
      signal,
    });
    if (probeResponse.ok) {
      rawProbe = (await probeResponse.json()) as typeof rawProbe;
    }
  } catch {
    // Staleness detection degrades to the filtered head — not fatal.
  }

  // Heuristic mode: measured stats only, zero LLM calls, honest meta.
  if (!llmConfigured) {
    const stats = computeStats(prepared, counts, DEFAULT_PATTERN_CANDIDATES, rawProbe);
    onProgress({ stage: "done" });
    return {
      profile: buildHeuristicProfile(prepared, stats),
      meta: aggregateMeta([], true),
      revision: 0,
    };
  }

  // Phase 2 — observe chunks (resume continues after completed partials).
  const chunks = toDistillChunks(prepared);
  const partials: PartialObservation[] = options.resumeFrom ? [...options.resumeFrom.partials] : [];
  const metas: VoiceCallMeta[] = options.resumeFrom ? [...options.resumeFrom.metas] : [];
  const stepCount = chunks.length + 1;
  const spentSoFar = () =>
    metas.reduce((total, meta) => total + (meta.costMicros ?? 0), 0);

  for (let index = partials.length; index < chunks.length; index++) {
    onProgress({ stage: "distilling", step: index + 1, stepCount, costMicros: spentSoFar() });
    try {
      const result = await postPhase<ObserveResponse>(
        { phase: "observe", chunkIndex: index, chunkCount: chunks.length, samples: chunks[index] },
        signal,
      );
      partials.push(result.observation);
      metas.push(result.meta);
    } catch (error) {
      throw new LearnFailure(
        error instanceof Error ? error.message : "Voice observation failed",
        { samples, counts, partials, metas },
      );
    }
  }

  // Phase 3 — measure with model-proposed candidates, then merge.
  const stats = computeStats(
    prepared,
    counts,
    {
      greetings: partials.flatMap((partial) => partial.greetingCandidates),
      signoffs: partials.flatMap((partial) => partial.signoffCandidates),
    },
    rawProbe,
  );
  onProgress({ stage: "distilling", step: stepCount, stepCount, costMicros: spentSoFar() });
  try {
    const result = await postPhase<MergeResponse>(
      { phase: "merge", partials, stats, samples: toMergeSamples(prepared, partials) },
      signal,
    );
    metas.push(result.meta);
    onProgress({ stage: "done" });
    return { profile: result.profile, meta: aggregateMeta(metas, false), revision: 0 };
  } catch (error) {
    throw new LearnFailure(
      error instanceof Error ? error.message : "Voice profile merge failed",
      { samples, counts, partials, metas },
    );
  }
}
