"use client";

import { LockKeyhole, ShieldCheck } from "lucide-react";

type Props = {
  googleError: string | null;
  onExploreDemo: () => void;
};

const ERROR_COPY: Record<string, string> = {
  access_denied: "Google sign-in was cancelled. You can try again whenever you're ready.",
  invalid_state: "The sign-in link expired. Start the connection again.",
  token_exchange_failed: "Google rejected the sign-in. Try connecting again.",
  not_configured: "Google OAuth isn't configured on this deployment.",
};

export function ConnectScreen({ googleError, onExploreDemo }: Props) {
  return (
    <main className="connect-screen">
      <div className="connect-card">
        <h1>Inbox Concierge</h1>
        <p>
          Connect Gmail and the concierge sorts your last 200 threads into buckets — with the
          evidence for every decision, and abstention when it isn&apos;t sure.
        </p>
        {googleError && (
          <p className="connect-error" role="alert">
            {ERROR_COPY[googleError] ?? "Google sign-in failed. Try again."}
          </p>
        )}
        <div className="connect-actions">
          <a className="button-primary" href="/api/google/start">
            <LockKeyhole size={14} aria-hidden="true" /> Connect Gmail
          </a>
          <button type="button" className="button-secondary" onClick={onExploreDemo}>
            Explore demo inbox
          </button>
        </div>
        <p className="connect-footnote">
          <ShieldCheck size={13} aria-hidden="true" /> Read-only access. Nothing is modified,
          moved, or sent in Gmail.
        </p>
      </div>
    </main>
  );
}
