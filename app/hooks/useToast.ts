"use client";

import { useCallback, useRef, useState } from "react";

export type Toast = {
  id: number;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
};

const TOAST_DURATION_MS = 4_200;

export function useToast() {
  const [toast, setToast] = useState<Toast | null>(null);
  const counter = useRef(0);
  const timer = useRef<number | null>(null);

  const dismissToast = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    setToast(null);
  }, []);

  const showToast = useCallback(
    (message: string, action?: { label: string; onAction: () => void }) => {
      counter.current += 1;
      if (timer.current !== null) window.clearTimeout(timer.current);
      setToast({
        id: counter.current,
        message,
        actionLabel: action?.label,
        onAction: action?.onAction,
      });
      timer.current = window.setTimeout(() => setToast(null), TOAST_DURATION_MS);
    },
    [],
  );

  return { toast, showToast, dismissToast };
}
