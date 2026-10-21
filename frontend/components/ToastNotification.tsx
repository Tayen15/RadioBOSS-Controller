"use client";

import React, { useEffect } from "react";
import { CheckCircle2, AlertCircle } from "lucide-react";

export interface ToastMessage {
  id: string;
  type: "success" | "error";
  text: string;
}

interface ToastNotificationProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export function ToastNotification({
  toasts,
  onDismiss,
}: ToastNotificationProps) {
  useEffect(() => {
    if (toasts.length === 0) return;
    const timer = setTimeout(() => {
      onDismiss(toasts[0].id);
    }, 1800); // Snappy 1.8 second auto-dismiss
    return () => clearTimeout(timer);
  }, [toasts, onDismiss]);

  if (toasts.length === 0) return null;

  const current = toasts[0];

  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[100] pointer-events-none transition-all duration-200 animate-in fade-in slide-in-from-top-2">
      <div
        onClick={() => onDismiss(current.id)}
        className={`pointer-events-auto cursor-pointer flex items-center gap-2 px-3 py-1.5 rounded-full shadow-lg border text-xs font-semibold backdrop-blur-md transition-transform active:scale-95 ${
          current.type === "success"
            ? "bg-base-200/90 border-success/40 text-success shadow-success/10"
            : "bg-base-200/90 border-error/40 text-error shadow-error/10"
        }`}
      >
        {current.type === "success" ? (
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
        )}
        <span className="truncate max-w-xs sm:max-w-md">{current.text}</span>
      </div>
    </div>
  );
}

