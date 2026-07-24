import { DRAFT_PROMPT_VERSION, type DraftResponse } from "../../lib/voice-types";
import type { StorageLike } from "./decision-cache";

const STORAGE_KEY = "tenex.drafts.v1";
const DEFAULT_MAX_ENTRIES = 100;

export type StoredDraft = { response: DraftResponse; storedAt: number };

type CacheFile = { entries: Record<string, StoredDraft> };

/**
 * Draft cache keyed structurally: (prompt version, profile build, user
 * revision, thread, latest message). A rebuilt profile or a new inbound
 * message is a clean miss — DecisionCache idiom.
 */
export class DraftCache {
  private readonly storage: StorageLike;
  private readonly maxEntries: number;

  constructor(storage: StorageLike, maxEntries = DEFAULT_MAX_ENTRIES) {
    this.storage = storage;
    this.maxEntries = maxEntries;
  }

  key(profileBuiltAt: string, revision: number, threadId: string, latestMessageId: string): string {
    return `${DRAFT_PROMPT_VERSION}|${profileBuiltAt}|r${revision}|${threadId}|${latestMessageId}`;
  }

  get(key: string): StoredDraft | null {
    return this.read().entries[key] ?? null;
  }

  set(key: string, value: StoredDraft): void {
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
      const raw = this.storage.getItem(STORAGE_KEY);
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
      this.storage.setItem(STORAGE_KEY, JSON.stringify(file));
    } catch {
      // Quota exceeded or storage unavailable — cache is best-effort.
    }
  }
}
