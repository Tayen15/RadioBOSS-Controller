"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/app/components/Navbar";

interface SongItem {
  video_id: string;
  title: string;
  artist: string;
  thumbnail_url: string;
  duration_formatted: string;
}

export default function StationPage() {
  const params = useParams();
  const stationId = (params?.id as string) || "";

  const [station, setStation] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Audio Player State
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.85);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Request Box State
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SongItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedSong, setSelectedSong] = useState<SongItem | null>(null);
  const [senderName, setSenderName] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // 1. Fetch Station Details
  useEffect(() => {
    async function loadStation() {
      try {
        const res = await fetch("/api/v1/stations");
        if (res.ok) {
          const data = await res.json();
          const match = (data.stations || []).find(
            (s: any) =>
              s.station_hash === stationId ||
              s.station_hash.startsWith(stationId)
          );
          if (match) {
            setStation(match);
          } else {
            // Fallback generic info
            setStation({
              station_hash: stationId,
              station_name: `Stasiun #${stationId.slice(0, 6).toUpperCase()}`,
              is_online: false,
              total_airtime_formatted: "0j 0m",
              total_songs_played: 0,
              public_stream_url: "",
              enable_online_requests: true,
              now_playing: null,
            });
          }
        }
      } catch (err) {
        console.error("Failed to load station:", err);
      } finally {
        setLoading(false);
      }
    }
    if (stationId) {
      loadStation();
    }
  }, [stationId]);

  // 2. Audio Control
  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => setIsPlaying(true)).catch((e) => {
        console.error("Playback failed:", e);
      });
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (audioRef.current) {
      audioRef.current.volume = val;
    }
  };

  // 3. Search Songs
  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/v1/requests/search?q=${encodeURIComponent(searchQuery.trim())}`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.songs || []);
        }
      } catch (e) {
        console.error("Search error:", e);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // 4. Submit Song Request
  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSong) return;
    if (!senderName.trim()) {
      setSubmitError("Harap masukkan nama Anda.");
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(null);

    try {
      const res = await fetch("/api/v1/requests/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          station_hash: station?.station_hash || stationId,
          sender_name: senderName.trim(),
          message: message.trim(),
          video_id: selectedSong.video_id,
          title: selectedSong.title,
          artist: selectedSong.artist,
          thumbnail_url: selectedSong.thumbnail_url,
          duration_formatted: selectedSong.duration_formatted,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setSubmitSuccess("Permintaan lagu & salam Anda telah terkirim ke bilik siar penyiar! Harap nantikan pemutaran yaa.");
        setSelectedSong(null);
        setMessage("");
      } else {
        setSubmitError(data.error || "Gagal mengirim request lagu.");
      }
    } catch (err: any) {
      setSubmitError(err.message || "Terjadi kesalahan jaringan.");
    } finally {
      setSubmitting(false);
    }
  };

  const copyStationLink = () => {
    if (typeof window !== "undefined") {
      navigator.clipboard.writeText(window.location.href);
      alert("Tautan stasiun radio berhasil disalin ke clipboard!");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-carbon text-white flex items-center justify-center font-mono text-sm">
        Memuat data siaran stasiun...
      </div>
    );
  }

  const hasStreamUrl = Boolean(station?.public_stream_url && station.public_stream_url.trim().length > 0);
  const streamSrc = hasStreamUrl ? station.public_stream_url.trim() : "";

  return (
    <div className="min-h-screen flex flex-col justify-between font-sans">
      <Navbar currentPath="/stations" />

      {/* Audio Element mounted ONLY if public stream URL is configured */}
      {hasStreamUrl && <audio ref={audioRef} src={streamSrc} preload="none" />}

      <main className="max-w-5xl mx-auto px-4 py-8 flex-1 w-full space-y-6">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center justify-between text-xs font-mono">
          <Link href="/stations" className="text-zinc-400 hover:text-white transition flex items-center gap-1.5">
            <span>&larr;</span> Kembali ke Direktori Stasiun
          </Link>
          <button
            onClick={copyStationLink}
            className="bg-control hover:bg-zinc-700 text-zinc-300 hover:text-white border border-borderLine px-3 py-1 rounded transition flex items-center gap-1"
          >
            <span>🔗 Bagikan Stasiun</span>
          </button>
        </div>

        {/* Hero Station Banner */}
        <section className="bg-slateDeck border border-borderLine rounded-2xl p-6 sm:p-8 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span
                  className={`text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1.5 ${
                    station?.is_online
                      ? "bg-emerald-400/15 text-emerald-400 border border-emerald-400/30"
                      : "bg-zinc-800 text-zinc-400 border border-zinc-700"
                  }`}
                >
                  <span
                    className={`h-2 w-2 rounded-full ${
                      station?.is_online ? "bg-emerald-400 animate-pulse" : "bg-zinc-500"
                    }`}
                  />
                  {station?.is_online ? "ON-AIR STUDIO AKTIF" : "OFFLINE / STANDBY"}
                </span>
                <span className="text-xs font-mono text-zinc-500">ID: {stationId.slice(0, 10)}</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                {station?.station_name || "Radio Stasiun Caster"}
              </h1>
              <p className="text-xs sm:text-sm text-zinc-400">
                Studio penyiaran musik resmi yang ditenagai oleh Radio Caster Bridge & RadioBOSS.
              </p>
            </div>

            {/* Quick Stats Badges */}
            <div className="flex items-center gap-3 font-mono text-xs">
              <div className="bg-carbon border border-borderLine rounded-xl p-3 text-center min-w-[100px]">
                <div className="text-[10px] text-zinc-500 uppercase">Jam Terbang</div>
                <div className="text-sm font-bold text-amberSignal mt-0.5">
                  {station?.total_airtime_formatted || "0j 0m"}
                </div>
              </div>
              <div className="bg-carbon border border-borderLine rounded-xl p-3 text-center min-w-[100px]">
                <div className="text-[10px] text-zinc-500 uppercase">Lagu Diputar</div>
                <div className="text-sm font-bold text-white mt-0.5">
                  {(station?.total_songs_played || 0).toLocaleString()}
                </div>
              </div>
            </div>
          </div>

          {/* Conditional Audio Player or Local Station Notice */}
          {hasStreamUrl ? (
            <div className="bg-carbon border border-amberSignal/30 rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-4 w-full sm:w-auto">
                <button
                  onClick={togglePlay}
                  className={`h-14 w-14 rounded-full flex items-center justify-center font-bold text-xl shrink-0 transition-all ${
                    isPlaying
                      ? "bg-red-500 text-white shadow-lg shadow-red-500/30 animate-pulse"
                      : "bg-amberSignal text-carbon shadow-lg shadow-amberSignal/20 hover:scale-105"
                  }`}
                >
                  {isPlaying ? "❚❚" : "▶"}
                </button>

                <div className="min-w-0">
                  <div className="text-[10px] font-mono text-amberSignal uppercase tracking-wider font-semibold">
                    {isPlaying ? "SEDANG MENDENGARKAN LIVE STREAM" : "KLIK TOMBOL UNTUK MENDENGARKAN"}
                  </div>
                  <div className="font-bold text-sm sm:text-base text-white truncate mt-0.5">
                    {station?.now_playing?.title || "Audio Stream Siaran Studio"}
                  </div>
                  <div className="text-xs text-zinc-400 truncate">
                    {station?.now_playing?.artist || station?.station_name || "Radio Live"}
                  </div>
                </div>
              </div>

              {/* Volume Control */}
              <div className="flex items-center gap-3 w-full sm:w-auto justify-end text-xs font-mono">
                <span className="text-zinc-400">Vol:</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={volume}
                  onChange={handleVolumeChange}
                  className="w-24 sm:w-28 accent-amberSignal"
                />
                <span className="text-zinc-300 w-8 text-right">{Math.round(volume * 100)}%</span>
              </div>
            </div>
          ) : (
            <div className="bg-carbon border border-borderLine rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="h-12 w-12 rounded-xl bg-control border border-borderLine flex items-center justify-center text-amberSignal text-2xl shrink-0">
                  📻
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider font-semibold flex items-center gap-2">
                    <span className="text-amberSignal font-bold">STUDIO LOKAL</span>
                    <span className="text-zinc-600">•</span>
                    <span className={station?.is_online ? "text-emerald-400" : "text-zinc-500"}>
                      {station?.is_online ? "Sistem Siaran Aktif" : "Standby / Offline"}
                    </span>
                  </div>
                  <div className="font-bold text-sm text-white truncate mt-0.5">
                    {station?.now_playing?.title ? (
                      <span>
                        Sedang On-Air: <span className="text-amberSignal">{station.now_playing.title}</span>
                        {station.now_playing.artist ? ` - ${station.now_playing.artist}` : ""}
                      </span>
                    ) : (
                      "Stasiun Beroperasi Lokal (Tanpa Streaming Publik)"
                    )}
                  </div>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    {station?.now_playing?.title
                      ? "Lagu sedang diputar di studio bilik siar lokal. Penyiar belum menyematkan link audio stream online publik."
                      : "Stasiun berjalan langsung di PC studio lokal. Penyiar belum mengonfigurasi URL audio stream publik (Icecast/Shoutcast)."}
                  </p>
                </div>
              </div>

              <div className="text-right shrink-0">
                <span className="text-[11px] font-mono text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  {station?.enable_online_requests !== false ? "Kotak Request Terbuka" : "Request Ditutup"}
                </span>
              </div>
            </div>
          )}
        </section>

        {/* Public Song Request Box */}
        <section className="bg-slateDeck border border-borderLine rounded-2xl p-6 sm:p-8 space-y-6">
          <div className="border-b border-borderLine pb-4">
            <div className="flex items-center gap-2">
              <span className="text-base text-amberSignal">🎙️</span>
              <h2 className="text-lg font-bold text-white tracking-wide">
                KOTAK REQUEST LAGU & SALAM PENDENGAR
              </h2>
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              Pilih lagu favoritmu dan titipkan pesan salam untuk dibacakan langsung oleh penyiar yang sedang on-air!
            </p>
          </div>

          {submitSuccess && (
            <div className="bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs p-4 rounded-xl flex items-center justify-between">
              <span>{submitSuccess}</span>
              <button onClick={() => setSubmitSuccess(null)} className="text-emerald-400 font-bold ml-2">
                &times;
              </button>
            </div>
          )}

          {submitError && (
            <div className="bg-red-500/15 border border-red-500/30 text-red-300 text-xs p-4 rounded-xl flex items-center justify-between">
              <span>{submitError}</span>
              <button onClick={() => setSubmitError(null)} className="text-red-400 font-bold ml-2">
                &times;
              </button>
            </div>
          )}

          {/* Form Step 1: Search Song */}
          <div className="space-y-3">
            <label className="text-xs font-bold text-zinc-300 uppercase tracking-wider block">
              1. Cari Lagu yang Ingin Di-Request:
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="Ketik judul lagu atau nama penyanyi (misal: Tulus, Juicy Luicy, Bernadya)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-carbon border border-borderLine focus:border-amberSignal rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none transition"
              />
              {searching && (
                <div className="absolute right-4 top-3.5 text-xs text-amberSignal font-mono animate-pulse">
                  Mencari...
                </div>
              )}
            </div>

            {/* Song Results Dropdown/List */}
            {searchResults.length > 0 && !selectedSong && (
              <div className="bg-carbon border border-borderLine rounded-xl max-h-60 overflow-y-auto divide-y divide-borderLine">
                {searchResults.map((song) => (
                  <div
                    key={song.video_id}
                    onClick={() => setSelectedSong(song)}
                    className="p-3 hover:bg-surfaceControl flex items-center justify-between cursor-pointer transition gap-3"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white truncate">{song.title}</div>
                      <div className="text-xs text-zinc-400 truncate">{song.artist}</div>
                    </div>
                    <button className="bg-amberSignal text-carbon font-bold text-xs px-3 py-1.5 rounded-lg shrink-0">
                      Pilih
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Form Step 2: Listener Details & Message (Shows when song is chosen) */}
          {selectedSong && (
            <form onSubmit={handleSubmitRequest} className="bg-carbon border border-borderLine rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-borderLine">
                <div className="flex items-center gap-3">
                  <div className="bg-amberSignal/20 text-amberSignal font-mono text-xs font-bold px-2 py-1 rounded">
                    Lagu Terpilih
                  </div>
                  <div>
                    <span className="font-bold text-white text-sm">{selectedSong.title}</span>
                    <span className="text-zinc-400 text-xs ml-2">- {selectedSong.artist}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedSong(null)}
                  className="text-xs text-zinc-400 hover:text-white"
                >
                  Ganti Lagu
                </button>
              </div>

              <div>
                <label className="text-xs font-bold text-zinc-300 block mb-1">
                  Nama Anda / Panggilan: <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Rian di Cawang / Maya & Teman Kantor"
                  value={senderName}
                  onChange={(e) => setSenderName(e.target.value)}
                  className="w-full bg-slateDeck border border-borderLine focus:border-amberSignal rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-zinc-300 block mb-1">
                  Pesan Salam untuk Penyiar (Opsional):
                </label>
                <textarea
                  rows={3}
                  placeholder="Titip salam buat siapa saja atau request kata-kata penyiar untuk menemani siaran..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="w-full bg-slateDeck border border-borderLine focus:border-amberSignal rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedSong(null)}
                  className="text-xs text-zinc-400 hover:text-white px-3 py-2 rounded"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="bg-amberSignal hover:bg-amber-400 text-carbon font-extrabold text-xs px-5 py-2.5 rounded-lg transition disabled:opacity-50"
                >
                  {submitting ? "Mengirim..." : "Kirim Request ke Studio (1-Klik)"}
                </button>
              </div>
            </form>
          )}
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-borderLine bg-slateDeck/50 py-4 text-center text-xs text-zinc-500 font-mono">
        CasterHub Broadcast Intelligence Network &copy; {new Date().getFullYear()} • Zero-PII Anonymous Telemetry
      </footer>
    </div>
  );
}
