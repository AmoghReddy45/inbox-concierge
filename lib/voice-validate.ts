import type { CodeStats, VoiceProfile } from "./voice-types";

/**
 * Server-side structural validation of client-supplied voice payloads.
 * Both AI routes spend money AFTER accepting a payload — a malformed
 * profile or stats block must 400 before the provider call, never
 * TypeError into a misleading 502 after it.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPatternInventory(
  value: unknown,
): value is Array<{ text: string; share: number; context: string }> {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        isRecord(item) && typeof item.text === "string" && isFiniteNumber(item.share),
    )
  );
}

function isLengthStats(value: unknown): boolean {
  return (
    isRecord(value) &&
    isFiniteNumber(value.medianWords) &&
    isFiniteNumber(value.p90Words) &&
    isFiniteNumber(value.oneLinerShare)
  );
}

function isReplyBehavior(value: unknown): boolean {
  return (
    isRecord(value) &&
    Array.isArray(value.respondsTo) &&
    value.respondsTo.every(
      (item: unknown) =>
        isRecord(item) && typeof item.situation === "string" && isFiniteNumber(item.count),
    ) &&
    isStringArray(value.neverObserved)
  );
}

function isCorpus(value: unknown): boolean {
  return isRecord(value) && isFiniteNumber(value.sampleCount) && isFiniteNumber(value.replyCount);
}

export function isValidCodeStats(value: unknown): value is CodeStats {
  return (
    isRecord(value) &&
    isCorpus(value.corpus) &&
    (value.signature === null || typeof value.signature === "string") &&
    isPatternInventory(value.greetings) &&
    isPatternInventory(value.signoffs) &&
    isLengthStats(value.length) &&
    isReplyBehavior(value.replyBehavior)
  );
}

export function isValidVoiceProfile(value: unknown): value is VoiceProfile {
  if (!isRecord(value)) return false;
  const tone = value.tone;
  const contexts = value.contexts;
  const exemplars = value.exemplars;
  return (
    typeof value.version === "string" &&
    typeof value.builtAt === "string" &&
    isCorpus(value.corpus) &&
    (value.signature === null || typeof value.signature === "string") &&
    isRecord(tone) &&
    isFiniteNumber(tone.formality) &&
    isStringArray(tone.notes) &&
    isPatternInventory(value.greetings) &&
    isPatternInventory(value.signoffs) &&
    isLengthStats(value.length) &&
    isStringArray(value.quirks) &&
    Array.isArray(contexts) &&
    contexts.every(
      (item: unknown) => isRecord(item) && typeof item.when === "string",
    ) &&
    Array.isArray(exemplars) &&
    exemplars.every(
      (item: unknown) => isRecord(item) && typeof item.body === "string",
    ) &&
    isReplyBehavior(value.replyBehavior) &&
    isStringArray(value.driftNotes)
  );
}

/**
 * Third-party text must never be able to close or forge an untrusted
 * fence. Strips any literal fence markers before interpolation.
 */
export function sanitizeFenceMarkers(value: string): string {
  return value.replace(/<\/?\s*untrusted_[a-z_]*\s*>/gi, "[fence-marker-removed]");
}
