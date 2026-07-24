"use client";

import { useState } from "react";
import type { StoredVoiceProfile } from "../../lib/voice-types";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { formatCost } from "../lib/format";

type Props = {
  stored: StoredVoiceProfile;
  stale: boolean;
  onRebuild: () => void;
  onClear: () => void;
  onClose: () => void;
};

function pct(share: number) {
  return `${Math.round(share * 100)}%`;
}

function contextLabel(context: "internal" | "external" | "any") {
  return context === "any" ? "everyone" : context;
}

/** The transparency payoff: the user's own measured voice, inspectable. */
export function VoiceProfileSheet({ stored, stale, onRebuild, onClear, onClose }: Props) {
  const trapRef = useFocusTrap<HTMLDivElement>(true);
  const [showExemplars, setShowExemplars] = useState(false);
  const { profile, meta } = stored;
  const builtDate = new Date(profile.builtAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

  return (
    <div className="overlay" role="presentation" onMouseDown={onClose}>
      <div
        className="modal voice-sheet"
        role="dialog"
        aria-label="Your voice profile"
        ref={trapRef}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <h2>Your voice, measured</h2>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </header>

        <p className="voice-meta mono">
          {profile.corpus.sampleCount} sent messages · built {builtDate} ·{" "}
          {meta.heuristicOnly
            ? "measured stats only (no model)"
            : `${meta.model} · ${meta.costMicros !== null ? formatCost(meta.costMicros) : "cost n/a"}`}
          {stale && <span className="voice-stale-chip">new sent mail since</span>}
        </p>

        <div className="voice-sheet-body">
          <section>
            <h3>Corpus</h3>
            <p>
              {profile.corpus.replyCount} replies · {profile.corpus.freshCount} fresh ·{" "}
              {profile.corpus.forwardCount} forwards
              {profile.corpus.filtered > 0 && ` · ${profile.corpus.filtered} junk filtered`}
              {profile.corpus.skipped > 0 && ` · ${profile.corpus.skipped} skipped`}
            </p>
          </section>

          <section>
            <h3>Signature</h3>
            {profile.signature ? (
              <pre className="voice-sig">{profile.signature}</pre>
            ) : (
              <p className="voice-muted">
                No consistent trailing signature detected — nothing will be appended to drafts.
              </p>
            )}
          </section>

          {!meta.heuristicOnly && (
            <section>
              <h3>Tone</h3>
              <div className="voice-axes">
                {(
                  [
                    ["Formality", profile.tone.formality],
                    ["Warmth", profile.tone.warmth],
                    ["Directness", profile.tone.directness],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label} className="voice-axis">
                    <span>{label}</span>
                    <div className="voice-axis-track">
                      <div className="voice-axis-fill" style={{ width: pct(value) }} />
                    </div>
                    <span className="mono">{pct(value)}</span>
                  </div>
                ))}
              </div>
              {profile.tone.notes.map((note) => (
                <p key={note} className="voice-muted">
                  {note}
                </p>
              ))}
            </section>
          )}

          <section>
            <h3>Openings &amp; closings (measured share)</h3>
            {profile.greetings.length === 0 && profile.signoffs.length === 0 ? (
              <p className="voice-muted">No recurring greeting or sign-off patterns crossed the 2-use bar.</p>
            ) : (
              <ul className="voice-inventory">
                {profile.greetings.map((entry) => (
                  <li key={`g-${entry.text}`}>
                    <code>{entry.text}</code>
                    <span className="mono">
                      {pct(entry.share)} · to {contextLabel(entry.context)}
                    </span>
                  </li>
                ))}
                {profile.signoffs.map((entry) => (
                  <li key={`s-${entry.text}`}>
                    <code>{entry.text}</code>
                    <span className="mono">
                      {pct(entry.share)} · to {contextLabel(entry.context)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3>Length</h3>
            <p>
              Median {profile.length.medianWords} words · 90th percentile {profile.length.p90Words} ·{" "}
              {pct(profile.length.oneLinerShare)} one-liners (≤15 words)
            </p>
          </section>

          {profile.quirks.length > 0 && (
            <section>
              <h3>Habits</h3>
              <ul className="voice-list">
                {profile.quirks.map((quirk) => (
                  <li key={quirk}>{quirk}</li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h3>What you reply to</h3>
            <ul className="voice-list">
              {profile.replyBehavior.respondsTo.map((entry) => (
                <li key={entry.situation}>
                  <strong>{entry.situation}</strong> — {entry.count} repl
                  {entry.count === 1 ? "y" : "ies"} ({pct(entry.share)} of your replies), typically{" "}
                  {entry.typicalLatency}
                </li>
              ))}
            </ul>
            {profile.replyBehavior.neverObserved.length > 0 && (
              <p className="voice-muted">
                No observed replies to: {profile.replyBehavior.neverObserved.join(", ")}.
              </p>
            )}
          </section>

          {profile.contexts.length > 0 && (
            <section>
              <h3>How you shift by situation</h3>
              <ul className="voice-list">
                {profile.contexts.map((context) => (
                  <li key={context.id}>
                    <strong>{context.when}</strong> — {context.register}
                    {context.typicalLength ? ` · ${context.typicalLength}` : ""}
                    {context.greeting ? (
                      <>
                        {" "}
                        · opens <code>{context.greeting}</code>
                      </>
                    ) : null}
                    {context.signoff ? (
                      <>
                        {" "}
                        · closes <code>{context.signoff}</code>
                      </>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {profile.driftNotes.length > 0 && (
            <section>
              <h3>Drift</h3>
              <ul className="voice-list">
                {profile.driftNotes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h3>
              <button
                type="button"
                className="voice-toggle"
                onClick={() => setShowExemplars((open) => !open)}
                aria-expanded={showExemplars}
              >
                {showExemplars ? "Hide" : "Show"} {profile.exemplars.length} verbatim exemplars
              </button>
            </h3>
            {showExemplars && (
              <div className="voice-exemplars">
                {profile.exemplars.map((exemplar, index) => (
                  <figure key={`${exemplar.sentAt}-${index}`}>
                    <figcaption className="mono">
                      {exemplar.situation} · {exemplar.internal ? "internal" : "external"}
                      {exemplar.parentGist ? ` · re: ${exemplar.parentGist}` : ""}
                    </figcaption>
                    <pre>{exemplar.body}</pre>
                  </figure>
                ))}
              </div>
            )}
          </section>
        </div>

        <footer>
          <button type="button" className="button-secondary" onClick={onClear}>
            Delete profile
          </button>
          <button type="button" className="button-primary" onClick={onRebuild}>
            Rebuild{meta.heuristicOnly ? " (free)" : " (~$0.25)"}
          </button>
        </footer>
      </div>
    </div>
  );
}
