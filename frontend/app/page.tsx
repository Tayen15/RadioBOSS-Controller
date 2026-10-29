"use client";

import React, { useState, useEffect, useCallback } from "react";
import { ConnectionBar } from "@/components/ConnectionBar";
import { NowPlayingWidget } from "@/components/NowPlayingWidget";
import { SearchSection } from "@/components/SearchSection";
import { TrackPreviewCard } from "@/components/TrackPreviewCard";
import { QueueHistory } from "@/components/QueueHistory";
import { PlaylistQueueWidget } from "@/components/PlaylistQueueWidget";
import { ToastNotification, ToastMessage } from "@/components/ToastNotification";
import { SettingsModal } from "@/components/SettingsModal";
import { UpdateModal } from "@/components/UpdateModal";
import { SmartRecommendationsWidget } from "@/components/SmartRecommendationsWidget";
import { PlaylistSetsWidget } from "@/components/PlaylistSetsWidget";
import {
  Headphones,
  ListMusic,
  History,
  FolderHeart,
  Compass,
  AlertTriangle,
  Play,
} from "lucide-react";
import {
  TrackItem,
  RadioBOSSStatus,
  HistoryItem,
  PlaybackAction,
  PlaylistItem,
  APP_VERSION,
  UpdateCheckResult,
} from "@/lib/types";
import {
  checkBackendHealth,
  fetchRadioBossStatus,
  searchYouTubeMusic,
  resolveUrl,
  queueToRadioBoss,
  sendPlaybackControl,
  fetchRadioBossPlaylist,
  fetchQueueHistory,
  clearQueueHistory,
  setLiveCastTitle,
  checkForUpdates,
} from "@/lib/api";

