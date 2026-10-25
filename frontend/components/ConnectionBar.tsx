"use client";

import React from "react";
import Image from "next/image";
import {
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Settings as SettingsIcon,
  Radio,
  Download,
} from "lucide-react";
import { RadioBOSSStatus, APP_VERSION } from "@/lib/types";

interface ConnectionBarProps {
  radioBossStatus: RadioBOSSStatus | null;
  loading: boolean;
  onRefresh: () => void;
  onOpenSettings: () => void;
  onOpenUpdateModal?: () => void;
  updateAvailable?: boolean;
  latestVersion?: string;
}

export function ConnectionBar({
  radioBossStatus,
  loading,
  onRefresh,
  onOpenSettings,
  onOpenUpdateModal,
  updateAvailable,
  latestVersion,
}: ConnectionBarProps) {
  const isRadioConnected = radioBossStatus?.connected ?? false;

  return (
    <header className="bg-base-200 border-b border-base-300 px-4 sm:px-6 py-2.5 sticky top-0 z-30">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
        {/* Console Brand & Version Readout */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative h-9 w-9 rounded-lg overflow-hidden border border-base-300 bg-base-100 shrink-0">
            <Image
              src="/logo.png"
              alt="Radio Caster Bridge Logo"
              width={36}
              height={36}
              className="h-full w-full object-cover"
              priority={true}
            />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm sm:text-base font-bold tracking-tight text-base-content truncate">
                Radio Caster Bridge
              </span>
              <span className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded bg-base-100 border border-base-300 font-mono text-xs text-base-content/70">
                v{APP_VERSION}
              </span>
            </div>
            <p className="text-xs text-base-content/70 hidden md:block truncate">
              YouTube Music Studio Deck &amp; RadioBOSS Controller
            </p>
          </div>
        </div>

        {/* Hardware Status & System Controls */}
        <div className="flex items-center gap-2">
          {/* RadioBOSS Link Readout */}
          <div
            className={`inline-flex items-center gap-1.5 px-3 h-9 rounded-lg border text-xs font-semibold ${
              isRadioConnected
                ? "bg-success/10 border-success/40 text-success"
                : "bg-warning/10 border-warning/40 text-warning"
            }`}
            title={radioBossStatus?.error || "Status koneksi RadioBOSS Web Remote API"}
          >
            <Radio className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden sm:inline text-base-content/80 font-medium">
              RadioBOSS:
            </span>
            {isRadioConnected ? (
              <span className="inline-flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                <span>Terhubung</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                <span>Terputus</span>
              </span>
            )}
          </div>

          {/* Refresh Status Key */}
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            aria-label="Perbarui status koneksi"
            className="btn btn-sm h-9 w-9 p-0 rounded-lg bg-base-100 border border-base-300 text-base-content/80 hover:text-base-content hover:bg-base-300"
            title="Perbarui Status Koneksi"
          >
            <RefreshCw
              className={`h-4 w-4 ${loading ? "animate-spin text-primary" : ""}`}
            />
          </button>

          {/* Update Notification Button */}
          {updateAvailable && onOpenUpdateModal && (
            <button
              type="button"
              onClick={onOpenUpdateModal}
              className="btn btn-sm h-9 rounded-lg bg-info/15 border border-info/40 text-info hover:bg-info/25 gap-1.5 text-xs font-semibold px-3"
              title={`Versi baru v${latestVersion || ""} tersedia. Klik untuk memasang.`}
            >
              <Download className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden sm:inline font-mono">v{latestVersion}</span>
              <span className="sm:hidden">Update</span>
            </button>
          )}

          {/* System Settings Key */}
          <button
            type="button"
            onClick={onOpenSettings}
            className="btn btn-sm h-9 rounded-lg bg-secondary border border-base-300 hover:bg-base-300 text-secondary-content gap-1.5 px-3 text-xs font-semibold"
            title="Buka Pengaturan RadioBOSS & Penyimpanan"
          >
            <SettingsIcon className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">Pengaturan</span>
          </button>
        </div>
      </div>
    </header>
  );
}
