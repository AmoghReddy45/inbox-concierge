"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MAX_SENT_SAMPLES, type SentProbeResponse, type StoredVoiceProfile } from "../../lib/voice-types";
import {
  LearnFailure,
  runVoiceLearn,
  type LearnCheckpoint,
  type LearnProgress,
} from "../lib/voice-learn";
import {
  clearVoiceProfile,
  isProfileStale,
  loadVoiceProfile,
  saveVoiceProfile,
  withProfileEdit,
} from "../lib/voice-profile-store";
import type { VoiceProfile } from "../../lib/voice-types";
import type { ThreadSource } from "./useThreads";

export type VoiceProfileState = {
  stored: StoredVoiceProfile | null;
  /** Non-null while a learn run is active (or finished awaiting dismissal). */
  progress: LearnProgress | null;
  error: string | null;
  canResume: boolean;
  stale: boolean;
};

/** Owns the voice profile lifecycle: load, learn (with resume), staleness, clear. */
export function useVoiceProfile(source: ThreadSource | null, llmConfigured: boolean) {
  const [stored, setStored] = useState<StoredVoiceProfile | null>(() =>
    typeof window === "undefined" ? null : loadVoiceProfile(window.localStorage),
  );
  const [progress, setProgress] = useState<LearnProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkpoint, setCheckpoint] = useState<LearnCheckpoint | null>(null);
  const [stale, setStale] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // One staleness probe per session — informational chip only, never a rebuild.
  useEffect(() => {
    if (!source || !stored) return;
    let cancelled = false;
    const params = source === "demo" ? "demo=1&probe=1" : "probe=1";
    void fetch(`/api/gmail/sent?${params}`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((probe: SentProbeResponse | null) => {
        if (!cancelled && probe) setStale(isProfileStale(stored, probe, source));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [source, stored]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const learn = useCallback(
    (resume: boolean) => {
      if (!source) return;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setError(null);
      setProgress({
        stage: "reading",
        samplesRead: 0,
        target: MAX_SENT_SAMPLES,
        filtered: 0,
        skipped: 0,
      });
      void runVoiceLearn({
        demo: source === "demo",
        llmConfigured,
        signal: controller.signal,
        onProgress: (next) => {
          if (!controller.signal.aborted) setProgress(next);
        },
        resumeFrom: resume ? checkpoint : null,
      })
        .then((result) => {
          if (controller.signal.aborted) return;
          setCheckpoint(null);
          saveVoiceProfile(window.localStorage, result);
          setStored(result);
          setStale(false);
        })
        .catch((failure: unknown) => {
          if (controller.signal.aborted) {
            setProgress(null);
            return;
          }
          setCheckpoint(failure instanceof LearnFailure ? failure.checkpoint : null);
          setError(failure instanceof Error ? failure.message : "Voice learning failed");
          setProgress(null);
        });
    },
    [checkpoint, llmConfigured, source],
  );

  const start = useCallback(() => learn(false), [learn]);
  const resumeLearn = useCallback(() => learn(true), [learn]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setProgress(null);
    setError(null);
  }, []);

  /** Called when the done state is dismissed. */
  const acknowledge = useCallback(() => setProgress(null), []);

  const clear = useCallback(() => {
    // A learn run in flight would resurrect the profile it saves — stop it.
    abortRef.current?.abort();
    setProgress(null);
    clearVoiceProfile(window.localStorage);
    setStored(null);
    setStale(false);
    setCheckpoint(null);
    setError(null);
  }, []);

  /** Persist a user edit (revision bump invalidates cached drafts). */
  const applyEdit = useCallback((edit: (profile: VoiceProfile) => VoiceProfile) => {
    setStored((current) => {
      if (!current) return current;
      const next = withProfileEdit(current, edit);
      saveVoiceProfile(window.localStorage, next);
      return next;
    });
  }, []);

  const state: VoiceProfileState = {
    stored,
    progress,
    error,
    canResume: checkpoint !== null,
    stale,
  };
  return { state, start, resumeLearn, cancel, acknowledge, clear, applyEdit };
}
