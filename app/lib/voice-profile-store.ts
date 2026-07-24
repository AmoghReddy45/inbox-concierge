import {
  VOICE_PROMPT_VERSION,
  type SentProbeResponse,
  type StoredVoiceProfile,
  type VoiceProfile,
} from "../../lib/voice-types";

const STORAGE_KEY = "tenex.voice.v1";
const STALE_AFTER_DAYS = 30;

export function loadVoiceProfile(storage: Storage): StoredVoiceProfile | null {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredVoiceProfile;
    if (!parsed?.profile || parsed.profile.version !== VOICE_PROMPT_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveVoiceProfile(storage: Storage, stored: StoredVoiceProfile) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Quota or private-mode failure: the profile still works for this session.
  }
}

export function clearVoiceProfile(storage: Storage) {
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * User edits (exemplar exclusion, signature change) bump the revision,
 * which invalidates every cached draft keyed on it.
 */
export function withProfileEdit(
  stored: StoredVoiceProfile,
  edit: (profile: VoiceProfile) => VoiceProfile,
): StoredVoiceProfile {
  return { ...stored, profile: edit(stored.profile), revision: stored.revision + 1 };
}

/**
 * Stale when there is sent mail newer than the corpus, or the profile is
 * over 30 days old. Never triggers a rebuild by itself — only a chip.
 * Cross-source comparisons (gmail profile probed against the demo corpus,
 * or vice versa) are meaningless and never flag stale.
 */
export function isProfileStale(
  stored: StoredVoiceProfile,
  probe: SentProbeResponse | null,
  currentSource?: "gmail" | "demo",
): boolean {
  const builtAt = new Date(stored.profile.builtAt).getTime();
  if (Number.isFinite(builtAt) && Date.now() - builtAt > STALE_AFTER_DAYS * 24 * 3_600_000) {
    return true;
  }
  // Probe comparison is only meaningful within one source. Legacy profiles
  // without a stamp get age-based staleness only.
  const profileSource = stored.profile.corpus.source;
  if (!profileSource || (currentSource && profileSource !== currentSource)) return false;
  if (!probe?.newestSentId) return false;
  // Probe-to-probe: the corpus head is post-filter, but the probe is raw —
  // comparing them directly would pin the chip on after any calendar accept.
  const baselineId = stored.profile.corpus.rawNewestSentId ?? stored.profile.corpus.newestSentId;
  const baselineAt = stored.profile.corpus.rawNewestSentAt ?? stored.profile.corpus.newestSentAt;
  if (probe.newestSentId === baselineId) return false;
  const probeAt = probe.newestSentAt ? new Date(probe.newestSentAt).getTime() : 0;
  return probeAt > new Date(baselineAt).getTime();
}
