"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import {
  Sparkles,
  Radio,
  User,
  Plus,
  Play,
  Pause,
  RefreshCw,
  Clock,
  Flame,
  Zap,
  Smile,
  Check,
} from "lucide-react";
import { TrackItem, PlaylistSet } from "@/lib/types";
import {
  fetchRecommendations,
  fetchArtistTopTracks,
  fetchMoodTracks,
  getStreamRelayUrl,
  fetchPlaylistSets,
  addTrackToPlaylistSet,
} from "@/lib/api";

interface SmartRecommendationsWidgetProps {
  seedTrack: TrackItem | null;
  currentArtist?: string | null;
  onSelectTrack: (track: TrackItem) => void;
  onQueueTrack: (track: TrackItem, pos: number) => void;
  isQueueing: boolean;
}

const MOOD_OPTIONS = [
  { id: "morning", label: "☀️ Semangat", query: "indonesia pop hits upbeat semangat" },
  { id: "chill", label: "☕ Santai", query: "chill acoustic pop indonesia" },
  { id: "tophits", label: "🇮🇩 Top Indo", query: "lagu pop indonesia terbaru hits" },
  { id: "melow", label: "💔 Galau", query: "lagu galau indonesia viral sedih" },
  { id: "nostalgia", label: "📻 2000s", query: "pop indonesia hits tahun 2000an" },
];

