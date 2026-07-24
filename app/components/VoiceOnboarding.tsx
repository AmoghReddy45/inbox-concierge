"use client";

import { useFocusTrap } from "../hooks/useFocusTrap";
import { formatCost } from "../lib/format";
import type { LearnProgress } from "../lib/voice-learn";
import type { VoiceProfileState } from "../hooks/useVoiceProfile";

type Props = {
  mode: "gmail" | "demo";
  llmConfigured: boolean;
  state: VoiceProfileState;
  onStart: () => void;
  onResume: () => void;
  onClose: () => void;
  onViewProfile: () => void;
};

function progressLine(progress: LearnProgress) {
  if (progress.stage === "reading") {
    const extras = [
      progress.filtered ? `${progress.filtered} junk filtered` : null,
      progress.skipped ? `${progress.skipped} skipped` : null,
    ].filter(Boolean);
    return {
      title: `Reading your sent mail · ${progress.samplesRead}/${progress.target}`,
      detail: extras.join(" · ") || "Calendar responses and empty bodies are dropped, with counts.",
      fraction: progress.samplesRead / progress.target,
    };
  }
  if (progress.stage === "distilling") {
    return {
      title: `Distilling your voice · call ${progress.step} of ${progress.stepCount}`,
      detail:
        progress.costMicros > 0
          ? `Measured spend so far: ${formatCost(progress.costMicros)}`
          : "Statistics are measured in code; the model only describes.",
      fraction: (progress.step - 1) / progress.stepCount,
    };
  }
  return { title: "Done", detail: "", fraction: 1 };
}

/** The learn-my-voice flow: quote the cost, show honest progress, report real spend. */
export function VoiceOnboarding({
  mode,
  llmConfigured,
  state,
  onStart,
  onResume,
  onClose,
  onViewProfile,
}: Props) {
  const trapRef = useFocusTrap<HTMLDivElement>(true);
  const { progress, error, stored, canResume } = state;
  const running = progress !== null && progress.stage !== "done";
  const finished = progress?.stage === "done" && stored !== null;

  return (
    <div className="overlay" role="presentation" onMouseDown={running ? undefined : onClose}>
      <div
        className="modal voice-modal"
        role="dialog"
        aria-label="Learn my voice"
        ref={trapRef}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <h2>Learn my voice</h2>
          {!running && (
            <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
              ×
            </button>
          )}
        </header>

        {finished ? (
          <div className="voice-stage">
            <p className="voice-lede">
              Profile built from {stored.profile.corpus.sampleCount} sent messages
              {stored.meta.heuristicOnly
                ? " — measured statistics only (no model configured)."
                : "."}
            </p>
            <dl className="voice-facts">
              <div>
                <dt>Replies studied</dt>
                <dd>{stored.profile.corpus.replyCount}</dd>
              </div>
              <div>
                <dt>Measured cost</dt>
                <dd>{stored.meta.costMicros !== null ? formatCost(stored.meta.costMicros) : "$0 (no model calls)"}</dd>
              </div>
              <div>
                <dt>Model time</dt>
                <dd>{stored.meta.latencyMs ? `${Math.round(stored.meta.latencyMs / 1000)}s` : "—"}</dd>
              </div>
            </dl>
            <footer>
              <button type="button" className="button-secondary" onClick={onClose}>
                Close
              </button>
              <button type="button" className="button-primary" onClick={onViewProfile}>
                View your profile
              </button>
            </footer>
          </div>
        ) : running ? (
          <div className="voice-stage" aria-live="polite">
            {(() => {
              const line = progressLine(progress);
              return (
                <>
                  <p className="voice-lede">{line.title}</p>
                  <div
                    className="voice-progress"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(line.fraction * 100)}
                  >
                    <div className="voice-progress-fill" style={{ width: `${Math.max(3, line.fraction * 100)}%` }} />
                  </div>
                  {line.detail && <p className="voice-detail">{line.detail}</p>}
                </>
              );
            })()}
          </div>
        ) : (
          <div className="voice-stage">
            <p className="voice-lede">
              Reads your last ~200 sent messages ({mode === "demo" ? "the demo corpus" : "readonly scope"}) to
              learn how you reply — tone, length, greetings, and which mail you answer at all.
            </p>
            {error && (
              <p className="voice-error" role="alert">
                {error}
              </p>
            )}
            <ul className="voice-points">
              <li>Every statistic is measured in code; the model only describes and selects examples.</li>
              <li>The profile lives in this browser&apos;s localStorage — nothing is written to Gmail.</li>
              {llmConfigured ? (
                <li>5 model calls, typically 45–75 seconds. Estimated cost ≈ $0.25; the real measured cost is shown after.</li>
              ) : (
                <li>No model key is configured — a measured-stats profile builds for free, and drafting stays disabled.</li>
              )}
            </ul>
            <footer>
              <button type="button" className="button-secondary" onClick={onClose}>
                Not now
              </button>
              {error && canResume ? (
                <button type="button" className="button-primary" onClick={onResume}>
                  Resume from last completed step
                </button>
              ) : (
                <button type="button" className="button-primary" onClick={onStart}>
                  {error ? "Try again" : llmConfigured ? "Learn my voice (~$0.25)" : "Measure my style (free)"}
                </button>
              )}
            </footer>
          </div>
        )}
      </div>
    </div>
  );
}
