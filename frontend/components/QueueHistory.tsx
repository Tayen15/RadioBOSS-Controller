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
      <section
        aria-label="Riwayat Request"
        className="rounded-xl bg-base-200 border border-base-300 p-5 text-center space-y-1.5"
      >
        <History className="mx-auto h-6 w-6 text-base-content/60" />
        <h4 className="text-sm font-semibold text-base-content">
          Belum Ada Riwayat Pengiriman
        </h4>
        <p className="text-xs text-base-content/70">
          Lagu yang dikirimkan ke RadioBOSS pada sesi siaran ini akan tercatat di sini.
        </p>
      </section>
    );
  }

  return (
    <section
      aria-label="Riwayat Request"
      className="rounded-xl bg-base-200 border border-base-300 p-4 sm:p-5 space-y-3"
    >
      <div className="flex items-center justify-between border-b border-base-300 pb-2.5">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-primary" />
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-base-content">
                Log Pengiriman Lagu
              </h3>
              <span className="px-2 py-0.5 rounded bg-base-100 border border-base-300 font-mono text-xs font-semibold text-base-content/80">
                {history.length} terkirim
              </span>
            </div>
            <p className="text-[11px] text-base-content/60">
              Daftar lagu yang sukses dikirim ke antrean RadioBOSS
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClearHistory}
          className="btn btn-ghost btn-xs h-8 px-2.5 rounded-md text-xs font-semibold text-error hover:bg-error/15 gap-1.5"
          title="Bersihkan log riwayat lokal"
        >
          <Trash2 className="h-3.5 w-3.5" />
          <span>Bersihkan</span>
        </button>
      </div>

      <div className="divide-y divide-base-300 rounded-lg border border-base-300 bg-base-100 max-h-72 overflow-y-auto">
        {history.map((item, idx) => {
          const indexStr = String(idx + 1).padStart(2, "0");

          return (
            <div
              key={item.id}
              className="flex items-center justify-between py-2.5 px-3 gap-3 hover:bg-base-300/50 transition-colors"
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <span className="font-mono text-xs font-bold text-base-content/60 w-5 shrink-0">
                  {indexStr}
                </span>

                <div className="w-9 h-9 rounded-md overflow-hidden bg-base-300 border border-base-300 shrink-0">
                  {item.thumbnail_url ? (
                    <Image
                      src={item.thumbnail_url}
                      alt={item.title}
                      width={36}
                      height={36}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-base-content/60">
                      <Music2 className="h-4 w-4" />
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <h5 className="truncate text-xs sm:text-sm font-semibold text-base-content">
                    {item.title}
                  </h5>
                  <div className="flex items-center gap-2 text-xs text-base-content/70 mt-0.5">
                    <span className="truncate max-w-[140px]">
                      {item.artists.join(", ") || "Artis"}
                    </span>
                    <span>•</span>
                    <span className="inline-flex items-center gap-1 font-mono text-base-content/70 tabular-nums shrink-0">
                      <Clock className="h-3 w-3" />
                      <span>{item.timestamp}</span>
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span
                  className={`px-2 py-0.5 rounded font-mono text-xs font-semibold border ${
                    item.pos === 1
                      ? "bg-primary/15 border-primary/40 text-primary"
                      : "bg-base-200 border-base-300 text-base-content/80"
                  }`}
                >
                  {item.pos === 1 ? "NEXT" : "QUEUE"}
                </span>

                <button
                  type="button"
                  onClick={() => onRequeue(item)}
                  className="btn btn-xs h-8 px-2.5 rounded-md bg-base-200 border border-base-300 text-xs font-semibold text-base-content/80 hover:text-base-content hover:bg-base-300 gap-1"
                  title="Muat kembali lagu ini ke Cue Deck"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Muat</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
