"use client";

import React, { useState } from "react";
import {
  Disc3,
  Play,
  Pause,
  Square,
  Users,
  SkipForward,
  Edit3,
  Wand2,
  Check,
  X,
} from "lucide-react";
import { NowPlayingTrack, PlaybackAction } from "@/lib/types";
import { cleanBroadcastTitle } from "@/lib/titleCleaner";
import { setLiveCastTitle } from "@/lib/api";

interface NowPlayingWidgetProps {
  nowPlaying: NowPlayingTrack | null | undefined;
  connected: boolean;
  autoRefresh: boolean;
  onToggleAutoRefresh: () => void;
  onControl?: (action: PlaybackAction) => Promise<void>;
  isControlling?: boolean;
  onUpdateCastTitle?: (newTitle: string) => Promise<void>;
}

function formatDisplayTitle(rawTitle?: string): string {
  if (!rawTitle) return "Tidak ada lagu aktif di deck RadioBOSS";
  const title = rawTitle.trim();
  if (
    title.startsWith("http://") ||
    title.startsWith("https://") ||
    title.includes("127.0.0.1") ||
    title.includes("/api/stream/")
  ) {
    return "Audio Stream Siaran Aktif";
  }
  return title;
}

export function NowPlayingWidget({
  nowPlaying,
  connected,
  autoRefresh,
  onToggleAutoRefresh,
  onControl,
  isControlling = false,
  onUpdateCastTitle,
}: NowPlayingWidgetProps) {
  const isPlaying = connected && nowPlaying?.status?.toLowerCase() === "playing";
  const isPaused = connected && nowPlaying?.status?.toLowerCase() === "paused";
  const displayTitle = connected
    ? formatDisplayTitle(nowPlaying?.title)
    : "Menunggu koneksi ke RadioBOSS...";

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState("");
  const [isUpdatingTitle, setIsUpdatingTitle] = useState(false);
  const [updateMsg, setUpdateMsg] = useState<string | null>(null);

  const handleStartEdit = () => {
    setEditedTitle(nowPlaying?.title || "");
    setUpdateMsg(null);
    setIsEditingTitle(true);
  };

  const handleApplyClean = () => {
    setEditedTitle((prev) => cleanBroadcastTitle(prev));
  };

  const handleSaveTitle = async () => {
    const trimmed = editedTitle.trim();
    if (!trimmed) return;
    setIsUpdatingTitle(true);
    setUpdateMsg(null);
    try {
      if (onUpdateCastTitle) {
        await onUpdateCastTitle(trimmed);
      } else {
        await setLiveCastTitle(trimmed);
      }
      setUpdateMsg("Judul siaran di RadioBOSS diperbarui.");
      setTimeout(() => {
        setIsEditingTitle(false);
        setUpdateMsg(null);
      }, 1400);
    } catch (e) {
      setUpdateMsg(
        e instanceof Error ? e.message : "Gagal mengubah judul siaran."
      );
    } finally {
      setIsUpdatingTitle(false);
    }
  };

  return (
    <section
      aria-label="Master On-Air Monitor"
      className="rounded-xl bg-base-200 border border-base-300 p-3 sm:p-4"
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        {/* Left & Center: Recessed Digital On-Air Readout */}
        <div className="flex-1 min-w-0 rounded-lg bg-base-100 border border-base-300 px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {/* State-driven Broadcast Disc Indicator (spins only when actually playing) */}
            <div className="h-11 w-11 rounded-lg bg-base-200 border border-base-300 flex items-center justify-center shrink-0">
              <Disc3
                className={`h-6 w-6 transition-colors ${
                  isPlaying
                    ? "text-primary animate-[spin_4s_linear_infinite]"
                    : "text-base-content/60"
                }`}
              />
            </div>

            <div className="min-w-0 flex-1">
              {/* Real Broadcast State Row (R-19 / R-31: only shows ON AIR when playing) */}
              <div className="flex items-center gap-2 flex-wrap">
                {isPlaying ? (
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-error/15 border border-error/40 text-error text-xs font-mono font-bold uppercase tracking-wider">
                    <span className="h-2 w-2 rounded-full bg-error animate-pulse" />
                    <span>ON AIR</span>
                  </span>
                ) : isPaused ? (
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-warning/15 border border-warning/40 text-warning text-xs font-mono font-bold uppercase tracking-wider">
                    <Pause className="h-3 w-3 fill-current" />
                    <span>STANDBY / DIJEDA</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-base-200 border border-base-300 text-base-content/70 text-xs font-mono font-semibold uppercase tracking-wider">
                    <Square className="h-2.5 w-2.5 fill-current" />
                    <span>{connected ? "IDLE / BERHENTI" : "OFFLINE"}</span>
                  </span>
                )}

                {nowPlaying?.listeners !== undefined && nowPlaying.listeners > 0 && (
                  <span className="inline-flex items-center gap-1 text-xs font-mono text-base-content/70">
                    <Users className="h-3.5 w-3.5" />
                    <span>{nowPlaying.listeners} pendengar</span>
                  </span>
                )}
              </div>

              {/* Track Title or Inline Broadcast Title Editor */}
              {isEditingTitle ? (
                <div className="mt-2 space-y-1.5">
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <input
                      type="text"
                      value={editedTitle}
                      onChange={(e) => setEditedTitle(e.target.value)}
                      placeholder="Ubah judul siaran (contoh: NIKI - Backburner)"
                      className="input input-sm input-bordered bg-base-200 flex-1 text-xs font-semibold rounded-lg h-9"
                      autoFocus
                    />
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={handleApplyClean}
                        className="btn btn-xs h-9 px-2.5 rounded-lg bg-base-200 border border-base-300 hover:bg-base-300 text-warning gap-1 text-xs font-semibold"
                        title="Hapus otomatis tag (2008 Remastered), (Official Video), dll"
                      >
                        <Wand2 className="h-3.5 w-3.5" />
                        <span>Bersihkan</span>
                      </button>
                      <button
                        type="button"
                        disabled={isUpdatingTitle || !editedTitle.trim()}
                        onClick={handleSaveTitle}
                        className="btn btn-xs btn-primary h-9 px-3 rounded-lg text-primary-content gap-1 text-xs font-bold"
                        title="Kirim perubahan ke encoder siaran RadioBOSS"
                      >
                        {isUpdatingTitle ? (
                          <span className="loading loading-spinner loading-xs" />
                        ) : (
                          <Check className="h-3.5 w-3.5" />
                        )}
                        <span>Simpan</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsEditingTitle(false);
                          setUpdateMsg(null);
                        }}
                        className="btn btn-xs btn-ghost h-9 w-9 p-0 rounded-lg text-base-content/70 hover:text-base-content"
                        title="Batal"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  {updateMsg && (
                    <p
                      className={`text-xs font-medium ${
                        updateMsg.includes("diperbarui") ||
                        updateMsg.includes("berhasil")
                          ? "text-success"
                          : "text-error"
                      }`}
                    >
                      {updateMsg}
                    </p>
                  )}
                </div>
              ) : (
                <div className="mt-1 flex items-center gap-2 min-w-0">
                  <h2
                    className="text-base sm:text-lg font-bold text-base-content tracking-tight truncate min-w-0"
                    title={displayTitle}
                  >
                    {displayTitle}
                  </h2>
                  {connected && (
                    <button
                      type="button"
                      onClick={handleStartEdit}
                      className="btn btn-ghost btn-xs h-7 px-2 rounded-md shrink-0 text-base-content/70 hover:text-primary hover:bg-base-200 gap-1 text-xs font-medium"
                      title="Ubah judul siaran on-air (setcasttitle)"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      <span className="hidden md:inline">Ubah Judul</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right inside LCD: Tabular Timecode Readout (Identity Motif) */}
          <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center border-t sm:border-t-0 sm:border-l border-base-300 pt-2 sm:pt-0 sm:pl-4 shrink-0">
            <span className="text-xs font-mono uppercase tracking-wider text-base-content/70">
              Timecode
            </span>
            <div className="font-mono text-sm sm:text-base font-bold tabular-nums tracking-tight">
              <span className="text-primary">
                {nowPlaying?.position || "00:00"}
              </span>
              <span className="text-base-content/60 mx-1">/</span>
              <span className="text-base-content/80">
                {nowPlaying?.duration && nowPlaying.duration !== "00:00"
                  ? nowPlaying.duration
                  : "--:--"}
              </span>
            </div>
          </div>
        </div>

        {/* Right: Physical Transport Keys & Auto-Sync Switch */}
        <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2 shrink-0">
          {connected && onControl && (
            <div className="join bg-base-100 border border-base-300 rounded-lg p-0.5">
              {isPlaying ? (
                <button
                  type="button"
                  onClick={() => onControl("pause")}
                  disabled={isControlling}
                  className="btn btn-warning btn-sm join-item h-9 px-3 gap-1.5 font-bold text-xs text-warning-content"
                  title="Jeda Siaran (Pause)"
                >
                  <Pause className="h-3.5 w-3.5 fill-current" />
                  <span>Jeda</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onControl("play")}
                  disabled={isControlling}
                  className="btn btn-success btn-sm join-item h-9 px-3 gap-1.5 font-bold text-xs text-success-content"
                  title="Mulai Putar (Play)"
                >
                  <Play className="h-3.5 w-3.5 fill-current" />
                  <span>Putar</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => onControl("next")}
                disabled={isControlling}
                className="btn btn-ghost btn-sm join-item h-9 px-3 gap-1.5 text-xs font-semibold text-base-content hover:text-primary"
                title="Lewati ke Lagu Berikutnya (Skip Next)"
              >
                <SkipForward className="h-3.5 w-3.5" />
                <span>Lewati</span>
              </button>

              <button
                type="button"
                onClick={() => onControl("stop")}
                disabled={isControlling}
                className="btn btn-ghost btn-sm join-item h-9 px-3 gap-1.5 text-xs font-semibold text-base-content/80 hover:text-error"
                title="Hentikan Siaran (Stop)"
              >
                <Square className="h-3 w-3 fill-current" />
                <span>Stop</span>
              </button>
            </div>
          )}

          {/* Realtime 1s Sync Switch */}
          <label
            className="flex items-center gap-2 bg-base-100 border border-base-300 rounded-lg px-3 h-10 cursor-pointer select-none"
            title="Sinkronisasi status RadioBOSS setiap 1 detik"
          >
            <span className="text-xs font-mono font-semibold text-base-content/80 whitespace-nowrap">
              SYNC 1s
            </span>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={onToggleAutoRefresh}
              className="toggle toggle-primary toggle-sm shrink-0"
            />
          </label>
        </div>
      </div>
    </section>
  );
}
