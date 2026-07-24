"use client";

import { X } from "lucide-react";
import type { Toast as ToastData } from "../hooks/useToast";

type Props = {
  toast: ToastData | null;
  onDismiss: () => void;
};

export function Toast({ toast, onDismiss }: Props) {
  return (
    <div className="toast-region" aria-live="polite">
      {toast && (
        <div className="toast" key={toast.id}>
          <span>{toast.message}</span>
          {toast.actionLabel && toast.onAction && (
            <button
              type="button"
              className="toast-action"
              onClick={() => {
                toast.onAction?.();
                onDismiss();
              }}
            >
              {toast.actionLabel}
            </button>
          )}
          <button type="button" className="toast-close" aria-label="Dismiss" onClick={onDismiss}>
            <X size={13} aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
