"use client";

import React from "react";
import { ListMusic, RefreshCw, Calendar, AlertTriangle } from "lucide-react";
import { PlaylistItem } from "@/lib/types";

interface PlaylistQueueWidgetProps {
  tracks: PlaylistItem[];
  isLoading: boolean;
  onRefresh: () => void;
  connected: boolean;
}

export function PlaylistQueueWidget({
  tracks,
  isLoading,
  onRefresh,
  connected,
}: PlaylistQueueWidgetProps) {
  return (
    <section
      aria-label="Antrean Siaran RadioBOSS"
      className="rounded-xl bg-base-200 border border-base-300 p-4 sm:p-5 space-y-3"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-base-300 pb-2.5">
        <div className="flex items-center gap-2">
          <ListMusic className="h-4 w-4 text-primary shrink-0" />
          <h3 className="text-sm font-bold text-base-content">
            Antrean Siaran RadioBOSS
          </h3>
          <span className="px-2 py-0.5 rounded bg-base-100 border border-base-300 font-mono text-xs font-semibold text-base-content/80">
            {tracks.length} terjadwal
          </span>
        </div>

        <button
          type="button"
          onClick={onRefresh}
          disabled={isLoading || !connected}
          aria-label="Muat ulang antrean RadioBOSS"
          className="btn btn-ghost btn-xs h-8 w-8 p-0 rounded-md bg-base-100 border border-base-300 text-base-content/80 hover:text-base-content"
          title="Muat Ulang Antrean RadioBOSS"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${isLoading ? "animate-spin text-primary" : ""}`}
          />
        </button>
      </div>

      {/* Dead-Air Guard Warning Banner (no endless pulse per R-19) */}
      {connected && tracks.length <= 1 && (
        <div className="rounded-lg bg-warning/15 border border-warning/40 px-3 py-2.5 flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 font-bold text-warning">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>
              DEAD-AIR GUARD: Antrean tersisa {tracks.length} lagu.
            </span>
          </div>
          <span className="font-mono text-xs font-bold uppercase text-warning shrink-0">
            Segera Isi
          </span>
        </div>
      )}

      {/* Queue Rows */}
      {!connected ? (
        <div className="py-6 px-3 text-center text-xs text-base-content/70 rounded-lg bg-base-100 border border-base-300">
          Hubungkan RadioBOSS untuk memantau antrean lagu siaran secara langsung.
        </div>
      ) : tracks.length === 0 ? (
        <div className="py-6 px-3 text-center text-xs text-base-content/70 rounded-lg bg-base-100 border border-base-300 space-y-1">
          <p className="font-semibold text-base-content">
            Antrean Mendatang Kosong
          </p>
          <p>
            Pilih lagu di kiri lalu tekan tombol Putar Berikutnya atau Antrean Bawah di Cue Deck.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-base-300 rounded-lg border border-base-300 bg-base-100 max-h-72 overflow-y-auto">
          {tracks.map((item, idx) => {
            const indexStr = String(idx + 1).padStart(2, "0");
            const isUpNext = idx === 0;

            return (
              <div
                key={`${item.index}-${idx}`}
                className={`flex items-center justify-between gap-3 py-2.5 px-3 transition-colors ${
                  isUpNext ? "bg-primary/5" : "hover:bg-base-300/50"
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <span
                    className={`font-mono text-xs font-bold w-5 shrink-0 ${
                      isUpNext ? "text-primary" : "text-base-content/60"
                    }`}
                  >
                    {indexStr}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs sm:text-sm font-semibold text-base-content">
                      {item.display_title}
                    </p>
                    {item.start_time && (
                      <div className="flex items-center gap-1.5 text-xs text-base-content/70 font-mono mt-0.5">
                        <Calendar className="h-3 w-3 shrink-0" />
                        <span>Mulai {item.start_time}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {isUpNext && (
                    <span className="px-1.5 py-0.5 rounded bg-primary/15 border border-primary/40 text-primary font-mono text-xs font-bold">
                      NEXT
                    </span>
                  )}
                  {item.duration && (
                    <span className="font-mono text-xs text-base-content/80 tabular-nums">
                      {item.duration}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
