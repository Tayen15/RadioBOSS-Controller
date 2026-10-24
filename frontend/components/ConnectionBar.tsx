"use client";

import React from "react";
import {
  Radio,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Settings as SettingsIcon,
} from "lucide-react";
import { RadioBOSSStatus } from "@/lib/types";

interface ConnectionBarProps {
  radioBossStatus: RadioBOSSStatus | null;
  loading: boolean;
  onRefresh: () => void;
  onOpenSettings: () => void;
}

export function ConnectionBar({
  radioBossStatus,
  loading,
  onRefresh,
  onOpenSettings,
}: ConnectionBarProps) {
  const isRadioConnected = radioBossStatus?.connected ?? false;

  return (
    <header className="navbar bg-base-200/90 backdrop-blur-md border-b border-base-300 px-4 sm:px-6 sticky top-0 z-30 justify-between">
      {/* Brand & Logo */}
      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-content shadow-sm shadow-primary/20">
          <Radio className="h-4.5 w-4.5" />
        </div>
        <span className="text-base sm:text-lg font-bold tracking-tight text-base-content">
          Radio Caster Bridge
        </span>
      </div>

      {/* Status Badges & Controls */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* RadioBOSS Status */}
        <div
          className={`badge badge-sm rounded-full gap-1.5 py-3 px-3 border ${
            isRadioConnected
              ? "badge-success/15 border-success/40 text-success"
              : "badge-warning/15 border-warning/40 text-warning"
          }`}
          title={radioBossStatus?.error || undefined}
        >
          <Radio className="h-3 w-3" />
          <span className="hidden sm:inline font-medium">RadioBOSS:</span>
          {isRadioConnected ? (
            <span className="inline-flex items-center gap-1 font-semibold">
              <CheckCircle2 className="h-3 w-3" />
              Terhubung
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 font-semibold">
              <AlertTriangle className="h-3 w-3" />
              Terputus
            </span>
          )}
        </div>

        {/* Refresh Button */}
        <button
          onClick={onRefresh}
          disabled={loading}
          aria-label="Refresh status"
          className="btn btn-ghost btn-circle btn-sm text-base-content/70 hover:text-base-content"
          title="Perbarui Status Koneksi"
        >
          <RefreshCw
            className={`h-4 w-4 ${loading ? "animate-spin text-base-content" : ""}`}
          />
        </button>

        {/* Settings Modal Button */}
        <button
          onClick={onOpenSettings}
          className="btn btn-primary btn-sm rounded-xl gap-1.5 shadow-sm text-primary-content font-semibold"
          title="Buka Pengaturan RadioBOSS"
        >
          <SettingsIcon className="h-4 w-4" />
          <span className="hidden sm:inline font-semibold">Pengaturan</span>
        </button>
      </div>
    </header>
  );
}
