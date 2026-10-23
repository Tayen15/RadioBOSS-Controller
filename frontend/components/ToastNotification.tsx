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
    }, 2800);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  const isSuccess = toast.type === "success";

  return (
    <div
      onClick={() => onDismiss(toast.id)}
      className="pointer-events-auto cursor-pointer group flex items-center gap-2.5 px-4 py-2 rounded-full shadow-2xl bg-slate-900/95 text-slate-100 border border-slate-700/80 backdrop-blur-xl text-xs font-medium transition-all duration-200 hover:scale-[1.02] active:scale-95 animate-in fade-in slide-in-from-top-3"
    >
      <div
        className={`flex h-5 w-5 items-center justify-center rounded-full shrink-0 ${
          isSuccess
            ? "bg-emerald-500/20 text-emerald-400"
            : "bg-rose-500/20 text-rose-400"
        }`}
      >
        {isSuccess ? (
          <CheckCircle2 className="h-3.5 w-3.5" />
        ) : (
          <AlertCircle className="h-3.5 w-3.5" />
        )}
      </div>

      <span className="truncate max-w-xs sm:max-w-md tracking-tight">
        {toast.text}
      </span>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDismiss(toast.id);
        }}
        className="text-slate-400 hover:text-white p-0.5 ml-0.5 rounded-full hover:bg-white/10 transition-colors"
        title="Tutup notifikasi"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

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


