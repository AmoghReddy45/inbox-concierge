import type { Decision, TriageMeta } from "../../lib/types";

export const CACHE_STORAGE_KEY = "tenex.triage.v1";
const DEFAULT_MAX_ENTRIES = 600;

export type StoredDecision = {
  decision: Decision;
  meta: TriageMeta;
  storedAt: number;
};

export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

type CacheFile = { entries: Record<string, StoredDecision> };

/**
 * localStorage-backed decision cache. Identity is structural:
 * (promptVersion, taxonomyVersion, threadId, latestMessageId) — any change
 * to classification inputs produces a clean miss. No TTLs.
 */
export class DecisionCache {
  private readonly storage: StorageLike;
  private readonly maxEntries: number;

  constructor(storage: StorageLike, maxEntries = DEFAULT_MAX_ENTRIES) {
    this.storage = storage;
    this.maxEntries = maxEntries;
  }

  key(
    promptVersion: string,
    taxonomyVersion: string,
    threadId: string,
    latestMessageId: string,
  ): string {
    return `${promptVersion}|${taxonomyVersion}|${threadId}|${latestMessageId}`;
  }

  get(key: string): StoredDecision | null {
    return this.read().entries[key] ?? null;
  }

  set(key: string, value: StoredDecision): void {
    const file = this.read();
    file.entries[key] = value;
    const keys = Object.keys(file.entries);
    if (keys.length > this.maxEntries) {
      keys
        .sort((a, b) => file.entries[a].storedAt - file.entries[b].storedAt)
        .slice(0, keys.length - this.maxEntries)
        .forEach((stale) => delete file.entries[stale]);
    }
    this.write(file);
  }

  private read(): CacheFile {
    try {
      const raw = this.storage.getItem(CACHE_STORAGE_KEY);
      if (!raw) return { entries: {} };
      const parsed = JSON.parse(raw) as CacheFile;
      if (!parsed || typeof parsed.entries !== "object" || parsed.entries === null) {
        return { entries: {} };
      }
      return parsed;
    } catch {
      return { entries: {} };
    }
  }

  private write(file: CacheFile): void {
    try {
      this.storage.setItem(CACHE_STORAGE_KEY, JSON.stringify(file));
    } catch {
      // Quota exceeded or storage unavailable — cache is best-effort.
    }
  }
}
