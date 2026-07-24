"use client";

import { Check, Copy, PenLine, RotateCw, Scissors } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ThreadMessage, ThreadSummary } from "../../lib/types";
import type { StoredVoiceProfile } from "../../lib/voice-types";
import { formatCost } from "../lib/format";
import {
  buildDraftExcerpt,
  matchExemplars,
  type ThreadSituation,
} from "../lib/exemplar-match";
import { useDraft } from "../hooks/useDraft";

type Props = {
  thread: ThreadSummary;
  messages: ThreadMessage[];
  sessionEmail: string | null;
  bucketId: string | null;
  stored: StoredVoiceProfile;
  situation: ThreadSituation;
};

/**
 * On-demand drafting below the thread: likelihood is free and shown by the
 * chip above; every generation is a fresh measured call; copy is the only
 * exit — the app never writes to Gmail.
 */
export function DraftCard({ thread, messages, sessionEmail, bucketId, stored, situation }: Props) {
  const { profile, meta, revision } = stored;
  const internal = thread.senderDomainRelation === "same-domain";
  const exemplars = useMemo(
    () => matchExemplars(profile, { situation, internal }, 3),
    [internal, profile, situation],
  );
  const { state, generate } = useDraft(thread, profile, revision, situation, exemplars, bucketId);

  const latest = messages[messages.length - 1];
  const mode: "reply" | "followup" =
    sessionEmail && latest && latest.email.toLowerCase() === sessionEmail.toLowerCase()
      ? "followup"
      : "reply";
  const excerpt = useMemo(() => buildDraftExcerpt(messages), [messages]);

  // Edits are tagged with the draft they modify, so a fresh generation
  // naturally supersedes them — no reset effect needed.
  const [edited, setEdited] = useState<{ of: string; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [whyOpen, setWhyOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const response = state.status === "ready" ? state.response : null;
  const draftWithSignature = response
    ? `${response.draft.body}${profile.signature ? `\n\n${profile.signature}` : ""}`
    : "";
  const value =
    edited && edited.of === draftWithSignature ? edited.text : draftWithSignature;

  // `r` drafts from anywhere in the open thread (matches the global-shortcut input guard).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const typing =
        ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable;
      if (typing || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "r" && state.status === "idle") {
        event.preventDefault();
        generate({ mode, excerpt });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [excerpt, generate, mode, state.status]);

  if (meta.heuristicOnly) {
    return (
      <p className="draft-disabled">
        <PenLine size={13} aria-hidden="true" /> Drafting needs the LLM — your heuristic profile
        measures your style but a template would not be your voice.
      </p>
    );
  }

  const copyDraft = () => {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    });
  };

  if (state.status === "idle" || state.status === "generating" || state.status === "error") {
    return (
      <div className="draft-card">
        {state.status === "error" && (
          <p className="voice-error" role="alert">
            {state.message}
          </p>
        )}
        <div className="draft-idle-row">
          <button
            type="button"
            className="button-primary draft-button"
            disabled={state.status === "generating"}
            onClick={() => generate({ mode, excerpt })}
          >
            <PenLine size={13} aria-hidden="true" />
            {state.status === "generating"
              ? "Drafting in your voice…"
              : state.status === "error"
                ? "Try again (~$0.02)"
                : mode === "followup"
                  ? "Draft a follow-up nudge (~$0.02)"
                  : "Draft a reply (~$0.02)"}
          </button>
          {state.status === "idle" && <kbd className="draft-kbd">r</kbd>}
        </div>
      </div>
    );
  }

  if (!response) return null;
  const { draft, meta: draftMeta } = response;

  return (
    <div className="draft-card draft-ready">
      <textarea
        ref={textareaRef}
        className="draft-textarea"
        value={value}
        rows={Math.min(14, Math.max(4, value.split("\n").length + 1))}
        onChange={(event) => setEdited({ of: draftWithSignature, text: event.target.value })}
        aria-label="Draft reply (editable)"
      />
      <div className="draft-actions">
        <button type="button" className="button-primary draft-button" onClick={copyDraft}>
          {copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
          {copied ? "Copied" : "Copy to clipboard"}
        </button>
        <button
          type="button"
          className="button-secondary draft-button"
          onClick={() => generate({ mode, excerpt, regenerate: true })}
        >
          <RotateCw size={13} aria-hidden="true" /> Try again
        </button>
        <button
          type="button"
          className="button-secondary draft-button"
          onClick={() => generate({ mode, excerpt, regenerate: true, adjust: "shorter" })}
        >
          <Scissors size={13} aria-hidden="true" /> Shorter
        </button>
        <button
          type="button"
          className="draft-why-toggle"
          aria-expanded={whyOpen}
          onClick={() => setWhyOpen((open) => !open)}
        >
          Why it sounds like you
        </button>
      </div>
      {whyOpen && (
        <ul className="draft-rationale">
          {draft.voiceRationale.map((entry) => (
            <li key={entry.pattern}>
              <code>{entry.pattern}</code> — {entry.evidence}
            </li>
          ))}
        </ul>
      )}
      <p className="draft-meta mono">
        {state.cached ? "cached draft · " : ""}
        {draftMeta.model} · {(draftMeta.latencyMs / 1000).toFixed(1)}s ·{" "}
        {draftMeta.costMicros !== null ? formatCost(draftMeta.costMicros) : "cost n/a"} · profile{" "}
        {new Date(draftMeta.profileBuiltAt).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        })}{" "}
        · read-only scope — copy to send from Gmail
      </p>
    </div>
  );
}
