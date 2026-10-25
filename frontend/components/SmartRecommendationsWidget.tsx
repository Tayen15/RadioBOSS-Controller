"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import {
  Radio,
  User,
  Plus,
  Play,
  Pause,
  RefreshCw,
  Clock,
  Flame,
  Zap,
  Compass,
  Check,
  Trophy,
  HardDrive,
  Headphones,
  Music2,
  FastForward,
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
  { id: "morning", label: "Semangat Pagi", query: "indonesia pop hits upbeat semangat" },
  { id: "chill", label: "Akustik Santai", query: "chill acoustic pop indonesia" },
  { id: "tophits", label: "Top Hits Indo", query: "lagu pop indonesia terbaru hits" },
  { id: "melow", label: "Pop Melankolis", query: "lagu galau indonesia viral sedih" },
  { id: "nostalgia", label: "Era 2000an", query: "pop indonesia hits tahun 2000an" },
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

  const [previewTrackId, setPreviewTrackId] = useState<string | null>(null);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);

  const [isAutoFilling, setIsAutoFilling] = useState<boolean>(false);

  const [sets, setSets] = useState<PlaylistSet[]>([]);
  const [activeSetDropdownTrackId, setActiveSetDropdownTrackId] = useState<string | null>(null);
  const [addedSetNotice, setAddedSetNotice] = useState<string | null>(null);

  const effectiveArtist =
    seedTrack?.artists?.[0] || currentArtist || "NIKI";

  const [prevSeedId, setPrevSeedId] = useState<string | null>(null);
  const [prevArtist, setPrevArtist] = useState<string | null>(null);
  const [prevMoodKey, setPrevMoodKey] = useState<string | null>(null);
  const [prevTab, setPrevTab] = useState(activeTab);

  // Synchronize loading states during render phase
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

  const loadSetsList = () => {
    fetchPlaylistSets()
      .then((data) => setSets(data))
      .catch(() => {});
  };

  useEffect(() => {
    loadSetsList();
  }, []);

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
      setAddedSetNotice("Lagu berhasil ditambahkan ke set.");
      setTimeout(() => setAddedSetNotice(null), 2000);
      setActiveSetDropdownTrackId(null);
    } catch {
      setAddedSetNotice("Gagal menyimpan ke set.");
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
    <section
      aria-label="Katalog Rekomendasi & Rotasi DJ"
      className="rounded-xl bg-base-200 border border-base-300 p-4 sm:p-5 space-y-4"
    >
      <audio
        ref={audioRef}
        onEnded={handleAudioEnded}
        onError={() => setPreviewTrackId(null)}
        className="hidden"
      />

      {/* Section Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-base-300 pb-3">
        <div>
          <h3 className="font-bold text-sm text-base-content">
            Rotasi Musik &amp; Rekomendasi Siaran
          </h3>
          <p className="text-xs text-base-content/70">
            {activeTab === "djchart"
              ? `Tangga lagu paling sering diputar di studio (${djTotalPlays} total putar)`
              : activeTab === "djrecs"
              ? "Lagu rotasi siap putar & kesesuaian artis favorit penyiar"
              : "Saran lagu lanjutan (Up Next), katalog artis aktif, & program suasana siaran"}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeList.length > 0 && (
            <button
              type="button"
              onClick={handleAutoFill}
              disabled={isAutoFilling || isQueueing}
              className="btn btn-secondary btn-xs h-8 px-3 rounded-lg border border-base-300 gap-1.5 text-xs font-semibold text-secondary-content hover:bg-base-300"
              title="Antrekan 3 lagu teratas dari daftar ini ke RadioBOSS"
            >
              <Zap className="h-3.5 w-3.5 text-primary" />
              <span>{isAutoFilling ? "Mengirim 3 Lagu..." : "Isi 3 Lagu"}</span>
            </button>
          )}

          <button
            type="button"
            onClick={refreshActiveTab}
            disabled={isLoading}
            className="btn btn-ghost btn-xs h-8 px-2.5 rounded-lg bg-base-100 border border-base-300 text-xs font-medium text-base-content/80 hover:text-base-content gap-1.5"
            title="Perbarui daftar"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isLoading ? "animate-spin text-primary" : ""}`}
            />
            <span>Segarkan</span>
          </button>
        </div>
      </div>

      {/* 5 Mode Switcher Tabs */}
      <div className="bg-base-100 border border-base-300 p-1 rounded-lg flex gap-1 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab("upnext")}
          className={`flex-1 min-w-fit inline-flex items-center justify-center gap-1.5 px-3 h-8 text-xs font-semibold rounded-md transition-colors ${
            activeTab === "upnext"
              ? "bg-primary text-primary-content font-bold"
              : "text-base-content/70 hover:text-base-content hover:bg-base-200"
          }`}
        >
          <Radio className="h-3.5 w-3.5 shrink-0" />
          <span>Up Next</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("djchart")}
          className={`flex-1 min-w-fit inline-flex items-center justify-center gap-1.5 px-3 h-8 text-xs font-semibold rounded-md transition-colors ${
            activeTab === "djchart"
              ? "bg-primary text-primary-content font-bold"
              : "text-base-content/70 hover:text-base-content hover:bg-base-200"
          }`}
        >
          <Trophy className="h-3.5 w-3.5 shrink-0" />
          <span>Top Chart DJ</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("djrecs")}
          className={`flex-1 min-w-fit inline-flex items-center justify-center gap-1.5 px-3 h-8 text-xs font-semibold rounded-md transition-colors ${
            activeTab === "djrecs"
              ? "bg-primary text-primary-content font-bold"
              : "text-base-content/70 hover:text-base-content hover:bg-base-200"
          }`}
        >
          <Headphones className="h-3.5 w-3.5 shrink-0" />
          <span>Rotasi DJ</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("artist")}
          className={`flex-1 min-w-fit inline-flex items-center justify-center gap-1.5 px-3 h-8 text-xs font-semibold rounded-md transition-colors ${
            activeTab === "artist"
              ? "bg-primary text-primary-content font-bold"
              : "text-base-content/70 hover:text-base-content hover:bg-base-200"
          }`}
        >
          <User className="h-3.5 w-3.5 shrink-0" />
          <span>Katalog Artis</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("mood")}
          className={`flex-1 min-w-fit inline-flex items-center justify-center gap-1.5 px-3 h-8 text-xs font-semibold rounded-md transition-colors ${
            activeTab === "mood"
              ? "bg-primary text-primary-content font-bold"
              : "text-base-content/70 hover:text-base-content hover:bg-base-200"
          }`}
        >
          <Compass className="h-3.5 w-3.5 shrink-0" />
          <span>Program Suasana</span>
        </button>
      </div>

      {/* Mood Program Selector (No emojis per R-04) */}
      {activeTab === "mood" && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {MOOD_OPTIONS.map((m) => {
            const isSelected = selectedMoodId === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setSelectedMoodId(m.id)}
                className={`btn btn-xs h-8 px-3 rounded-md text-xs shrink-0 transition-colors ${
                  isSelected
                    ? "bg-secondary border border-primary/50 text-base-content font-bold"
                    : "bg-base-100 border border-base-300 text-base-content/70 hover:text-base-content"
                }`}
              >
                <span>{m.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* DJ Top Artists Readout */}
      {activeTab === "djrecs" && djTopArtists.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
          <span className="text-base-content/70 font-medium shrink-0">
            Frekuensi Artis Tertinggi:
          </span>
          {djTopArtists.map((a) => (
            <span
              key={a.artist}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-base-100 border border-base-300 shrink-0 text-xs font-medium text-base-content"
            >
              <span>{a.artist}</span>
              <span className="font-mono font-bold text-primary">{a.play_count}x</span>
            </span>
          ))}
        </div>
      )}

      {/* Feedback Banner for Set Saving */}
      {addedSetNotice && (
        <div className="alert alert-success text-xs py-2 px-3 rounded-lg flex items-center justify-between font-semibold text-success-content">
          <span className="flex items-center gap-1.5">
            <Check className="h-4 w-4" />
            <span>{addedSetNotice}</span>
          </span>
        </div>
      )}

      {/* Single-Column Tracklist Content */}
      {isLoading ? (
        <div className="py-8 text-center space-y-2 rounded-lg bg-base-100 border border-base-300">
          <span className="loading loading-spinner loading-sm text-primary" />
          <p className="text-xs text-base-content/70">
            {activeTab === "upnext"
              ? "Menyusun daftar lagu Up Next yang selaras..."
              : activeTab === "artist"
              ? `Memuat katalog rilis resmi ${effectiveArtist}...`
              : activeTab === "djchart"
              ? "Menghitung statistik tangga lagu studio..."
              : activeTab === "djrecs"
              ? "Memindai histori rotasi & kecocokan musik penyiar..."
              : "Memuat daftar lagu program siaran..."}
          </p>
        </div>
      ) : activeList.length === 0 ? (
        <div className="py-8 px-4 text-center space-y-1.5 bg-base-100 rounded-lg border border-base-300">
          <Music2 className="h-6 w-6 text-base-content/60 mx-auto" />
          <p className="text-xs text-base-content font-semibold">
            {activeTab === "djchart"
              ? "Belum Ada Statistik Tangga Lagu DJ"
              : activeTab === "djrecs"
              ? "Data Riwayat Putar Belum Cukup"
              : "Daftar Rekomendasi Belum Tersedia"}
          </p>
          <p className="text-xs text-base-content/70">
            {activeTab === "djchart" || activeTab === "djrecs"
              ? "Kirim dan putar lagu ke RadioBOSS untuk mulai merekam frekuensi rotasi studio."
              : "Pilih satu lagu dari hasil pencarian di atas untuk memicu rekomendasi terkait."}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-base-300 rounded-lg border border-base-300 bg-base-100 max-h-96 overflow-y-auto">
          {activeList.map((item, idx) => {
            const track = item as TrackItem & Partial<CachedTrackItem>;
            const isPlayingPreview = previewTrackId === track.video_id;
            const isSetDropdownOpen = activeSetDropdownTrackId === track.video_id;
            const rankNum = track.rank ?? idx + 1;
            const rankStr = String(rankNum).padStart(2, "0");

            return (
              <div
                key={track.video_id}
                className="group relative flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-base-300/60 transition-colors"
              >
                {/* Left: Tabular Index/Rank + Artwork + Track Info */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <span
                    className={`font-mono text-xs font-bold w-6 shrink-0 text-center rounded py-0.5 ${
                      activeTab === "djchart" && rankNum <= 3
                        ? "bg-primary/20 text-primary border border-primary/40"
                        : "text-base-content/60"
                    }`}
                  >
                    {rankStr}
                  </span>

                  <div className="relative shrink-0 w-10 h-10 rounded-md overflow-hidden bg-base-300 border border-base-300">
                    {track.thumbnail_url ? (
                      <Image
                        src={track.thumbnail_url}
                        alt={track.title}
                        width={40}
                        height={40}
                        unoptimized
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-base-content/60">
                        <Music2 className="h-4 w-4" />
                      </div>
                    )}
                  </div>

                  {/* Clickable Title & Artist to Load into Cue Deck */}
                  <div
                    onClick={() => onSelectTrack(track)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSelectTrack(track);
                      }
                    }}
                    className="min-w-0 flex-1 cursor-pointer"
                    title="Klik untuk memuat ke Cue Deck"
                  >
                    <h4 className="text-sm font-semibold text-base-content truncate group-hover:text-primary transition-colors">
                      {track.title}
                    </h4>
                    <div className="flex items-center gap-2 text-xs text-base-content/70 truncate mt-0.5">
                      <span className="truncate">
                        {track.artists.join(", ") || "YouTube Music"}
                      </span>

                      {track.play_count !== undefined && track.play_count > 0 && (
                        <span className="inline-flex items-center gap-1 font-mono text-warning font-semibold shrink-0">
                          <Flame className="h-3 w-3 fill-current" />
                          <span>{track.play_count}x</span>
                        </span>
                      )}

                      {track.is_cached && (
                        <span className="inline-flex items-center gap-1 text-success font-medium shrink-0">
                          <HardDrive className="h-3 w-3" />
                          <span>Cache</span>
                        </span>
                      )}

                      {track.last_played_relative && (
                        <span className="text-base-content/60 font-mono shrink-0 hidden sm:inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          <span>{track.last_played_relative}</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: Always-Accessible Controls (Preview, +Set, Next, Queue) */}
                <div className="flex items-center gap-1.5 shrink-0 relative">
                  {/* Persistent Headphone Preview Button (fixes hover-only mobile issue) */}
                  <button
                    type="button"
                    onClick={() => handleTogglePreview(track)}
                    aria-label={isPlayingPreview ? "Jeda pratinjau" : "Dengarkan di headphone"}
                    className={`btn btn-xs h-8 w-8 p-0 rounded-md border ${
                      isPlayingPreview
                        ? "bg-accent text-accent-content border-accent"
                        : "bg-base-200 border-base-300 text-base-content/80 hover:text-base-content hover:bg-base-300"
                    }`}
                    title={isPlayingPreview ? "Jeda Pratinjau Headphone" : "Pratinjau Headphone"}
                  >
                    {isPlayingPreview ? (
                      <Pause className="h-3.5 w-3.5 fill-current" />
                    ) : (
                      <Play className="h-3.5 w-3.5 fill-current ml-0.5" />
                    )}
                  </button>

                  {/* Save to Playlist Set */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        loadSetsList();
                        setActiveSetDropdownTrackId(
                          isSetDropdownOpen ? null : track.video_id
                        );
                      }}
                      className="btn btn-xs h-8 px-2 rounded-md bg-base-200 border border-base-300 text-xs font-semibold text-base-content/80 hover:text-base-content hover:bg-base-300"
                      title="Simpan ke Set Playlist"
                    >
                      +Set
                    </button>

                    {isSetDropdownOpen && (
                      <div className="absolute right-0 top-9 z-50 w-48 bg-base-200 border border-base-300 rounded-lg shadow-2xl p-2 space-y-1">
                        <p className="text-xs font-bold text-base-content/70 px-2 py-1">
                          Simpan ke Set Playlist:
                        </p>
                        {sets.length === 0 ? (
                          <p className="text-xs text-base-content/70 px-2 py-1.5">
                            Belum ada set dibuat di tab Set Koleksi.
                          </p>
                        ) : (
                          sets.map((s) => (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => handleSaveTrackToSet(s.id, track)}
                              className="w-full text-left text-xs px-2.5 py-1.5 rounded-md hover:bg-base-300 text-base-content truncate transition-colors flex items-center justify-between gap-2"
                            >
                              <span className="truncate font-medium">{s.name}</span>
                              <span className="font-mono text-xs text-base-content/70">
                                {s.track_count}
                              </span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>

                  {/* Play Next (pos=1) */}
                  <button
                    type="button"
                    onClick={() => onQueueTrack(track, 1)}
                    disabled={isQueueing}
                    className="btn btn-primary btn-xs h-8 px-2.5 rounded-md text-xs font-bold text-primary-content gap-1"
                    title="Putar berikutnya di RadioBOSS (pos=1)"
                  >
                    <FastForward className="h-3 w-3 fill-current" />
                    <span>Next</span>
                  </button>

                  {/* Queue Bottom (pos=-1) */}
                  <button
                    type="button"
                    onClick={() => onQueueTrack(track, -1)}
                    disabled={isQueueing}
                    className="btn btn-secondary btn-xs h-8 px-2.5 rounded-md border border-base-300 text-xs font-semibold text-secondary-content hover:bg-base-300 gap-1"
                    title="Tambahkan ke antrean paling bawah (pos=-1)"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Antrean</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
