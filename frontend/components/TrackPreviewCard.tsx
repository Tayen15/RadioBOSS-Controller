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
  Loader2,
  AlertCircle,
  Mic2,
  FileText,
  Calendar,
  Tag,
} from "lucide-react";
import { TrackItem } from "@/lib/types";
import { getStreamRelayUrl } from "@/lib/api";
import { LyricsModal } from "@/components/LyricsModal";

interface TrackPreviewCardProps {
  track: TrackItem;
  onQueue: (pos: number, useRelay: boolean) => Promise<void>;
  isQueueing: boolean;
  activePos: number | null;
}

export function TrackPreviewCard({
  track,
  onQueue,
  isQueueing,
  activePos,
}: TrackPreviewCardProps) {
  const [useRelay, setUseRelay] = useState<boolean>(true);
  const [showPreviewAudio, setShowPreviewAudio] = useState<boolean>(false);
  const [audioState, setAudioState] = useState<
    "idle" | "loading" | "playing" | "paused" | "error"
  >("idle");
  const [audioError, setAudioError] = useState<string | null>(null);
  const [isLyricsOpen, setIsLyricsOpen] = useState<boolean>(false);

  const relayUrl = getStreamRelayUrl(track.video_id);

  return (
    <div className="card bg-base-200 border border-primary/30 shadow-xl overflow-hidden">
      <div className="card-body p-4 sm:p-5 space-y-4">
        {/* Card Header */}
        <div className="flex items-center justify-between border-b border-base-300 pb-3">
          <div className="flex items-center gap-2">
            <span className="badge badge-primary gap-1 font-semibold text-xs">
              <Disc3 className="h-3.5 w-3.5 animate-spin" />
              Lagu Terpilih
            </span>
            <span className="badge badge-accent badge-outline badge-xs font-semibold gap-1">
              <ShieldCheck className="h-3 w-3" />
              Studio Master
            </span>
          </div>

          <a
            href={track.url}
            target="_blank"
            rel="noopener noreferrer"
            className="link link-hover text-xs text-base-content/60 hover:text-primary flex items-center gap-1"
          >
            <span>Buka YouTube</span>
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>

        {/* Track Visual & Details */}
        <div className="flex flex-col sm:flex-row gap-4 items-center sm:items-start text-center sm:text-left">
          {/* Cover Art */}
          <div className="avatar shrink-0">
            <div className="w-28 h-28 rounded-2xl overflow-hidden bg-base-300 shadow-md border border-base-content/10">
              {track.thumbnail_url ? (
                <Image
                  src={track.thumbnail_url}
                  alt={track.title}
                  width={112}
                  height={112}
                  className="h-full w-full object-cover"
                  priority={true}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-base-content/40">
                  <Music2 className="h-8 w-8" />
                </div>
              )}
            </div>
          </div>

          {/* Details */}
          <div className="flex-1 min-w-0">
            <h3 className="text-base sm:text-lg font-bold text-base-content tracking-tight leading-snug line-clamp-2">
              {track.title}
            </h3>
            <p className="mt-1 text-sm font-semibold text-primary truncate">
              {track.artists.join(", ") || "Unknown Artist"}
            </p>

            <div className="mt-2.5 flex flex-wrap items-center justify-center sm:justify-start gap-1.5 text-xs">
              {track.album && (
                <span
                  className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-base-200/80 border border-base-300 text-xs font-medium text-base-content/80 max-w-[320px] sm:max-w-md truncate"
                  title={track.album}
                >
                  <Disc3 className="h-3 w-3 text-base-content/50 shrink-0" />
                  <span className="truncate">{track.album}</span>
                </span>
              )}
              {track.year && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-base-200/50 border border-base-300/80 text-xs text-base-content/70">
                  <Calendar className="h-3 w-3 text-secondary shrink-0" />
                  <span>{track.year}</span>
                </span>
              )}
              {track.genre && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-base-200/50 border border-base-300/80 text-xs text-base-content/70">
                  <Tag className="h-3 w-3 text-accent shrink-0" />
                  <span>{track.genre}</span>
                </span>
              )}
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-base-200/50 border border-base-300/80 text-xs font-mono text-base-content/70">
                <Clock className="h-3 w-3 text-base-content/40 shrink-0" />
                <span>{track.duration_formatted}</span>
              </span>
            </div>
          </div>
        </div>

        {/* Audio Headphone Preview Player & Lyrics Action Row */}
        <div className="space-y-2 pt-1">
          <div className="flex flex-col sm:flex-row gap-2">
            {!showPreviewAudio && (
              <button
                type="button"
                onClick={() => {
                  setShowPreviewAudio(true);
                  setAudioState("loading");
                  setAudioError(null);
                }}
                className="btn btn-outline btn-sm flex-1 gap-1.5 border-base-300 text-xs font-medium"
              >
                <Headphones className="h-4 w-4 text-primary" />
                <span>Headphone Preview</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsLyricsOpen(true)}
              className="btn btn-outline btn-sm flex-1 gap-1.5 border-base-300 hover:border-secondary/60 text-xs font-medium"
            >
              <Mic2 className="h-4 w-4 text-secondary" />
              <span>Lirik &amp; Cue Siaran</span>
            </button>
          </div>

          {showPreviewAudio && (
            <div className="rounded-xl bg-base-100 border border-base-300 p-3 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 font-semibold text-primary">
                  <Headphones className="h-3.5 w-3.5" />
                  Preview Headphone
                  {audioState === "loading" && (
                    <span className="badge badge-warning badge-xs gap-1 ml-1">
                      <span className="loading loading-spinner loading-xs" />
                      Memuat...
                    </span>
                  )}
                  {audioState === "playing" && (
                    <span className="badge badge-success badge-xs ml-1">
                      ● Memutar
                    </span>
                  )}
                </span>
                <button
                  onClick={() => {
                    setShowPreviewAudio(false);
                    setAudioState("idle");
                    setAudioError(null);
                  }}
                  className="btn btn-ghost btn-xs text-base-content/60 hover:text-base-content"
                >
                  Tutup
                </button>
              </div>

              {audioError && (
                <div className="alert alert-error text-xs py-2 rounded-lg">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{audioError}</span>
                </div>
              )}

              <audio
                autoPlay
                controls
                src={relayUrl}
                className="w-full h-8 rounded"
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
                  setAudioError("Gagal memuat stream audio dari server.");
                }}
              />
            </div>
          )}
        </div>

        {/* Studio Master Cache Toggle */}
        <div className="rounded-xl bg-base-100 border border-base-300 p-3">
          <label className="flex items-center justify-between gap-3 cursor-pointer">
            <div className="flex items-start gap-2.5 min-w-0 flex-1">
              <Radio className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <span className="block text-xs font-semibold text-base-content leading-tight">
                  Studio Master Cache &amp; ID3 Tags
                </span>
                <p className="text-[11px] text-base-content/60 leading-normal mt-0.5">
                  Metadata lengkap (Artis, Judul, Album, Durasi &amp; Cover Art) ke RadioBOSS.
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

        {/* Action Buttons */}
        <div className="grid grid-cols-1 gap-2.5 pt-1">
          {/* Play Next */}
          <button
            onClick={() => onQueue(1, useRelay)}
            disabled={isQueueing}
            className="btn btn-primary btn-block gap-2 shadow-md font-bold"
          >
            {isQueueing && activePos === 1 ? (
              <>
                <span className="loading loading-spinner loading-sm" />
                <span>Mengirim ke RadioBOSS...</span>
              </>
            ) : (
              <>
                <FastForward className="h-4 w-4" />
                <span>Putar Berikutnya (Play Next)</span>
              </>
            )}
          </button>

          {/* Append to Bottom */}
          <button
            onClick={() => onQueue(-1, useRelay)}
            disabled={isQueueing}
            className="btn btn-secondary btn-outline btn-block gap-2 font-bold"
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

      {/* Announcer Lyrics & Cue Points Modal */}
      <LyricsModal
        track={track}
        isOpen={isLyricsOpen}
        onClose={() => setIsLyricsOpen(false)}
      />
    </div>
  );
}
