import { sha256Base64Url } from "./hash";
import type { TaxonomyBucket } from "./types";

/**
 * UI-facing bucket: taxonomy sent to the classifier plus presentation fields.
 * `tone` keys into the chip/tab tint tokens in globals.css.
 */
export type Bucket = TaxonomyBucket & {
  tone: "violet" | "amber" | "blue" | "green" | "neutral";
  custom?: boolean;
};

export const DEFAULT_BUCKETS: Bucket[] = [
  {
    id: "important",
    name: "Important",
    description: "Time-sensitive requests, decisions, and direct obligations addressed to me.",
    tone: "violet",
  },
  {
    id: "review",
    name: "Needs review",
    description:
      "Ambiguous or conflicting evidence that deserves a human look — the classifier abstains here.",
    tone: "amber",
  },
  {
    id: "wait",
    name: "Can wait",
    description: "Useful information without an immediate action or deadline.",
    tone: "blue",
  },
  {
    id: "newsletter",
    name: "Newsletter",
    description: "Recurring editorial or marketing updates I subscribed to.",
    tone: "green",
  },
  {
    id: "archive",
    name: "Auto-archive",
    description:
      "Low-value automated mail: receipts, notifications, no-reply updates. Recommendation only.",
    tone: "neutral",
  },
  {
    id: "escalations",
    name: "Customer escalations",
    description:
      "External customer blockers, outages, billing problems, or deadlines awaiting my response.",
    tone: "violet",
    custom: true,
  },
];

export function toTaxonomy(buckets: Bucket[]): TaxonomyBucket[] {
  return buckets.map(({ id, name, description }) => ({ id, name, description }));
}

/**
 * Content-derived taxonomy version: stable across reloads, changes iff any
 * bucket id/name/description changes. Used as cache key and stale-guard.
 */
export async function computeTaxonomyVersion(taxonomy: TaxonomyBucket[]) {
  const canonical = JSON.stringify(
    taxonomy.map(({ id, name, description }) => [id, name, description]),
  );
  return sha256Base64Url(canonical);
}
