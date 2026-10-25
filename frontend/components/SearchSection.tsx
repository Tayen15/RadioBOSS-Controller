"use client";

import React, { useState } from "react";
import Image from "next/image";
import {
  Search,
  Link as LinkIcon,
  Music2,
  Check,
  Disc3,
  X,
} from "lucide-react";
import { TrackItem } from "@/lib/types";

interface SearchSectionProps {
  onSelectTrack: (track: TrackItem) => void;
  onSearch: (query: string) => Promise<void>;
  onResolveUrl: (url: string) => Promise<void>;
  searchResults: TrackItem[];
  isSearching: boolean;
  isResolving: boolean;
  selectedTrackId?: string;
}

function isDirectYouTubeUrl(value: string): boolean {
  const trimmed = value.trim().toLowerCase();
  return (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.includes("youtube.com/") ||
    trimmed.includes("music.youtube.com/") ||
    trimmed.includes("youtu.be/")
  );
}

export function SearchSection({
  onSelectTrack,
  onSearch,
  onResolveUrl,
  searchResults,
  isSearching,
  isResolving,
  selectedTrackId,
}: SearchSectionProps) {
  const [inputValue, setInputValue] = useState("");
  const isUrlMode = isDirectYouTubeUrl(inputValue);
  const isBusy = isSearching || isResolving;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputValue.trim();
    if (!trimmed) return;

    if (isDirectYouTubeUrl(trimmed)) {
      onResolveUrl(trimmed);
    } else {
      onSearch(trimmed);
    }
  };

  return (
    <section
      aria-label="Pencarian Katalog Studio"
      className="rounded-xl bg-base-200 border border-base-300 p-4 sm:p-5 space-y-4"
    >
      {/* Header & Mode Indicator */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-base-content tracking-tight">
            Pencarian Katalog &amp; Ekstraktor URL
          </h3>
          <p className="text-xs text-base-content/70">
            Ketik judul atau artis untuk mencari rilis resmi YouTube Music, atau tempel tautan langsung.
          </p>
        </div>

        <span className="font-mono text-xs text-base-content/70 px-2.5 py-1 rounded-md bg-base-100 border border-base-300">
          {isUrlMode ? "MODE: URL LANGSUNG" : "MODE: STUDIO MASTER"}
        </span>
      </div>

      {/* Unified Smart Omnibox */}
      <form onSubmit={handleSubmit} className="flex items-stretch gap-2">
        <div className="relative flex-1 min-w-0">
          {isUrlMode ? (
            <LinkIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-accent" />
          ) : (
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-base-content/60" />
          )}
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Cari judul lagu, nama artis, atau tempel link YouTube / YT Music..."
            className="input input-bordered w-full h-11 pl-10 pr-9 bg-base-100 border-base-300 rounded-lg text-sm text-base-content placeholder:text-base-content/60"
          />
          {inputValue && (
            <button
              type="button"
              onClick={() => setInputValue("")}
              aria-label="Bersihkan pencarian"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 h-6 w-6 rounded flex items-center justify-center text-base-content/60 hover:text-base-content hover:bg-base-300"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <button
          type="submit"
          disabled={isBusy || !inputValue.trim()}
          className="btn btn-primary h-11 px-5 rounded-lg text-sm font-bold text-primary-content shrink-0"
        >
          {isBusy ? (
            <>
              <span className="loading loading-spinner loading-xs" />
              <span>{isUrlMode ? "Mengekstrak..." : "Mencari..."}</span>
            </>
          ) : isUrlMode ? (
            "Ekstrak URL"
          ) : (
            "Cari Lagu"
          )}
        </button>
      </form>

      {/* Single-Column Studio Tracklist Results */}
      {isSearching ? (
        <div className="py-8 text-center space-y-2 rounded-lg bg-base-100 border border-base-300">
          <span className="loading loading-spinner loading-sm text-primary" />
          <p className="text-xs text-base-content/70">
            Memindai katalog studio master YouTube Music...
          </p>
        </div>
      ) : searchResults.length > 0 ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-base-content/70 px-1">
            <span className="font-semibold text-base-content">
              Hasil Katalog Studio ({searchResults.length} lagu)
            </span>
            <span className="font-mono">Klik baris untuk memuat ke Cue Deck</span>
          </div>

          <div className="divide-y divide-base-300 rounded-lg border border-base-300 bg-base-100 overflow-hidden">
            {searchResults.map((track, index) => {
              const isSelected = selectedTrackId === track.video_id;
              const indexStr = String(index + 1).padStart(2, "0");

              return (
                <div
                  key={track.video_id}
                  onClick={() => onSelectTrack(track)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelectTrack(track);
                    }
                  }}
                  className={`group flex items-center justify-between gap-3 px-3 py-2.5 cursor-pointer transition-colors ${
                    isSelected
                      ? "bg-primary/10 border-l-2 border-l-primary"
                      : "hover:bg-base-300/60"
                  }`}
                >
                  {/* Left: Tabular Index + Artwork + Full Title/Artist */}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span
                      className={`font-mono text-xs font-bold w-5 shrink-0 ${
                        isSelected ? "text-primary" : "text-base-content/60"
                      }`}
                    >
                      {indexStr}
                    </span>

                    <div className="w-11 h-11 rounded-md overflow-hidden bg-base-300 border border-base-300 shrink-0">
                      {track.thumbnail_url ? (
                        <Image
                          src={track.thumbnail_url}
                          alt={track.title}
                          width={44}
                          height={44}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-base-content/60">
                          <Music2 className="h-4 w-4" />
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <h4 className="text-sm font-semibold text-base-content truncate">
                        {track.title}
                      </h4>
                      <div className="flex items-center gap-1.5 text-xs text-base-content/70 truncate mt-0.5">
                        <span className="font-medium text-base-content/80 truncate">
                          {track.artists.join(", ") || "Artis Tidak Diketahui"}
                        </span>
                        {track.album && (
                          <>
                            <span className="text-base-content/60">•</span>
                            <span
                              className="truncate text-base-content/70"
                              title={track.album}
                            >
                              {track.album}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Tabular Duration + Cue Status */}
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-mono text-xs font-medium text-base-content/80 tabular-nums">
                      {track.duration_formatted}
                    </span>

                    {isSelected ? (
                      <span className="inline-flex items-center gap-1 px-2.5 h-8 rounded-md bg-primary text-primary-content text-xs font-bold">
                        <Check className="h-3.5 w-3.5 stroke-[2.5]" />
                        <span>Di Cue</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 h-8 rounded-md bg-base-200 border border-base-300 text-xs font-semibold text-base-content/80 group-hover:border-primary/50 group-hover:text-base-content transition-colors">
                        Muat Cue
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="rounded-lg bg-base-100 border border-base-300 px-4 py-4 flex items-center justify-between gap-3 text-xs text-base-content/70">
          <div className="flex items-center gap-2.5">
            <Disc3 className="h-4 w-4 text-base-content/60 shrink-0" />
            <span>
              Belum ada hasil pencarian aktif. Ketik judul lagu di atas atau pilih dari tab rekomendasi di bawah.
            </span>
          </div>
          <span className="hidden sm:inline font-mono text-base-content/60 shrink-0">
            320kbps CBR Relay
          </span>
        </div>
      )}
    </section>
  );
}
