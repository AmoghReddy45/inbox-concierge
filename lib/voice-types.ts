/**
 * Contracts for the voice-learning reply draft agent.
 * Kept separate from lib/types.ts so the triage contract stays reviewable.
 */
import type { TriageUsage } from "./types";

export const VOICE_PROMPT_VERSION = "voice-distill-v1";
export const DRAFT_PROMPT_VERSION = "draft-v1";

export const MAX_SENT_SAMPLES = 200;
export const MAX_SENT_PAGES = 10;
/** Recency tiers: [maxRankExclusive, bodyCharBudget, promptWeight]. */
export const RECENCY_TIERS = [
  { name: "newest", upTo: 50, bodyChars: 1_000, weight: 3 },
  { name: "middle", upTo: 120, bodyChars: 500, weight: 2 },
  { name: "oldest", upTo: 200, bodyChars: 300, weight: 1 },
] as const;
/** ≥70% of exemplars must come from the newest EXEMPLAR_RECENCY_POOL samples. */
export const EXEMPLAR_RECENCY_POOL = 80;
export const EXEMPLAR_RECENCY_FLOOR = 0.7;
export const MIN_USABLE_SAMPLES = 5;
export const THIN_CORPUS_THRESHOLD = 30;
export const MIN_EXEMPLARS = 4;
export const MAX_EXEMPLARS = 12;

export type SentSample = {
  /** Sent message id. */
  id: string;
  threadId: string;
  sentAt: string;
  kind: "reply" | "fresh" | "forward";
  subject: string;
  /** The user's own words: quoted tail stripped, untruncated here (tiers apply later). */
  body: string;
  toDomains: string[];
  /** All recipient domains match the user's own domain. */
  internal: boolean;
  duplicateCount: number;
  parent?: {
    sender: string;
    email: string;
    /** Untrusted third-party text, <= 400 chars. */
    excerpt: string;
    receivedAt: string;
  };
  replyLatencyMinutes?: number;
};

export type SentPageResponse = {
  samples: SentSample[];
  nextPageToken: string | null;
  scannedThreads: number;
  skipped: number;
  /** Junk dropped (calendar responses, empty bodies, duplicates) — surfaced, never silent. */
  filtered: number;
  mode: "gmail" | "demo";
};

export type SentProbeResponse = {
  newestSentId: string | null;
  newestSentAt: string | null;
};

/** One sample as submitted to the observe phase — body already tier-budgeted. */
export type DistillSample = {
  id: string;
  tier: "newest" | "middle" | "oldest";
  sentAt: string;
  kind: "reply" | "fresh" | "forward";
  subject: string;
  body: string;
  internal: boolean;
  parentSender?: string;
  /** Untrusted third-party text. */
  parentExcerpt?: string;
};

/** Model-authored field notes from one observe chunk — descriptive only, no numbers. */
export type PartialObservation = {
  toneNotes: string[];
  greetingCandidates: string[];
  signoffCandidates: string[];
  quirks: string[];
  contextObservations: string[];
  exemplarCandidates: Array<{ sampleId: string; situation: string; parentGist: string }>;
  driftNotes: string[];
};

export type VoiceCallMeta = {
  model: string;
  promptVersion: string;
  latencyMs: number;
  usage: TriageUsage | null;
  costMicros: number | null;
};

export type ObserveRequest = {
  phase: "observe";
  chunkIndex: number;
  chunkCount: number;
  samples: DistillSample[];
};

export type ObserveResponse = { observation: PartialObservation; meta: VoiceCallMeta };

/** Sample submitted to merge for verbatim exemplar extraction (body ≤ 1,500 chars). */
export type MergeSample = {
  id: string;
  /** Recency rank, 0 = newest — the exemplar floor is enforced against this. */
  rank: number;
  sentAt: string;
  internal: boolean;
  body: string;
  parentSender?: string;
};

/** Client-measured ground truth. The model never alters these numbers. */
export type CodeStats = {
  corpus: VoiceProfile["corpus"];
  signature: string | null;
  greetings: VoiceProfile["greetings"];
  signoffs: VoiceProfile["signoffs"];
  length: VoiceProfile["length"];
  replyBehavior: VoiceProfile["replyBehavior"];
};

export type MergeRequest = {
  phase: "merge";
  partials: PartialObservation[];
  stats: CodeStats;
  samples: MergeSample[];
};

export type MergeResponse = { profile: VoiceProfile; meta: VoiceCallMeta };

export type VoiceContextMode = {
  id: string;
  /** Plain-language trigger, e.g. "a colleague asks for a decision". */
  when: string;
  register: string;
  typicalLength: string;
  /** Must be one of profile.greetings[].text (validated) or null. */
  greeting: string | null;
  signoff: string | null;
};

export type VoiceExemplar = {
  /** A VoiceContextMode id. */
  situation: string;
  /** One line: what they were replying to. */
  parentGist: string;
  /** VERBATIM user text, signature stripped — verified against the corpus. */
  body: string;
  sentAt: string;
  internal: boolean;
};

export type VoiceProfile = {
  version: string;
  builtAt: string;
  corpus: {
    sampleCount: number;
    replyCount: number;
    freshCount: number;
    forwardCount: number;
    newestSentAt: string;
    oldestSentAt: string;
    newestSentId: string;
    filtered: number;
    skipped: number;
  };
  /** Code-detected, verbatim; appended to drafts in code, never generated. */
  signature: string | null;
  tone: { formality: number; warmth: number; directness: number; notes: string[] };
  greetings: Array<{ text: string; share: number; context: "internal" | "external" | "any" }>;
  signoffs: Array<{ text: string; share: number; context: "internal" | "external" | "any" }>;
  /** Code-measured; the model may reference but not alter. */
  length: { medianWords: number; p90Words: number; oneLinerShare: number };
  quirks: string[];
  contexts: VoiceContextMode[];
  exemplars: VoiceExemplar[];
  replyBehavior: {
    respondsTo: Array<{ situation: string; share: number; typicalLatency: string; count: number }>;
    /** Situations with zero observed replies — absence of evidence, not prediction. */
    neverObserved: string[];
  };
  driftNotes: string[];
};

export type VoiceProfileMeta = {
  model: string;
  promptVersion: string;
  latencyMs: number;
  usage: TriageUsage | null;
  costMicros: number | null;
  /** True when built without an LLM: measured stats only. */
  heuristicOnly: boolean;
};

export type StoredVoiceProfile = {
  profile: VoiceProfile;
  meta: VoiceProfileMeta;
  /** Bumped by user edits (exemplar exclusions, signature edit). */
  revision: number;
};

export type ReplyLikelihood =
  | { level: "typical"; note: string }
  | { level: "sometimes"; note: string }
  | { level: "no-evidence"; note: string }
  | { level: "unknown"; note: string };

export type DraftRequest = {
  thread: {
    id: string;
    subject: string;
    sender: string;
    email: string;
    date: string;
    /** <= 2,400 chars: latest inbound in full + brief earlier context. */
    excerpt: string;
    bucketId: string | null;
    internal: boolean;
  };
  situation: string;
  profile: VoiceProfile;
  exemplars: VoiceExemplar[];
  mode: "reply" | "followup";
  previousDraft?: string;
  adjust?: "shorter";
};

export type DraftResponse = {
  threadId: string;
  draft: {
    /** Signature NOT included — appended verbatim client-side. */
    body: string;
    voiceRationale: Array<{ pattern: string; evidence: string }>;
  };
  meta: {
    model: string;
    promptVersion: string;
    latencyMs: number;
    usage: TriageUsage | null;
    costMicros: number | null;
    profileBuiltAt: string;
  };
};
