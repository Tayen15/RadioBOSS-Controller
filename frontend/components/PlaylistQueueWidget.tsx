"use client";

import React from "react";
import { ListMusic, RefreshCw, Clock, Calendar, AlertTriangle } from "lucide-react";
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
    <section className="card bg-base-200 border border-base-300 shadow-md">
      <div className="card-body p-4 sm:p-5 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-base-300 pb-2.5">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ListMusic className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-base-content flex items-center gap-2">
                <span>Antrean Siaran RadioBOSS</span>
                <span className="badge badge-accent badge-xs font-semibold">
                  {tracks.length} Terjadwal
                </span>
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading || !connected}
            className="btn btn-ghost btn-circle btn-xs text-base-content/60 hover:text-base-content"
            title="Muat Ulang Antrean RadioBOSS"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isLoading ? "animate-spin text-primary" : ""}`}
            />
          </button>
        </div>

        {/* Dead-Air Guard Warning Banner */}
        {connected && tracks.length <= 1 && (
          <div className="alert alert-warning text-xs py-2 px-3 rounded-xl flex items-center justify-between gap-2 shadow-sm animate-pulse">
            <div className="flex items-center gap-2 font-bold text-warning-content">
              <AlertTriangle className="h-4 w-4 shrink-0 text-warning-content" />
              <span>DEAD-AIR GUARD: Antrean menipis ({tracks.length} lagu tersisa)!</span>
            </div>
            <span className="badge badge-warning bg-warning-content/20 text-warning-content border border-warning-content/30 badge-xs font-bold uppercase tracking-wider">
              Antrekan Lagu
            </span>
          </div>
        )}

        {/* Content */}
        {!connected ? (
          <div className="py-6 text-center text-xs text-base-content/50">
            Hubungkan RadioBOSS untuk melihat antrean lagu siaran.
          </div>
        ) : tracks.length === 0 ? (
          <div className="py-6 text-center text-xs text-base-content/50 space-y-1">
            <p>Tidak ada lagu antrean mendatang di playlist RadioBOSS.</p>
            <p className="text-[11px] text-base-content/40">
              Kirim lagu menggunakan tombol <em>Putar Berikutnya</em> atau <em>Antrean Bawah</em>.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-base-300/60 max-h-72 overflow-y-auto pr-1 space-y-1">
            {tracks.map((item, idx) => (
              <div
                key={`${item.index}-${idx}`}
                className="flex items-center justify-between gap-3 py-2 px-1 hover:bg-base-300/30 rounded-lg transition-colors group"
              >
                {/* Index Number */}
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-base-300 text-[10px] font-bold text-base-content/70">
                    {idx + 1}
                  </span>

                  {/* Title & Artist */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-base-content group-hover:text-primary transition-colors">
                      {item.display_title}
                    </p>
                    <div className="flex items-center gap-2 text-[10px] text-base-content/50">
                      {item.start_time && (
                        <span className="inline-flex items-center gap-0.5">
                          <Calendar className="h-2.5 w-2.5" />
                          {item.start_time}
                        </span>
                      )}
                      {item.duration && (
                        <span className="inline-flex items-center gap-0.5">
                          <Clock className="h-2.5 w-2.5" />
                          {item.duration}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Status indicator */}
                <span className="badge badge-ghost badge-xs text-[10px] shrink-0">
                  Berikutnya
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
