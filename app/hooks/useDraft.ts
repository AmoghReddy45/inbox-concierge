"use client";

import { useCallback, useState } from "react";
import { isApiErrorBody, type ThreadSummary } from "../../lib/types";
import type {
  DraftRequest,
  DraftResponse,
  VoiceExemplar,
  VoiceProfile,
} from "../../lib/voice-types";
import { DraftCache } from "../lib/draft-cache";
import type { ThreadSituation } from "../lib/exemplar-match";

export type DraftState =
  | { status: "idle" }
  | { status: "generating"; previous: DraftResponse | null }
  | { status: "ready"; response: DraftResponse; cached: boolean }
  | { status: "error"; message: string; retryable: boolean; previous: DraftResponse | null };

export type GenerateOptions = {
  mode: "reply" | "followup";
  excerpt: string;
  adjust?: "shorter";
  regenerate?: boolean;
};

/**
 * One draft lifecycle per open thread (the parent remounts per thread id).
 * Cache is read at mount; every generation is a fresh measured call.
 */
export function useDraft(
  thread: ThreadSummary,
  /** Id of the newest message actually rendered/drafted against. */
  latestMessageId: string,
  profile: VoiceProfile,
  revision: number,
  situation: ThreadSituation,
  exemplars: VoiceExemplar[],
  bucketId: string | null,
) {
  const [cache] = useState<DraftCache | null>(() =>
    typeof window === "undefined" ? null : new DraftCache(window.localStorage),
  );
  const cacheKey = cache?.key(profile.builtAt, revision, thread.id, latestMessageId) ?? null;
  const [state, setState] = useState<DraftState>(() => {
    const hit = cache && cacheKey ? cache.get(cacheKey) : null;
    return hit ? { status: "ready", response: hit.response, cached: true } : { status: "idle" };
  });

  const generate = useCallback(
    (options: GenerateOptions) => {
      const previous =
        state.status === "ready"
          ? state.response
          : state.status === "generating" || state.status === "error"
            ? state.previous
            : null;
      setState({ status: "generating", previous });

      const request: DraftRequest = {
        thread: {
          id: thread.id,
          subject: thread.subject,
          sender: thread.sender,
          email: thread.email,
          date: thread.date,
          excerpt: options.excerpt,
          bucketId,
          internal: thread.senderDomainRelation === "same-domain",
        },
        situation,
        profile,
        exemplars,
        mode: options.mode,
        ...(options.regenerate && previous ? { previousDraft: previous.draft.body } : {}),
        ...(options.adjust ? { adjust: options.adjust } : {}),
      };

      void (async () => {
        try {
          const response = await fetch("/api/ai/draft", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(request),
          });
          const payload = (await response.json()) as DraftResponse | unknown;
          if (!response.ok || isApiErrorBody(payload)) {
            setState({
              status: "error",
              message: isApiErrorBody(payload)
                ? payload.error.message
                : `Draft failed (HTTP ${response.status})`,
              retryable: isApiErrorBody(payload) ? payload.error.retryable : response.status >= 500,
              previous,
            });
            return;
          }
          const draftResponse = payload as DraftResponse;
          if (cache && cacheKey) {
            cache.set(cacheKey, { response: draftResponse, storedAt: Date.now() });
          }
          setState({ status: "ready", response: draftResponse, cached: false });
        } catch (error) {
          setState({
            status: "error",
            message: error instanceof Error ? error.message : "Draft request failed",
            retryable: true,
            previous,
          });
        }
      })();
    },
    [bucketId, cache, cacheKey, exemplars, profile, situation, state, thread],
  );

  return { state, generate };
}
