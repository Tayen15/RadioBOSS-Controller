"use client";

import React, { useEffect } from "react";
import { CheckCircle2, AlertCircle, X } from "lucide-react";

export interface ToastMessage {
  id: string;
  type: "success" | "error";
  text: string;
}

interface ToastNotificationProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: ToastMessage;
  onDismiss: (id: string) => void;
}) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss(toast.id);
    }, 3200);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  const isSuccess = toast.type === "success";

  return (
    <div
      role="status"
      onClick={() => onDismiss(toast.id)}
      className={`pointer-events-auto cursor-pointer flex items-center gap-3 px-3.5 py-2.5 rounded-lg shadow-2xl bg-base-200 text-base-content border text-xs font-medium transition-colors duration-150 ${
        isSuccess ? "border-success/40" : "border-error/40"
      }`}
    >
      <div
        className={`flex h-6 w-6 items-center justify-center rounded-md shrink-0 ${
          isSuccess
            ? "bg-success/15 text-success"
            : "bg-error/15 text-error"
        }`}
      >
        {isSuccess ? (
          <CheckCircle2 className="h-3.5 w-3.5" />
        ) : (
          <AlertCircle className="h-3.5 w-3.5" />
        )}
      </div>

      <span className="truncate max-w-xs sm:max-w-md">
        {toast.text}
      </span>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDismiss(toast.id);
        }}
        className="btn btn-ghost btn-xs h-6 w-6 p-0 min-h-0 rounded-md text-base-content/60 hover:text-base-content"
        title="Tutup notifikasi"
        aria-label="Tutup notifikasi"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/**
 * Studio console toast notification stack.
 */
export function ToastNotification({
  toasts,
  onDismiss,
}: ToastNotificationProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] pointer-events-none flex flex-col items-center gap-2">
      {toasts.slice(0, 3).map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
