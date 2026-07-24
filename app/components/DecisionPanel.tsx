"use client";

import {
  Check,
  ChevronDown,
  CircleAlert,
  CircleHelp,
  LoaderCircle,
  ShieldCheck,
  Tag,
  X,
} from "lucide-react";
import { useState } from "react";
import type { Bucket } from "../../lib/taxonomy";
import type { ThreadSummary } from "../../lib/types";
import type { ThreadTask } from "../lib/classify-orchestrator";
import { formatCost, formatTokens } from "../lib/format";
import { useFocusTrap } from "../hooks/useFocusTrap";

type Props = {
  thread: ThreadSummary;
  task: ThreadTask | undefined;
  buckets: Bucket[];
  correctedBucketId: string | null;
  startCorrecting: boolean;
  onCorrect: (bucketId: string) => void;
  onRetry: () => void;
  onClose: () => void;
};

export function DecisionPanel({
  thread,
  task,
  buckets,
  correctedBucketId,
  startCorrecting,
  onCorrect,
  onRetry,
  onClose,
}: Props) {
  // Parent keys this component by thread + correcting mode, so initial
  // state resets via remount instead of prop-sync effects.
  const [correcting, setCorrecting] = useState(startCorrecting);
  const [technicalOpen, setTechnicalOpen] = useState(false);
  const containerRef = useFocusTrap<HTMLElement>(true);

  const decision = task?.state === "classified" ? task.decision : undefined;
  const meta = task?.state === "classified" ? task.meta : undefined;
  const effectiveBucketId = correctedBucketId ?? decision?.bucketId ?? null;
  const bucket = buckets.find((candidate) => candidate.id === effectiveBucketId) ?? null;
  const runnerUp = decision?.runnerUpBucketId
    ? (buckets.find((candidate) => candidate.id === decision.runnerUpBucketId) ?? null)
    : null;

  const stateLabel = correctedBucketId
    ? "Corrected by you"
    : task?.state === "failed"
      ? "Classification failed"
      : task?.state === "classifying"
        ? "Classifying"
        : task?.state === "verifying"
          ? "Verifying risk"
          : task?.state === "queued"
            ? "Queued"
            : decision?.needsReview
              ? "Needs review"
              : decision?.verified
                ? "Strong evidence · verified"
                : decision
                  ? "Strong evidence"
                  : "Waiting";

  return (
    <aside
      className="decision-panel"
      role="dialog"
      aria-label={`Decision for ${thread.subject}`}
      ref={containerRef}
    >
      <header className="panel-header">
        <div>
          <span className="mono panel-kicker">Decision</span>
          <h2>{thread.subject}</h2>
          <span className="panel-sender">
            {thread.sender} · {thread.email}
          </span>
        </div>
        <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
          <X size={16} aria-hidden="true" />
        </button>
      </header>

      <div className="panel-scroll">
        <section className={`verdict ${decision?.needsReview && !correctedBucketId ? "is-review" : ""}`}>
          <span className="verdict-state">
            {task?.state === "classifying" && <LoaderCircle size={13} className="spin" aria-hidden="true" />}
            {task?.state === "failed" && <CircleAlert size={13} aria-hidden="true" />}
            {decision && !decision.needsReview && !correctedBucketId && <Check size={13} aria-hidden="true" />}
            {decision?.needsReview && !correctedBucketId && <CircleHelp size={13} aria-hidden="true" />}
            {correctedBucketId && <Check size={13} aria-hidden="true" />}
            {stateLabel}
          </span>
          <h3 className={`verdict-bucket tone-text-${bucket?.tone ?? "neutral"}`}>
            {bucket?.name ?? (task?.state === "failed" ? "Unsorted" : "—")}
          </h3>
          {bucket && <p className="verdict-definition">{bucket.description}</p>}
        </section>

        {task?.state === "failed" && (
          <section className="panel-section">
            <p className="failed-reason">{task.error?.message ?? "The classifier request failed."}</p>
            <button type="button" className="button-secondary" onClick={onRetry}>
              Retry classification
            </button>
          </section>
        )}

        {decision && decision.ambiguityReasons.length > 0 && (
          <section className="panel-section ambiguity">
            <h4 className="section-label">
              <CircleAlert size={13} aria-hidden="true" /> Why it needs a human look
            </h4>
            <ul>
              {decision.ambiguityReasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </section>
        )}

        {decision && (
          <section className="panel-section">
            <h4 className="section-label">Why this decision</h4>
            <p className="rationale">{decision.rationale}</p>
            {decision.evidence.length > 0 && (
              <div className="evidence-list">
                {decision.evidence.map((quote) => (
                  <blockquote key={quote}>“{quote}”</blockquote>
                ))}
              </div>
            )}
          </section>
        )}

        {runnerUp && !correctedBucketId && (
          <section className="panel-section runner-up">
            <h4 className="section-label">What else it could be</h4>
            <div className="runner-up-card">
              <span className={`tone-dot tone-${runnerUp.tone}`} aria-hidden="true" />
              <div>
                <strong>{runnerUp.name}</strong>
                <span>{runnerUp.description}</span>
              </div>
            </div>
          </section>
        )}

        <section className="panel-section">
          {!correcting ? (
            <button
              type="button"
              className="button-primary"
              onClick={() => setCorrecting(true)}
              disabled={!decision && task?.state !== "failed"}
            >
              <Tag size={13} aria-hidden="true" /> Correct classification
            </button>
          ) : (
            <div className="correct-picker" role="group" aria-label="Move to bucket">
              <h4 className="section-label">Move to</h4>
              {buckets.map((candidate) => (
                <button
                  key={candidate.id}
                  type="button"
                  className="correct-option"
                  onClick={() => {
                    onCorrect(candidate.id);
                    setCorrecting(false);
                  }}
                >
                  <span className={`tone-dot tone-${candidate.tone}`} aria-hidden="true" />
                  <span className="correct-name">{candidate.name}</span>
                  {effectiveBucketId === candidate.id && <Check size={14} aria-hidden="true" />}
                </button>
              ))}
            </div>
          )}
          <p className="panel-footnote">
            Corrections are recorded locally and outrank the model until this thread changes.
          </p>
        </section>

        <section className="panel-section technical">
          <button
            type="button"
            className="technical-toggle"
            aria-expanded={technicalOpen}
            onClick={() => setTechnicalOpen((open) => !open)}
          >
            Technical details
            <ChevronDown size={14} className={technicalOpen ? "rotate-180" : ""} aria-hidden="true" />
          </button>
          {technicalOpen && (
            <dl className="technical-grid">
              <div>
                <dt>Source</dt>
                <dd>
                  {meta ? (meta.source === "llm" ? "LLM" : "Heuristic fallback") : "—"}
                  {meta?.cached ? " · cached" : ""}
                </dd>
              </div>
              <div>
                <dt>Model</dt>
                <dd>{meta?.model ?? "—"}</dd>
              </div>
              <div>
                <dt>Prompt</dt>
                <dd>{meta?.promptVersion ?? "—"}</dd>
              </div>
              <div>
                <dt>Latency</dt>
                <dd>{meta ? `${meta.latencyMs} ms` : "—"}</dd>
              </div>
              <div>
                <dt>Tokens</dt>
                <dd>
                  {meta?.usage
                    ? `${formatTokens(meta.usage.inputTokens)} in · ${formatTokens(meta.usage.outputTokens)} out`
                    : "n/a"}
                </dd>
              </div>
              <div>
                <dt>Cost</dt>
                <dd>{meta ? formatCost(meta.costMicros) : "—"}</dd>
              </div>
              {meta?.verification && (
                <div>
                  <dt>Risk verifier</dt>
                  <dd>
                    {meta.verification.upheld ? "upheld" : "challenged"} ·{" "}
                    {formatCost(meta.verification.costMicros)}
                  </dd>
                </div>
              )}
            </dl>
          )}
        </section>
      </div>

      <footer className="panel-footer">
        <ShieldCheck size={13} aria-hidden="true" /> Read-only: nothing changes in Gmail.
      </footer>
    </aside>
  );
}
