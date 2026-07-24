"use client";

type Hint = [keys: string, label: string];

type Props = {
  context: "list" | "thread";
  /** Whether the reply-draft shortcut is live (profile exists, LLM available). */
  canDraft: boolean;
};

/**
 * Superhuman-style persistent hint strip: a few contextual shortcuts at
 * the bottom of the shell. Every key shown maps 1:1 to useShortcuts /
 * DraftCard bindings; the full list lives behind "?".
 */
export function HintBar({ context, canDraft }: Props) {
  const hints: Hint[] =
    context === "thread"
      ? [
          ["J K", "next / prev"],
          ...(canDraft ? ([["R", "draft reply"]] as Hint[]) : []),
          ["I", "why this bucket"],
          ["Esc", "back"],
          ["⌘K", "commands"],
        ]
      : [
          ["J K", "navigate"],
          ["⏎", "open"],
          ["C", "correct"],
          ["⌘K", "commands"],
          ["?", "shortcuts"],
        ];
  return (
    <footer className="hint-bar" aria-hidden="true">
      {hints.map(([keys, label]) => (
        <span className="hint" key={keys}>
          <kbd>{keys}</kbd> {label}
        </span>
      ))}
    </footer>
  );
}
