"use client";

import React, { useState } from "react";
import Image from "next/image";
import {
  Search,
  Link as LinkIcon,
  Music2,
  Sparkles,
  Check,
  Clock,
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

export function SearchSection({
  onSelectTrack,
  onSearch,
  onResolveUrl,
  searchResults,
  isSearching,
  isResolving,
  selectedTrackId,
}: SearchSectionProps) {
  const [activeTab, setActiveTab] = useState<"search" | "url">("search");
  const [searchQuery, setSearchQuery] = useState("");
  const [directUrl, setDirectUrl] = useState("");

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      onSearch(searchQuery.trim());
    }
  };

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (directUrl.trim()) {
      onResolveUrl(directUrl.trim());
    }
  };

  return (
    <section className="card bg-base-200 border border-base-300 shadow-md">
      <div className="card-body p-4 sm:p-5">
        {/* Tab Switcher */}
        <div className="tabs tabs-box bg-base-300/50 p-1 rounded-2xl w-full flex">
          <button
            type="button"
            onClick={() => setActiveTab("search")}
            className={`tab flex-1 gap-2 text-xs sm:text-sm font-semibold rounded-xl transition-all ${
              activeTab === "search"
                ? "tab-active bg-primary text-primary-content shadow-sm"
                : "text-base-content/70 hover:text-base-content"
            }`}
          >
            <Sparkles className="h-4 w-4" />
            <span>Cari Studio Track</span>
            <span className="badge badge-accent badge-xs font-bold uppercase hidden sm:inline-flex">
              Official
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("url")}
            className={`tab flex-1 gap-2 text-xs sm:text-sm font-semibold rounded-xl transition-all ${
              activeTab === "url"
                ? "tab-active bg-primary text-primary-content shadow-sm"
                : "text-base-content/70 hover:text-base-content"
            }`}
          >
            <LinkIcon className="h-4 w-4" />
            <span>Paste Link URL</span>
          </button>
        </div>

        {/* Tab 1: YouTube Music Studio Search */}
        {activeTab === "search" && (
          <div className="mt-3 space-y-4">
            <form onSubmit={handleSearchSubmit} className="join w-full shadow-sm">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-base-content/40" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Ketik judul lagu atau nama artis..."
                  className="input input-bordered join-item w-full pl-10 bg-base-100 text-sm focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={isSearching || !searchQuery.trim()}
                className="btn btn-primary join-item px-5 text-sm font-semibold"
              >
                {isSearching ? (
                  <span className="loading loading-spinner loading-xs" />
                ) : (
                  "Cari"
                )}
              </button>
            </form>

            {/* Search Results List */}
            {searchResults.length > 0 && (
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between text-xs text-base-content/60 px-1">
                  <span className="font-medium">
                    Hasil Studio Master ({searchResults.length}):
                  </span>
                  <span className="badge badge-ghost badge-xs text-base-content/50">
                    Topic / Audio Master
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {searchResults.map((track) => {
                    const isSelected = selectedTrackId === track.video_id;
                    return (
                      <div
                        key={track.video_id}
                        onClick={() => onSelectTrack(track)}
                        className={`group relative flex cursor-pointer items-center gap-3 rounded-xl border p-2.5 transition-all ${
                          isSelected
                            ? "border-primary bg-primary/10 shadow-sm shadow-primary/10"
                            : "border-base-300 bg-base-100 hover:border-primary/40 hover:bg-base-300/40"
                        }`}
                      >
                        {/* Artwork */}
                        <div className="avatar shrink-0">
                          <div className="w-13 h-13 rounded-lg overflow-hidden bg-base-300">
                            {track.thumbnail_url ? (
                              <Image
                                src={track.thumbnail_url}
                                alt={track.title}
                                width={52}
                                height={52}
                                className="h-full w-full object-cover transition-transform group-hover:scale-105"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-base-content/40">
                                <Music2 className="h-5 w-5" />
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Text */}
                        <div className="min-w-0 flex-1">
                          <h4 className="truncate text-xs sm:text-sm font-semibold text-base-content group-hover:text-primary transition-colors">
                            {track.title}
                          </h4>
                          <p className="truncate text-xs text-base-content/70">
                            {track.artists.join(", ") || "Unknown Artist"}
                          </p>
                          <div className="mt-1 flex items-center gap-2 text-[10px] text-base-content/50">
                            {track.album && (
                              <span className="truncate max-w-[110px]">{track.album}</span>
                            )}
                            <span className="inline-flex items-center gap-0.5">
                              <Clock className="h-2.5 w-2.5" />
                              {track.duration_formatted}
                            </span>
                          </div>
                        </div>

                        {/* Select Icon */}
                        <div className="shrink-0 pr-1">
                          {isSelected ? (
                            <div className="badge badge-primary badge-circle h-6 w-6 p-0 flex items-center justify-center">
                              <Check className="h-3.5 w-3.5 stroke-[3]" />
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="btn btn-ghost btn-xs text-base-content/70 opacity-60 group-hover:opacity-100 group-hover:text-primary"
                            >
                              Pilih
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Direct URL Input */}
        {activeTab === "url" && (
          <div className="mt-3 space-y-3">
            <form onSubmit={handleUrlSubmit} className="join w-full shadow-sm">
              <div className="relative flex-1">
                <LinkIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-base-content/40" />
                <input
                  type="text"
                  value={directUrl}
                  onChange={(e) => setDirectUrl(e.target.value)}
                  placeholder="Paste URL YouTube / YT Music..."
                  className="input input-bordered join-item w-full pl-10 bg-base-100 text-sm focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={isResolving || !directUrl.trim()}
                className="btn btn-primary join-item px-5 text-sm font-semibold"
              >
                {isResolving ? (
                  <span className="loading loading-spinner loading-xs" />
                ) : (
                  "Proses Link"
                )}
              </button>
            </form>
            <p className="text-xs text-base-content/60 leading-relaxed">
              Mendukung link <code className="badge badge-neutral badge-xs">youtube.com/watch?v=...</code>,{" "}
              <code className="badge badge-neutral badge-xs">music.youtube.com/...</code>, atau shortlink{" "}
              <code className="badge badge-neutral badge-xs">youtu.be/...</code>.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
