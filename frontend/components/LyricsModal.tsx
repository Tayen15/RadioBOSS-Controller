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
  Quote,
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
  const [copiedType, setCopiedType] = useState<
    "lyrics" | "intro" | "outro" | "quote" | null
  >(null);
  const [activeTab, setActiveTab] = useState<"lyrics" | "cues">("lyrics");

  const [prevTrackId, setPrevTrackId] = useState<string | null>(null);

  // Adjust state during render when track or modal state changes
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
              intro_talk_window: "00:00 - 00:14 (Intro Standar Radio)",
              station_id_cue: "01:45 (Sweep / Station ID)",
              outro_talk_window: "15 detik sebelum lagu berakhir (Fade Out)",
              vibe: "Radio Hits Favorit",
              vibe_badge: "✨ Radio Hits Favorit",
              vibe_category: "universal",
              key_lyric_quote: currentTrack.title,
              intro_script: `Halo Sobat Radio, berikut lagu hits pilihan spesial dari ${currentTrack.artists?.join(", ") || "musisi terbaik"} berjudul '${currentTrack.title}'. Selamat mendengarkan!`,
              outro_script: `Baru saja kita dengarkan hits '${currentTrack.title}' dari ${currentTrack.artists?.join(", ") || "musisi terbaik"}. Tetap stay tune bersama kami untuk playlist terbaik berikutnya!`,
              broadcaster_tips: [
                "Gunakan intro musik untuk menyapa pendengar dan membacakan nama pengirim request.",
                "Sebutkan judul lagu dan nama artis dengan jelas.",
                "Pastikan mic ducking aktif saat berbicara di atas intro lagu.",
              ],
              song_trivia: {
                title: currentTrack.title,
                artist: currentTrack.artists?.join(", ") || "",
                album: currentTrack.album || "Single",
                release_year: currentTrack.year || "Official Release",
                duration: currentTrack.duration_formatted || "00:00",
              },
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

  const handleCopyText = (
    text: string,
    type: "lyrics" | "intro" | "outro" | "quote"
  ) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedType(type);
    setTimeout(() => {
      setCopiedType((prev) => (prev === type ? null : prev));
    }, 2000);
  };

  return (
    <dialog className="modal modal-open z-50">
      <div className="modal-box rounded-2xl bg-base-200 border border-base-300 max-w-2xl shadow-2xl p-5 sm:p-6 space-y-4">
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
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-base-300 text-base-content shrink-0">
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
            className="btn btn-ghost btn-circle btn-sm text-base-content/60 hover:text-white shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="tabs tabs-box bg-base-100 border border-base-300 p-1 rounded-xl flex gap-1">
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
              <span className="badge badge-success badge-xs font-bold text-success-content">
                Ada
              </span>
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
            <span>Smart Announcer Cues</span>
            {data?.talking_points?.vibe && (
              <span className="badge badge-accent badge-xs font-bold text-accent-content hidden sm:inline-flex">
                Smart
              </span>
            )}
          </button>
        </div>

        {/* Content Body */}
        {isLoading ? (
          <div className="py-14 text-center space-y-2">
            <span className="loading loading-spinner loading-md text-base-content" />
            <p className="text-xs text-base-content/60">
              Menganalisis metadata, lirik &amp; cue point siaran...
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
                      onClick={() => handleCopyText(data.lyrics, "lyrics")}
                      className="btn btn-ghost btn-xs gap-1 hover:text-primary font-medium"
                    >
                      {copiedType === "lyrics" ? (
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
              <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1 select-text scrollbar-thin">
                {/* Vibe & Song Fact Header */}
                <div className="p-3.5 rounded-2xl bg-base-100 border border-base-300 flex flex-wrap items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-base-content/60">
                      Nuansa Lagu:
                    </span>
                    <span className="badge badge-primary font-bold text-xs py-2 px-3 shadow-sm">
                      {data?.talking_points?.vibe_badge || "✨ Radio Hits Favorit"}
                    </span>
                  </div>
                  {data?.talking_points?.song_trivia && (
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-base-content/60">
                      {data.talking_points.song_trivia.release_year && (
                        <span className="badge badge-ghost badge-sm">
                          📅 {data.talking_points.song_trivia.release_year}
                        </span>
                      )}
                      {data.talking_points.song_trivia.duration && (
                        <span className="badge badge-ghost badge-sm font-mono">
                          ⏱️ {data.talking_points.song_trivia.duration}
                        </span>
                      )}
                      {(data.talking_points.song_trivia.play_count ?? 0) > 0 && (
                        <span className="badge badge-accent badge-sm text-accent-content font-bold">
                          🔥 Diputar {data.talking_points.song_trivia.play_count}x
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* 3 Timing Ramp Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {/* Intro Ramp */}
                  <div className="p-3 rounded-2xl bg-base-100 border border-base-300 space-y-1">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-base-content">
                      <Clock className="h-3.5 w-3.5 text-success" />
                      <span>Intro Ramp</span>
                    </div>
                    <p className="text-xs font-bold text-base-content font-mono">
                      {data?.talking_points?.intro_talk_window || "00:00 - 00:14"}
                    </p>
                    <p className="text-[10px] text-base-content/50 leading-tight">
                      Batas aman bicara sebelum vokal masuk.
                    </p>
                  </div>

                  {/* Station ID Cue */}
                  <div className="p-3 rounded-2xl bg-base-100 border border-base-300 space-y-1">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-base-content">
                      <Radio className="h-3.5 w-3.5 text-warning" />
                      <span>Station ID Cue</span>
                    </div>
                    <p className="text-xs font-bold text-base-content font-mono">
                      {data?.talking_points?.station_id_cue || "Midpoint Sweep"}
                    </p>
                    <p className="text-[10px] text-base-content/50 leading-tight">
                      Titik selingan jingle / callout stasiun.
                    </p>
                  </div>

                  {/* Outro Ramp */}
                  <div className="p-3 rounded-2xl bg-base-100 border border-base-300 space-y-1">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-base-content">
                      <Radio className="h-3.5 w-3.5 text-accent" />
                      <span>Outro Backsell</span>
                    </div>
                    <p className="text-xs font-bold text-base-content font-mono">
                      {data?.talking_points?.outro_talk_window || "15s Fade Out"}
                    </p>
                    <p className="text-[10px] text-base-content/50 leading-tight">
                      Mulai ulas lagu saat musik memudar.
                    </p>
                  </div>
                </div>

                {/* Memorable Lyric Hook Quote Box */}
                {data?.talking_points?.key_lyric_quote && (
                  <div className="p-3.5 rounded-2xl bg-base-100 border border-base-300 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-xs font-bold text-base-content">
                        <Quote className="h-3.5 w-3.5 text-primary" />
                        <span>Kutipan Lirik Ikonik (Hook Lagu):</span>
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          handleCopyText(
                            data.talking_points.key_lyric_quote!,
                            "quote"
                          )
                        }
                        className="btn btn-ghost btn-xs gap-1 text-[11px] font-medium"
                      >
                        {copiedType === "quote" ? (
                          <>
                            <Check className="h-3 w-3 text-success" />
                            <span className="text-success">Tersalin</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3" />
                            <span>Salin</span>
                          </>
                        )}
                      </button>
                    </div>
                    <p className="text-xs sm:text-sm italic font-serif text-base-content/90 border-l-2 border-primary pl-3 py-0.5">
                      &ldquo;{data.talking_points.key_lyric_quote}&rdquo;
                    </p>
                  </div>
                )}

                {/* On-Air Radio Broadcaster Scripts (Naskah Siap Baca) */}
                <div className="space-y-2.5">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-base-content px-1">
                    <Mic2 className="h-3.5 w-3.5 text-primary" />
                    <span>Naskah Siaran Siap Baca (Ad-Lib On-Air):</span>
                  </div>

                  {/* Intro Script */}
                  {data?.talking_points?.intro_script && (
                    <div className="p-3.5 rounded-2xl bg-base-100 border border-base-300 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-success flex items-center gap-1">
                          🎙️ Naskah Intro (Dibaca saat intro musik berjalan)
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            handleCopyText(
                              data.talking_points.intro_script!,
                              "intro"
                            )
                          }
                          className="btn btn-ghost btn-xs gap-1 text-[11px] font-medium"
                        >
                          {copiedType === "intro" ? (
                            <>
                              <Check className="h-3 w-3 text-success" />
                              <span className="text-success">Tersalin</span>
                            </>
                          ) : (
                            <>
                              <Copy className="h-3 w-3" />
                              <span>Salin Naskah</span>
                            </>
                          )}
                        </button>
                      </div>
                      <p className="text-xs text-base-content/85 leading-relaxed bg-base-200/50 p-2.5 rounded-xl border border-base-300/60 font-sans">
                        {data.talking_points.intro_script}
                      </p>
                    </div>
                  )}

                  {/* Outro Script */}
                  {data?.talking_points?.outro_script && (
                    <div className="p-3.5 rounded-2xl bg-base-100 border border-base-300 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-accent flex items-center gap-1">
                          📻 Naskah Outro (Dibaca saat backsell musik fade-out)
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            handleCopyText(
                              data.talking_points.outro_script!,
                              "outro"
                            )
                          }
                          className="btn btn-ghost btn-xs gap-1 text-[11px] font-medium"
                        >
                          {copiedType === "outro" ? (
                            <>
                              <Check className="h-3 w-3 text-success" />
                              <span className="text-success">Tersalin</span>
                            </>
                          ) : (
                            <>
                              <Copy className="h-3 w-3" />
                              <span>Salin Naskah</span>
                            </>
                          )}
                        </button>
                      </div>
                      <p className="text-xs text-base-content/85 leading-relaxed bg-base-200/50 p-2.5 rounded-xl border border-base-300/60 font-sans">
                        {data.talking_points.outro_script}
                      </p>
                    </div>
                  )}
                </div>

                {/* Broadcaster Tips & Advice */}
                <div className="p-3.5 rounded-2xl bg-base-100 border border-base-300 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-base-content">
                    <Sparkles className="h-3.5 w-3.5 text-warning" />
                    <span>Panduan Teknis &amp; Tips Siaran:</span>
                  </div>
                  <ul className="space-y-1.5">
                    {data?.talking_points?.broadcaster_tips?.map((tip, idx) => (
                      <li
                        key={idx}
                        className="flex items-start gap-2 text-xs text-base-content/75 leading-relaxed"
                      >
                        <span className="text-accent font-bold mt-0.5">•</span>
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

