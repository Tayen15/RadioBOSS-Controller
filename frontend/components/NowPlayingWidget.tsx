"use client";

import React from "react";
import { Disc, Play, Pause, Square, Users, Radio, Clock, SkipForward } from "lucide-react";
import { NowPlayingTrack, PlaybackAction } from "@/lib/types";

interface NowPlayingWidgetProps {
  nowPlaying: NowPlayingTrack | null | undefined;
  connected: boolean;
  autoRefresh: boolean;
  onToggleAutoRefresh: () => void;
  onControl?: (action: PlaybackAction) => Promise<void>;
  isControlling?: boolean;
}

function formatDisplayTitle(rawTitle?: string): string {
  if (!rawTitle) return "Tidak ada lagu aktif";
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
}: NowPlayingWidgetProps) {
  const isPlaying = nowPlaying?.status?.toLowerCase() === "playing";
  const isPaused = nowPlaying?.status?.toLowerCase() === "paused";
  const displayTitle = connected
    ? formatDisplayTitle(nowPlaying?.title)
    : "Menunggu koneksi ke RadioBOSS...";

  return (
    <section className="card rounded-2xl bg-base-200 border border-base-300 shadow-md">
      <div className="card-body p-4 sm:p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Left: Disc Icon & Track Metadata */}
          <div className="flex items-center gap-4 min-w-0">
            {/* Spinning Disc Avatar */}
            <div className="avatar shrink-0">
              <div
                className={`w-14 h-14 rounded-2xl bg-base-100 border border-base-300 flex items-center justify-center shadow-inner relative`}
              >
                <Disc
                  className={`h-8 w-8 text-base-content transition-all ${
                    isPlaying ? "animate-[spin_4s_linear_infinite]" : "opacity-40"
                  }`}
                />
                {isPlaying && (
                  <span className="absolute -top-1 -right-1 flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-success" />
                  </span>
                )}
              </div>
            </div>

            {/* Track Info */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full border border-base-300 bg-base-100 text-base-content text-[10px] font-bold uppercase tracking-wider">
                  <span className="h-1.5 w-1.5 rounded-full bg-error animate-pulse" />
                  Live On-Air
                </span>

                {/* Status Indicator */}
                {connected ? (
                  isPlaying ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border border-success/40 bg-success/15 text-success text-xs font-semibold">
                      <Play className="h-2.5 w-2.5 fill-current" />
                      Memutar
                    </span>
                  ) : isPaused ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border border-warning/40 bg-warning/15 text-warning text-xs font-semibold">
                      <Pause className="h-2.5 w-2.5 fill-current" />
                      Dijeda
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border border-base-300 bg-base-100 text-base-content/70 text-xs font-medium">
                      <Square className="h-2 w-2 fill-current text-base-content/40" />
                      Berhenti
                    </span>
                  )
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border border-error/40 bg-error/15 text-error text-xs font-semibold">
                    Offline
                  </span>
                )}
              </div>

              <h2
                className="mt-1 text-base sm:text-lg font-bold text-base-content tracking-tight truncate"
                title={displayTitle}
              >
                {displayTitle}
              </h2>

              <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-base-content/60">
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {nowPlaying?.position || "00:00"} / {nowPlaying?.duration || "00:00"}
                </span>

                {nowPlaying?.listeners !== undefined && nowPlaying.listeners > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {nowPlaying.listeners} Pendengar
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Right: Remote Transport & Auto-Refresh Controls */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0 self-start md:self-center">
            {/* Playback Transport Buttons */}
            {connected && onControl && (
              <div className="join bg-base-100 border border-base-300 rounded-xl p-0.5 shadow-sm">
                {/* Play / Pause */}
                {isPlaying ? (
                  <button
                    type="button"
                    onClick={() => onControl("pause")}
                    disabled={isControlling}
                    className="btn btn-warning btn-xs join-item gap-1 font-bold px-2.5 h-8"
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
                    className="btn btn-success btn-xs join-item gap-1 font-bold px-2.5 h-8 text-success-content"
                    title="Mulai Putar (Play)"
                  >
                    <Play className="h-3.5 w-3.5 fill-current" />
                    <span>Putar</span>
                  </button>
                )}

                {/* Skip / Next */}
                <button
                  type="button"
                  onClick={() => onControl("next")}
                  disabled={isControlling}
                  className="btn btn-ghost btn-xs join-item gap-1 px-2.5 h-8 hover:text-primary"
                  title="Lewati ke Lagu Berikutnya (Skip Next)"
                >
                  <SkipForward className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Lewati</span>
                </button>

                {/* Stop */}
                <button
                  type="button"
                  onClick={() => onControl("stop")}
                  disabled={isControlling}
                  className="btn btn-ghost btn-xs join-item gap-1 px-2.5 h-8 text-base-content/60 hover:text-error"
                  title="Hentikan Siaran (Stop)"
                >
                  <Square className="h-3 w-3 fill-current" />
                  <span className="hidden sm:inline">Stop</span>
                </button>
              </div>
            )}

            {/* Realtime Auto-Sync Toggle */}
            <label className="flex items-center gap-2 bg-base-100 border border-base-300 rounded-xl px-2.5 py-1.5 shadow-sm h-9 cursor-pointer">
              <span className="text-xs font-medium text-base-content/80 whitespace-nowrap">
                Realtime (1s)
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
      </div>
    </section>
  );
}
