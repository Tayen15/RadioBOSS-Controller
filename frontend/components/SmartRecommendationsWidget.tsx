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
  Trophy,
  HardDrive,
  Headphones,
} from "lucide-react";
import {
  TrackItem,
  PlaylistSet,
  CachedTrackItem,
  DJArtistStat,
} from "@/lib/types";
import {
  fetchRecommendations,
  fetchArtistTopTracks,
  fetchMoodTracks,
  getStreamRelayUrl,
  fetchPlaylistSets,
  addTrackToPlaylistSet,
  fetchDJTopChart,
  fetchDJSmartRecommendations,
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
  const [activeTab, setActiveTab] = useState<
    "upnext" | "artist" | "djchart" | "djrecs" | "mood"
  >("upnext");
  const [recommendations, setRecommendations] = useState<TrackItem[]>([]);
  const [artistTracks, setArtistTracks] = useState<TrackItem[]>([]);
  const [moodTracks, setMoodTracks] = useState<TrackItem[]>([]);
  const [selectedMoodId, setSelectedMoodId] = useState<string>("morning");

  // DJ Top Chart & Smart Recs states
  const [djChart, setDjChart] = useState<CachedTrackItem[]>([]);
  const [djTotalPlays, setDjTotalPlays] = useState<number>(0);
  const [djTopArtists, setDjTopArtists] = useState<DJArtistStat[]>([]);
  const [djRotationReady, setDjRotationReady] = useState<CachedTrackItem[]>([]);
  const [djAffinityRecs, setDjAffinityRecs] = useState<TrackItem[]>([]);

  const [isLoadingRecs, setIsLoadingRecs] = useState<boolean>(false);
  const [isLoadingArtist, setIsLoadingArtist] = useState<boolean>(false);
  const [isLoadingMood, setIsLoadingMood] = useState<boolean>(false);
  const [isLoadingDJChart, setIsLoadingDJChart] = useState<boolean>(false);
  const [isLoadingDJRecs, setIsLoadingDJRecs] = useState<boolean>(false);

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
  const [prevTab, setPrevTab] = useState(activeTab);

  // Synchronize loading states during render phase (avoids cascading render warning in effects)
  if (activeTab !== prevTab) {
    setPrevTab(activeTab);
    if (activeTab === "djchart") {
      setIsLoadingDJChart(true);
    } else if (activeTab === "djrecs") {
      setIsLoadingDJRecs(true);
    }
  }

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

  // Fetch DJ Top Chart
  useEffect(() => {
    if (activeTab !== "djchart") return;

    let isMounted = true;
    fetchDJTopChart(25)
      .then((res) => {
        if (isMounted && res.success) {
          setDjChart(res.chart);
          setDjTotalPlays(res.total_plays);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (isMounted) setIsLoadingDJChart(false);
      });

    return () => {
      isMounted = false;
    };
  }, [activeTab]);

  // Fetch DJ Smart Recommendations
  useEffect(() => {
    if (activeTab !== "djrecs") return;

    let isMounted = true;
    fetchDJSmartRecommendations(10)
      .then((res) => {
        if (isMounted && res.success) {
          setDjTopArtists(res.top_artists);
          setDjRotationReady(res.rotation_ready);
          setDjAffinityRecs(res.affinity_recommendations);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (isMounted) setIsLoadingDJRecs(false);
      });

    return () => {
      isMounted = false;
    };
  }, [activeTab]);

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
    } else if (activeTab === "djchart") {
      setIsLoadingDJChart(true);
      fetchDJTopChart(25)
        .then((res) => {
          if (res.success) {
            setDjChart(res.chart);
            setDjTotalPlays(res.total_plays);
          }
        })
        .catch(() => {})
        .finally(() => setIsLoadingDJChart(false));
    } else if (activeTab === "djrecs") {
      setIsLoadingDJRecs(true);
      fetchDJSmartRecommendations(10)
        .then((res) => {
          if (res.success) {
            setDjTopArtists(res.top_artists);
            setDjRotationReady(res.rotation_ready);
            setDjAffinityRecs(res.affinity_recommendations);
          }
        })
        .catch(() => {})
        .finally(() => setIsLoadingDJRecs(false));
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
    let toQueue: (TrackItem | CachedTrackItem)[] = [];
    if (activeTab === "djrecs") {
      toQueue = [...djRotationReady.slice(0, 2), ...djAffinityRecs.slice(0, 1)];
      if (toQueue.length < 3) {
        toQueue = [...djRotationReady, ...djAffinityRecs].slice(0, 3);
      }
    } else {
      toQueue = getActiveList().slice(0, 3);
    }

    if (toQueue.length === 0) return;

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

  const getActiveList = (): (TrackItem | CachedTrackItem)[] => {
    if (activeTab === "upnext") return recommendations;
    if (activeTab === "artist") return artistTracks;
    if (activeTab === "djchart") return djChart;
    if (activeTab === "djrecs") return [...djRotationReady, ...djAffinityRecs];
    return moodTracks;
  };

  const activeList = getActiveList();
  const isLoading =
    activeTab === "upnext"
      ? isLoadingRecs
      : activeTab === "artist"
      ? isLoadingArtist
      : activeTab === "djchart"
      ? isLoadingDJChart
      : activeTab === "djrecs"
      ? isLoadingDJRecs
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
              <span className="badge badge-accent badge-xs scale-90 text-accent-content">
                {activeTab === "djchart"
                  ? "Top Chart DJ"
                  : activeTab === "djrecs"
                  ? "DJ Taste"
                  : "Auto Radio"}
              </span>
            </h3>
            <p className="text-[10px] text-base-content/60">
              {activeTab === "djchart"
                ? `Tangga lagu terpopuler siaran (${djTotalPlays} total putar)`
                : activeTab === "djrecs"
                ? "Rotasi andalan & lagu sesuai selera DJ"
                : "Saran lagu Up Next, katalog artis, & mood siaran"}
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
            <RefreshCw
              className={`h-3 w-3 ${isLoading ? "animate-spin text-secondary" : ""}`}
            />
            <span className="text-[10px]">Refresh</span>
          </button>
        </div>
      </div>

      {/* 5 Tabs Switcher (Scrollable on small screens) */}
      <div className="tabs tabs-box bg-base-300/50 p-1 rounded-xl flex gap-1 overflow-x-auto no-scrollbar flex-nowrap">
        <button
          type="button"
          onClick={() => setActiveTab("upnext")}
          className={`tab shrink-0 gap-1 text-[11px] font-semibold rounded-lg transition-all ${
            activeTab === "upnext"
              ? "tab-active bg-secondary text-secondary-content shadow-sm"
              : "text-base-content/70 hover:text-base-content"
          }`}
        >
          <Radio className="h-3 w-3 shrink-0" />
          <span>Up Next</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("djchart")}
          className={`tab shrink-0 gap-1 text-[11px] font-semibold rounded-lg transition-all ${
            activeTab === "djchart"
              ? "tab-active bg-secondary text-secondary-content shadow-sm"
              : "text-base-content/70 hover:text-base-content"
          }`}
        >
          <Trophy className="h-3 w-3 shrink-0 text-warning" />
          <span>Top Chart DJ</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("djrecs")}
          className={`tab shrink-0 gap-1 text-[11px] font-semibold rounded-lg transition-all ${
            activeTab === "djrecs"
              ? "tab-active bg-secondary text-secondary-content shadow-sm"
              : "text-base-content/70 hover:text-base-content"
          }`}
        >
          <Headphones className="h-3 w-3 shrink-0 text-accent" />
          <span>Rekomendasi DJ</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("artist")}
          className={`tab shrink-0 gap-1 text-[11px] font-semibold rounded-lg transition-all ${
            activeTab === "artist"
              ? "tab-active bg-secondary text-secondary-content shadow-sm"
              : "text-base-content/70 hover:text-base-content"
          }`}
        >
          <User className="h-3 w-3 shrink-0" />
          <span>Top Artis</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("mood")}
          className={`tab shrink-0 gap-1 text-[11px] font-semibold rounded-lg transition-all ${
            activeTab === "mood"
              ? "tab-active bg-secondary text-secondary-content shadow-sm"
              : "text-base-content/70 hover:text-base-content"
          }`}
        >
          <Smile className="h-3 w-3 shrink-0" />
          <span>Mood</span>
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

      {/* DJ Top Artists Pill Row (Visible in Rekomendasi DJ tab) */}
      {activeTab === "djrecs" && djTopArtists.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin text-[10px]">
          <span className="text-base-content/50 font-medium shrink-0">
            Selera Artis:
          </span>
          {djTopArtists.map((a) => (
            <span
              key={a.artist}
              className="badge badge-outline border-base-300 badge-xs font-semibold gap-1 py-1.5 shrink-0 text-base-content/80"
            >
              <span>{a.artist}</span>
              <span className="text-warning font-bold">{a.play_count}x</span>
            </span>
          ))}
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
              : activeTab === "djchart"
              ? "Menghitung tangga lagu siaran DJ..."
              : activeTab === "djrecs"
              ? "Menganalisis rotasi & selera musik DJ..."
              : "Mengambil katalog lagu mood siaran..."}
          </p>
        </div>
      ) : activeList.length === 0 ? (
        <div className="py-8 text-center space-y-1 bg-base-100/50 rounded-xl border border-dashed border-base-300">
          <Flame className="h-6 w-6 text-base-content/30 mx-auto" />
          <p className="text-xs text-base-content/60 font-medium">
            {activeTab === "djchart"
              ? "Belum ada tangga lagu DJ."
              : activeTab === "djrecs"
              ? "Belum ada riwayat putar yang cukup untuk rekomendasi DJ."
              : "Belum ada rekomendasi lagu."}
          </p>
          <p className="text-[10px] text-base-content/40">
            {activeTab === "djchart" || activeTab === "djrecs"
              ? "Putar lagu ke RadioBOSS untuk mulai mencatat tangga lagu studio Anda."
              : "Pilih lagu di kolom kiri untuk memicu rekomendasi otomatis."}
          </p>
        </div>
      ) : (
        <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
          {activeList.map((item, idx) => {
            const track = item as TrackItem & Partial<CachedTrackItem>;
            const isPlayingPreview = previewTrackId === track.video_id;
            const isSetDropdownOpen = activeSetDropdownTrackId === track.video_id;
            const rankNum = track.rank ?? idx + 1;

            return (
              <div
                key={track.video_id}
                className="group relative flex items-center justify-between gap-2.5 p-2 rounded-xl bg-base-100 hover:bg-base-300/40 border border-base-300/60 transition-colors"
              >
                {/* Rank Badge for DJ Top Chart */}
                {activeTab === "djchart" && (
                  <div className="shrink-0 flex items-center justify-center w-6 text-center">
                    {rankNum === 1 ? (
                      <span className="badge bg-warning text-black font-black text-[10px] h-5 w-5 p-0 rounded-md shadow-sm">
                        1
                      </span>
                    ) : rankNum === 2 ? (
                      <span className="badge bg-slate-300 text-black font-bold text-[10px] h-5 w-5 p-0 rounded-md">
                        2
                      </span>
                    ) : rankNum === 3 ? (
                      <span className="badge bg-amber-700/80 text-white font-bold text-[10px] h-5 w-5 p-0 rounded-md">
                        3
                      </span>
                    ) : (
                      <span className="text-[11px] font-mono font-bold text-base-content/40">
                        {rankNum}
                      </span>
                    )}
                  </div>
                )}

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
                  <div className="flex items-center gap-1.5 text-[10px] text-base-content/60 truncate mt-0.5">
                    <span className="truncate">
                      {track.artists.join(", ") || "YouTube Music"}
                    </span>

                    {/* Play count badge */}
                    {track.play_count !== undefined && track.play_count > 0 && (
                      <span className="inline-flex items-center gap-0.5 text-warning font-semibold shrink-0">
                        <Flame className="h-2.5 w-2.5 fill-current" />
                        <span>{track.play_count}x</span>
                      </span>
                    )}

                    {/* Local Cache badge */}
                    {track.is_cached && (
                      <span className="badge badge-success/20 text-success text-[9px] gap-0.5 font-semibold py-0 h-4 shrink-0">
                        <HardDrive className="h-2 w-2" />
                        <span>Cache</span>
                      </span>
                    )}

                    {/* Last played relative time */}
                    {track.last_played_relative && (
                      <span className="text-base-content/40 shrink-0 hidden sm:inline-flex items-center gap-0.5">
                        <Clock className="h-2 w-2" />
                        <span>{track.last_played_relative}</span>
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
