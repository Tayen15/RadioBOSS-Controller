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
import { SmartRecommendationsWidget } from "@/components/SmartRecommendationsWidget";
import { PlaylistSetsWidget } from "@/components/PlaylistSetsWidget";
import { Music2, ListMusic, History, FolderHeart } from "lucide-react";
import {
  TrackItem,
  RadioBOSSStatus,
  HistoryItem,
  PlaybackAction,
  PlaylistItem,
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
} from "@/lib/api";

export default function DashboardPage() {
  // Connection & settings states
  const [backendOnline, setBackendOnline] = useState<boolean>(false);
  const [radioBossStatus, setRadioBossStatus] =
    useState<RadioBOSSStatus | null>(null);
  const [isStatusLoading, setIsStatusLoading] = useState<boolean>(false);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

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

  // Fase 1: Playback Transport & Playlist Queue states
  const [isControlling, setIsControlling] = useState<boolean>(false);
  const [playlistTracks, setPlaylistTracks] = useState<PlaylistItem[]>([]);
  const [isPlaylistLoading, setIsPlaylistLoading] = useState<boolean>(false);
  const [bottomLeftTab, setBottomLeftTab] = useState<"playlist" | "sets" | "history">("playlist");

  // Fetch permanent history from backend file storage on mount
  useEffect(() => {
    fetchQueueHistory()
      .then((serverHistory) => {
        if (serverHistory && Array.isArray(serverHistory) && serverHistory.length > 0) {
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

  const addToast = (type: "success" | "error", text: string) => {
    const newToast: ToastMessage = {
      id: `${Date.now()}-${Math.random()}`,
      type,
      text,
    };
    setToasts((prev) => [newToast, ...prev]);
  };

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Check connectivity and fetch now playing
  const isSyncingRef = React.useRef(false);
  const syncStatus = useCallback(async (silent = false) => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;
    if (!silent) setIsStatusLoading(true);
    try {
      const isHealthy = await checkBackendHealth();
      setBackendOnline(isHealthy);

      if (isHealthy) {
        const rbStatus = await fetchRadioBossStatus();
        setRadioBossStatus(rbStatus);
      } else {
        setRadioBossStatus({
          connected: false,
          error: "Backend server offline",
        });
      }
    } catch {
      setBackendOnline(false);
      setRadioBossStatus({ connected: false, error: "Gagal menghubungkan" });
    } finally {
      isSyncingRef.current = false;
      if (!silent) setIsStatusLoading(false);
    }
  }, []);

  // Fetch upcoming RadioBOSS playlist
  const syncPlaylist = useCallback(async () => {
    setIsPlaylistLoading(true);
    try {
      const res = await fetchRadioBossPlaylist(10);
      if (res.success && res.tracks) {
        setPlaylistTracks(res.tracks);
      }
    } catch {
      // Ignore background errors
    } finally {
      setIsPlaylistLoading(false);
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
        syncPlaylist();
      }, 400);
    } catch (err) {
      addToast(
        "error",
        err instanceof Error
          ? err.message
          : `Gagal mengeksekusi perintah ${action}.`,
      );
    } finally {
      setIsControlling(false);
    }
  };

  // Initial fetch and auto-refresh loop (Realtime: 1 second)
  useEffect(() => {
    let isCancelled = false;

    // Async deferred call to prevent synchronous cascading render during effect mount
    const timer = setTimeout(() => {
      if (!isCancelled) {
        syncStatus();
        syncPlaylist();
      }
    }, 0);

    if (!autoRefresh) {
      return () => {
        isCancelled = true;
        clearTimeout(timer);
      };
    }

    let tickCount = 0;
    const interval = setInterval(() => {
      if (!isCancelled) {
        syncStatus(true);
        tickCount++;
        // Refresh playlist every 3 seconds
        if (tickCount % 3 === 0) {
          syncPlaylist();
        }
      }
    }, 1000);

    return () => {
      isCancelled = true;
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [autoRefresh, syncStatus, syncPlaylist]);

  // Handle Search YouTube Music
  const handleSearch = async (query: string) => {
    setIsSearching(true);
    try {
      const resp = await searchYouTubeMusic(query, 6);
      if (resp.results && resp.results.length > 0) {
        setSearchResults(resp.results);
        // Automatically select the first official studio track
        setSelectedTrack(resp.results[0]);
      } else {
        addToast(
          "error",
          `Tidak ditemukan lagu studio untuk query '${query}'.`,
        );
      }
    } catch (err) {
      addToast(
        "error",
        err instanceof Error
          ? err.message
          : "Terjadi kesalahan saat mencari lagu.",
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
          resp.error || "Gagal mengekstrak lagu dari URL tersebut.",
        );
      }
    } catch (err) {
      addToast(
        "error",
        err instanceof Error ? err.message : "Gagal memproses URL.",
      );
    } finally {
      setIsResolving(false);
    }
  };

  // Handle Queuing to RadioBOSS with Anti-Repeat Safety Guard
  const queueTrackWithGuard = async (
    targetTrack: TrackItem,
    pos: number,
    useRelay: boolean = true
  ) => {
    // Anti-Repeat Safety Guard: warn if artist was played or queued recently
    const primaryArtist = targetTrack.artists?.[0]?.toLowerCase()?.trim();
    if (primaryArtist) {
      const recentArtistPlayed = history.slice(0, 3).some(
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
          `⚠️ Peringatan Anti-Repeat Siaran:\nLagu dari artis "${targetTrack.artists[0]}" baru saja diputar atau ada di antrean terakhir!\n\nTetap ingin menambahkan lagu ini ke antrean RadioBOSS?`
        );
        if (!confirmRepeat) {
          return;
        }
      }
    }

    setIsQueueing(true);
    setActiveQueuePos(pos);

    const posLabel = pos === 1 ? "Putar Berikutnya" : "Antrean Bawah";

    // Format strictly as "Nama Artis - Judul Lagu"
    const artistStr =
      targetTrack.artists?.filter(Boolean).join(", ").trim() || "";
    const cleanTitle = targetTrack.title.trim();
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
        artists: targetTrack.artists,
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

      // Refresh status and playlist after insertion
      setTimeout(() => {
        syncStatus();
        syncPlaylist();
      }, 1000);
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

  const handleQueueTrack = async (pos: number, useRelay: boolean) => {
    if (selectedTrack) {
      await queueTrackWithGuard(selectedTrack, pos, useRelay);
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
      {/* Top Header & Connection Bar */}
      <ConnectionBar
        backendOnline={backendOnline}
        radioBossStatus={radioBossStatus}
        loading={isStatusLoading}
        onRefresh={syncStatus}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* Quick Setup Warning if RadioBOSS Disconnected */}
      {backendOnline && !radioBossStatus?.connected && (
        <div className="alert alert-warning text-xs py-2.5 px-4 sm:px-6 rounded-none border-x-0 border-t-0 shadow-sm flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 font-medium">
            ⚠️ RadioBOSS belum terhubung. Pastikan Web Remote Control aktif di
            RadioBOSS (Port 9000).
          </span>
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="btn btn-xs btn-outline font-semibold"
          >
            Atur Password / Port RadioBOSS
          </button>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Live On-Air Banner with Remote Transport Controls */}
        <NowPlayingWidget
          nowPlaying={radioBossStatus?.now_playing}
          connected={radioBossStatus?.connected ?? false}
          autoRefresh={autoRefresh}
          onToggleAutoRefresh={() => setAutoRefresh(!autoRefresh)}
          onControl={handlePlaybackControl}
          isControlling={isControlling}
        />

        {/* Two-column layout for studio workflow */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column (Search & Deck Tabs) */}
          <div className="lg:col-span-7 space-y-6">
            <SearchSection
              onSelectTrack={(track) => setSelectedTrack(track)}
              onSearch={handleSearch}
              onResolveUrl={handleResolveUrl}
              searchResults={searchResults}
              isSearching={isSearching}
              isResolving={isResolving}
              selectedTrackId={selectedTrack?.video_id}
            />

            {/* Tabbed Deck: RadioBOSS Playlist Inspector vs Riwayat Request */}
            <div className="space-y-3">
              <div className="tabs tabs-box bg-base-300/40 p-1 rounded-2xl w-full flex gap-1">
                <button
                  type="button"
                  onClick={() => setBottomLeftTab("playlist")}
                  className={`tab flex-1 gap-1.5 sm:gap-2 text-[11px] sm:text-xs font-semibold rounded-xl transition-all ${
                    bottomLeftTab === "playlist"
                      ? "tab-active bg-primary text-primary-content shadow-sm"
                      : "text-base-content/70 hover:text-base-content"
                  }`}
                >
                  <ListMusic className="h-3.5 w-3.5" />
                  <span className="truncate">Antrean RadioBOSS</span>
                  <span className="badge badge-accent badge-xs font-bold scale-90">
                    {playlistTracks.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setBottomLeftTab("sets")}
                  className={`tab flex-1 gap-1.5 sm:gap-2 text-[11px] sm:text-xs font-semibold rounded-xl transition-all ${
                    bottomLeftTab === "sets"
                      ? "tab-active bg-primary text-primary-content shadow-sm"
                      : "text-base-content/70 hover:text-base-content"
                  }`}
                >
                  <FolderHeart className="h-3.5 w-3.5" />
                  <span className="truncate">Set Playlist</span>
                  <span className="badge badge-accent badge-xs font-bold scale-90">
                    Koleksi
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setBottomLeftTab("history")}
                  className={`tab flex-1 gap-1.5 sm:gap-2 text-[11px] sm:text-xs font-semibold rounded-xl transition-all ${
                    bottomLeftTab === "history"
                      ? "tab-active bg-primary text-primary-content shadow-sm"
                      : "text-base-content/70 hover:text-base-content"
                  }`}
                >
                  <History className="h-3.5 w-3.5" />
                  <span className="truncate">Riwayat Request</span>
                  <span className="badge badge-ghost badge-xs font-bold scale-90">
                    {history.length}
                  </span>
                </button>
              </div>

              {bottomLeftTab === "playlist" && (
                <PlaylistQueueWidget
                  tracks={playlistTracks}
                  isLoading={isPlaylistLoading}
                  onRefresh={syncPlaylist}
                  connected={radioBossStatus?.connected ?? false}
                />
              )}

              {bottomLeftTab === "sets" && (
                <PlaylistSetsWidget
                  onSelectTrack={(track) => setSelectedTrack(track)}
                  onQueueTrack={(track, pos) => queueTrackWithGuard(track, pos, true)}
                  onAddToast={addToast}
                  isQueueing={isQueueing}
                  onQueueComplete={() => {
                    syncStatus();
                    syncPlaylist();
                  }}
                />
              )}

              {bottomLeftTab === "history" && (
                <QueueHistory
                  history={history}
                  onClearHistory={handleClearHistory}
                  onRequeue={handleRequeue}
                />
              )}
            </div>
          </div>

          {/* Right Column (Track Preview & RadioBOSS Dispatch Card & Recommendations) */}
          <div className="lg:col-span-5 lg:sticky lg:top-20 space-y-6">
            {selectedTrack ? (
              <TrackPreviewCard
                track={selectedTrack}
                onQueue={handleQueueTrack}
                isQueueing={isQueueing}
                activePos={activeQueuePos}
              />
            ) : (
              <div className="card bg-base-200 border border-base-300 p-6 shadow-sm space-y-4">
                <div className="flex items-center gap-3 border-b border-base-300 pb-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Music2 className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-base-content">
                      Studio Dispatch Deck
                    </h3>
                    <p className="text-[11px] text-base-content/60">
                      Pilih lagu untuk membuka pratinjau audio &amp; kontrol
                      siaran
                    </p>
                  </div>
                </div>

                <div className="space-y-2.5 text-xs text-base-content/70">
                  <div className="flex items-start gap-2.5 p-3 rounded-xl bg-base-100 border border-base-300/60">
                    <span className="badge badge-primary badge-xs mt-0.5 font-bold">
                      1
                    </span>
                    <p className="leading-relaxed">
                      <strong>Cari Lagu Studio:</strong> Temukan lagu resmi
                      YouTube Music di kolom kiri atau paste URL langsung.
                    </p>
                  </div>
                  <div className="flex items-start gap-2.5 p-3 rounded-xl bg-base-100 border border-base-300/60">
                    <span className="badge badge-accent badge-xs mt-0.5 font-bold">
                      2
                    </span>
                    <p className="leading-relaxed">
                      <strong>Caster Preview:</strong> Dengarkan lagu di
                      headphone sebelum mengudara untuk memastikan intro &amp;
                      versi lagu pas.
                    </p>
                  </div>
                  <div className="flex items-start gap-2.5 p-3 rounded-xl bg-base-100 border border-base-300/60">
                    <span className="badge badge-secondary badge-xs mt-0.5 font-bold">
                      3
                    </span>
                    <p className="leading-relaxed">
                      <strong>Kirim ke RadioBOSS:</strong> Sisipkan otomatis ke{" "}
                      <em>Putar Berikutnya</em> atau antrean bawah dengan tag
                      ID3 dan cover art lengkap.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Smart Song Recommendations (Up Next & Top Artist Songs) */}
            <SmartRecommendationsWidget
              seedTrack={selectedTrack}
              currentArtist={
                radioBossStatus?.now_playing?.title
                  ? radioBossStatus.now_playing.title.split(" - ")[0]
                  : null
              }
              onSelectTrack={(track) => setSelectedTrack(track)}
              onQueueTrack={(track, pos) => queueTrackWithGuard(track, pos, true)}
              isQueueing={isQueueing}
            />
          </div>
        </div>
      </main>

      {/* Refined Footer Info */}
      <footer className="footer footer-center p-5 bg-base-200 border-t border-base-300 text-base-content/70">
        <div className="flex flex-col sm:flex-row items-center justify-between w-full max-w-7xl px-4 text-xs gap-3">
          <div className="flex items-center gap-2">
            <span className="font-bold text-base-content">
              Radio Caster Bridge
            </span>
            <span className="text-base-content/30">•</span>
            <span className="text-base-content/70">
              YouTube Music Studio Streamer &amp; RadioBOSS Controller
            </span>
          </div>
          <div className="flex items-center gap-2 text-base-content/60">
            <span>&copy; {new Date().getFullYear()}</span>
            <span className="text-base-content/30">•</span>
            <span>Crafted by</span>
            <a
              href="https://hi.oktaa.my.id"
              target="_blank"
              rel="noopener noreferrer"
              className="link link-primary font-bold hover:underline transition-all"
            >
              Tayen
            </a>
          </div>
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
      />
    </div>
  );
}