export function SmartRecommendationsWidget({
  seedTrack,
  currentArtist,
  onSelectTrack,
  onQueueTrack,
  isQueueing,
}: SmartRecommendationsWidgetProps) {
  const [activeTab, setActiveTab] = useState<"upnext" | "artist" | "mood">("upnext");
  const [recommendations, setRecommendations] = useState<TrackItem[]>([]);
  const [artistTracks, setArtistTracks] = useState<TrackItem[]>([]);
  const [moodTracks, setMoodTracks] = useState<TrackItem[]>([]);
  const [selectedMoodId, setSelectedMoodId] = useState<string>("morning");

  const [isLoadingRecs, setIsLoadingRecs] = useState<boolean>(false);
  const [isLoadingArtist, setIsLoadingArtist] = useState<boolean>(false);
  const [isLoadingMood, setIsLoadingMood] = useState<boolean>(false);

  // Audio preview state
  const [previewTrackId, setPreviewTrackId] = useState<string | null>(null);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);

  // Auto-fill state
  const [isAutoFilling, setIsAutoFilling] = useState<boolean>(false);

  // Save to set dropdown state
  const [sets, setSets] = useState<PlaylistSet[]>([]);
  const [activeSetDropdownTrackId, setActiveSetDropdownTrackId] = useState<string | null>(null);
  const [addedSetNotice, setAddedSetNotice] = useState<string | null>(null);

  const effectiveArtist =
    seedTrack?.artists?.[0] || currentArtist || "NIKI";

  const [prevSeedId, setPrevSeedId] = useState<string | null>(null);
  const [prevArtist, setPrevArtist] = useState<string | null>(null);
  const [prevMoodKey, setPrevMoodKey] = useState<string | null>(null);

  // Synchronize loading states during render phase (avoids cascading render warning in effects)
  if (seedTrack?.video_id && seedTrack.video_id !== prevSeedId) {
    setPrevSeedId(seedTrack.video_id);
    setIsLoadingRecs(true);
  } else if (!seedTrack?.video_id && prevSeedId !== null) {
    setPrevSeedId(null);
    setIsLoadingRecs(false);
  }

  if (effectiveArtist && effectiveArtist !== prevArtist) {
    setPrevArtist(effectiveArtist);
    setIsLoadingArtist(true);
  }

  const activeMoodKey = activeTab === "mood" ? selectedMoodId : null;
  if (activeMoodKey && activeMoodKey !== prevMoodKey) {
    setPrevMoodKey(activeMoodKey);
    setIsLoadingMood(true);
  } else if (activeTab !== "mood" && prevMoodKey !== null) {
    setPrevMoodKey(null);
  }

  // Load playlist sets for quick "+Set" picker
  const loadSetsList = () => {
    fetchPlaylistSets()
      .then((data) => setSets(data))
      .catch(() => {});
  };

  useEffect(() => {
    loadSetsList();
  }, []);

  // Fetch recommendations whenever seedTrack changes
  useEffect(() => {
    if (!seedTrack?.video_id) return;

    let isMounted = true;

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

  // Fetch mood tracks
  useEffect(() => {
    if (activeTab !== "mood") return;

    let isMounted = true;
    const item = MOOD_OPTIONS.find((m) => m.id === selectedMoodId);
    if (!item) return;

    fetchMoodTracks(item.query, 8)
      .then((res) => {
        if (isMounted && res.success) {
          setMoodTracks(res.results);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (isMounted) setIsLoadingMood(false);
      });

    return () => {
      isMounted = false;
    };
  }, [activeTab, selectedMoodId]);

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
        .then((res) => {
          if (res.success) setRecommendations(res.results);
        })
        .catch(() => {})
        .finally(() => setIsLoadingRecs(false));
    } else if (activeTab === "artist" && effectiveArtist) {
      setIsLoadingArtist(true);
      fetchArtistTopTracks(effectiveArtist, 6)
        .then((res) => {
          if (res.success) setArtistTracks(res.results);
        })
        .catch(() => {})
        .finally(() => setIsLoadingArtist(false));
    } else if (activeTab === "mood") {
      const item = MOOD_OPTIONS.find((m) => m.id === selectedMoodId);
      if (!item) return;
      setIsLoadingMood(true);
      fetchMoodTracks(item.query, 8)
        .then((res) => {
          if (res.success) setMoodTracks(res.results);
        })
        .catch(() => {})
        .finally(() => setIsLoadingMood(false));
    }
  };

  // Instant Auto-Fill Queue: Queues top 3 songs from active recommendation list
  const handleAutoFill = async () => {
    const list = getActiveList();
    if (list.length === 0) return;

    const toQueue = list.slice(0, 3);
    setIsAutoFilling(true);

    for (const track of toQueue) {
      onQueueTrack(track, -1);
      await new Promise((r) => setTimeout(r, 800));
    }

    setIsAutoFilling(false);
  };

  const handleSaveTrackToSet = async (setId: string, track: TrackItem) => {
    try {
      await addTrackToPlaylistSet(setId, track);
      setAddedSetNotice(`Tersimpan ke set!`);
      setTimeout(() => setAddedSetNotice(null), 2000);
      setActiveSetDropdownTrackId(null);
    } catch {
      setAddedSetNotice(`Gagal menyimpan`);
      setTimeout(() => setAddedSetNotice(null), 2000);
    }
  };

  const getActiveList = (): TrackItem[] => {
    if (activeTab === "upnext") return recommendations;
    if (activeTab === "artist") return artistTracks;
    return moodTracks;
  };

  const activeList = getActiveList();
  const isLoading =
    activeTab === "upnext"
      ? isLoadingRecs
      : activeTab === "artist"
      ? isLoadingArtist
      : isLoadingMood;

  return (
    <div className="card rounded-2xl bg-base-200 border border-base-300 p-5 shadow-sm space-y-4">
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
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-base-300 text-base-content">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-base-content flex items-center gap-1.5">
              <span>Rekomendasi Cerdas</span>
              <span className="badge badge-accent badge-xs scale-90 text-accent-content">Auto Radio</span>
            </h3>
            <p className="text-[10px] text-base-content/60">
              Saran lagu Up Next, katalog artis, &amp; mood siaran
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {activeList.length > 0 && (
            <button
              type="button"
              onClick={handleAutoFill}
              disabled={isAutoFilling || isQueueing}
              className="btn btn-secondary btn-xs gap-1 font-bold shadow-sm"
              title="Antrekan 3 lagu rekomendasi teratas secara otomatis ke RadioBOSS"
            >
              <Zap className="h-3 w-3" />
              <span>{isAutoFilling ? "Mengantrekan..." : "Isi 3 Lagu"}</span>
            </button>
          )}

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
      </div>

      {/* 3 Tabs Switcher */}
      <div className="tabs tabs-box bg-base-300/50 p-1 rounded-xl flex gap-1">
        <button
          type="button"
          onClick={() => setActiveTab("upnext")}
          className={`tab flex-1 gap-1 text-[11px] font-semibold rounded-lg transition-all ${
            activeTab === "upnext"
              ? "tab-active bg-secondary text-secondary-content shadow-sm"
              : "text-base-content/70 hover:text-base-content"
          }`}
        >
          <Radio className="h-3 w-3" />
          <span className="truncate">Up Next</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("artist")}
          className={`tab flex-1 gap-1 text-[11px] font-semibold rounded-lg transition-all ${
            activeTab === "artist"
              ? "tab-active bg-secondary text-secondary-content shadow-sm"
              : "text-base-content/70 hover:text-base-content"
          }`}
        >
          <User className="h-3 w-3" />
          <span className="truncate">Top Artis</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("mood")}
          className={`tab flex-1 gap-1 text-[11px] font-semibold rounded-lg transition-all ${
            activeTab === "mood"
              ? "tab-active bg-secondary text-secondary-content shadow-sm"
              : "text-base-content/70 hover:text-base-content"
          }`}
        >
          <Smile className="h-3 w-3" />
          <span className="truncate">Mood &amp; Vibe</span>
        </button>
      </div>

      {/* Mood Selector Chips (Visible when Mood tab is active) */}
      {activeTab === "mood" && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
          {MOOD_OPTIONS.map((m) => {
            const isSelected = selectedMoodId === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setSelectedMoodId(m.id)}
                className={`btn btn-xs rounded-lg text-[10px] shrink-0 font-medium transition-all ${
                  isSelected
                    ? "btn-secondary text-secondary-content font-bold shadow-sm"
                    : "btn-ghost bg-base-100 text-base-content/70 hover:bg-base-300"
                }`}
              >
                <span>{m.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Notification Toast for Set saving */}
      {addedSetNotice && (
        <div className="alert alert-success text-[11px] py-1 px-3 rounded-lg flex items-center justify-between shadow-sm animate-fade-in">
          <span className="flex items-center gap-1 font-semibold">
            <Check className="h-3 w-3" />
            <span>{addedSetNotice}</span>
          </span>
        </div>
      )}

      {/* Content List */}
      {isLoading ? (
        <div className="py-8 text-center space-y-2">
          <span className="loading loading-spinner loading-sm text-secondary" />
          <p className="text-xs text-base-content/60">
            {activeTab === "upnext"
              ? "Menyesuaikan vibe & rekomendasi..."
              : activeTab === "artist"
              ? `Mengambil lagu populer ${effectiveArtist}...`
              : "Mengambil katalog lagu mood siaran..."}
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
            const isSetDropdownOpen = activeSetDropdownTrackId === track.video_id;

            return (
              <div
                key={track.video_id}
                className="group relative flex items-center justify-between gap-2.5 p-2 rounded-xl bg-base-100 hover:bg-base-300/40 border border-base-300/60 transition-colors"
              >
                {/* Track Thumbnail & Preview Trigger */}
                <div className="relative shrink-0 w-11 h-11 rounded-lg overflow-hidden bg-base-300">
                  {track.thumbnail_url ? (
                    <Image
                      src={track.thumbnail_url}
                      alt={track.title}
                      width={44}
                      height={44}
                      unoptimized
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
                  <h4 className="text-xs font-bold text-base-content truncate group-hover:text-white transition-colors">
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
                <div className="flex items-center gap-1 shrink-0 relative">
                  {/* Quick Save to Set Dropdown */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        loadSetsList();
                        setActiveSetDropdownTrackId(
                          isSetDropdownOpen ? null : track.video_id
                        );
                      }}
                      className="btn btn-ghost btn-xs text-[10px] text-base-content/60 hover:text-accent p-1 h-7 min-h-0"
                      title="Simpan ke Playlist Set"
                    >
                      +Set
                    </button>

                    {isSetDropdownOpen && (
                      <div className="absolute right-0 top-8 z-50 w-44 bg-base-100 border border-base-300 rounded-xl shadow-2xl p-1.5 space-y-1">
                        <p className="text-[10px] font-bold text-base-content/50 px-2 py-0.5 uppercase tracking-wider">
                          Pilih Playlist Set:
                        </p>
                        {sets.length === 0 ? (
                          <p className="text-[10px] text-base-content/50 px-2 py-1">
                            Belum ada set dibuat di tab Set Playlist.
                          </p>
                        ) : (
                          sets.map((s) => (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => handleSaveTrackToSet(s.id, track)}
                              className="w-full text-left text-xs px-2 py-1.5 rounded-lg hover:bg-base-200 text-base-content truncate transition-colors flex items-center justify-between"
                            >
                              <span className="truncate">{s.name}</span>
                              <span className="badge badge-ghost border border-base-300 badge-xs font-mono scale-90">
                                {s.track_count}
                              </span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>

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
