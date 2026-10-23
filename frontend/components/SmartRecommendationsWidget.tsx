"use client";

import React, { useState, useEffect } from "react";
import {
  Sparkles,
  Radio,
  User,
  Plus,
  Play,
  Pause,
  RefreshCw,
  Clock,
  ExternalLink,
  Flame,
} from "lucide-react";
import { TrackItem } from "@/lib/types";
import { fetchRecommendations, fetchArtistTopTracks, getStreamRelayUrl } from "@/lib/api";

interface SmartRecommendationsWidgetProps {
  seedTrack: TrackItem | null;
  currentArtist?: string | null;
  onSelectTrack: (track: TrackItem) => void;
  onQueueTrack: (track: TrackItem, pos: number) => void;
  onAddToSet?: (track: TrackItem) => void;
  isQueueing: boolean;
}

export function SmartRecommendationsWidget({
  seedTrack,
  currentArtist,
  onSelectTrack,
  onQueueTrack,
  onAddToSet,
  isQueueing,
}: SmartRecommendationsWidgetProps) {
  const [activeTab, setActiveTab] = useState<"upnext" | "artist">("upnext");
  const [recommendations, setRecommendations] = useState<TrackItem[]>([]);
  const [artistTracks, setArtistTracks] = useState<TrackItem[]>([]);
  const [isLoadingRecs, setIsLoadingRecs] = useState<boolean>(false);
  const [isLoadingArtist, setIsLoadingArtist] = useState<boolean>(false);

  // Audio preview state
  const [previewTrackId, setPreviewTrackId] = useState<string | null>(null);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);

  const effectiveArtist =
    seedTrack?.artists?.[0] || currentArtist || "NIKI";

  // Fetch recommendations whenever seedTrack changes
  useEffect(() => {
    if (!seedTrack?.video_id) return;

    let isMounted = true;
    setIsLoadingRecs(true);

    fetchRecommendations(seedTrack.video_id, 8)
      .then((res) => {
        if (isMounted && res.success) {
          setRecommendations(res.results);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (isMounted) setIsLoadingRecs(false);
      });

    return () => {
      isMounted = false;
    };
  }, [seedTrack?.video_id]);

  // Fetch artist top tracks
  useEffect(() => {
    if (!effectiveArtist) return;

    let isMounted = true;
    setIsLoadingArtist(true);

    fetchArtistTopTracks(effectiveArtist, 6)
      .then((res) => {
        if (isMounted && res.success) {
          setArtistTracks(res.results);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (isMounted) setIsLoadingArtist(false);
      });

    return () => {
      isMounted = false;
    };
  }, [effectiveArtist]);

  const handleTogglePreview = (track: TrackItem) => {
    if (previewTrackId === track.video_id) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setPreviewTrackId(null);
    } else {
      setPreviewTrackId(track.video_id);
      if (audioRef.current) {
        audioRef.current.src = getStreamRelayUrl(track.video_id);
        audioRef.current.play().catch(() => {
          setPreviewTrackId(null);
        });
      }
    }
  };

  const handleAudioEnded = () => {
    setPreviewTrackId(null);
  };

  const refreshActiveTab = () => {
    if (activeTab === "upnext" && seedTrack?.video_id) {
      setIsLoadingRecs(true);
      fetchRecommendations(seedTrack.video_id, 8)
        .then((res) => setRecommendations(res.results))
        .catch(() => {})
        .finally(() => setIsLoadingRecs(false));
    } else if (activeTab === "artist" && effectiveArtist) {
      setIsLoadingArtist(true);
      fetchArtistTopTracks(effectiveArtist, 6)
        .then((res) => setArtistTracks(res.results))
        .catch(() => {})
        .finally(() => setIsLoadingArtist(false));
    }
  };

  const activeList = activeTab === "upnext" ? recommendations : artistTracks;
  const isLoading = activeTab === "upnext" ? isLoadingRecs : isLoadingArtist;

  return (
    <div className="card bg-base-200 border border-base-300 p-5 shadow-sm space-y-4">
      {/* Hidden audio element for preview */}
      <audio
        ref={audioRef}
        onEnded={handleAudioEnded}
        onError={() => setPreviewTrackId(null)}
        className="hidden"
      />

      {/* Header */}
      <div className="flex items-center justify-between border-b border-base-300 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary/10 text-secondary">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-base-content flex items-center gap-1.5">
              <span>Rekomendasi Cerdas</span>
              <span className="badge badge-secondary badge-xs scale-90">Auto Radio</span>
            </h3>
            <p className="text-[10px] text-base-content/60">
              Saran lagu berdasarkan vibe &amp; artis lagu aktif
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={refreshActiveTab}
          disabled={isLoading}
          className="btn btn-ghost btn-xs text-base-content/60 hover:text-base-content gap-1"
          title="Perbarui rekomendasi"
        >
          <RefreshCw className={`h-3 w-3 ${isLoading ? "animate-spin text-secondary" : ""}`} />
          <span className="text-[10px]">Refresh</span>
        </button>
      </div>

      {/* Tabs Switcher */}
      <div className="tabs tabs-box bg-base-300/50 p-1 rounded-xl flex gap-1">
        <button
          type="button"
          onClick={() => setActiveTab("upnext")}
          className={`tab flex-1 gap-1.5 text-[11px] font-semibold rounded-lg transition-all ${
            activeTab === "upnext"
              ? "tab-active bg-secondary text-secondary-content shadow-sm"
              : "text-base-content/70 hover:text-base-content"
          }`}
        >
          <Radio className="h-3 w-3" />
          <span className="truncate">Lagu Serupa (Up Next)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("artist")}
          className={`tab flex-1 gap-1.5 text-[11px] font-semibold rounded-lg transition-all ${
            activeTab === "artist"
              ? "tab-active bg-secondary text-secondary-content shadow-sm"
              : "text-base-content/70 hover:text-base-content"
          }`}
        >
          <User className="h-3 w-3" />
          <span className="truncate">Top {effectiveArtist}</span>
        </button>
      </div>

      {/* Content List */}
      {isLoading ? (
        <div className="py-8 text-center space-y-2">
          <span className="loading loading-spinner loading-sm text-secondary" />
          <p className="text-xs text-base-content/60">
            {activeTab === "upnext"
              ? "Menyesuaikan vibe & rekomendasi..."
              : `Mengambil lagu populer ${effectiveArtist}...`}
          </p>
        </div>
      ) : activeList.length === 0 ? (
        <div className="py-8 text-center space-y-1 bg-base-100/50 rounded-xl border border-dashed border-base-300">
          <Flame className="h-6 w-6 text-base-content/30 mx-auto" />
          <p className="text-xs text-base-content/60 font-medium">
            Belum ada rekomendasi lagu.
          </p>
          <p className="text-[10px] text-base-content/40">
            Pilih lagu di kolom kiri untuk memicu rekomendasi otomatis.
          </p>
        </div>
      ) : (
        <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
          {activeList.map((track) => {
            const isPlayingPreview = previewTrackId === track.video_id;
            return (
              <div
                key={track.video_id}
                className="group flex items-center justify-between gap-2.5 p-2 rounded-xl bg-base-100 hover:bg-base-300/40 border border-base-300/60 transition-colors"
              >
                {/* Track Thumbnail & Preview Trigger */}
                <div className="relative shrink-0 w-11 h-11 rounded-lg overflow-hidden bg-base-300">
                  {track.thumbnail_url ? (
                    <img
                      src={track.thumbnail_url}
                      alt={track.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-base-content/40 text-xs">
                      🎵
                    </div>
                  )}

                  {/* Headphone Preview Button Overlay */}
                  <button
                    type="button"
                    onClick={() => handleTogglePreview(track)}
                    className={`absolute inset-0 flex items-center justify-center bg-black/60 transition-opacity ${
                      isPlayingPreview
                        ? "opacity-100 text-secondary"
                        : "opacity-0 group-hover:opacity-100 text-white"
                    }`}
                    title={isPlayingPreview ? "Pause Headphone Preview" : "Dengarkan di Headphone"}
                  >
                    {isPlayingPreview ? (
                      <Pause className="h-4 w-4 fill-current animate-pulse" />
                    ) : (
                      <Play className="h-4 w-4 fill-current ml-0.5" />
                    )}
                  </button>
                </div>

                {/* Track Details */}
                <div
                  onClick={() => onSelectTrack(track)}
                  className="min-w-0 flex-1 cursor-pointer"
                  title="Klik untuk memilih ke Dispatch Deck"
                >
                  <h4 className="text-xs font-bold text-base-content truncate group-hover:text-primary transition-colors">
                    {track.title}
                  </h4>
                  <div className="flex items-center gap-2 text-[10px] text-base-content/60 truncate mt-0.5">
                    <span className="truncate">
                      {track.artists.join(", ") || "YouTube Music"}
                    </span>
                    {track.duration_formatted && (
                      <span className="shrink-0 flex items-center gap-0.5 text-base-content/40">
                        <Clock className="h-2.5 w-2.5" />
                        {track.duration_formatted}
                      </span>
                    )}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-1 shrink-0">
                  {onAddToSet && (
                    <button
                      type="button"
                      onClick={() => onAddToSet(track)}
                      className="btn btn-ghost btn-xs text-[10px] text-base-content/60 hover:text-accent p-1 h-7 min-h-0"
                      title="Simpan ke Playlist Set"
                    >
                      +Set
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => onQueueTrack(track, 1)}
                    disabled={isQueueing}
                    className="btn btn-ghost btn-xs text-[10px] text-secondary hover:bg-secondary/10 p-1.5 h-7 min-h-0 font-semibold"
                    title="Mainkan selanjutnya di RadioBOSS (pos=1)"
                  >
                    Next
                  </button>

                  <button
                    type="button"
                    onClick={() => onQueueTrack(track, -1)}
                    disabled={isQueueing}
                    className="btn btn-primary btn-xs text-[10px] gap-1 px-2 h-7 min-h-0 font-bold shadow-sm"
                    title="Tambahkan ke antrean paling bawah (pos=-1)"
                  >
                    <Plus className="h-3 w-3" />
                    <span>Antrean</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
