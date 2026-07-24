"use client";

import { useEffect, useState } from "react";
import type { RunSnapshot } from "../lib/classify-orchestrator";

type Props = {
  snapshot: RunSnapshot | null;
  /** Threads known to the UI but not yet registered with the orchestrator. */
  expectedTotal: number;
  onPause: () => void;
  onResume: () => void;
};

/**
 * The honest progress strip: renders orchestrator state only. Terminal
 * (classified + failed) over total; nothing is simulated.
 */
export function ProgressStrip({ snapshot, expectedTotal, onPause, onResume }: Props) {
  const pausedUntil = snapshot?.pausedUntil ?? null;
  const [pauseSeconds, setPauseSeconds] = useState(0);

  useEffect(() => {
    if (pausedUntil === null) return;
    const tick = () =>
      setPauseSeconds(Math.max(0, Math.ceil((pausedUntil - Date.now()) / 1000)));
    tick();
    const timer = window.setInterval(tick, 1_000);
    return () => window.clearInterval(timer);
  }, [pausedUntil]);

  if (!snapshot) return null;
  const total = Math.max(snapshot.total, expectedTotal);
  if (total === 0) return null;
  const terminal = snapshot.counts.classified + snapshot.counts.failed;
  const running = terminal < total;
  if (!running) return null;

  const percent = total ? (terminal / total) * 100 : 0;
  const paused = pausedUntil !== null;

  return (
    <div className="progress-strip" role="status" aria-label="Classification progress">
      <div className="progress-track" aria-hidden="true">
        <span style={{ width: `${percent}%` }} />
      </div>
      <span className="progress-copy mono">
        {paused
          ? `Rate limited · resuming in ${pauseSeconds}s`
          : snapshot.manuallyPaused
            ? `Paused · ${terminal} / ${total}`
            : `${terminal} / ${total}`}
        <button
          type="button"
          className="progress-control"
          onClick={snapshot.manuallyPaused ? onResume : onPause}
          disabled={paused}
        >
          {snapshot.manuallyPaused ? "Resume" : "Pause"}
        </button>
      </span>
    </div>
  );
}
