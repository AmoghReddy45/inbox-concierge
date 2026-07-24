"use client";

import { useEffect } from "react";

export type ShortcutHandlers = {
  onNext: () => void;
  onPrevious: () => void;
  onOpen: () => void;
  onEscape: () => void;
  onSearch: () => void;
  onCorrect: () => void;
  onWhy: () => void;
  onUndo: () => void;
  onTab: (index: number) => void;
  onPalette: () => void;
  onHelp: () => void;
};

/** One global keydown map. Hints shown in the UI must map 1:1 to this. */
export function useShortcuts(handlers: ShortcutHandlers) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const typing =
        ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable;

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        handlers.onPalette();
        return;
      }
      if (event.key === "Escape") {
        // While typing, Escape releases focus instead of tearing down the
        // surface underneath (thread view, draft textarea edits).
        if (typing) {
          target.blur();
          return;
        }
        handlers.onEscape();
        return;
      }
      if (typing || event.metaKey || event.ctrlKey || event.altKey) return;

      switch (event.key) {
        case "j":
          event.preventDefault();
          handlers.onNext();
          break;
        case "k":
          event.preventDefault();
          handlers.onPrevious();
          break;
        case "Enter":
        case "o":
          event.preventDefault();
          handlers.onOpen();
          break;
        case "/":
          event.preventDefault();
          handlers.onSearch();
          break;
        case "c":
          event.preventDefault();
          handlers.onCorrect();
          break;
        case "i":
          event.preventDefault();
          handlers.onWhy();
          break;
        case "u":
          event.preventDefault();
          handlers.onUndo();
          break;
        case "?":
          event.preventDefault();
          handlers.onHelp();
          break;
        default: {
          const digit = Number(event.key);
          if (Number.isInteger(digit) && digit >= 1 && digit <= 9) {
            event.preventDefault();
            handlers.onTab(digit - 1);
          }
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handlers]);
}
