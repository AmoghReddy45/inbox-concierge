"use client";

type Props = {
  /** Quiet status line under the spinner, e.g. "Getting ready…". */
  status: string;
};

/**
 * First-load splash, after Superhuman's boot screen: violet-washed ground,
 * letter-spaced wordmark, one thin arc spinner, quiet copy. Fades in after
 * a short delay so sub-300ms loads never flash it.
 */
export function LoadingSplash({ status }: Props) {
  return (
    <main className="loading-splash" aria-busy="true">
      <span className="splash-wordmark">Inbox&nbsp;Concierge</span>
      <span className="splash-spinner" aria-hidden="true" />
      <span className="splash-status" role="status">
        {status}
      </span>
    </main>
  );
}
