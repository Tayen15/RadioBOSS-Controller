"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import Image from "next/image";
import {
  FolderHeart,
  Plus,
  Play,
  Pause,
  Trash2,
  FolderOpen,
  Link as LinkIcon,
  Clock,
  Send,
  Loader2,
  Search,
  ChevronUp,
  ChevronDown,
  ListX,
  X,
  FastForward,
  Music2,
} from "lucide-react";
import { PlaylistSet, PlaylistSetDetails, PlaylistSetItem, TrackItem } from "@/lib/types";
import {
  fetchPlaylistSets,
  createPlaylistSet,
  fetchPlaylistSetDetails,
  deletePlaylistSet,
  addTrackToPlaylistSet,
  removeTrackFromPlaylistSet,
  clearPlaylistSetTracks,
  reorderPlaylistSetTracks,
  resolvePlaylistUrl,
  queueToRadioBoss,
  getStreamRelayUrl,
} from "@/lib/api";

interface PlaylistSetsWidgetProps {
  onSelectTrack: (track: TrackItem) => void;
  onQueueTrack?: (track: TrackItem, pos: number) => void;
  onAddToast: (type: "success" | "error", message: string) => void;
  onQueueComplete?: () => void;
  isQueueing?: boolean;
}

export function PlaylistSetsWidget({
  onSelectTrack,
  onQueueTrack,
  onAddToast,
  onQueueComplete,
  isQueueing,
}: PlaylistSetsWidgetProps) {
  const [sets, setSets] = useState<PlaylistSet[]>([]);
  const [isLoadingSets, setIsLoadingSets] = useState<boolean>(false);
  const [selectedSetId, setSelectedSetId] = useState<string | null>(null);
  const [selectedSetDetails, setSelectedSetDetails] =
    useState<PlaylistSetDetails | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState<boolean>(false);

  const [isCreatingSet, setIsCreatingSet] = useState<boolean>(false);
  const [newSetName, setNewSetName] = useState<string>("");
  const [newSetDesc, setNewSetDesc] = useState<string>("");

  const [isImporterOpen, setIsImporterOpen] = useState<boolean>(false);
  const [importUrl, setImportUrl] = useState<string>("");
  const [isResolvingPlaylist, setIsResolvingPlaylist] = useState<boolean>(false);
  const [resolvedTracks, setResolvedTracks] = useState<TrackItem[]>([]);
  const [resolvedTitle, setResolvedTitle] = useState<string>("");

  const [isBatchQueueing, setIsBatchQueueing] = useState<boolean>(false);
  const [batchProgress, setBatchProgress] = useState<{
    current: number;
    total: number;
  }>({ current: 0, total: 0 });

  const [previewTrackId, setPreviewTrackId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [filterQuery, setFilterQuery] = useState<string>("");
  const [prevSelectedSetId, setPrevSelectedSetId] = useState<string | null>(null);

  // Synchronize detail loading state during render phase
  if (selectedSetId !== prevSelectedSetId) {
    setPrevSelectedSetId(selectedSetId);
    if (!selectedSetId) {
      setSelectedSetDetails(null);
      setIsLoadingDetails(false);
    } else {
      setIsLoadingDetails(true);
    }
  }

  const loadSets = useCallback(async () => {
    setIsLoadingSets(true);
    try {
      const data = await fetchPlaylistSets();
      setSets(data);
      if (data.length > 0) {
        setSelectedSetId((prev) => prev ?? data[0].id);
      }
    } catch (err) {
      onAddToast(
        "error",
        err instanceof Error ? err.message : "Gagal memuat playlist set."
      );
    } finally {
      setIsLoadingSets(false);
    }
  }, [onAddToast]);

  useEffect(() => {
    let isMounted = true;
    fetchPlaylistSets()
      .then((data) => {
        if (!isMounted) return;
        setSets(data);
        if (data.length > 0) {
          setSelectedSetId((prev) => prev ?? data[0].id);
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        onAddToast(
          "error",
          err instanceof Error ? err.message : "Gagal memuat playlist set."
        );
      })
      .finally(() => {
        if (isMounted) setIsLoadingSets(false);
      });

    return () => {
      isMounted = false;
    };
  }, [onAddToast]);

  const loadSetDetails = useCallback(
    async (setId: string) => {
      setIsLoadingDetails(true);
      try {
        const details = await fetchPlaylistSetDetails(setId);
        setSelectedSetDetails(details);
      } catch (err) {
        onAddToast(
          "error",
          err instanceof Error ? err.message : "Gagal mengambil detail set."
        );
      } finally {
        setIsLoadingDetails(false);
      }
    },
    [onAddToast]
  );

  useEffect(() => {
    if (!selectedSetId) return;

    let isMounted = true;
    fetchPlaylistSetDetails(selectedSetId)
      .then((details) => {
        if (isMounted) setSelectedSetDetails(details);
      })
      .catch((err) => {
        if (!isMounted) return;
        onAddToast(
          "error",
          err instanceof Error ? err.message : "Gagal mengambil detail set."
        );
      })
      .finally(() => {
        if (isMounted) setIsLoadingDetails(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedSetId, onAddToast]);

  const handleCreateSet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSetName.trim()) return;

    try {
      const created = await createPlaylistSet(newSetName.trim(), newSetDesc.trim());
      onAddToast("success", `Set "${created.name}" berhasil dibuat.`);
      setNewSetName("");
      setNewSetDesc("");
      setIsCreatingSet(false);
      await loadSets();
      setSelectedSetId(created.id);
    } catch (err) {
      onAddToast(
        "error",
        err instanceof Error ? err.message : "Gagal membuat playlist set."
      );
    }
  };

  const handleDeleteSet = async (setId: string, setName: string) => {
    if (!window.confirm(`Hapus playlist set "${setName}" beserta seluruh lagunya?`)) {
      return;
    }
    try {
      await deletePlaylistSet(setId);
      onAddToast("success", `Set "${setName}" berhasil dihapus.`);
      if (selectedSetId === setId) {
        setSelectedSetId(null);
      }
      await loadSets();
    } catch (err) {
      onAddToast(
        "error",
        err instanceof Error ? err.message : "Gagal menghapus playlist set."
      );
    }
  };

  const handleRemoveTrack = async (itemId: string) => {
    if (!selectedSetId) return;
    try {
      await removeTrackFromPlaylistSet(selectedSetId, itemId);
      onAddToast("success", "Lagu dihapus dari set.");
      loadSetDetails(selectedSetId);
      loadSets();
    } catch (err) {
      onAddToast(
        "error",
        err instanceof Error ? err.message : "Gagal menghapus lagu dari set."
      );
    }
  };

  const handleResolvePlaylist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importUrl.trim()) return;

    setIsResolvingPlaylist(true);
    try {
      const res = await resolvePlaylistUrl(importUrl.trim(), 40);
      setResolvedTitle(res.title);
      setResolvedTracks(res.tracks);
      onAddToast("success", `Berhasil mengekstrak ${res.count} lagu dari playlist.`);
    } catch (err) {
      onAddToast(
        "error",
        err instanceof Error ? err.message : "Gagal membaca playlist YouTube."
      );
    } finally {
      setIsResolvingPlaylist(false);
    }
  };

  const handleSaveImportedToSet = async () => {
    if (!selectedSetId || resolvedTracks.length === 0) return;

    setIsResolvingPlaylist(true);
    try {
      for (const track of resolvedTracks) {
        await addTrackToPlaylistSet(selectedSetId, track);
      }
      onAddToast(
        "success",
        `${resolvedTracks.length} lagu berhasil disimpan ke set.`
      );
      setResolvedTracks([]);
      setImportUrl("");
      setIsImporterOpen(false);
      loadSetDetails(selectedSetId);
      loadSets();
    } catch (err) {
      onAddToast(
        "error",
        err instanceof Error ? err.message : "Gagal menyimpan lagu ke set."
      );
    } finally {
      setIsResolvingPlaylist(false);
    }
  };

  const handleBatchQueue = async (tracksToQueue: (PlaylistSetItem | TrackItem)[]) => {
    if (tracksToQueue.length === 0) return;

    if (
      !window.confirm(
        `Kirim ${tracksToQueue.length} lagu sekaligus ke antrean RadioBOSS?`
      )
    ) {
      return;
    }

    setIsBatchQueueing(true);
    setBatchProgress({ current: 0, total: tracksToQueue.length });

    let successCount = 0;
    for (let i = 0; i < tracksToQueue.length; i++) {
      const track = tracksToQueue[i];
      setBatchProgress({ current: i + 1, total: tracksToQueue.length });

      try {
        await queueToRadioBoss(
          track.video_id,
          `${track.artists?.[0] ? track.artists.join(", ") + " - " : ""}${track.title}`,
          -1,
          true,
          undefined,
          {
            artist: track.artists?.[0] || "",
            album: track.album || "",
            thumbnail_url: track.thumbnail_url || "",
          }
        );
        successCount++;
      } catch {
        // Continue queueing remaining songs
      }

      await new Promise((r) => setTimeout(r, 600));
    }

    setIsBatchQueueing(false);
    onAddToast(
      "success",
      `Pengiriman selesai: ${successCount} dari ${tracksToQueue.length} lagu masuk ke RadioBOSS.`
    );
    if (onQueueComplete) {
      onQueueComplete();
    }
  };

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

  const totalDurationFormatted = useMemo(() => {
    if (!selectedSetDetails?.tracks?.length) return "00:00";
    const totalSecs = selectedSetDetails.tracks.reduce(
      (acc, t) => acc + (t.duration_seconds || 0),
      0
    );
    const hours = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    if (hours > 0) {
      return `${hours}j ${mins}m`;
    }
    return `${mins}m ${secs}s`;
  }, [selectedSetDetails]);

  const filteredTracks = useMemo(() => {
    if (!selectedSetDetails?.tracks) return [];
    if (!filterQuery.trim()) return selectedSetDetails.tracks;
    const q = filterQuery.toLowerCase().trim();
    return selectedSetDetails.tracks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.artists.some((a) => a.toLowerCase().includes(q))
    );
  }, [selectedSetDetails, filterQuery]);

  const handleMoveTrack = async (index: number, direction: "up" | "down") => {
    if (!selectedSetDetails || !selectedSetId) return;
    const tracksList = [...selectedSetDetails.tracks];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= tracksList.length) return;

    const temp = tracksList[index];
    tracksList[index] = tracksList[targetIndex];
    tracksList[targetIndex] = temp;

    setSelectedSetDetails({
      ...selectedSetDetails,
      tracks: tracksList,
    });

    try {
      const itemIds = tracksList.map((t) => t.id);
      await reorderPlaylistSetTracks(selectedSetId, itemIds);
    } catch {
      onAddToast("error", "Gagal memperbarui urutan lagu.");
      loadSetDetails(selectedSetId);
    }
  };

  const handleClearSetTracks = async () => {
    if (!selectedSetId || !selectedSetDetails) return;
    if (
      !window.confirm(
        `Kosongkan seluruh (${selectedSetDetails.tracks.length}) lagu dari set "${selectedSetDetails.name}"?`
      )
    ) {
      return;
    }
    try {
      await clearPlaylistSetTracks(selectedSetId);
      onAddToast("success", "Semua lagu di set berhasil dikosongkan.");
      loadSetDetails(selectedSetId);
      loadSets();
    } catch (err) {
      onAddToast(
        "error",
        err instanceof Error ? err.message : "Gagal mengosongkan lagu di set."
      );
    }
  };

  const handleQueueSingle = async (trackObj: TrackItem, pos: number) => {
    if (onQueueTrack) {
      onQueueTrack(trackObj, pos);
    } else {
      try {
        await queueToRadioBoss(
          trackObj.video_id,
          `${trackObj.artists?.[0] ? trackObj.artists.join(", ") + " - " : ""}${trackObj.title}`,
          pos,
          true,
          undefined,
          {
            artist: trackObj.artists?.[0] || "",
            album: trackObj.album || "",
            thumbnail_url: trackObj.thumbnail_url || "",
          }
        );
        onAddToast(
          "success",
          `Lagu dikirim ke RadioBOSS (${pos === 1 ? "Putar Berikutnya" : "Antrean Bawah"}).`
        );
        if (onQueueComplete) onQueueComplete();
      } catch (err) {
        onAddToast(
          "error",
          err instanceof Error ? err.message : "Gagal mengirim lagu ke RadioBOSS."
        );
      }
    }
  };

  return (
    <section
      aria-label="Koleksi Set Playlist & Importer"
      className="rounded-xl bg-base-200 border border-base-300 p-4 sm:p-5 space-y-4"
    >
      <audio
        ref={audioRef}
        onEnded={handleAudioEnded}
        onError={() => setPreviewTrackId(null)}
        className="hidden"
      />

      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-base-300 pb-3">
        <div>
          <h3 className="font-bold text-sm text-base-content">
            Koleksi Set Playlist &amp; Importer
          </h3>
          <p className="text-xs text-base-content/70">
            Susun daftar lagu program siaran atau impor playlist dari YouTube Music
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsImporterOpen(!isImporterOpen)}
            className="btn btn-xs h-8 px-3 rounded-lg bg-base-100 border border-base-300 hover:bg-base-300 text-xs font-semibold text-base-content gap-1.5"
            title="Impor playlist dari YouTube atau YouTube Music"
          >
            <LinkIcon className="h-3.5 w-3.5 text-accent" />
            <span>Impor URL Playlist</span>
          </button>

          <button
            type="button"
            onClick={() => setIsCreatingSet(!isCreatingSet)}
            className="btn btn-primary btn-xs h-8 px-3 rounded-lg gap-1.5 text-xs font-bold text-primary-content"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Buat Set Baru</span>
          </button>
        </div>
      </div>

      {/* Form: Create New Set */}
      {isCreatingSet && (
        <form
          onSubmit={handleCreateSet}
          className="bg-base-100 p-3.5 rounded-lg border border-base-300 space-y-3"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-base-content flex items-center gap-1.5">
              <Plus className="h-3.5 w-3.5 text-primary" />
              <span>Buat Set Siaran Baru</span>
            </span>
            <button
              type="button"
              onClick={() => setIsCreatingSet(false)}
              className="btn btn-ghost btn-xs h-7 px-2 text-xs text-base-content/70 hover:text-base-content"
            >
              Batal
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <input
              type="text"
              value={newSetName}
              onChange={(e) => setNewSetName(e.target.value)}
              placeholder="Nama Set (contoh: Morning Show, Pop Sore)"
              required
              className="input input-bordered input-sm h-9 bg-base-200 text-xs w-full rounded-md"
            />
            <input
              type="text"
              value={newSetDesc}
              onChange={(e) => setNewSetDesc(e.target.value)}
              placeholder="Deskripsi singkat program (opsional)"
              className="input input-bordered input-sm h-9 bg-base-200 text-xs w-full rounded-md"
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-sm h-9 rounded-md font-bold text-xs w-full text-primary-content"
          >
            Simpan Set Playlist
          </button>
        </form>
      )}

      {/* Form: YouTube Playlist Importer */}
      {isImporterOpen && (
        <div className="bg-base-100 p-3.5 rounded-lg border border-accent/40 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-accent flex items-center gap-1.5">
              <LinkIcon className="h-3.5 w-3.5" />
              <span>Impor Playlist YouTube / YT Music</span>
            </span>
            <button
              type="button"
              onClick={() => {
                setIsImporterOpen(false);
                setResolvedTracks([]);
              }}
              className="btn btn-ghost btn-xs h-7 px-2 text-xs text-base-content/70 hover:text-base-content"
            >
              Tutup
            </button>
          </div>

          <form onSubmit={handleResolvePlaylist} className="flex items-stretch gap-2">
            <input
              type="url"
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
              placeholder="Tempel URL Playlist (contoh: https://music.youtube.com/playlist?list=...)"
              required
              className="input input-bordered input-sm h-9 flex-1 bg-base-200 text-xs font-mono rounded-md"
            />
            <button
              type="submit"
              disabled={isResolvingPlaylist}
              className="btn btn-accent btn-sm h-9 px-3 rounded-md font-bold text-xs text-accent-content shrink-0 gap-1.5"
            >
              {isResolvingPlaylist ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Mengekstrak...</span>
                </>
              ) : (
                <span>Ekstrak Playlist</span>
              )}
            </button>
          </form>

          {resolvedTracks.length > 0 && (
            <div className="space-y-2.5 pt-2.5 border-t border-base-300">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-bold text-base-content truncate">
                  {resolvedTitle} ({resolvedTracks.length} lagu)
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleBatchQueue(resolvedTracks)}
                    disabled={isBatchQueueing}
                    className="btn btn-xs btn-primary h-8 px-3 rounded-md font-bold text-xs text-primary-content gap-1.5"
                    title="Kirim semua lagu hasil impor langsung ke RadioBOSS"
                  >
                    <Send className="h-3 w-3" />
                    <span>Kirim Semua ke RadioBOSS</span>
                  </button>

                  {selectedSetId && (
                    <button
                      type="button"
                      onClick={handleSaveImportedToSet}
                      disabled={isResolvingPlaylist}
                      className="btn btn-xs h-8 px-3 rounded-md bg-base-200 border border-accent/40 text-accent hover:bg-base-300 text-xs font-semibold"
                    >
                      Simpan ke Set Aktif
                    </button>
                  )}
                </div>
              </div>

              <div className="max-h-48 overflow-y-auto divide-y divide-base-300 bg-base-200 rounded-md border border-base-300 px-3 py-1">
                {resolvedTracks.slice(0, 15).map((track, i) => (
                  <div
                    key={track.video_id || i}
                    className="flex items-center justify-between text-xs py-1.5 gap-2"
                  >
                    <div className="truncate flex items-center gap-2 flex-1 min-w-0">
                      <span className="text-base-content/60 font-mono w-6 shrink-0">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="font-semibold truncate text-base-content">
                        {track.title}
                      </span>
                      <span className="text-base-content/70 truncate">
                        • {track.artists.join(", ")}
                      </span>
                    </div>
                    <span className="text-base-content/70 font-mono text-xs shrink-0 tabular-nums">
                      {track.duration_formatted}
                    </span>
                  </div>
                ))}
                {resolvedTracks.length > 15 && (
                  <p className="text-xs text-center text-base-content/70 py-2 font-mono">
                    + {resolvedTracks.length - 15} lagu lainnya siap disimpan
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Batch Queue Progress Readout */}
      {isBatchQueueing && (
        <div className="p-3 bg-primary/10 border border-primary/40 rounded-lg space-y-1.5">
          <div className="flex items-center justify-between text-xs font-bold text-primary">
            <span className="flex items-center gap-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>Mengirim batch lagu ke antrean RadioBOSS...</span>
            </span>
            <span className="font-mono tabular-nums">
              {batchProgress.current} / {batchProgress.total}
            </span>
          </div>
          <progress
            className="progress progress-primary w-full h-2"
            value={batchProgress.current}
            max={batchProgress.total}
          />
        </div>
      )}

      {/* Set Selector Tabs & Active Set Tracklist */}
      {isLoadingSets ? (
        <div className="py-8 text-center space-y-2 rounded-lg bg-base-100 border border-base-300">
          <span className="loading loading-spinner loading-sm text-primary" />
          <p className="text-xs text-base-content/70">Memuat koleksi playlist set...</p>
        </div>
      ) : sets.length === 0 ? (
        <div className="py-8 px-4 text-center space-y-1.5 bg-base-100 rounded-lg border border-base-300">
          <FolderHeart className="h-6 w-6 text-base-content/60 mx-auto" />
          <p className="text-xs text-base-content font-semibold">
            Belum Ada Koleksi Set Playlist
          </p>
          <p className="text-xs text-base-content/70">
            Gunakan tombol &quot;Buat Set Baru&quot; di atas untuk menyimpan daftar lagu per program siaran.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Set Selector Strip */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {sets.map((s) => {
              const isSelected = selectedSetId === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelectedSetId(s.id)}
                  className={`btn btn-xs h-8 px-3 rounded-md gap-2 shrink-0 text-xs transition-colors ${
                    isSelected
                      ? "bg-primary text-primary-content font-bold"
                      : "bg-base-100 border border-base-300 text-base-content/80 hover:text-base-content hover:bg-base-300"
                  }`}
                >
                  <FolderOpen className="h-3.5 w-3.5" />
                  <span className="max-w-[140px] truncate">{s.name}</span>
                  <span className="font-mono text-xs opacity-80">
                    ({s.track_count})
                  </span>
                </button>
              );
            })}
          </div>

          {/* Active Set Details */}
          {selectedSetDetails && (
            <div className="bg-base-100 rounded-lg border border-base-300 p-3.5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-base-300 pb-2.5">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-sm font-bold text-base-content">
                      {selectedSetDetails.name}
                    </h4>
                    <span className="px-2 py-0.5 rounded bg-base-200 border border-base-300 font-mono text-xs font-semibold text-base-content/80">
                      {selectedSetDetails.tracks.length} lagu
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-base-200 border border-base-300 font-mono text-xs text-primary">
                      <Clock className="h-3 w-3" />
                      <span>{totalDurationFormatted}</span>
                    </span>
                  </div>
                  {selectedSetDetails.description && (
                    <p className="text-xs text-base-content/70 mt-0.5">
                      {selectedSetDetails.description}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                  <button
                    type="button"
                    onClick={() => handleBatchQueue(selectedSetDetails.tracks)}
                    disabled={
                      isBatchQueueing || selectedSetDetails.tracks.length === 0
                    }
                    className="btn btn-primary btn-xs h-8 px-3 rounded-md gap-1.5 text-xs font-bold text-primary-content"
                    title="Kirim semua lagu di set ini secara berurutan ke RadioBOSS"
                  >
                    <Send className="h-3 w-3" />
                    <span>Kirim Semua ({selectedSetDetails.tracks.length})</span>
                  </button>

                  {selectedSetDetails.tracks.length > 0 && (
                    <button
                      type="button"
                      onClick={handleClearSetTracks}
                      className="btn btn-xs h-8 px-2.5 rounded-md bg-base-200 border border-base-300 text-xs font-medium text-base-content/80 hover:text-warning hover:bg-base-300 gap-1"
                      title="Kosongkan semua lagu di set ini"
                    >
                      <ListX className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Kosongkan</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() =>
                      handleDeleteSet(
                        selectedSetDetails.id,
                        selectedSetDetails.name
                      )
                    }
                    className="btn btn-xs h-8 px-2.5 rounded-md bg-base-200 border border-base-300 text-xs font-medium text-error hover:bg-error/15 gap-1"
                    title="Hapus set ini"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Hapus Set</span>
                  </button>
                </div>
              </div>

              {/* In-Set Filter */}
              {selectedSetDetails.tracks.length > 3 && (
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-base-content/60" />
                  <input
                    type="text"
                    value={filterQuery}
                    onChange={(e) => setFilterQuery(e.target.value)}
                    placeholder="Saring lagu di dalam set ini..."
                    className="input input-sm input-bordered w-full h-9 pl-9 pr-8 bg-base-200 text-xs rounded-md"
                  />
                  {filterQuery && (
                    <button
                      type="button"
                      onClick={() => setFilterQuery("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 flex items-center justify-center rounded text-base-content/60 hover:text-base-content"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              )}

              {/* Tracks List */}
              {isLoadingDetails ? (
                <div className="py-6 text-center">
                  <span className="loading loading-spinner loading-xs text-primary" />
                </div>
              ) : selectedSetDetails.tracks.length === 0 ? (
                <div className="py-6 text-center text-xs text-base-content/70">
                  Set ini masih kosong. Simpan lagu dari hasil pencarian atau gunakan Impor URL Playlist.
                </div>
              ) : filteredTracks.length === 0 ? (
                <div className="py-4 text-center text-xs text-base-content/70">
                  Tidak ditemukan lagu yang cocok dengan &quot;{filterQuery}&quot;.
                </div>
              ) : (
                <div className="divide-y divide-base-300 rounded-md border border-base-300 bg-base-200/50 max-h-80 overflow-y-auto">
                  {filteredTracks.map((item, index) => {
                    const isPlayingPreview = previewTrackId === item.video_id;
                    const indexStr = String(index + 1).padStart(2, "0");
                    const trackObj: TrackItem = {
                      video_id: item.video_id,
                      title: item.title,
                      artists: item.artists,
                      album: item.album,
                      year: item.year,
                      genre: item.genre,
                      thumbnail_url: item.thumbnail_url,
                      url: `https://music.youtube.com/watch?v=${item.video_id}`,
                      duration_seconds: item.duration_seconds,
                      duration_formatted: item.duration_formatted,
                    };

                    return (
                      <div
                        key={item.id}
                        className="group flex items-center justify-between gap-2.5 px-3 py-2 hover:bg-base-300/60 text-xs transition-colors"
                      >
                        {/* Left: Index + Artwork + Title */}
                        <div className="min-w-0 flex-1 flex items-center gap-2.5">
                          <span className="font-mono text-xs font-bold text-base-content/60 w-5 shrink-0">
                            {indexStr}
                          </span>

                          <div className="relative w-9 h-9 rounded-md overflow-hidden bg-base-300 border border-base-300 shrink-0">
                            {item.thumbnail_url ? (
                              <Image
                                src={item.thumbnail_url}
                                alt={item.title}
                                width={36}
                                height={36}
                                unoptimized
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-base-content/60">
                                <Music2 className="h-4 w-4" />
                              </div>
                            )}
                          </div>

                          <div
                            onClick={() => onSelectTrack(trackObj)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                onSelectTrack(trackObj);
                              }
                            }}
                            className="min-w-0 flex-1 cursor-pointer"
                            title="Klik untuk memuat ke Cue Deck"
                          >
                            <p className="text-sm font-semibold truncate text-base-content group-hover:text-primary transition-colors">
                              {item.title}
                            </p>
                            <p className="text-xs text-base-content/70 truncate">
                              {item.artists.join(", ") || "YouTube Music"}
                            </p>
                          </div>
                        </div>

                        {/* Right: Duration + Persistent Preview + Queue + Reorder + Delete */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-xs text-base-content/70 font-mono tabular-nums mr-1 hidden sm:inline">
                            {item.duration_formatted}
                          </span>

                          {/* Headphone Preview Button */}
                          <button
                            type="button"
                            onClick={() => handleTogglePreview(trackObj)}
                            aria-label={isPlayingPreview ? "Jeda pratinjau" : "Pratinjau headphone"}
                            className={`btn btn-xs h-8 w-8 p-0 rounded-md border ${
                              isPlayingPreview
                                ? "bg-accent text-accent-content border-accent"
                                : "bg-base-100 border-base-300 text-base-content/80 hover:text-base-content"
                            }`}
                            title={isPlayingPreview ? "Jeda Pratinjau" : "Dengarkan di Headphone"}
                          >
                            {isPlayingPreview ? (
                              <Pause className="h-3.5 w-3.5 fill-current" />
                            ) : (
                              <Play className="h-3.5 w-3.5 fill-current ml-0.5" />
                            )}
                          </button>

                          {/* Next */}
                          <button
                            type="button"
                            onClick={() => handleQueueSingle(trackObj, 1)}
                            disabled={isQueueing}
                            className="btn btn-primary btn-xs h-8 px-2.5 rounded-md font-bold text-xs text-primary-content gap-1"
                            title="Putar berikutnya di RadioBOSS (pos=1)"
                          >
                            <FastForward className="h-3 w-3 fill-current" />
                            <span>Next</span>
                          </button>

                          {/* Queue Bottom */}
                          <button
                            type="button"
                            onClick={() => handleQueueSingle(trackObj, -1)}
                            disabled={isQueueing}
                            className="btn btn-secondary btn-xs h-8 px-2 rounded-md border border-base-300 font-semibold text-xs text-secondary-content hover:bg-base-300 gap-1"
                            title="Tambahkan ke antrean bawah di RadioBOSS"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            <span className="hidden md:inline">Antrean</span>
                          </button>

                          {/* Reorder Up/Down */}
                          {!filterQuery && (
                            <div className="flex items-center gap-0.5">
                              <button
                                type="button"
                                onClick={() => handleMoveTrack(index, "up")}
                                disabled={index === 0}
                                className="btn btn-ghost btn-xs h-8 w-7 p-0 rounded-md text-base-content/70 hover:text-base-content disabled:opacity-25"
                                title="Pindah ke atas"
                              >
                                <ChevronUp className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleMoveTrack(index, "down")}
                                disabled={index === selectedSetDetails.tracks.length - 1}
                                className="btn btn-ghost btn-xs h-8 w-7 p-0 rounded-md text-base-content/70 hover:text-base-content disabled:opacity-25"
                                title="Pindah ke bawah"
                              >
                                <ChevronDown className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          )}

                          {/* Remove Track */}
                          <button
                            type="button"
                            onClick={() => handleRemoveTrack(item.id)}
                            className="btn btn-ghost btn-xs h-8 w-8 p-0 rounded-md text-base-content/70 hover:text-error hover:bg-error/10"
                            title="Hapus lagu dari set"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
