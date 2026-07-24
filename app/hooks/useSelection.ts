"use client";

import { useCallback, useState } from "react";
import type { ThreadSummary } from "../../lib/types";

/**
 * Selected thread + j/k navigation over the currently visible list.
 * Selection validity is derived: if the stored id left the visible list,
 * the first visible thread is treated as selected.
 */
export function useSelection(visibleThreads: ThreadSummary[]) {
  const [storedId, setSelectedId] = useState<string | null>(null);

  const selectedId =
    storedId && visibleThreads.some((thread) => thread.id === storedId)
      ? storedId
      : (visibleThreads[0]?.id ?? null);

  const moveSelection = useCallback(
    (direction: 1 | -1) => {
      if (!visibleThreads.length) return;
      const index = visibleThreads.findIndex((thread) => thread.id === selectedId);
      const next =
        index < 0
          ? direction === 1
            ? 0
            : visibleThreads.length - 1
          : (index + direction + visibleThreads.length) % visibleThreads.length;
      const id = visibleThreads[next].id;
      setSelectedId(id);
      document
        .querySelector(`[data-thread-id="${CSS.escape(id)}"]`)
        ?.scrollIntoView({ block: "nearest" });
    },
    [selectedId, visibleThreads],
  );

  return { selectedId, setSelectedId, moveSelection };
}
