"use client";

import React, { useState, useEffect } from "react";
import {
  Mic2,
  FileText,
  X,
  Copy,
  Check,
  Radio,
  Clock,
  Music,
  Quote,
  Calendar,
  Flame,
  Sliders,
} from "lucide-react";
import Image from "next/image";
import { TrackItem, LyricsResponse } from "@/lib/types";
import { fetchTrackLyrics } from "@/lib/api";

interface LyricsModalProps {
  track: TrackItem | null;
  isOpen: boolean;
  onClose: () => void;
}

function stripLeadingEmoji(text?: string): string {
  if (!text) return "";
  return text.replace(/^[^\w\d\s(]+/u, "").trim();
}

export function LyricsModal({ track, isOpen, onClose }: LyricsModalProps) {
  const [data, setData] = useState<LyricsResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [copiedType, setCopiedType] = useState<
    "lyrics" | "intro" | "outro" | "quote" | null
  >(null);
  const [activeTab, setActiveTab] = useState<"lyrics" | "cues">("lyrics");
  const [prevTrackId, setPrevTrackId] = useState<string | null>(null);

  if (isOpen && track && track.video_id !== prevTrackId) {
    setPrevTrackId(track.video_id);
    setIsLoading(true);
    setData(null);
  } else if (!isOpen && prevTrackId !== null) {
    setPrevTrackId(null);
  }

  // Close modal on Escape key (R-26 & R-32)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen || !track) return;

    let isMounted = true;
    const currentTrack = track;

    fetchTrackLyrics(currentTrack.video_id)
      .then((res) => {
        if (isMounted) {
          setData(res);
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
              vibe_badge: "Radio Hits Favorit",
              vibe_category: "universal",
              key_lyric_quote: currentTrack.title,
              intro_script: `Halo pendengar setia, berikut lagu pilihan dari ${currentTrack.artists?.join(", ") || "musisi pilihan"} berjudul '${currentTrack.title}'. Selamat mendengarkan.`,
              outro_script: `Baru saja kita dengarkan '${currentTrack.title}' dari ${currentTrack.artists?.join(", ") || "musisi pilihan"}. Tetap bersama kami untuk rangkaian lagu berikutnya.`,
              broadcaster_tips: [
                "Gunakan waktu intro musik untuk menyapa pendengar dan membacakan pengirim request.",
                "Sebutkan judul lagu dan nama artis sebelum vokal utama masuk.",
                "Pastikan mic ducking aktif saat berbicara di atas intro atau outro lagu.",
              ],
              song_trivia: {
                title: currentTrack.title,
                artist: currentTrack.artists?.join(", ") || "",
                album: currentTrack.album || "Single",
                release_year: currentTrack.year || "Rilis Resmi",
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
      <div className="modal-box rounded-xl bg-base-200 border border-base-300 max-w-2xl shadow-2xl p-5 sm:p-6 space-y-4">
        {/* Header Bar */}
        <div className="flex items-center justify-between border-b border-base-300 pb-3">
          <div className="flex items-center gap-3 min-w-0">
            {track.thumbnail_url ? (
              <div className="relative h-11 w-11 rounded-lg overflow-hidden shrink-0 border border-base-300">
                <Image
                  src={track.thumbnail_url}
                  alt={track.title}
                  fill
                  className="object-cover"
                />
              </div>
            ) : (
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-base-300 text-base-content shrink-0">
                <Music className="h-5 w-5" />
              </div>
            )}
            <div className="min-w-0">
              <h3 className="font-bold text-sm sm:text-base text-base-content truncate">
                {track.title}
              </h3>
              <p className="text-xs text-base-content/70 truncate">
                {track.artists?.join(", ") || "YouTube Music"}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup jendela lirik"
            className="btn btn-ghost btn-sm h-9 w-9 p-0 rounded-lg text-base-content/70 hover:text-base-content shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Mode Switcher */}
        <div className="bg-base-100 border border-base-300 p-1 rounded-lg flex gap-1">
          <button
            type="button"
            onClick={() => setActiveTab("lyrics")}
            className={`flex-1 inline-flex items-center justify-center gap-2 h-9 text-xs font-bold rounded-md transition-colors ${
              activeTab === "lyrics"
                ? "bg-primary text-primary-content"
                : "text-base-content/70 hover:text-base-content"
            }`}
          >
            <FileText className="h-3.5 w-3.5" />
            <span>Teks Lirik</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("cues")}
            className={`flex-1 inline-flex items-center justify-center gap-2 h-9 text-xs font-bold rounded-md transition-colors ${
              activeTab === "cues"
                ? "bg-primary text-primary-content"
                : "text-base-content/70 hover:text-base-content"
            }`}
          >
            <Mic2 className="h-3.5 w-3.5" />
            <span>Cue Ramp &amp; Naskah Penyiar</span>
          </button>
        </div>

        {/* Content Body */}
        {isLoading ? (
          <div className="py-12 text-center space-y-2 rounded-lg bg-base-100 border border-base-300">
            <span className="loading loading-spinner loading-md text-primary" />
            <p className="text-xs text-base-content/70">
              Memuat lirik lagu dan menghitung titik cue siaran...
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {activeTab === "lyrics" ? (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-xs text-base-content/70 px-1">
                  <span>Sumber: {data?.source || "YouTube Music"}</span>
                  {data?.has_lyrics && (
                    <button
                      type="button"
                      onClick={() => handleCopyText(data.lyrics, "lyrics")}
                      className="btn btn-xs h-8 px-3 rounded-md bg-base-100 border border-base-300 gap-1.5 hover:border-primary/50 text-xs font-semibold text-base-content"
                    >
                      {copiedType === "lyrics" ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-success" />
                          <span className="text-success">Tersalin</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" />
                          <span>Salin Lirik</span>
                        </>
                      )}
                    </button>
                  )}
                </div>

                <div className="bg-base-100 border border-base-300 rounded-lg p-4 max-h-[340px] overflow-y-auto select-text">
                  <p className="text-xs sm:text-sm text-base-content leading-relaxed whitespace-pre-line font-sans">
                    {data?.lyrics}
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1 select-text">
                {/* Vibe & Song Fact Header */}
                <div className="p-3.5 rounded-lg bg-base-100 border border-base-300 flex flex-wrap items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-base-content/70">
                      Karakter Lagu:
                    </span>
                    <span className="px-2.5 py-1 rounded bg-primary/15 border border-primary/40 text-primary font-bold text-xs">
                      {stripLeadingEmoji(data?.talking_points?.vibe_badge) ||
                        data?.talking_points?.vibe ||
                        "Radio Hits"}
                    </span>
                  </div>
                  {data?.talking_points?.song_trivia && (
                    <div className="flex flex-wrap items-center gap-2 text-xs text-base-content/80">
                      {data.talking_points.song_trivia.release_year && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-base-200 border border-base-300 font-mono">
                          <Calendar className="h-3 w-3 text-base-content/60" />
                          <span>{data.talking_points.song_trivia.release_year}</span>
                        </span>
                      )}
                      {data.talking_points.song_trivia.duration && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-base-200 border border-base-300 font-mono tabular-nums">
                          <Clock className="h-3 w-3 text-base-content/60" />
                          <span>{data.talking_points.song_trivia.duration}</span>
                        </span>
                      )}
                      {(data.talking_points.song_trivia.play_count ?? 0) > 0 && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-warning/15 border border-warning/30 text-warning font-mono font-bold">
                          <Flame className="h-3 w-3 fill-current" />
                          <span>{data.talking_points.song_trivia.play_count}x diputar</span>
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* 3 Timing Ramp Readouts */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div className="p-3 rounded-lg bg-base-100 border border-base-300 space-y-1">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-base-content">
                      <Clock className="h-3.5 w-3.5 text-success" />
                      <span>Intro Ramp</span>
                    </div>
                    <p className="text-xs font-bold text-primary font-mono tabular-nums">
                      {data?.talking_points?.intro_talk_window || "00:00 - 00:14"}
                    </p>
                    <p className="text-xs text-base-content/70 leading-snug">
                      Jendela bicara sebelum vokal masuk.
                    </p>
                  </div>

                  <div className="p-3 rounded-lg bg-base-100 border border-base-300 space-y-1">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-base-content">
                      <Radio className="h-3.5 w-3.5 text-warning" />
                      <span>Station ID Cue</span>
                    </div>
                    <p className="text-xs font-bold text-primary font-mono tabular-nums">
                      {data?.talking_points?.station_id_cue || "Midpoint Sweep"}
                    </p>
                    <p className="text-xs text-base-content/70 leading-snug">
                      Titik selingan jingle atau identifikasi stasiun.
                    </p>
                  </div>

                  <div className="p-3 rounded-lg bg-base-100 border border-base-300 space-y-1">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-base-content">
                      <Radio className="h-3.5 w-3.5 text-accent" />
                      <span>Outro Backsell</span>
                    </div>
                    <p className="text-xs font-bold text-primary font-mono tabular-nums">
                      {data?.talking_points?.outro_talk_window || "15s Fade Out"}
                    </p>
                    <p className="text-xs text-base-content/70 leading-snug">
                      Mulai ulas lagu saat musik memudar.
                    </p>
                  </div>
                </div>

                {/* Key Lyric Hook */}
                {data?.talking_points?.key_lyric_quote && (
                  <div className="p-3.5 rounded-lg bg-base-100 border border-base-300 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-xs font-bold text-base-content">
                        <Quote className="h-3.5 w-3.5 text-primary" />
                        <span>Kutipan Lirik Utama (Hook):</span>
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          handleCopyText(
                            data.talking_points.key_lyric_quote!,
                            "quote"
                          )
                        }
                        className="btn btn-xs h-7 px-2.5 rounded-md bg-base-200 border border-base-300 gap-1 text-xs font-semibold"
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
                    <p className="text-xs sm:text-sm italic text-base-content border-l-2 border-primary pl-3 py-0.5">
                      &ldquo;{data.talking_points.key_lyric_quote}&rdquo;
                    </p>
                  </div>
                )}

                {/* Ready-to-Read On-Air Scripts */}
                <div className="space-y-2.5">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-base-content px-1">
                    <Mic2 className="h-3.5 w-3.5 text-primary" />
                    <span>Naskah Siaran Siap Baca (Ad-Lib On-Air):</span>
                  </div>

                  {data?.talking_points?.intro_script && (
                    <div className="p-3.5 rounded-lg bg-base-100 border border-base-300 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-success flex items-center gap-1.5">
                          <Mic2 className="h-3.5 w-3.5" />
                          <span>Naskah Intro (Saat musik pembuka berjalan)</span>
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            handleCopyText(
                              data.talking_points.intro_script!,
                              "intro"
                            )
                          }
                          className="btn btn-xs h-7 px-2.5 rounded-md bg-base-200 border border-base-300 gap-1 text-xs font-semibold"
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
                      <p className="text-xs sm:text-sm text-base-content leading-relaxed bg-base-200 p-3 rounded-md border border-base-300">
                        {data.talking_points.intro_script}
                      </p>
                    </div>
                  )}

                  {data?.talking_points?.outro_script && (
                    <div className="p-3.5 rounded-lg bg-base-100 border border-base-300 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-accent flex items-center gap-1.5">
                          <Radio className="h-3.5 w-3.5" />
                          <span>Naskah Outro (Saat backsell musik fade-out)</span>
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            handleCopyText(
                              data.talking_points.outro_script!,
                              "outro"
                            )
                          }
                          className="btn btn-xs h-7 px-2.5 rounded-md bg-base-200 border border-base-300 gap-1 text-xs font-semibold"
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
                      <p className="text-xs sm:text-sm text-base-content leading-relaxed bg-base-200 p-3 rounded-md border border-base-300">
                        {data.talking_points.outro_script}
                      </p>
                    </div>
                  )}
                </div>

                {/* Broadcaster Technical Notes */}
                <div className="p-3.5 rounded-lg bg-base-100 border border-base-300 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-base-content">
                    <Sliders className="h-3.5 w-3.5 text-primary" />
                    <span>Catatan Teknis Penyiar:</span>
                  </div>
                  <ul className="space-y-1.5">
                    {data?.talking_points?.broadcaster_tips?.map((tip, idx) => (
                      <li
                        key={idx}
                        className="flex items-start gap-2 text-xs text-base-content/80 leading-relaxed"
                      >
                        <span className="text-primary font-mono font-bold">•</span>
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
            className="btn btn-secondary btn-sm h-9 px-4 rounded-lg border border-base-300 text-xs font-semibold"
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
