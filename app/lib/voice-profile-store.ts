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
 */
export function isProfileStale(stored: StoredVoiceProfile, probe: SentProbeResponse | null): boolean {
  const builtAt = new Date(stored.profile.builtAt).getTime();
  if (Number.isFinite(builtAt) && Date.now() - builtAt > STALE_AFTER_DAYS * 24 * 3_600_000) {
    return true;
  }
  if (!probe?.newestSentId) return false;
  if (probe.newestSentId === stored.profile.corpus.newestSentId) return false;
  const probeAt = probe.newestSentAt ? new Date(probe.newestSentAt).getTime() : 0;
  const corpusAt = new Date(stored.profile.corpus.newestSentAt).getTime();
  return probeAt > corpusAt;
}
