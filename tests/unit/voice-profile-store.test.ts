import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isProfileStale,
  loadVoiceProfile,
  saveVoiceProfile,
  withProfileEdit,
} from "../../app/lib/voice-profile-store";
import type { StoredVoiceProfile } from "../../lib/voice-types";

function storedOf(builtAt: string, newestSentId = "s1", newestSentAt = builtAt): StoredVoiceProfile {
  return {
    profile: {
      version: "voice-distill-v1",
      builtAt,
      corpus: {
        sampleCount: 38,
        replyCount: 32,
        freshCount: 5,
        forwardCount: 1,
        newestSentAt,
        oldestSentAt: builtAt,
        newestSentId,
        filtered: 0,
        skipped: 0,
      },
      signature: "Best,\nA.",
      tone: { formality: 0.5, warmth: 0.5, directness: 0.5, notes: [] },
      greetings: [],
      signoffs: [],
      length: { medianWords: 10, p90Words: 20, oneLinerShare: 0.3 },
      quirks: [],
      contexts: [],
      exemplars: [
        { situation: "request", parentGist: "", body: "One.", sentAt: builtAt, internal: true },
        { situation: "request", parentGist: "", body: "Two.", sentAt: builtAt, internal: true },
        { situation: "fyi", parentGist: "", body: "Three.", sentAt: builtAt, internal: false },
      ],
      replyBehavior: { respondsTo: [], neverObserved: [], studiedReplies: 32 },
      driftNotes: [],
    },
    meta: {
      model: "test",
      promptVersion: "voice-distill-v1",
      latencyMs: 0,
      usage: null,
      costMicros: null,
      heuristicOnly: false,
    },
    revision: 0,
  };
}

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  } as Storage;
}

test("withProfileEdit bumps revision and applies the edit immutably", () => {
  const stored = storedOf(new Date().toISOString());
  const edited = withProfileEdit(stored, (profile) => ({
    ...profile,
    exemplars: profile.exemplars.filter((_, index) => index !== 0),
  }));
  assert.equal(edited.revision, 1);
  assert.equal(edited.profile.exemplars.length, 2);
  assert.equal(stored.revision, 0, "original untouched");
  assert.equal(stored.profile.exemplars.length, 3);

  const signed = withProfileEdit(edited, (profile) => ({ ...profile, signature: null }));
  assert.equal(signed.revision, 2);
  assert.equal(signed.profile.signature, null);
});

test("save/load round-trips and rejects version mismatches", () => {
  const storage = memoryStorage();
  const stored = storedOf(new Date().toISOString());
  saveVoiceProfile(storage, stored);
  const loaded = loadVoiceProfile(storage);
  assert.ok(loaded);
  assert.equal(loaded.profile.corpus.newestSentId, "s1");

  saveVoiceProfile(storage, {
    ...stored,
    profile: { ...stored.profile, version: "voice-distill-v0" },
  });
  assert.equal(loadVoiceProfile(storage), null, "old prompt version treated as absent");
});

test("isProfileStale: fresh, new-sent-mail, and age cases", () => {
  const now = Date.now();
  const recent = storedOf(new Date(now - 2 * 24 * 3_600_000).toISOString());
  assert.equal(isProfileStale(recent, null), false, "no probe, recent build");
  assert.equal(
    isProfileStale(recent, { newestSentId: "s1", newestSentAt: recent.profile.corpus.newestSentAt }),
    false,
    "probe matches corpus head",
  );
  assert.equal(
    isProfileStale(recent, { newestSentId: "s99", newestSentAt: new Date(now).toISOString() }),
    true,
    "newer sent mail exists",
  );
  const ancient = storedOf(new Date(now - 40 * 24 * 3_600_000).toISOString());
  assert.equal(isProfileStale(ancient, null), true, "over 30 days old");
});

test("isProfileStale compares probe-to-probe when the raw head was recorded", () => {
  const now = Date.now();
  const stored = storedOf(new Date(now - 24 * 3_600_000).toISOString());
  // Newest sent item at build time was a filtered calendar accept: raw head
  // differs from the corpus head. The probe returning that same raw id must
  // NOT flag stale.
  stored.profile.corpus.rawNewestSentId = "cal-accept-1";
  stored.profile.corpus.rawNewestSentAt = new Date(now - 3_600_000).toISOString();
  assert.equal(
    isProfileStale(stored, {
      newestSentId: "cal-accept-1",
      newestSentAt: stored.profile.corpus.rawNewestSentAt,
    }),
    false,
    "raw head unchanged — not stale despite corpus-id mismatch",
  );
  assert.equal(
    isProfileStale(stored, {
      newestSentId: "brand-new",
      newestSentAt: new Date(now).toISOString(),
    }),
    true,
    "genuinely newer sent mail",
  );
});