export default function DashboardPage() {
  // Connection & settings states
  const [backendOnline, setBackendOnline] = useState<boolean>(false);
  const [radioBossStatus, setRadioBossStatus] =
    useState<RadioBOSSStatus | null>(null);
  const [isStatusLoading, setIsStatusLoading] = useState<boolean>(false);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isUpdateOpen, setIsUpdateOpen] = useState<boolean>(false);
  const [updateResult, setUpdateResult] = useState<UpdateCheckResult | null>(
    null
  );

  // Search & Track selection states
  const [searchResults, setSearchResults] = useState<TrackItem[]>([]);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [isResolving, setIsResolving] = useState<boolean>(false);
  const [selectedTrack, setSelectedTrack] = useState<TrackItem | null>(null);

  // Queue states
  const [isQueueing, setIsQueueing] = useState<boolean>(false);
  const [activeQueuePos, setActiveQueuePos] = useState<number | null>(null);

  // History & Toast states
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const savedHistory = localStorage.getItem("radioboss_queue_history");
        if (savedHistory) {
          return JSON.parse(savedHistory);
        }
      } catch {
        // Ignore localStorage errors
      }
    }
    return [];
  });
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Playback Transport & Playlist Queue states
  const [isControlling, setIsControlling] = useState<boolean>(false);
  const [playlistTracks, setPlaylistTracks] = useState<PlaylistItem[]>([]);
  const [isPlaylistLoading, setIsPlaylistLoading] = useState<boolean>(false);

  // Zone 2 (Discovery Deck) & Zone 3 (Queue Monitor) tabs
  const [catalogTab, setCatalogTab] = useState<"recommendations" | "sets">(
    "recommendations"
  );
  const [queueTab, setQueueTab] = useState<"playlist" | "history">("playlist");

  // Fetch permanent history from backend file storage on mount
  useEffect(() => {
    fetchQueueHistory()
      .then((serverHistory) => {
        if (
          serverHistory &&
          Array.isArray(serverHistory) &&
          serverHistory.length > 0
        ) {
          setHistory(serverHistory);
          try {
            localStorage.setItem(
              "radioboss_queue_history",
              JSON.stringify(serverHistory)
            );
          } catch {}
        }
      })
      .catch(() => {});

    // Silent background check for application updates on mount
    checkForUpdates(false)
      .then((res) => {
        setUpdateResult(res);
      })
      .catch(() => {});
  }, []);

  // Save history to localStorage and state
  const saveHistory = (items: HistoryItem[]) => {
    setHistory(items);
    try {
      localStorage.setItem("radioboss_queue_history", JSON.stringify(items));
    } catch {
      // Ignore localStorage errors
    }
  };

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (type: "success" | "error", text: string) => {
      const id = `${Date.now()}-${Math.random()}`;
      const newToast: ToastMessage = {
        id,
        type,
        text,
      };
      setToasts((prev) => [newToast, ...prev.slice(0, 2)]);
      setTimeout(() => {
        dismissToast(id);
      }, 3200);
    },
    [dismissToast]
  );

  // Check connectivity and fetch now playing with debounced failure handling (prevents flickering disconnects on slower devices/LAN)
  const isSyncingRef = React.useRef(false);
  const consecutiveFailuresRef = React.useRef(0);
  const syncStatus = useCallback(async (silent = false) => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;
    if (!silent) setIsStatusLoading(true);
    try {
      const rbStatus = await fetchRadioBossStatus();
      const isOnline = rbStatus.error !== "Tidak dapat menghubungi backend";

      if (rbStatus.connected && isOnline) {
        consecutiveFailuresRef.current = 0;
        setBackendOnline(true);
        setRadioBossStatus((prev) => {
          if (
            prev &&
            prev.connected === rbStatus.connected &&
            prev.error === rbStatus.error &&
            prev.now_playing?.title === rbStatus.now_playing?.title &&
            prev.now_playing?.status === rbStatus.now_playing?.status &&
            prev.now_playing?.duration === rbStatus.now_playing?.duration &&
            prev.now_playing?.position === rbStatus.now_playing?.position &&
            prev.now_playing?.listeners === rbStatus.now_playing?.listeners
          ) {
            return prev;
          }
          return rbStatus;
        });
      } else {
        // Debounce: require 2 consecutive failures before declaring RadioBOSS disconnected
        consecutiveFailuresRef.current += 1;
        if (consecutiveFailuresRef.current >= 2) {
          setBackendOnline(isOnline);
          setRadioBossStatus(rbStatus);
        }
      }
    } catch {
      consecutiveFailuresRef.current += 1;
      if (consecutiveFailuresRef.current >= 2) {
        setBackendOnline(false);
        setRadioBossStatus((prev) => {
          if (prev && !prev.connected && prev.error === "Backend server offline") {
            return prev;
          }
          return { connected: false, error: "Backend server offline" };
        });
      }
    } finally {
      isSyncingRef.current = false;
      if (!silent) setIsStatusLoading(false);
    }
  }, []);

  // Fetch upcoming RadioBOSS playlist with silent background updates (limit up to 50 tracks)
  const syncPlaylist = useCallback(async (isManual: boolean = false) => {
    if (isManual) setIsPlaylistLoading(true);
    try {
      const res = await fetchRadioBossPlaylist(50);
      if (res.success && res.tracks) {
        setPlaylistTracks((prev) => {
          if (
            prev.length === res.tracks.length &&
            prev.every(
              (t, i) =>
                t.title === res.tracks[i]?.title &&
                t.artist === res.tracks[i]?.artist &&
                t.is_playing === res.tracks[i]?.is_playing
            )
          ) {
            return prev;
          }
          return res.tracks;
        });
      }
    } catch {
      // Ignore background errors
    } finally {
      if (isManual) setIsPlaylistLoading(false);
    }
  }, []);

  // Handle Playback Transport Commands (Play, Pause, Next, Stop)
  const handlePlaybackControl = async (action: PlaybackAction) => {
    setIsControlling(true);
    try {
      const res = await sendPlaybackControl(action);
      addToast("success", res.message);
      setTimeout(() => {
        syncStatus();
        syncPlaylist(true);
      }, 400);
    } catch (err) {
      addToast(
        "error",
        err instanceof Error
          ? err.message
          : `Gagal mengeksekusi perintah ${action}.`
      );
    } finally {
      setIsControlling(false);
    }
  };

  // Initial fetch and adaptive auto-refresh loop (1s active, 5s when window minimized/hidden)
  useEffect(() => {
    let isCancelled = false;
    let timerId: ReturnType<typeof setTimeout> | null = null;
    let tickCount = 0;

    const runSync = () => {
      if (isCancelled) return;
      syncStatus(true);
      tickCount++;
      if (tickCount % 3 === 0) {
        syncPlaylist(false);
      }

      const isHidden =
        typeof document !== "undefined" &&
        document.visibilityState === "hidden";
      const nextDelay = isHidden ? 5000 : 1000;

      if (autoRefresh && !isCancelled) {
        timerId = setTimeout(runSync, nextDelay);
      }
    };

    // Immediate initial sync
    syncStatus(false);
    syncPlaylist(false);

    if (autoRefresh) {
      timerId = setTimeout(runSync, 1000);
    }

    const handleVisibilityChange = () => {
      if (
        document.visibilityState === "visible" &&
        autoRefresh &&
        !isCancelled
      ) {
        if (timerId) clearTimeout(timerId);
        syncStatus(true);
        syncPlaylist(false);
        timerId = setTimeout(runSync, 1000);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isCancelled = true;
      if (timerId) clearTimeout(timerId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [autoRefresh, syncStatus, syncPlaylist]);

  // Handle Search YouTube Music
  const handleSearch = async (query: string) => {
    setIsSearching(true);
    try {
      const resp = await searchYouTubeMusic(query, 6);
      if (resp.results && resp.results.length > 0) {
        setSearchResults(resp.results);
        setSelectedTrack(resp.results[0]);
      } else {
        addToast(
          "error",
          `Tidak ditemukan lagu studio untuk query '${query}'.`
        );
      }
    } catch (err) {
      addToast(
        "error",
        err instanceof Error
          ? err.message
          : "Terjadi kesalahan saat mencari lagu."
      );
    } finally {
      setIsSearching(false);
    }
  };

  // Handle direct URL resolve
  const handleResolveUrl = async (url: string) => {
    setIsResolving(true);
    try {
      const resp = await resolveUrl(url);
      if (resp.success && resp.data) {
        setSelectedTrack(resp.data);
      } else {
        addToast(
          "error",
          resp.error || "Gagal mengekstrak lagu dari URL tersebut."
        );
      }
    } catch (err) {
      addToast(
        "error",
        err instanceof Error ? err.message : "Gagal memproses URL."
      );
    } finally {
      setIsResolving(false);
    }
  };

  // Handle Queuing to RadioBOSS with Anti-Repeat Safety Guard
  const queueTrackWithGuard = async (
    targetTrack: TrackItem,
    pos: number,
    useRelay: boolean = true,
    customMeta?: { title: string; artist: string },
    skipRepeatConfirm: boolean = false
  ) => {
    const primaryArtist = (
      customMeta?.artist ||
      targetTrack.artists?.[0] ||
      ""
    )
      .toLowerCase()
      .trim();
    if (primaryArtist && !skipRepeatConfirm) {
      const recentArtistPlayed = history
        .slice(0, 3)
        .some(
          (h) =>
            h.artists?.some((a) => a.toLowerCase().trim() === primaryArtist) ||
            h.title?.toLowerCase().includes(primaryArtist)
        );
      const nowPlayingTitle =
        radioBossStatus?.now_playing?.title?.toLowerCase();
      const isNowPlaying =
        nowPlayingTitle && nowPlayingTitle.includes(primaryArtist);

      if (recentArtistPlayed || isNowPlaying) {
        const confirmRepeat = window.confirm(
          `Peringatan Anti-Repeat Siaran:\nLagu dari artis "${
            customMeta?.artist || targetTrack.artists[0]
          }" baru saja diputar atau ada di antrean terakhir.\n\nTetap ingin menambahkan lagu ini ke antrean RadioBOSS?`
        );
        if (!confirmRepeat) {
          return;
        }
      }
    }

    setIsQueueing(true);
    setActiveQueuePos(pos);
    // Switch active tab to RadioBOSS playlist so user sees the newly queued track
    setQueueTab("playlist");

    const posLabel = pos === 1 ? "Putar Berikutnya" : "Antrean Bawah";

    const artistStr = (
      customMeta?.artist !== undefined
        ? customMeta.artist
        : targetTrack.artists?.filter(Boolean).join(", ") || ""
    ).trim();
    const cleanTitle = (
      customMeta?.title !== undefined ? customMeta.title : targetTrack.title
    ).trim();
    const formattedTitle =
      artistStr && !cleanTitle.includes(" - ")
        ? `${artistStr} - ${cleanTitle}`
        : cleanTitle;

    try {
      const res = await queueToRadioBoss(
        targetTrack.video_id,
        formattedTitle,
        pos,
        useRelay,
        undefined,
        {
          artist: artistStr,
          album: targetTrack.album,
          thumbnail_url: targetTrack.thumbnail_url,
          year: targetTrack.year,
          genre: targetTrack.genre,
        }
      );

      // Record to history
      const now = new Date();
      const timeStr = now.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });

      const newHistoryItem: HistoryItem = {
        id: `${Date.now()}-${targetTrack.video_id}`,
        video_id: targetTrack.video_id,
        title: formattedTitle,
        artists: customMeta?.artist ? [customMeta.artist] : targetTrack.artists,
        thumbnail_url: targetTrack.thumbnail_url,
        pos: pos,
        timestamp: timeStr,
        status: "success",
      };

      const updatedHistory = [newHistoryItem, ...history.slice(0, 9)];
      saveHistory(updatedHistory);

      addToast(
        "success",
        res.message || `Lagu berhasil dikirim ke RadioBOSS (${posLabel})!`
      );

      // Immediately sync status and playlist, then sync again after 1.2s to capture RadioBOSS update
      syncStatus();
      syncPlaylist(true);
      setTimeout(() => {
        syncStatus();
        syncPlaylist(true);
      }, 1200);
    } catch (err) {
      const errorMsg =
        err instanceof Error
          ? err.message
          : "Gagal mengirim lagu ke RadioBOSS.";
      addToast("error", errorMsg);
    } finally {
      setIsQueueing(false);
      setActiveQueuePos(null);
    }
  };

  const handleQueueTrack = async (
    pos: number,
    useRelay: boolean,
    customMetadata?: { title: string; artist: string }
  ) => {
    if (selectedTrack) {
      await queueTrackWithGuard(selectedTrack, pos, useRelay, customMetadata);
    }
  };

  const handleUpdateSelectedMetadata = (
    trackId: string,
    title: string,
    artist: string
  ) => {
    if (selectedTrack && selectedTrack.video_id === trackId) {
      setSelectedTrack({
        ...selectedTrack,
        title,
        artists: artist ? [artist] : selectedTrack.artists,
      });
    }
  };

  // Handle requeuing from history
  const handleRequeue = async (item: HistoryItem) => {
    const track: TrackItem = {
      video_id: item.video_id,
      title: item.title,
      artists: item.artists,
      thumbnail_url: item.thumbnail_url,
      url: `https://music.youtube.com/watch?v=${item.video_id}`,
      duration_formatted: "00:00",
    };
    setSelectedTrack(track);
  };

  // Clear history both locally and on server
  const handleClearHistory = async () => {
    saveHistory([]);
    try {
      await clearQueueHistory();
    } catch {}
  };

  return (
    <div className="min-h-screen bg-base-100 text-base-content flex flex-col">
      {/* ZONE 1A: Top Console Header & Connection Bar */}
      <ConnectionBar
        radioBossStatus={radioBossStatus}
        loading={isStatusLoading}
        onRefresh={syncStatus}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenUpdateModal={() => setIsUpdateOpen(true)}
        updateAvailable={updateResult?.update_available}
        latestVersion={updateResult?.latest_version}
      />

      {/* Backend Disconnected Alert */}
      {!backendOnline && (
        <div className="bg-error/15 border-b border-error/30 text-error text-xs py-2.5 px-4 sm:px-6 flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Layanan Backend Terputus: Tidak dapat terhubung ke server lokal (Port 8000). Pastikan aplikasi controller berjalan.
          </span>
          <button
            type="button"
            onClick={async () => {
              const ok = await checkBackendHealth();
              setBackendOnline(ok);
              if (ok) {
                syncStatus(true);
              }
            }}
            className="btn btn-xs h-7 rounded-md bg-error text-error-content border-none font-bold"
          >
            Hubungkan Ulang
          </button>
        </div>
      )}

      {/* Quick Setup Warning if RadioBOSS Disconnected */}
      {backendOnline && !radioBossStatus?.connected && (
        <div className="bg-warning/15 border-b border-warning/30 text-warning text-xs py-2.5 px-4 sm:px-6 flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            RadioBOSS belum terhubung. Pastikan Web Remote Control aktif di RadioBOSS (Port 9000).
          </span>
          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            className="btn btn-xs h-7 rounded-md bg-warning text-warning-content border-none font-bold"
          >
            Atur Password / Port RadioBOSS
          </button>
        </div>
      )}

      {/* Main Studio Workbench */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-5">
        {/* ZONE 1B: Master On-Air Monitor & Transport Deck */}
        <NowPlayingWidget
          nowPlaying={radioBossStatus?.now_playing}
          connected={radioBossStatus?.connected ?? false}
          autoRefresh={autoRefresh}
          onToggleAutoRefresh={() => setAutoRefresh(!autoRefresh)}
          onControl={handlePlaybackControl}
          isControlling={isControlling}
          onUpdateCastTitle={async (newTitle) => {
            await setLiveCastTitle(newTitle);
            addToast(
              "success",
              `Judul siaran RadioBOSS berhasil diubah ke: "${newTitle}"`
            );
            syncStatus(true);
          }}
        />

        {/* 2-Column Broadcast Workbench (Zone 2 Left + Zone 3 Right) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* ZONE 2: Left Column (Discovery & Catalog Deck) */}
          <div className="lg:col-span-7 space-y-5">
            {/* Smart Omnibox Search & Studio Tracklist */}
            <SearchSection
              onSelectTrack={(track) => setSelectedTrack(track)}
              onSearch={handleSearch}
              onResolveUrl={handleResolveUrl}
              searchResults={searchResults}
              isSearching={isSearching}
              isResolving={isResolving}
              selectedTrackId={selectedTrack?.video_id}
            />

            {/* Catalog & Rotation Switcher (Smart Recommendations + Saved Playlist Sets) */}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-1 bg-base-200 border border-base-300 p-1 rounded-lg">
                <button
                  type="button"
                  onClick={() => setCatalogTab("recommendations")}
                  className={`flex items-center justify-center gap-2 py-2 px-3 text-xs font-bold rounded-md transition-colors ${
                    catalogTab === "recommendations"
                      ? "bg-primary text-primary-content"
                      : "text-base-content/70 hover:text-base-content"
                  }`}
                >
                  <Compass className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">Rekomendasi &amp; Rotasi DJ</span>
                </button>

                <button
                  type="button"
                  onClick={() => setCatalogTab("sets")}
                  className={`flex items-center justify-center gap-2 py-2 px-3 text-xs font-bold rounded-md transition-colors ${
                    catalogTab === "sets"
                      ? "bg-primary text-primary-content"
                      : "text-base-content/70 hover:text-base-content"
                  }`}
                >
                  <FolderHeart className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">Koleksi Set Playlist</span>
                </button>
              </div>

              {catalogTab === "recommendations" ? (
                <SmartRecommendationsWidget
                  seedTrack={selectedTrack}
                  currentArtist={
                    radioBossStatus?.now_playing?.title
                      ? radioBossStatus.now_playing.title.split(" - ")[0]
                      : null
                  }
                  onSelectTrack={(track) => setSelectedTrack(track)}
                  onQueueTrack={async (track, pos) => {
                    await queueTrackWithGuard(track, pos, true, undefined, true);
                  }}
                  isQueueing={isQueueing}
                />
              ) : (
                <PlaylistSetsWidget
                  onSelectTrack={(track) => setSelectedTrack(track)}
                  onQueueTrack={async (track, pos) => {
                    await queueTrackWithGuard(track, pos, true, undefined, true);
                  }}
                  onAddToast={addToast}
                  isQueueing={isQueueing}
                  onQueueComplete={() => {
                    syncStatus();
                    syncPlaylist(true);
                  }}
                />
              )}
            </div>
          </div>

          {/* ZONE 3: Right Column (Cue Deck & Live On-Air Dispatch Monitor) */}
          <div className="lg:col-span-5 lg:sticky lg:top-16 space-y-5">
            {/* Top Module: Active Studio Cue Deck or Compact Standby Deck */}
            {selectedTrack ? (
              <TrackPreviewCard
                track={selectedTrack}
                onQueue={handleQueueTrack}
                onUpdateMetadata={handleUpdateSelectedMetadata}
                isQueueing={isQueueing}
                activePos={activeQueuePos}
              />
            ) : (
              <div className="rounded-xl bg-base-200 border border-base-300 p-5 space-y-3">
                <div className="flex items-center justify-between border-b border-base-300 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-base-100 border border-base-300 text-base-content/70">
                      <Headphones className="h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-base-content">
                        Studio Cue &amp; Dispatch Deck
                      </h3>
                      <p className="text-xs text-base-content/60">
                        Pratinjau Headphone &amp; Injeksi Antrean Siaran
                      </p>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-base-100 border border-base-300 text-xs font-mono text-base-content/60">
                    STANDBY
                  </span>
                </div>

                <div className="p-4 rounded-lg bg-base-100 border border-base-300 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <p className="text-xs text-base-content/70 leading-relaxed">
                    Klik lagu dari hasil pencarian atau daftar rekomendasi di sebelah kiri untuk memuat pratinjau audio, lirik penyiar, dan tombol kirim ke RadioBOSS.
                  </p>
                  {searchResults.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setSelectedTrack(searchResults[0])}
                      className="btn btn-secondary btn-sm h-8 rounded-lg text-xs font-semibold gap-1.5 shrink-0"
                    >
                      <Play className="h-3.5 w-3.5" />
                      <span>Muat Hasil #01</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Bottom Module: Live RadioBOSS Queue & Request Log right beneath Dispatch controls */}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-1 bg-base-200 border border-base-300 p-1 rounded-lg">
                <button
                  type="button"
                  onClick={() => setQueueTab("playlist")}
                  className={`flex items-center justify-center gap-2 py-2 px-3 text-xs font-bold rounded-md transition-colors ${
                    queueTab === "playlist"
                      ? "bg-primary text-primary-content"
                      : "text-base-content/70 hover:text-base-content"
                  }`}
                >
                  <ListMusic className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">Antrean RadioBOSS</span>
                  <span
                    className={`px-1.5 py-0.2 rounded text-xs font-mono tabular-nums ${
                      queueTab === "playlist"
                        ? "bg-primary-content/15 text-primary-content"
                        : "bg-base-100 text-base-content/70"
                    }`}
                  >
                    {playlistTracks.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setQueueTab("history")}
                  className={`flex items-center justify-center gap-2 py-2 px-3 text-xs font-bold rounded-md transition-colors ${
                    queueTab === "history"
                      ? "bg-primary text-primary-content"
                      : "text-base-content/70 hover:text-base-content"
                  }`}
                >
                  <History className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">Riwayat Request</span>
                  <span
                    className={`px-1.5 py-0.2 rounded text-xs font-mono tabular-nums ${
                      queueTab === "history"
                        ? "bg-primary-content/15 text-primary-content"
                        : "bg-base-100 text-base-content/70"
                    }`}
                  >
                    {history.length}
                  </span>
                </button>
              </div>

              {queueTab === "playlist" ? (
                <PlaylistQueueWidget
                  tracks={playlistTracks}
                  isLoading={isPlaylistLoading}
                  onRefresh={() => syncPlaylist(true)}
                  connected={radioBossStatus?.connected ?? false}
                />
              ) : (
                <QueueHistory
                  history={history}
                  onClearHistory={handleClearHistory}
                  onRequeue={handleRequeue}
                />
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Studio Console Footer */}
      <footer className="py-4 px-6 border-t border-base-300 text-center text-xs text-base-content/60">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="flex items-center gap-2">
            <span className="font-semibold text-base-content/80">
              Radio Caster Bridge
            </span>
            <span>•</span>
            <span className="font-mono tabular-nums">v{APP_VERSION}</span>
          </p>
          <p>
            Crafted by{" "}
            <a
              href="https://hi.oktaa.my.id"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-base-content/80 hover:text-primary transition-colors underline decoration-base-content/30"
            >
              Tayen
            </a>
          </p>
        </div>
      </footer>

      {/* Toast Notification Container */}
      <ToastNotification toasts={toasts} onDismiss={dismissToast} />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSettingsSaved={() => {
          syncStatus();
          setIsSettingsOpen(false);
        }}
        onOpenUpdateModal={() => setIsUpdateOpen(true)}
      />

      {/* Auto Update Modal */}
      <UpdateModal
        isOpen={isUpdateOpen}
        onClose={() => setIsUpdateOpen(false)}
        initialCheckResult={updateResult}
        onUpdateDetected={(res) => setUpdateResult(res)}
      />
    </div>
  );
}
