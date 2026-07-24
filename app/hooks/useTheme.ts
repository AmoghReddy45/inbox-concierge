"use client";

import { useCallback, useState } from "react";

export type ThemePreference = "snow" | "carbon" | "system";

const STORAGE_KEY = "tenex.theme.v1";

function applyTheme(preference: ThemePreference) {
  const root = document.documentElement;
  if (preference === "system") delete root.dataset.theme;
  else root.dataset.theme = preference === "carbon" ? "dark" : "light";
}

/**
 * Theme preference: Snow (light) / Carbon (dark) / match system.
 * The pre-hydration script in layout.tsx applies the stored value before
 * first paint; this hook owns changes after mount.
 */
function readStoredPreference(): ThemePreference {
  if (typeof window === "undefined") return "system";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "snow" || stored === "carbon" || stored === "system") return stored;
  } catch {
    // Storage unavailable.
  }
  return "system";
}

export function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>(readStoredPreference);

  const setTheme = useCallback((next: ThemePreference) => {
    setPreference(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage unavailable — theme still applies for this session.
    }
    applyTheme(next);
  }, []);

  return { theme: preference, setTheme };
}
