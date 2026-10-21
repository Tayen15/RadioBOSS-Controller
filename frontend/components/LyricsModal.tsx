"use client";

import React, { useState, useEffect } from "react";
import {
  Mic2,
  FileText,
  X,
  Copy,
  Check,
  Sparkles,
  Radio,
  Clock,
  Music,
} from "lucide-react";
import Image from "next/image";
import { TrackItem, LyricsResponse } from "@/lib/types";
import { fetchTrackLyrics } from "@/lib/api";

interface LyricsModalProps {
  track: TrackItem | null;
  isOpen: boolean;
  onClose: () => void;
}

export function LyricsModal({ track, isOpen, onClose }: LyricsModalProps) {
  const [data, setData] = useState<LyricsResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<"lyrics" | "cues">("lyrics");

  const [prevTrackId, setPrevTrackId] = useState<string | null>(null);

  // Adjust state during render when track or modal state changes (avoids cascading render in effect)
  if (isOpen && track && track.video_id !== prevTrackId) {
    setPrevTrackId(track.video_id);
    setIsLoading(true);
    setData(null);
  } else if (!isOpen && prevTrackId !== null) {
    setPrevTrackId(null);
  }

  useEffect(() => {
    if (!isOpen || !track) return;

    let isMounted = true;
    const currentTrack = track;

    fetchTrackLyrics(currentTrack.video_id)
      .then((res) => {
        if (isMounted) {
          setData(res);
          // If lyrics exist, default to lyrics tab, otherwise cues
          if (!res.has_lyrics) {
            setActiveTab("cues");
          }
        }
      })
      .catch(() => {
        if (isMounted) {
          setData({
            video_id: currentTrack.video_id,
            has_lyrics: false,
            lyrics: "Lirik belum tersedia untuk lagu ini di YouTube Music.",
            source: "YouTube Music",
            talking_points: {
              intro_talk_window: "00:00 - 00:14 (Perkiraan intro)",
              outro_talk_window: "15 detik sebelum lagu berakhir",
              broadcaster_tips: [
                "Gunakan intro musik untuk menyapa pendengar dan membacakan nama pengirim request.",
                "Sebutkan judul lagu dan nama artis dengan jelas.",
              ],
            },
          });
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, track]);

  if (!isOpen || !track) return null;

  const handleCopy = () => {
    if (!data?.lyrics) return;
    navigator.clipboard.writeText(data.lyrics);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <dialog className="modal modal-open z-50">
      <div className="modal-box bg-base-200 border border-base-300 max-w-xl shadow-2xl p-5 sm:p-6 space-y-4">
        {/* Header Bar */}
        <div className="flex items-center justify-between border-b border-base-300 pb-3">
          <div className="flex items-center gap-3 min-w-0">
            {track.thumbnail_url ? (
              <div className="relative h-11 w-11 rounded-xl overflow-hidden shrink-0 border border-base-300 shadow-sm">
                <Image
                  src={track.thumbnail_url}
                  alt={track.title}
                  fill
                  className="object-cover"
                />
              </div>
            ) : (
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
                <Music className="h-5 w-5" />
              </div>
            )}
            <div className="min-w-0">
              <h3 className="font-bold text-sm sm:text-base text-base-content truncate">
                {track.title}
              </h3>
              <p className="text-xs text-base-content/60 truncate">
                {track.artists?.join(", ") || "YouTube Music"}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="btn btn-ghost btn-circle btn-sm text-base-content/60 hover:text-base-content shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="tabs tabs-box bg-base-300/60 p-1 rounded-xl flex gap-1">
          <button
            type="button"
            onClick={() => setActiveTab("lyrics")}
            className={`tab flex-1 gap-1.5 text-xs font-bold rounded-lg transition-all ${
              activeTab === "lyrics"
                ? "tab-active bg-primary text-primary-content shadow-sm"
                : "text-base-content/70 hover:text-base-content"
            }`}
          >
            <FileText className="h-3.5 w-3.5" />
            <span>Lirik Lagu</span>
            {data?.has_lyrics && (
              <span className="badge badge-accent badge-xs font-bold">Ada</span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("cues")}
            className={`tab flex-1 gap-1.5 text-xs font-bold rounded-lg transition-all ${
              activeTab === "cues"
                ? "tab-active bg-primary text-primary-content shadow-sm"
                : "text-base-content/70 hover:text-base-content"
            }`}
          >
            <Mic2 className="h-3.5 w-3.5" />
            <span>Announcer Cue Points</span>
          </button>
        </div>

        {/* Content Body */}
        {isLoading ? (
          <div className="py-14 text-center space-y-2">
            <span className="loading loading-spinner loading-md text-primary" />
            <p className="text-xs text-base-content/60">
              Mengambil lirik &amp; talking points siaran...
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {activeTab === "lyrics" ? (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-xs text-base-content/60 px-1">
                  <span>Sumber: {data?.source || "YouTube Music"}</span>
                  {data?.has_lyrics && (
                    <button
                      type="button"
                      onClick={handleCopy}
                      className="btn btn-ghost btn-xs gap-1 hover:text-primary font-medium"
                    >
                      {copied ? (
                        <>
                          <Check className="h-3 w-3 text-success" />
                          <span className="text-success">Tersalin</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" />
                          <span>Salin Lirik</span>
                        </>
                      )}
                    </button>
                  )}
                </div>

                <div className="bg-base-100 border border-base-300 rounded-2xl p-4 max-h-[340px] overflow-y-auto select-text scrollbar-thin">
                  <p className="text-xs sm:text-sm text-base-content leading-relaxed whitespace-pre-line font-sans">
                    {data?.lyrics}
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Intro & Outro Cue Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="p-3 rounded-2xl bg-base-100 border border-base-300 space-y-1">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-primary">
                      <Clock className="h-3.5 w-3.5" />
                      <span>Intro Ramp (Talk Window)</span>
                    </div>
                    <p className="text-xs font-semibold text-base-content">
                      {data?.talking_points?.intro_talk_window || "00:00 - 00:14"}
                    </p>
                    <p className="text-[10px] text-base-content/50">
                      Batas waktu aman penyiar berbicara sebelum vokal lagu masuk.
                    </p>
                  </div>

                  <div className="p-3 rounded-2xl bg-base-100 border border-base-300 space-y-1">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-accent">
                      <Radio className="h-3.5 w-3.5" />
                      <span>Outro Ramp (Transisi)</span>
                    </div>
                    <p className="text-xs font-semibold text-base-content">
                      {data?.talking_points?.outro_talk_window || "15s Fade Out"}
                    </p>
                    <p className="text-[10px] text-base-content/50">
                      Waktu penyiar mulai berbicara kembali saat musik mulai memudar.
                    </p>
                  </div>
                </div>

                {/* Broadcaster Talking Ideas */}
                <div className="p-3.5 rounded-2xl bg-base-100 border border-base-300 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-base-content">
                    <Sparkles className="h-3.5 w-3.5 text-warning" />
                    <span>Inspirasi Obrolan Penyiar:</span>
                  </div>
                  <ul className="space-y-1.5">
                    {data?.talking_points?.broadcaster_tips?.map((tip, idx) => (
                      <li
                        key={idx}
                        className="flex items-start gap-2 text-xs text-base-content/75 leading-relaxed"
                      >
                        <span className="text-primary font-bold mt-0.5">•</span>
                        <span>{tip}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Modal Actions */}
        <div className="modal-action border-t border-base-300 pt-3">
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost btn-sm text-xs font-medium"
          >
            Tutup
          </button>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button onClick={onClose}>close</button>
      </form>
    </dialog>
  );
}
