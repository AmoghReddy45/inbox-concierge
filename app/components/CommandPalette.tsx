"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useFocusTrap } from "../hooks/useFocusTrap";

export type Command = {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
};

type Props = {
  commands: Command[];
  onClose: () => void;
};

export function CommandPalette({ commands, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useFocusTrap<HTMLDivElement>(true);

  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return normalized
      ? commands.filter((command) => command.label.toLowerCase().includes(normalized))
      : commands;
  }, [commands, query]);

  const clampedIndex = Math.min(activeIndex, Math.max(0, visible.length - 1));

  return (
    <div className="overlay overlay-top" role="presentation" onMouseDown={onClose}>
      <div
        className="command-palette"
        role="dialog"
        aria-label="Command palette"
        ref={containerRef}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="command-input">
          <Search size={15} aria-hidden="true" />
          <input
            data-autofocus
            value={query}
            placeholder="Type a command…"
            aria-label="Search commands"
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActiveIndex((index) => Math.min(index + 1, visible.length - 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActiveIndex((index) => Math.max(index - 1, 0));
              } else if (event.key === "Enter" && visible[clampedIndex]) {
                event.preventDefault();
                visible[clampedIndex].run();
                onClose();
              }
            }}
          />
          <kbd>ESC</kbd>
        </div>
        <div className="command-list" role="listbox" aria-label="Commands">
          {visible.length ? (
            visible.map((command, index) => (
              <button
                key={command.id}
                type="button"
                role="option"
                aria-selected={index === clampedIndex}
                className={index === clampedIndex ? "is-active" : ""}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => {
                  command.run();
                  onClose();
                }}
              >
                <span>{command.label}</span>
                {command.hint && <kbd>{command.hint}</kbd>}
              </button>
            ))
          ) : (
            <div className="command-empty">No matching command</div>
          )}
        </div>
      </div>
    </div>
  );
}
