/**
 * Shared contracts between server routes and the client.
 * Server: app/api/gmail/threads, app/api/ai/triage
 * Client: app/lib/classify-orchestrator.ts and the inbox UI.
 */

export const PAGE_SIZE = 25;
export const MAX_THREADS = 200;
export const GMAIL_FETCH_CONCURRENCY = 5;
export const CLASSIFY_CONCURRENCY = 8;
export const EXCERPT_BUDGET = 1_200;
export const MAX_TAXONOMY_BUCKETS = 20;
export const PROMPT_VERSION = "triage-v6";
export const VERIFY_PROMPT_VERSION = "verify-v1";
/** Buckets whose loss is expensive; used by verification triggers. */
export const HIGH_STAKES_BUCKETS = ["important", "escalations", "review"] as const;

export type TaxonomyBucket = {
  id: string;
  name: string;
  description: string;
};

export type ThreadSummary = {
  id: string;
  sender: string;
  email: string;
  subject: string;
  preview: string;
  /** Plain-text classification input, <= EXCERPT_BUDGET chars. */
  excerpt: string;
  /** ISO timestamp of the latest message. */
  date: string;
  unread: boolean;
  /** Friendly Gmail-derived labels, e.g. ["Promotions", "Starred"]. */
  gmailLabels: string[];
  /** True when the latest message carries a List-Unsubscribe header. */
  listUnsubscribe: boolean;
  messageCount: number;
  /** Version key: changes iff a new message arrives on the thread. */
  latestMessageId: string;
  /** True when any message in the thread is from the connected account. */
  userReplied: boolean;
  senderDomainRelation: "same-domain" | "external";
};

export type ThreadsResponse = {
  threads: ThreadSummary[];
  nextPageToken: string | null;
  email: string | null;
  mode: "gmail" | "demo";
  /** Threads that failed to fetch in this page and were omitted. */
  skipped: number;
};

/** One message in the thread reading view. */
export type ThreadMessage = {
  id: string;
  sender: string;
  email: string;
  /** ISO timestamp. */
  date: string;
  /** Structure-preserving extracted text (fallback body; newlines kept). */
  text: string;
  /** Raw text/html part when present — rendered client-side in a sandboxed iframe. */
  html: string | null;
  /** Recipient display line, e.g. "to Me, Lauren & Dan" (best-effort). */
  recipients: string;
};

export type ThreadDetail = {
  id: string;
  subject: string;
  messages: ThreadMessage[];
};

export type Decision = {
  bucketId: string;
  runnerUpBucketId: string | null;
  rationale: string;
  /** 1..4 quotes, each verified verbatim (case/whitespace-insensitive) against subject/excerpt. */
  evidence: string[];
  ambiguityReasons: string[];
  needsReview: boolean;
  /** Set client-side when the risk verifier reviewed and upheld this decision. */
  verified?: boolean;
};

/** Result of the adversarial second-pass check on a high-risk decision. */
export type VerificationResult = {
  upheld: boolean;
  /** Verbatim-grounded quotes supporting the challenge (empty when upheld). */
  challengeEvidence: string[];
  reason: string;
};

export type VerificationMeta = {
  upheld: boolean;
  model: string;
  promptVersion: string;
  latencyMs: number;
  usage: TriageUsage | null;
  costMicros: number | null;
};

export type TriageUsage = {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
};

export type TriageMeta = {
  source: "llm" | "fallback";
  model: string;
  promptVersion: string;
  /** Measured wall time of the provider call (0 for fallback). */
  latencyMs: number;
  usage: TriageUsage | null;
  /** Micro-USD, computed from usage and price env vars; null when not computable. */
  costMicros: number | null;
  /** Echo of the request's taxonomyVersion, used by the client stale-guard. */
  taxonomyVersion: string;
  /** Set client-side when the decision came from the local cache. */
  cached?: boolean;
  /** Present when the risk verifier ran for this thread (merged client-side). */
  verification?: VerificationMeta;
};

/** A past manual correction, sent as a hint — never an override. */
export type FeedbackHint = {
  sender: string;
  subject: string;
  correctedToBucketId: string;
};

export const MAX_FEEDBACK_HINTS = 10;

export type TriageRequest = {
  thread: {
    id: string;
    sender: string;
    email: string;
    subject: string;
    date: string;
    gmailLabels: string[];
    listUnsubscribe: boolean;
    excerpt: string;
    messageCount: number;
    userReplied?: boolean;
    senderDomainRelation?: "same-domain" | "external";
  };
  taxonomy: TaxonomyBucket[];
  taxonomyVersion: string;
  /** Recent user corrections (<= MAX_FEEDBACK_HINTS), excluding this thread. */
  feedback?: FeedbackHint[];
  /** Corpus-structure hint: how this sender's other threads were classified. */
  senderPrior?: { bucketId: string; count: number };
  /** "verify" runs the adversarial second pass on decisionToVerify. */
  mode?: "classify" | "verify";
  decisionToVerify?: Decision;
};

export type VerifyResponse = {
  threadId: string;
  verification: VerificationResult;
  meta: TriageMeta;
};

export type TriageResponse = {
  threadId: string;
  decision: Decision;
  meta: TriageMeta;
};

export type TriageStatusResponse = {
  configured: boolean;
  model: string;
  promptVersion: string;
};

export type ApiErrorCode =
  | "not_connected"
  | "auth_expired"
  | "gmail_error"
  | "bad_request"
  | "rate_limited"
  | "timeout"
  | "upstream_error"
  | "invalid_model_output";

export type ApiErrorBody = {
  error: {
    code: ApiErrorCode;
    message: string;
    retryable: boolean;
  };
};

export function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== "object" || value === null) return false;
  const error = (value as { error?: unknown }).error;
  return (
    typeof error === "object" &&
    error !== null &&
    typeof (error as { code?: unknown }).code === "string" &&
    typeof (error as { retryable?: unknown }).retryable === "boolean"
  );
}
