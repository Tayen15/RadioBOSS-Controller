"use client";

import React from "react";
import Image from "next/image";
import { History, Trash2, RotateCcw, Clock, Music2 } from "lucide-react";
import { HistoryItem } from "@/lib/types";

interface QueueHistoryProps {
  history: HistoryItem[];
  onClearHistory: () => void;
  onRequeue: (item: HistoryItem) => void;
}

export function QueueHistory({
  history,
  onClearHistory,
  onRequeue,
}: QueueHistoryProps) {
  if (history.length === 0) {
    return (
      <div className="card bg-base-200 border border-base-300 shadow-sm p-6 text-center">
        <History className="mx-auto h-7 w-7 text-base-content/30" />
        <h4 className="mt-2 text-sm font-semibold text-base-content/80">
          Belum Ada Riwayat Antrean
        </h4>
        <p className="mt-0.5 text-xs text-base-content/50">
          Lagu yang dikirimkan ke RadioBOSS pada sesi ini akan muncul di sini.
        </p>
      </div>
    );
  }

  return (
    <section className="card bg-base-200 border border-base-300 shadow-md">
      <div className="card-body p-4 sm:p-5">
        <div className="flex items-center justify-between border-b border-base-300 pb-3">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-bold text-base-content tracking-tight">
              Riwayat Request ({history.length})
            </h3>
          </div>

          <button
            onClick={onClearHistory}
            className="btn btn-ghost btn-xs text-error gap-1 hover:bg-error/15"
            title="Bersihkan riwayat request lokal"
          >
            <Trash2 className="h-3 w-3" />
            <span>Bersihkan</span>
          </button>
        </div>

        <div className="divide-y divide-base-300/60 mt-1">
          {history.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between py-2.5 gap-3 hover:bg-base-300/40 px-2 rounded-xl transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                {/* Thumbnail */}
                <div className="avatar shrink-0">
                  <div className="w-10 h-10 rounded-lg overflow-hidden bg-base-300">
                    {item.thumbnail_url ? (
                      <Image
                        src={item.thumbnail_url}
                        alt={item.title}
                        width={40}
                        height={40}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-base-content/40">
                        <Music2 className="h-4 w-4" />
                      </div>
                    )}
                  </div>
                </div>

                {/* Info */}
                <div className="min-w-0">
                  <h5 className="truncate text-xs sm:text-sm font-semibold text-base-content">
                    {item.title}
                  </h5>
                  <div className="flex items-center gap-2 text-[11px] text-base-content/60">
                    <span className="truncate max-w-[130px]">
                      {item.artists.join(", ") || "Unknown Artist"}
                    </span>
                    <span>•</span>
                    <span className="inline-flex items-center gap-0.5 text-base-content/50">
                      <Clock className="h-2.5 w-2.5" />
                      {item.timestamp}
                    </span>
                  </div>
                </div>
              </div>

              {/* Badges & Requeue Action */}
              <div className="flex items-center gap-2 shrink-0">
                <span
                  className={`badge badge-xs font-semibold ${
                    item.pos === 1
                      ? "badge-primary badge-outline"
                      : "badge-secondary badge-outline"
                  }`}
                >
                  {item.pos === 1 ? "Next" : "Queue"}
                </span>

                <button
                  onClick={() => onRequeue(item)}
                  className="btn btn-ghost btn-circle btn-xs text-base-content/70 hover:text-primary"
                  title="Kirim ulang ke RadioBOSS"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
