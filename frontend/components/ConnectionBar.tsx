"use client";

import React from "react";
import {
  Radio,
  Server,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Settings as SettingsIcon,
} from "lucide-react";
import { RadioBOSSStatus } from "@/lib/types";

interface ConnectionBarProps {
  backendOnline: boolean;
  radioBossStatus: RadioBOSSStatus | null;
  loading: boolean;
  onRefresh: () => void;
  onOpenSettings: () => void;
}

export function ConnectionBar({
  backendOnline,
  radioBossStatus,
  loading,
  onRefresh,
  onOpenSettings,
}: ConnectionBarProps) {
  const isRadioConnected = radioBossStatus?.connected ?? false;

  return (
    <header className="navbar bg-base-200/90 backdrop-blur-md border-b border-base-300 px-4 sm:px-6 sticky top-0 z-30 justify-between">
      {/* Brand & Title */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-content shadow-md shadow-primary/20">
          <Radio className="h-5 w-5" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-base sm:text-lg font-bold tracking-tight text-base-content">
              Radio Caster Bridge
            </span>
            <span className="badge badge-primary badge-outline badge-xs font-semibold uppercase tracking-wider hidden sm:inline-flex">
              v2.0 Standalone
            </span>
          </div>
          <p className="text-xs text-base-content/60">
            YouTube Music Studio Streamer &amp; RadioBOSS Controller
          </p>
        </div>
      </div>

      {/* Status Badges & Controls */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Backend Status */}
        <div
          className={`badge badge-sm gap-1.5 py-3 px-3 border ${
            backendOnline
              ? "badge-success/15 border-success/30 text-success"
              : "badge-error/15 border-error/30 text-error"
          }`}
        >
          <Server className="h-3 w-3" />
          <span className="hidden sm:inline font-medium">Backend:</span>
          {backendOnline ? (
            <span className="inline-flex items-center gap-1 font-semibold">
              <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
              Online
            </span>
          ) : (
            <span className="font-semibold">Offline</span>
          )}
        </div>

        {/* RadioBOSS Status */}
        <div
          className={`badge badge-sm gap-1.5 py-3 px-3 border ${
            isRadioConnected
              ? "badge-success/15 border-success/30 text-success"
              : "badge-warning/15 border-warning/30 text-warning"
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
          className="btn btn-ghost btn-circle btn-sm"
          title="Perbarui Status Koneksi"
        >
          <RefreshCw
            className={`h-4 w-4 ${loading ? "animate-spin text-primary" : "text-base-content/70"}`}
          />
        </button>

        {/* Settings Modal Button */}
        <button
          onClick={onOpenSettings}
          className="btn btn-primary btn-sm gap-1.5 shadow-sm"
          title="Buka Pengaturan RadioBOSS"
        >
          <SettingsIcon className="h-4 w-4" />
          <span className="hidden sm:inline font-semibold">Pengaturan</span>
        </button>
      </div>
    </header>
  );
}
