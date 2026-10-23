"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import Image from "next/image";
import {
  FolderHeart,
  Plus,
  Play,
  Pause,
  Trash2,
  FolderOpen,
  Link as LinkIcon,
  Sparkles,
  Music,
  CheckCircle2,
  Clock,
  Send,
  AlertCircle,
  Loader2,
  RefreshCw,
  Search,
  ChevronUp,
  ChevronDown,
  ListX,
  X,
  FastForward,
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

  // New set modal/form states
  const [isCreatingSet, setIsCreatingSet] = useState<boolean>(false);
  const [newSetName, setNewSetName] = useState<string>("");
  const [newSetDesc, setNewSetDesc] = useState<string>("");

  // Playlist Importer states
  const [isImporterOpen, setIsImporterOpen] = useState<boolean>(false);
  const [importUrl, setImportUrl] = useState<string>("");
  const [isResolvingPlaylist, setIsResolvingPlaylist] = useState<boolean>(false);
  const [resolvedTracks, setResolvedTracks] = useState<TrackItem[]>([]);
  const [resolvedTitle, setResolvedTitle] = useState<string>("");

  // Batch queue states
  const [isBatchQueueing, setIsBatchQueueing] = useState<boolean>(false);
  const [batchProgress, setBatchProgress] = useState<{
    current: number;
    total: number;
  }>({ current: 0, total: 0 });

  // Audio preview states
  const [previewTrackId, setPreviewTrackId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // In-set filter search
  const [filterQuery, setFilterQuery] = useState<string>("");

  const loadSets = async () => {
    setIsLoadingSets(true);
    try {
      const data = await fetchPlaylistSets();
      setSets(data);
      if (data.length > 0 && !selectedSetId) {
        setSelectedSetId(data[0].id);
      }
    } catch (err) {
      onAddToast(
        "error",
        err instanceof Error ? err.message : "Gagal memuat playlist set."
      );
    } finally {
      setIsLoadingSets(false);
    }
  };

  useEffect(() => {
    loadSets();
  }, []);

  const loadSetDetails = async (setId: string) => {
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
  };

  useEffect(() => {
    if (selectedSetId) {
      loadSetDetails(selectedSetId);
    } else {
      setSelectedSetDetails(null);
    }
  }, [selectedSetId]);

  const handleCreateSet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSetName.trim()) return;

    try {
      const created = await createPlaylistSet(newSetName.trim(), newSetDesc.trim());
      onAddToast("success", `Set "${created.name}" berhasil dibuat!`);
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
      onAddToast("success", `Berhasil mengekstrak ${res.count} lagu dari playlist!`);
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
        `${resolvedTracks.length} lagu berhasil disimpan ke set!`
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
      } catch (err) {
        // Continue queueing remaining songs even if one fails
      }

      // Small pause between insertions to allow RadioBOSS API to commit
      await new Promise((r) => setTimeout(r, 600));
    }

    setIsBatchQueueing(false);
    onAddToast(
      "success",
      `Batch Selesai: ${successCount} dari ${tracksToQueue.length} lagu berhasil dikirim ke RadioBOSS!`
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
    if (!selectedSetDetails?.tracks?.length) return "0 mnt";
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
  }, [selectedSetDetails?.tracks]);

  const filteredTracks = useMemo(() => {
    if (!selectedSetDetails?.tracks) return [];
    if (!filterQuery.trim()) return selectedSetDetails.tracks;
    const q = filterQuery.toLowerCase().trim();
    return selectedSetDetails.tracks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.artists.some((a) => a.toLowerCase().includes(q))
    );
  }, [selectedSetDetails?.tracks, filterQuery]);

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
      onAddToast("success", "Semua lagu berhasil dikosongkan.");
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
          `Lagu dikirim ke RadioBOSS (${pos === 1 ? "Putar Berikutnya" : "Antrean Bawah"})!`
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
    <div className="card bg-base-200 border border-base-300 p-5 shadow-sm space-y-4">
      {/* Hidden audio element for preview */}
      <audio
        ref={audioRef}
        onEnded={handleAudioEnded}
        onError={() => setPreviewTrackId(null)}
        className="hidden"
      />
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-base-300 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/10 text-accent">
            <FolderHeart className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-base-content flex items-center gap-1.5">
              <span>Koleksi Set Playlist &amp; Importer</span>
              <span className="badge badge-accent badge-xs font-bold scale-90">
                SQLite Local DB
              </span>
            </h3>
            <p className="text-[10px] text-base-content/60">
              Preset koleksi siaran &amp; impor playlist YouTube / YT Music
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsImporterOpen(!isImporterOpen)}
            className="btn btn-outline btn-accent btn-xs gap-1 font-semibold"
            title="Impor playlist dari YouTube atau YouTube Music"
          >
            <LinkIcon className="h-3 w-3" />
            <span>Impor Playlist URL</span>
          </button>

          <button
            type="button"
            onClick={() => setIsCreatingSet(!isCreatingSet)}
            className="btn btn-primary btn-xs gap-1 font-bold shadow-sm"
          >
            <Plus className="h-3 w-3" />
            <span>Set Baru</span>
          </button>
        </div>
      </div>

      {/* Form: Create Set */}
      {isCreatingSet && (
        <form
          onSubmit={handleCreateSet}
          className="bg-base-100 p-3.5 rounded-xl border border-primary/30 space-y-3"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-primary flex items-center gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              <span>Buat Playlist Set Baru</span>
            </span>
            <button
              type="button"
              onClick={() => setIsCreatingSet(false)}
              className="btn btn-ghost btn-xs text-base-content/50"
            >
              Batal
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              type="text"
              value={newSetName}
              onChange={(e) => setNewSetName(e.target.value)}
              placeholder="Nama Set (contoh: Morning Show Hits, Indie Sore)"
              required
              className="input input-bordered input-xs bg-base-200 text-xs w-full"
            />
            <input
              type="text"
              value={newSetDesc}
              onChange={(e) => setNewSetDesc(e.target.value)}
              placeholder="Deskripsi singkat (opsional)"
              className="input input-bordered input-xs bg-base-200 text-xs w-full"
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-xs font-bold w-full"
          >
            Simpan Set ke Database
          </button>
        </form>
      )}

      {/* Form: YouTube Playlist Importer */}
      {isImporterOpen && (
        <div className="bg-base-100 p-3.5 rounded-xl border border-accent/40 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-accent flex items-center gap-1.5">
              <LinkIcon className="h-3.5 w-3.5" />
              <span>Impor YouTube / YT Music Playlist</span>
            </span>
            <button
              type="button"
              onClick={() => {
                setIsImporterOpen(false);
                setResolvedTracks([]);
              }}
              className="btn btn-ghost btn-xs text-base-content/50"
            >
              Tutup
            </button>
          </div>

          <form onSubmit={handleResolvePlaylist} className="join w-full">
            <input
              type="url"
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
              placeholder="Paste URL Playlist (contoh: https://music.youtube.com/playlist?list=...)"
              required
              className="input input-bordered input-xs join-item w-full bg-base-200 text-xs font-mono"
            />
            <button
              type="submit"
              disabled={isResolvingPlaylist}
              className="btn btn-accent btn-xs join-item font-bold shrink-0"
            >
              {isResolvingPlaylist ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Mengekstrak...</span>
                </>
              ) : (
                <span>Ekstrak Lagu</span>
              )}
            </button>
          </form>

          {/* Resolved Tracks Preview */}
          {resolvedTracks.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-base-300">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-base-content truncate">
                  {resolvedTitle} ({resolvedTracks.length} lagu)
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleBatchQueue(resolvedTracks)}
                    disabled={isBatchQueueing}
                    className="btn btn-xs btn-primary font-bold gap-1"
                    title="Kirim semua lagu hasil impor langsung ke RadioBOSS"
                  >
                    <Send className="h-3 w-3" />
                    <span>Kirim Langsung ke RadioBOSS</span>
                  </button>

                  {selectedSetId && (
                    <button
                      type="button"
                      onClick={handleSaveImportedToSet}
                      disabled={isResolvingPlaylist}
                      className="btn btn-xs btn-outline btn-accent font-semibold"
                    >
                      Simpan ke Set Aktif
                    </button>
                  )}
                </div>
              </div>

              <div className="max-h-48 overflow-y-auto space-y-1 pr-1 bg-base-200/50 p-2 rounded-lg">
                {resolvedTracks.slice(0, 15).map((track, i) => (
                  <div
                    key={track.video_id || i}
                    className="flex items-center justify-between text-[11px] py-1 border-b border-base-300/40 last:border-none"
                  >
                    <div className="truncate flex items-center gap-1.5 flex-1 pr-2">
                      <span className="text-base-content/40 font-mono w-5">
                        {i + 1}.
                      </span>
                      <span className="font-bold truncate text-base-content">
                        {track.title}
                      </span>
                      <span className="text-base-content/60 truncate">
                        - {track.artists.join(", ")}
                      </span>
                    </div>
                    <span className="text-base-content/40 text-[10px] shrink-0">
                      {track.duration_formatted}
                    </span>
                  </div>
                ))}
                {resolvedTracks.length > 15 && (
                  <p className="text-[10px] text-center text-base-content/50 italic py-1">
                    ... dan {resolvedTracks.length - 15} lagu lainnya
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Batch Queue Progress Bar */}
      {isBatchQueueing && (
        <div className="p-3 bg-primary/10 border border-primary/30 rounded-xl space-y-1.5 animate-pulse">
          <div className="flex items-center justify-between text-xs font-bold text-primary">
            <span className="flex items-center gap-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>Mengirim batch lagu ke RadioBOSS...</span>
            </span>
            <span>
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

      {/* Set Selector Pills */}
      {isLoadingSets ? (
        <div className="py-6 text-center space-y-1">
          <span className="loading loading-spinner loading-xs text-accent" />
          <p className="text-[11px] text-base-content/60">Memuat playlist sets...</p>
        </div>
      ) : sets.length === 0 ? (
        <div className="py-6 text-center space-y-1 bg-base-100 rounded-xl border border-dashed border-base-300">
          <FolderHeart className="h-6 w-6 text-base-content/30 mx-auto" />
          <p className="text-xs text-base-content/70 font-semibold">
            Belum ada Playlist Set.
          </p>
          <p className="text-[10px] text-base-content/50">
            Klik tombol &quot;+ Set Baru&quot; di atas untuk membuat koleksi siaran Anda.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
            {sets.map((s) => {
              const isSelected = selectedSetId === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelectedSetId(s.id)}
                  className={`btn btn-xs rounded-lg gap-1.5 shrink-0 transition-all ${
                    isSelected
                      ? "btn-accent text-accent-content font-bold shadow-sm"
                      : "btn-ghost bg-base-100 text-base-content/70 hover:bg-base-300"
                  }`}
                >
                  <FolderOpen className="h-3 w-3" />
                  <span className="max-w-[120px] truncate">{s.name}</span>
                  <span className="badge badge-neutral badge-xs scale-90">
                    {s.track_count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Active Set Details & Tracks List */}
          {selectedSetDetails && (
            <div className="bg-base-100 rounded-xl border border-base-300 p-3.5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-base-300/60 pb-2">
                <div>
                  <h4 className="text-xs font-bold text-base-content flex items-center gap-1.5 flex-wrap">
                    <span>{selectedSetDetails.name}</span>
                    <span className="badge badge-accent badge-xs font-bold">
                      {selectedSetDetails.tracks.length} Lagu
                    </span>
                    <span className="badge badge-ghost badge-xs font-mono text-[10px] gap-1">
                      <Clock className="h-2.5 w-2.5" />
                      {totalDurationFormatted}
                    </span>
                  </h4>
                  {selectedSetDetails.description && (
                    <p className="text-[10px] text-base-content/60 truncate mt-0.5">
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
                    className="btn btn-primary btn-xs gap-1 font-bold shadow-sm"
                    title="Kirim semua lagu di set ini secara berurutan ke RadioBOSS"
                  >
                    <Send className="h-3 w-3" />
                    <span>Kirim Semua ({selectedSetDetails.tracks.length})</span>
                  </button>

                  {selectedSetDetails.tracks.length > 0 && (
                    <button
                      type="button"
                      onClick={handleClearSetTracks}
                      className="btn btn-ghost btn-xs text-base-content/60 hover:text-error p-1 h-6 min-h-0"
                      title="Kosongkan semua lagu di set ini"
                    >
                      <ListX className="h-3.5 w-3.5" />
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
                    className="btn btn-ghost btn-xs text-error hover:bg-error/10 p-1 h-6 min-h-0"
                    title="Hapus set ini"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* In-Set Search Filter */}
              {selectedSetDetails.tracks.length > 3 && (
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-base-content/40" />
                  <input
                    type="text"
                    value={filterQuery}
                    onChange={(e) => setFilterQuery(e.target.value)}
                    placeholder="Filter lagu di set ini (judul atau artis)..."
                    className="input input-xs input-bordered w-full pl-8 pr-7 bg-base-200/50 text-xs rounded-lg"
                  />
                  {filterQuery && (
                    <button
                      type="button"
                      onClick={() => setFilterQuery("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-base-content/40 hover:text-base-content"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              )}

              {/* Tracks in Set */}
              {isLoadingDetails ? (
                <div className="py-6 text-center space-y-1">
                  <span className="loading loading-spinner loading-xs text-primary" />
                </div>
              ) : selectedSetDetails.tracks.length === 0 ? (
                <div className="py-6 text-center text-xs text-base-content/50">
                  Set ini masih kosong. Cari lagu atau impor playlist untuk mengisinya!
                </div>
              ) : filteredTracks.length === 0 ? (
                <div className="py-4 text-center text-xs text-base-content/50">
                  Tidak ditemukan lagu yang cocok dengan &quot;{filterQuery}&quot;.
                </div>
              ) : (
                <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                  {filteredTracks.map((item, index) => {
                    const isPlayingPreview = previewTrackId === item.video_id;
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
                        className="group flex items-center justify-between gap-2 p-1.5 rounded-lg bg-base-200/60 hover:bg-base-200 text-xs transition-colors"
                      >
                        {/* Track Info & Preview Overlay */}
                        <div className="min-w-0 flex-1 flex items-center gap-2">
                          <span className="font-mono text-[10px] text-base-content/40 w-4 text-right shrink-0">
                            {index + 1}.
                          </span>

                          <div className="relative w-8 h-8 rounded-lg overflow-hidden bg-base-300 shrink-0">
                            {item.thumbnail_url ? (
                              <Image
                                src={item.thumbnail_url}
                                alt={item.title}
                                width={32}
                                height={32}
                                unoptimized
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-[10px]">
                                🎵
                              </div>
                            )}

                            {/* Headphone Audio Preview Button */}
                            <button
                              type="button"
                              onClick={() => handleTogglePreview(trackObj)}
                              className={`absolute inset-0 flex items-center justify-center bg-black/60 transition-opacity ${
                                isPlayingPreview
                                  ? "opacity-100 text-accent"
                                  : "opacity-0 group-hover:opacity-100 text-white"
                              }`}
                              title={isPlayingPreview ? "Pause Preview" : "Dengarkan di Headphone"}
                            >
                              {isPlayingPreview ? (
                                <Pause className="h-3.5 w-3.5 fill-current animate-pulse" />
                              ) : (
                                <Play className="h-3.5 w-3.5 fill-current ml-0.5" />
                              )}
                            </button>
                          </div>

                          <div
                            onClick={() => onSelectTrack(trackObj)}
                            className="min-w-0 flex-1 cursor-pointer"
                            title="Klik untuk memilih ke Dispatch Deck"
                          >
                            <p className="font-bold truncate text-base-content group-hover:text-primary transition-colors">
                              {item.title}
                            </p>
                            <p className="text-[10px] text-base-content/60 truncate">
                              {item.artists.join(", ") || "YouTube Music"}
                            </p>
                          </div>
                        </div>

                        {/* Action Buttons: Next, +Antrean, Reorder Up/Down, Remove */}
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="text-[10px] text-base-content/40 font-mono mr-1">
                            {item.duration_formatted}
                          </span>

                          {/* Quick 1-Click Queue: Next */}
                          <button
                            type="button"
                            onClick={() => handleQueueSingle(trackObj, 1)}
                            disabled={isQueueing}
                            className="btn btn-ghost btn-xs text-primary hover:bg-primary/10 px-1.5 h-6 min-h-0 font-bold text-[10px] gap-0.5"
                            title="Putar Sebagai Lagu Berikutnya (Posisi 1 di RadioBOSS)"
                          >
                            <FastForward className="h-3 w-3" />
                            <span>Next</span>
                          </button>

                          {/* Quick 1-Click Queue: Bottom */}
                          <button
                            type="button"
                            onClick={() => handleQueueSingle(trackObj, -1)}
                            disabled={isQueueing}
                            className="btn btn-ghost btn-xs text-base-content/70 hover:text-base-content hover:bg-base-300 px-1.5 h-6 min-h-0 font-medium text-[10px] gap-0.5"
                            title="Tambahkan ke Antrean Paling Bawah di RadioBOSS"
                          >
                            <Plus className="h-3 w-3" />
                            <span>Antrean</span>
                          </button>

                          {/* Reorder Up / Down (only when not searching) */}
                          {!filterQuery && (
                            <div className="flex flex-col">
                              <button
                                type="button"
                                onClick={() => handleMoveTrack(index, "up")}
                                disabled={index === 0}
                                className="btn btn-ghost btn-xs text-base-content/40 hover:text-base-content p-0 h-3 min-h-0 disabled:opacity-20"
                                title="Pindah ke Atas"
                              >
                                <ChevronUp className="h-2.5 w-2.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleMoveTrack(index, "down")}
                                disabled={index === selectedSetDetails.tracks.length - 1}
                                className="btn btn-ghost btn-xs text-base-content/40 hover:text-base-content p-0 h-3 min-h-0 disabled:opacity-20"
                                title="Pindah ke Bawah"
                              >
                                <ChevronDown className="h-2.5 w-2.5" />
                              </button>
                            </div>
                          )}

                          {/* Remove from set */}
                          <button
                            type="button"
                            onClick={() => handleRemoveTrack(item.id)}
                            className="btn btn-ghost btn-xs text-base-content/40 hover:text-error p-1 h-6 min-h-0 ml-0.5"
                            title="Hapus dari set"
                          >
                            <Trash2 className="h-3 w-3" />
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
    </div>
  );
}
