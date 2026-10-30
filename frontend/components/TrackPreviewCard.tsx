"use client";

import React, { useState } from "react";
import Image from "next/image";
import {
  Music2,
  PlusCircle,
  FastForward,
  Headphones,
  ExternalLink,
  ShieldCheck,
  Disc3,
  Clock,
  Radio,
  AlertCircle,
  Mic2,
  Calendar,
  Tag,
  Flame,
  HardDrive,
  Edit3,
  Wand2,
  RotateCcw,
  Check,
} from "lucide-react";
import { TrackItem, CachedTrackItem } from "@/lib/types";
import { getStreamRelayUrl } from "@/lib/api";
import { cleanBroadcastTitle } from "@/lib/titleCleaner";
import { LyricsModal } from "@/components/LyricsModal";

interface TrackPreviewCardProps {
  track: TrackItem;
  onQueue: (
    pos: number,
    useRelay: boolean,
    customMetadata?: { title: string; artist: string }
  ) => Promise<void>;
  onUpdateMetadata?: (trackId: string, title: string, artist: string) => void;
  isQueueing: boolean;
  activePos: number | null;
  targetPlaylistTab?: string;
  availablePlaylistTabs?: string[];
  onSelectPlaylistTab?: (tab: string) => void;
}

export function TrackPreviewCard({
  track,
  onQueue,
  onUpdateMetadata,
  isQueueing,
  activePos,
  targetPlaylistTab = "",
  availablePlaylistTabs = [],
  onSelectPlaylistTab,
}: TrackPreviewCardProps) {
  const [useRelay, setUseRelay] = useState<boolean>(true);
  const [showPreviewAudio, setShowPreviewAudio] = useState<boolean>(false);
  const [audioState, setAudioState] = useState<
    "idle" | "loading" | "playing" | "paused" | "error"
  >("idle");
  const [audioError, setAudioError] = useState<string | null>(null);
  const [isLyricsOpen, setIsLyricsOpen] = useState<boolean>(false);

  const [editedTitle, setEditedTitle] = useState(track.title);
  const [editedArtist, setEditedArtist] = useState(
    track.artists.filter(Boolean).join(", ")
  );
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [prevTrackId, setPrevTrackId] = useState(track.video_id);
  const [metadataSaveMsg, setMetadataSaveMsg] = useState<string | null>(null);

  // Sync state during render when selected track changes
  if (track.video_id !== prevTrackId) {
    setPrevTrackId(track.video_id);
    setEditedTitle(track.title);
    setEditedArtist(track.artists.filter(Boolean).join(", "));
    setIsEditOpen(false);
    setShowPreviewAudio(false);
    setAudioState("idle");
    setAudioError(null);
    setMetadataSaveMsg(null);
  }

  const isMetadataCustomized =
    editedTitle.trim() !== track.title.trim() ||
    editedArtist.trim() !== track.artists.filter(Boolean).join(", ").trim();

  const handleApplyMetadata = () => {
    const cleanT = editedTitle.trim() || track.title;
    const cleanA = editedArtist.trim();
    if (onUpdateMetadata) {
      onUpdateMetadata(track.video_id, cleanT, cleanA);
    }
    setMetadataSaveMsg("Metadata diterapkan!");
    setTimeout(() => setMetadataSaveMsg(null), 2000);
  };

  const handleCleanTitle = () => {
    const cleaned = cleanBroadcastTitle(editedTitle);
    setEditedTitle(cleaned);
    if (onUpdateMetadata) {
      onUpdateMetadata(track.video_id, cleaned, editedArtist.trim());
    }
    setMetadataSaveMsg("Judul dibersihkan & diterapkan!");
    setTimeout(() => setMetadataSaveMsg(null), 2000);
  };

  const handleResetMetadata = () => {
    setEditedTitle(track.title);
    const origArtist = track.artists.filter(Boolean).join(", ");
    setEditedArtist(origArtist);
    if (onUpdateMetadata) {
      onUpdateMetadata(track.video_id, track.title, origArtist);
    }
    setMetadataSaveMsg("Metadata dikembalikan ke asli.");
    setTimeout(() => setMetadataSaveMsg(null), 2000);
  };

  const relayUrl = getStreamRelayUrl(track.video_id);

  return (
    <section
      aria-label="Cue Deck & Studio Dispatch"
      className="rounded-xl bg-base-200 border border-base-300 overflow-hidden"
    >
      <div className="p-4 sm:p-5 space-y-4">
        {/* Console Deck Header */}
        <div className="flex items-center justify-between border-b border-base-300 pb-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-primary/15 border border-primary/40 text-primary font-mono text-xs font-bold uppercase tracking-wider">
              <Disc3
                className={`h-3.5 w-3.5 ${
                  audioState === "playing" ? "animate-spin" : ""
                }`}
              />
              <span>CUE DECK</span>
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-base-100 border border-base-300 text-xs font-medium text-base-content/80">
              <ShieldCheck className="h-3.5 w-3.5 text-success shrink-0" />
              <span>Studio Master</span>
            </span>
          </div>

          <a
            href={track.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-base-content/70 hover:text-primary transition-colors py-1 px-2 rounded-md hover:bg-base-100"
          >
            <span>Buka Sumber</span>
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>

        {/* Track Visual & Details */}
        <div className="flex flex-col sm:flex-row gap-4 items-center sm:items-start text-center sm:text-left">
          {/* Cover Art */}
          <div className="w-24 h-24 rounded-lg overflow-hidden bg-base-100 border border-base-300 shrink-0">
            {track.thumbnail_url ? (
              <Image
                src={track.thumbnail_url}
                alt={track.title}
                width={96}
                height={96}
                className="h-full w-full object-cover"
                priority={true}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-base-content/60">
                <Music2 className="h-8 w-8" />
              </div>
            )}
          </div>

          {/* Track Metadata */}
          <div className="flex-1 min-w-0 w-full">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <h3 className="text-base sm:text-lg font-bold text-base-content tracking-tight leading-snug line-clamp-2">
                  {editedTitle}
                </h3>
                <p className="mt-0.5 text-sm font-medium text-base-content/80 truncate">
                  {editedArtist || "Artis Tidak Diketahui"}
                </p>
              </div>

              {/* Edit Metadata Toggle Button */}
              <button
                type="button"
                onClick={() => setIsEditOpen((prev) => !prev)}
                className={`btn btn-xs h-8 px-2.5 rounded-lg gap-1.5 shrink-0 text-xs font-semibold ${
                  isEditOpen || isMetadataCustomized
                    ? "btn-primary text-primary-content"
                    : "bg-base-100 border border-base-300 text-base-content/80 hover:bg-base-300"
                }`}
                title="Ubah metadata siaran atau bersihkan label remaster"
              >
                <Edit3 className="h-3.5 w-3.5" />
                <span>{isMetadataCustomized ? "Disesuaikan" : "Metadata"}</span>
              </button>
            </div>

            {/* Editable Broadcast Metadata Panel */}
            {isEditOpen && (
              <div className="mt-3 p-3 rounded-lg bg-base-100 border border-base-300 space-y-2.5 text-left">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-base-content flex items-center gap-1.5">
                    <Edit3 className="h-3.5 w-3.5 text-primary" />
                    <span>Penyesuaian Metadata ID3 &amp; Siaran</span>
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleCleanTitle}
                      className="btn btn-xs h-7 px-2 rounded-md bg-base-200 border border-base-300 hover:bg-base-300 text-warning gap-1 text-xs font-semibold"
                      title="Bersihkan tag (2008 Remastered), (Official Video), dll"
                    >
                      <Wand2 className="h-3 w-3" />
                      <span>Bersihkan</span>
                    </button>
                    {isMetadataCustomized && (
                      <button
                        type="button"
                        onClick={handleResetMetadata}
                        className="btn btn-xs btn-ghost h-7 px-2 rounded-md text-xs text-base-content/70 hover:text-base-content gap-1"
                        title="Kembalikan ke metadata asli"
                      >
                        <RotateCcw className="h-3 w-3" />
                        <span>Reset</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-xs font-semibold text-base-content/70 block mb-1">
                      Judul Lagu
                    </label>
                    <input
                      type="text"
                      value={editedTitle}
                      onChange={(e) => setEditedTitle(e.target.value)}
                      className="input input-sm input-bordered bg-base-200 w-full text-xs font-medium rounded-md h-9"
                      placeholder="Judul lagu..."
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-base-content/70 block mb-1">
                      Nama Artis
                    </label>
                    <input
                      type="text"
                      value={editedArtist}
                      onChange={(e) => setEditedArtist(e.target.value)}
                      className="input input-sm input-bordered bg-base-200 w-full text-xs font-medium rounded-md h-9"
                      placeholder="Nama artis..."
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <p className="text-xs text-base-content/70 leading-normal flex-1 mr-2">
                    Metadata ini disematkan ke tag ID3 file MP3 cache dan dikirimkan sebagai judul siaran ke RadioBOSS.
                  </p>
                  <button
                    type="button"
                    onClick={handleApplyMetadata}
                    className="btn btn-xs h-7 px-2.5 rounded-md btn-primary text-primary-content gap-1 text-xs font-semibold shrink-0"
                  >
                    <Check className="h-3 w-3" />
                    <span>Terapkan</span>
                  </button>
                </div>

                {metadataSaveMsg && (
                  <p className="text-xs font-semibold text-success animate-fade-in">
                    ✓ {metadataSaveMsg}
                  </p>
                )}
              </div>
            )}

            {/* Technical Metadata Readout Chips */}
            <div className="mt-2.5 flex flex-wrap items-center justify-center sm:justify-start gap-1.5 text-xs">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-base-100 border border-base-300 font-mono font-semibold text-primary tabular-nums">
                <Clock className="h-3 w-3 shrink-0" />
                <span>{track.duration_formatted}</span>
              </span>

              {track.album && (
                <span
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-base-100 border border-base-300 font-medium text-base-content/80 max-w-[240px] truncate"
                  title={track.album}
                >
                  <Disc3 className="h-3 w-3 text-base-content/60 shrink-0" />
                  <span className="truncate">{track.album}</span>
                </span>
              )}

              {track.year && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-base-100 border border-base-300 font-mono text-base-content/70">
                  <Calendar className="h-3 w-3 text-base-content/60 shrink-0" />
                  <span>{track.year}</span>
                </span>
              )}

              {track.genre && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-base-100 border border-base-300 text-base-content/70">
                  <Tag className="h-3 w-3 text-base-content/60 shrink-0" />
                  <span>{track.genre}</span>
                </span>
              )}

              {(track as Partial<CachedTrackItem>).play_count !== undefined &&
                ((track as Partial<CachedTrackItem>).play_count ?? 0) > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-warning/10 border border-warning/30 font-mono font-bold text-warning">
                    <Flame className="h-3 w-3 fill-current" />
                    <span>{(track as Partial<CachedTrackItem>).play_count}x</span>
                  </span>
                )}

              {(track as Partial<CachedTrackItem>).is_cached && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-success/10 border border-success/30 font-semibold text-success">
                  <HardDrive className="h-3 w-3" />
                  <span>Tersimpan di Cache</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Headphone Preview & Announcer Script Tools */}
        <div className="space-y-2 pt-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {!showPreviewAudio && (
              <button
                type="button"
                onClick={() => {
                  setShowPreviewAudio(true);
                  setAudioState("loading");
                  setAudioError(null);
                }}
                className="btn btn-sm h-10 rounded-lg bg-base-100 border border-base-300 hover:bg-base-300 text-xs font-semibold text-base-content gap-2"
              >
                <Headphones className="h-4 w-4 text-accent" />
                <span>Pratinjau Headphone</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsLyricsOpen(true)}
              className={`btn btn-sm h-10 rounded-lg bg-base-100 border border-base-300 hover:bg-base-300 text-xs font-semibold text-base-content gap-2 ${
                showPreviewAudio ? "sm:col-span-2" : ""
              }`}
            >
              <Mic2 className="h-4 w-4 text-primary" />
              <span>Lirik &amp; Naskah Siaran</span>
            </button>
          </div>

          {showPreviewAudio && (
            <div className="rounded-lg bg-base-100 border border-base-300 p-3 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-2 font-semibold text-base-content">
                  <Headphones className="h-4 w-4 text-accent" />
                  <span>Monitor Headphone</span>
                  {audioState === "loading" && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-warning/15 text-warning font-mono text-xs font-semibold">
                      <span className="loading loading-spinner loading-xs" />
                      <span>Memuat stream...</span>
                    </span>
                  )}
                  {audioState === "playing" && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-success/15 text-success font-mono text-xs font-semibold">
                      <span>AKTIF</span>
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setShowPreviewAudio(false);
                    setAudioState("idle");
                    setAudioError(null);
                  }}
                  className="btn btn-ghost btn-xs h-7 px-2 text-xs text-base-content/70 hover:text-base-content"
                >
                  Tutup
                </button>
              </div>

              {audioError && (
                <div className="alert alert-error text-xs py-2 rounded-lg text-error-content font-medium">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{audioError}</span>
                </div>
              )}

              <audio
                autoPlay
                controls
                src={relayUrl}
                className="w-full h-9 rounded"
                preload="auto"
                onWaiting={() => setAudioState("loading")}
                onCanPlay={() => {
                  if (audioState === "loading") setAudioState("paused");
                }}
                onPlay={() => {
                  setAudioState("playing");
                  setAudioError(null);
                }}
                onPause={() => setAudioState("paused")}
                onError={() => {
                  setAudioState("error");
                  setAudioError("Gagal memuat stream audio dari server lokal.");
                }}
              />
            </div>
          )}
        </div>

        {/* Studio Master Cache & ID3 Relay Switch */}
        <div className="rounded-lg bg-base-100 border border-base-300 p-3">
          <label className="flex items-center justify-between gap-3 cursor-pointer">
            <div className="flex items-start gap-2.5 min-w-0 flex-1">
              <Radio className="h-4 w-4 text-base-content/70 shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <span className="block text-xs font-semibold text-base-content leading-tight">
                  Transcode MP3 Studio &amp; Tag ID3 Lengkap
                </span>
                <p className="text-xs text-base-content/70 leading-normal mt-0.5">
                  Sematkan Artis, Judul, Album, dan Cover Art langsung ke RadioBOSS.
                </p>
              </div>
            </div>
            <input
              type="checkbox"
              checked={useRelay}
              onChange={(e) => setUseRelay(e.target.checked)}
              className="toggle toggle-primary toggle-sm shrink-0"
            />
          </label>
        </div>

        {/* Target RadioBOSS Playlist Tab Selector */}
        {availablePlaylistTabs && availablePlaylistTabs.length > 0 && (
          <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-base-100 border border-base-300 text-xs gap-2">
            <span className="text-base-content/70 font-semibold truncate">
              Target Tab RadioBOSS:
            </span>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => onSelectPlaylistTab?.("")}
                className={`px-2 py-0.5 rounded text-[11px] font-semibold border transition-all ${
                  !targetPlaylistTab
                    ? "bg-primary text-primary-content border-primary font-bold shadow-xs"
                    : "bg-base-200 border-base-300 text-base-content/70 hover:text-base-content"
                }`}
                title="Gunakan tab yang aktif di RadioBOSS"
              >
                Auto
              </button>
              {availablePlaylistTabs.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => onSelectPlaylistTab?.(t)}
                  className={`px-2.5 py-0.5 rounded text-[11px] font-semibold border transition-all ${
                    targetPlaylistTab === t
                      ? "bg-primary text-primary-content border-primary font-bold shadow-xs"
                      : "bg-base-200 border-base-300 text-base-content/70 hover:text-base-content"
                  }`}
                  title={`Kirim lagu ke tab '${t}'`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Primary & Secondary Broadcast Dispatch Buttons */}
        <div className="grid grid-cols-1 gap-2 pt-1">
          <button
            type="button"
            onClick={() =>
              onQueue(1, useRelay, {
                title: editedTitle.trim(),
                artist: editedArtist.trim(),
              })
            }
            disabled={isQueueing}
            className="btn btn-primary h-11 btn-block rounded-lg gap-2 font-bold text-sm text-primary-content"
          >
            {isQueueing && activePos === 1 ? (
              <>
                <span className="loading loading-spinner loading-sm" />
                <span>Mengirim ke RadioBOSS...</span>
              </>
            ) : (
              <>
                <FastForward className="h-4 w-4 fill-current" />
                <span>Putar Berikutnya (Play Next)</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() =>
              onQueue(-1, useRelay, {
                title: editedTitle.trim(),
                artist: editedArtist.trim(),
              })
            }
            disabled={isQueueing}
            className="btn btn-secondary h-11 btn-block rounded-lg gap-2 font-semibold text-sm border border-base-300 text-secondary-content hover:bg-base-300"
          >
            {isQueueing && activePos === -1 ? (
              <>
                <span className="loading loading-spinner loading-sm" />
                <span>Mengirim ke RadioBOSS...</span>
              </>
            ) : (
              <>
                <PlusCircle className="h-4 w-4" />
                <span>Tambahkan ke Antrean Bawah</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Announcer Lyrics & Cue Sheet Modal */}
      <LyricsModal
        track={{
          ...track,
          title: editedTitle.trim() || track.title,
          artists: editedArtist.trim() ? [editedArtist.trim()] : track.artists,
        }}
        isOpen={isLyricsOpen}
        onClose={() => setIsLyricsOpen(false)}
      />
    </section>
  );
}
