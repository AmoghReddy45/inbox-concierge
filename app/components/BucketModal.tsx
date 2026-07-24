"use client";

import { RefreshCw, X } from "lucide-react";
import { useState } from "react";
import { useFocusTrap } from "../hooks/useFocusTrap";

type Props = {
  threadCount: number;
  onCreate: (name: string, description: string, example: string) => void;
  onClose: () => void;
};

/** One-click starting points (pattern borrowed from Inbox Zero's category dialog). */
const PRESETS: Array<{ name: string; description: string }> = [
  {
    name: "Recruiting",
    description: "Recruiter outreach, hiring intros, and candidate profiles shared for roles.",
  },
  {
    name: "Finance",
    description: "Invoices, receipts, and billing notices I may need for records.",
  },
  {
    name: "Travel",
    description: "Flight, hotel, and reservation confirmations or changes for upcoming trips.",
  },
  {
    name: "Waiting on reply",
    description: "Threads where the other person owes me a response to my last message.",
  },
  {
    name: "Cold outreach",
    description: "Unsolicited sales or agency pitches from people I have no relationship with.",
  },
  {
    name: "Team",
    description: "Messages from teammates in my own company or workspace.",
  },
];

export function BucketModal({ threadCount, onCreate, onClose }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [example, setExample] = useState("");
  const containerRef = useFocusTrap<HTMLDivElement>(true);
  const valid = name.trim().length > 0 && description.trim().length > 0;

  return (
    <div className="overlay" role="presentation" onMouseDown={onClose}>
      <div
        className="modal bucket-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bucket-modal-title"
        ref={containerRef}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <h2 id="bucket-modal-title">New bucket</h2>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
            <X size={16} aria-hidden="true" />
          </button>
        </header>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (valid) onCreate(name, description, example);
          }}
        >
          <label>
            <span>Name</span>
            <input
              data-autofocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Customer escalations"
            />
          </label>
          <div className="preset-row" role="group" aria-label="Bucket suggestions">
            {PRESETS.map((preset) => (
              <button
                key={preset.name}
                type="button"
                className="preset-chip"
                onClick={() => {
                  setName(preset.name);
                  setDescription(preset.description);
                }}
              >
                + {preset.name}
              </button>
            ))}
          </div>
          <label>
            <span>What belongs here?</span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              placeholder="External customer email reporting a blocker, outage, or billing problem where I have not replied yet."
            />
            <small>
              Written in plain language — this definition is sent to the classifier verbatim.
            </small>
          </label>
          <label>
            <span>
              Example <em>optional</em>
            </span>
            <input
              value={example}
              onChange={(event) => setExample(event.target.value)}
              placeholder="Checkout is down and we need an ETA before 4 PM."
            />
          </label>
          <div className="modal-note">
            <RefreshCw size={13} aria-hidden="true" />
            <span>
              Creating this bucket reclassifies all {threadCount} threads. Cached decisions for the
              old taxonomy are kept for audit.
            </span>
          </div>
          <footer>
            <button type="button" className="button-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="button-primary" disabled={!valid}>
              Create &amp; reclassify
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
