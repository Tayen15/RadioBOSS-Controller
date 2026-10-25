"use client";

import React, { useState, useEffect } from "react";
import {
  Settings as SettingsIcon,
  X,
  Radio,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Save,
  Tag,
  ChevronDown,
  Check,
  FolderOpen,
  HardDrive,
  Trash2,
  RefreshCw,
  Flame,
  ListMusic,
  Scissors,
  Download,
} from "lucide-react";
import { AppConfig, TitleFormatMode, CacheStats, CachedTrackItem } from "@/lib/types";
import {
  getAppSettings,
  saveAppSettings,
  fetchCacheStats,
  openCacheFolder,
  clearAudioCache,
  fetchCachedTracks,
  trimAudioCache,
} from "@/lib/api";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSettingsSaved: () => void;
  onOpenUpdateModal?: () => void;
}

const FORMAT_OPTIONS: {
  value: TitleFormatMode;
  label: string;
  badge?: string;
  desc: string;
}[] = [
  {
    value: "radioboss_native",
    label: "RadioBOSS Standar: %artist - %title",
    badge: "Direkomendasikan",
    desc: "Mengikuti metadata ID3 tag file atau decoder bawaan RadioBOSS",
  },
  {
    value: "artist_title",
    label: "Format: Nama Artis - Judul Lagu",
    desc: "Format standar siaran radio (contoh: NIKI - Backburner)",
  },
  {
    value: "title_artist",
    label: "Format: Judul Lagu - Nama Artis",
    desc: "Format judul mendahului artis (contoh: Backburner - NIKI)",
  },
  {
    value: "title_only",
    label: "Format: Hanya Judul Lagu",
    desc: "Menampilkan judul lagu saja tanpa nama artis",
  },
  {
    value: "custom",
    label: "Kustom Format Manual...",
    desc: "Gunakan template variabel {artist} dan {title}",
  },
];

export function SettingsModal({
  isOpen,
  onClose,
  onSettingsSaved,
  onOpenUpdateModal,
}: SettingsModalProps) {
  const [host, setHost] = useState("http://127.0.0.1");
  const [port, setPort] = useState(9000);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [titleFormatMode, setTitleFormatMode] =
    useState<TitleFormatMode>("radioboss_native");
  const [customFormat, setCustomFormat] = useState("{artist} - {title}");
  const [isFormatDropdownOpen, setIsFormatDropdownOpen] = useState(false);

  const [serverPort, setServerPort] = useState(8000);
  const [enableLoudnorm, setEnableLoudnorm] = useState(true);
  const [customCacheDir, setCustomCacheDir] = useState<string>("");
  const [customDataDir, setCustomDataDir] = useState<string>("");
  const [maxCacheSizeMb, setMaxCacheSizeMb] = useState<number>(2048);
  const [autoCleanupCache, setAutoCleanupCache] = useState<boolean>(true);

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
  const [isOpeningFolder, setIsOpeningFolder] = useState(false);
  const [isClearingCache, setIsClearingCache] = useState(false);
  const [isTrimmingCache, setIsTrimmingCache] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const [showCacheList, setShowCacheList] = useState(false);
  const [cachedTracks, setCachedTracks] = useState<CachedTrackItem[]>([]);
  const [isLoadingCachedTracks, setIsLoadingCachedTracks] = useState(false);

  const handleToggleCacheList = async () => {
    if (!showCacheList) {
      setIsLoadingCachedTracks(true);
      try {
        const data = await fetchCachedTracks("", false, "play_count", 50);
        setCachedTracks(data);
      } catch {}
      setIsLoadingCachedTracks(false);
    }
    setShowCacheList(!showCacheList);
  };

  const loadCacheStats = () => {
    fetchCacheStats()
      .then((data) => setCacheStats(data))
      .catch(() => {});
  };

  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen) {
      setIsLoading(true);
      setFeedback(null);
    }
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
    if (!isOpen) return;

    let isMounted = true;
    loadCacheStats();

    getAppSettings()
      .then((cfg) => {
        if (!isMounted) return;
        setHost(cfg.radioboss_host || "http://127.0.0.1");
        setPort(cfg.radioboss_port || 9000);
        setPassword(cfg.radioboss_password || "");
        setTitleFormatMode(cfg.title_format_mode || "radioboss_native");
        setCustomFormat(cfg.custom_title_format || "{artist} - {title}");
        setServerPort(cfg.server_port || 8000);
        setEnableLoudnorm(cfg.enable_loudnorm !== undefined ? cfg.enable_loudnorm : true);
        setCustomCacheDir(cfg.custom_cache_dir || "");
        setCustomDataDir(cfg.custom_data_dir || "");
        setMaxCacheSizeMb(
          cfg.max_cache_size_mb !== undefined ? cfg.max_cache_size_mb : 2048
        );
        setAutoCleanupCache(
          cfg.auto_cleanup_cache !== undefined ? cfg.auto_cleanup_cache : true
        );
      })
      .catch((err) => {
        if (!isMounted) return;
        setFeedback({
          type: "error",
          message:
            err instanceof Error ? err.message : "Gagal memuat pengaturan.",
        });
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  const handleOpenFolder = async () => {
    setIsOpeningFolder(true);
    try {
      await openCacheFolder();
    } catch (err) {
      setFeedback({
        type: "error",
        message:
          err instanceof Error
            ? err.message
            : "Gagal membuka folder cache di Explorer.",
      });
    } finally {
      setIsOpeningFolder(false);
    }
  };

  const handleTrimCache = async () => {
    setIsTrimmingCache(true);
    try {
      const res = await trimAudioCache();
      loadCacheStats();
      setFeedback({
        type: "success",
        message: res.message,
      });
    } catch (err) {
      setFeedback({
        type: "error",
        message:
          err instanceof Error ? err.message : "Gagal memangkas cache.",
      });
    } finally {
      setIsTrimmingCache(false);
    }
  };

  const handleClearCache = async (days?: number) => {
    const confirmMsg = days
      ? `Hapus file cache lagu yang lebih lama dari ${days} hari?`
      : "Hapus SEMUA file audio yang sudah di-cache di penyimpanan lokal?";
    if (!window.confirm(confirmMsg)) {
      return;
    }
    setIsClearingCache(true);
    try {
      const res = await clearAudioCache(days);
      loadCacheStats();
      setFeedback({
        type: "success",
        message: `${res.deleted_count} file cache audio berhasil dibersihkan.`,
      });
    } catch (err) {
      setFeedback({
        type: "error",
        message:
          err instanceof Error
            ? err.message
            : "Gagal membersihkan cache audio.",
      });
    } finally {
      setIsClearingCache(false);
    }
  };

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setFeedback(null);

    const config: AppConfig = {
      radioboss_host: host.trim(),
      radioboss_port: Number(port) || 9000,
      radioboss_password: password,
      title_format_mode: titleFormatMode,
      custom_title_format: customFormat.trim(),
      server_port: Number(serverPort) || 8000,
      enable_loudnorm: enableLoudnorm,
      custom_cache_dir: customCacheDir.trim(),
      custom_data_dir: customDataDir.trim(),
      max_cache_size_mb: Number(maxCacheSizeMb) ?? 2048,
      auto_cleanup_cache: autoCleanupCache,
    };

    try {
      const res = await saveAppSettings(config);
      if (res.success) {
        setFeedback({
          type: "success",
          message:
            res.message ||
            (res.connected
              ? "Pengaturan disimpan dan koneksi RadioBOSS terverifikasi."
              : "Pengaturan disimpan, tetapi RadioBOSS belum terhubung. Periksa port dan password."),
        });

        setTimeout(() => {
          onSettingsSaved();
        }, 800);
      } else {
        setFeedback({
          type: "error",
          message: res.message || "Gagal menyimpan pengaturan.",
        });
      }
    } catch (err) {
      setFeedback({
        type: "error",
        message:
          err instanceof Error
            ? err.message
            : "Terjadi kesalahan saat menyimpan pengaturan.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <dialog className="modal modal-open z-50">
      <div className="modal-box rounded-xl bg-base-200 border border-base-300 max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl p-5 sm:p-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-base-300 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-base-100 border border-base-300 text-primary">
              <SettingsIcon className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-bold text-base text-base-content">
                Pengaturan Konsol &amp; Penyimpanan
              </h3>
              <p className="text-xs text-base-content/70">
                Konfigurasi jaringan RadioBOSS, format metadata, dan ruang disk cache
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup pengaturan"
            className="btn btn-ghost btn-sm h-9 w-9 p-0 rounded-lg text-base-content/70 hover:text-base-content"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Feedback Alert */}
        {feedback && (
          <div
            className={`alert ${
              feedback.type === "success"
                ? "alert-success text-success-content"
                : "alert-error text-error-content"
            } mt-4 text-xs py-2.5 rounded-lg font-semibold`}
          >
            {feedback.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
        )}

        {isLoading ? (
          <div className="py-12 text-center space-y-2">
            <span className="loading loading-spinner loading-md text-primary" />
            <p className="text-xs text-base-content/70">Memuat konfigurasi sistem...</p>
          </div>
        ) : (
          <form onSubmit={handleSave} className="mt-4 space-y-5">
            {/* Section 1: RadioBOSS Connection */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-base-content uppercase tracking-wider">
                <Radio className="h-3.5 w-3.5 text-primary" />
                <span>Koneksi Web Remote RadioBOSS</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2 form-control">
                  <label className="label py-1">
                    <span className="label-text text-xs font-semibold text-base-content">
                      Host RadioBOSS
                    </span>
                  </label>
                  <input
                    type="text"
                    value={host}
                    onChange={(e) => setHost(e.target.value)}
                    placeholder="http://127.0.0.1"
                    required
                    className="input input-bordered input-sm h-9 bg-base-100 rounded-lg text-xs font-mono"
                  />
                </div>

                <div className="form-control">
                  <label className="label py-1">
                    <span className="label-text text-xs font-semibold text-base-content">
                      Port API
                    </span>
                  </label>
                  <input
                    type="number"
                    value={port}
                    onChange={(e) => setPort(Number(e.target.value))}
                    placeholder="9000"
                    required
                    className="input input-bordered input-sm h-9 bg-base-100 rounded-lg text-xs font-mono tabular-nums"
                  />
                </div>
              </div>

              <div className="form-control">
                <label className="label py-1">
                  <span className="label-text text-xs font-semibold text-base-content">
                    Password Web Remote Control
                  </span>
                </label>
                <div className="flex items-stretch gap-2">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Kosongkan jika tanpa password"
                    className="input input-bordered input-sm h-9 flex-1 bg-base-100 rounded-lg text-xs font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="btn btn-sm h-9 px-3 rounded-lg bg-base-100 border border-base-300 text-base-content/80 hover:text-base-content"
                    title={showPassword ? "Sembunyikan password" : "Tampilkan password"}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <p className="text-xs text-base-content/70 mt-1">
                  Sesuaikan dengan pengaturan di menu Settings &gt; Remote Control pada aplikasi RadioBOSS.
                </p>
              </div>
            </div>

            {/* Section 2: Metadata Format */}
            <div className="space-y-3 pt-2 border-t border-base-300">
              <div className="flex items-center gap-2 text-xs font-bold text-base-content uppercase tracking-wider pt-2">
                <Tag className="h-3.5 w-3.5 text-primary" />
                <span>Format Judul Siaran</span>
              </div>

              <div className="form-control relative">
                <label className="label py-1">
                  <span className="label-text text-xs font-semibold text-base-content">
                    Pola Pengiriman Judul
                  </span>
                </label>

                <button
                  type="button"
                  onClick={() => setIsFormatDropdownOpen(!isFormatDropdownOpen)}
                  className="input input-bordered input-sm h-10 w-full bg-base-100 rounded-lg flex items-center justify-between text-xs px-3 hover:border-primary/50 transition-colors"
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="font-semibold text-base-content truncate">
                      {FORMAT_OPTIONS.find((opt) => opt.value === titleFormatMode)
                        ?.label || "RadioBOSS Standar"}
                    </span>
                    {FORMAT_OPTIONS.find((opt) => opt.value === titleFormatMode)
                      ?.badge && (
                      <span className="px-2 py-0.5 rounded bg-primary/15 border border-primary/40 text-primary font-mono text-xs font-bold">
                        {
                          FORMAT_OPTIONS.find((opt) => opt.value === titleFormatMode)
                            ?.badge
                        }
                      </span>
                    )}
                  </div>
                  <ChevronDown
                    className={`h-4 w-4 text-base-content/70 transition-transform ${
                      isFormatDropdownOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {isFormatDropdownOpen && (
                  <div className="absolute top-[102%] left-0 right-0 z-50 mt-1 bg-base-100 border border-base-300 rounded-lg shadow-2xl p-1.5 space-y-1">
                    {FORMAT_OPTIONS.map((opt) => {
                      const isSelected = titleFormatMode === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => {
                            setTitleFormatMode(opt.value);
                            setIsFormatDropdownOpen(false);
                          }}
                          className={`w-full flex items-center justify-between gap-3 p-2.5 rounded-md text-left transition-colors ${
                            isSelected
                              ? "bg-primary/15 border border-primary/40 text-base-content font-semibold"
                              : "hover:bg-base-200 text-base-content"
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold truncate">
                                {opt.label}
                              </span>
                              {opt.badge && (
                                <span className="px-1.5 py-0.5 rounded bg-primary/20 text-primary font-mono text-xs font-semibold">
                                  {opt.badge}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-base-content/70 truncate mt-0.5">
                              {opt.desc}
                            </p>
                          </div>
                          {isSelected && (
                            <Check className="h-4 w-4 text-primary shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {titleFormatMode === "custom" && (
                <div className="form-control">
                  <label className="label py-1">
                    <span className="label-text text-xs font-semibold text-base-content">
                      Template Kustom
                    </span>
                  </label>
                  <input
                    type="text"
                    value={customFormat}
                    onChange={(e) => setCustomFormat(e.target.value)}
                    placeholder="{artist} - {title}"
                    className="input input-bordered input-sm h-9 bg-base-100 rounded-lg text-xs font-mono"
                  />
                  <p className="text-xs text-base-content/70 mt-1">
                    Gunakan variabel <code className="font-mono text-primary">&#123;artist&#125;</code> dan <code className="font-mono text-primary">&#123;title&#125;</code>.
                  </p>
                </div>
              )}
            </div>

            {/* Section 3: Studio Audio Cache & Storage */}
            <div className="space-y-3 pt-2 border-t border-base-300">
              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-2 text-xs font-bold text-base-content uppercase tracking-wider">
                  <HardDrive className="h-3.5 w-3.5 text-primary" />
                  <span>Penyimpanan &amp; Cache Audio Studio</span>
                </div>
                <button
                  type="button"
                  onClick={loadCacheStats}
                  className="btn btn-ghost btn-xs h-8 px-2.5 rounded-md bg-base-100 border border-base-300 text-xs font-medium text-base-content/80 gap-1.5 hover:text-base-content"
                  title="Perbarui ukuran cache"
                >
                  <RefreshCw className="h-3 w-3" />
                  <span>Hitung Ulang</span>
                </button>
              </div>

              <div className="bg-base-100 border border-base-300 rounded-lg p-3.5 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-base-content/80 font-medium">
                    Status Penyimpanan:
                  </span>
                  <span className="font-mono font-bold text-accent tabular-nums">
                    {cacheStats
                      ? `${cacheStats.total_files} file (${cacheStats.total_size_mb} MB)`
                      : "Memuat..."}
                  </span>
                </div>

                {/* Cache Capacity Progress Bar */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-base-content/70">Kapasitas Terpakai:</span>
                    <span className="font-mono font-semibold text-base-content tabular-nums">
                      {cacheStats ? (
                        maxCacheSizeMb > 0 ? (
                          <>
                            {cacheStats.total_size_mb} MB / {maxCacheSizeMb} MB{" "}
                            <span
                              className={`ml-1 font-bold ${
                                (cacheStats.total_size_mb / maxCacheSizeMb) * 100 > 90
                                  ? "text-error"
                                  : (cacheStats.total_size_mb / maxCacheSizeMb) * 100 > 70
                                  ? "text-warning"
                                  : "text-success"
                              }`}
                            >
                              (
                              {Math.min(
                                100,
                                Math.round(
                                  (cacheStats.total_size_mb / maxCacheSizeMb) * 100
                                )
                              )}
                              %)
                            </span>
                          </>
                        ) : (
                          `${cacheStats.total_size_mb} MB (Tanpa Batas)`
                        )
                      ) : (
                        "Memuat..."
                      )}
                    </span>
                  </div>
                  {maxCacheSizeMb > 0 && cacheStats && (
                    <progress
                      className={`progress w-full h-2 ${
                        (cacheStats.total_size_mb / maxCacheSizeMb) * 100 > 90
                          ? "progress-error"
                          : (cacheStats.total_size_mb / maxCacheSizeMb) * 100 > 70
                          ? "progress-warning"
                          : "progress-success"
                      }`}
                      value={cacheStats.total_size_mb}
                      max={maxCacheSizeMb}
                    />
                  )}
                </div>

                {/* Storage Cache Limit Selector */}
                <div className="space-y-2.5 pt-2.5 border-t border-base-300">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-xs font-semibold text-base-content block">
                        Batas Kapasitas Cache
                      </span>
                      <span className="text-xs text-base-content/70 block">
                        Batas ruang disk untuk penyimpanan lagu MP3 lokal
                      </span>
                    </div>
                    <select
                      value={maxCacheSizeMb}
                      onChange={(e) => setMaxCacheSizeMb(Number(e.target.value))}
                      className="select select-bordered select-sm h-9 w-full sm:w-60 bg-base-200 rounded-md text-xs font-mono font-semibold shrink-0"
                    >
                      <option value={500}>500 MB (Hemat Disk)</option>
                      <option value={1024}>1 GB / 1024 MB</option>
                      <option value={2048}>2 GB / 2048 MB (Standar)</option>
                      <option value={5120}>5 GB / 5120 MB (Koleksi Besar)</option>
                      <option value={10240}>10 GB / 10240 MB</option>
                      <option value={0}>Tanpa Batas (Unlimited)</option>
                    </select>
                  </div>

                  <label className="flex items-center gap-2.5 cursor-pointer select-none pt-0.5">
                    <input
                      type="checkbox"
                      checked={autoCleanupCache}
                      onChange={(e) => setAutoCleanupCache(e.target.checked)}
                      className="checkbox checkbox-primary checkbox-sm rounded"
                    />
                    <span className="text-xs text-base-content/80">
                      Pangkas otomatis saat penuh (hapus lagu yang paling jarang diputar terlebih dahulu)
                    </span>
                  </label>
                </div>

                {/* Custom Database Directory */}
                <div className="form-control space-y-1.5 pt-2 border-t border-base-300">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-base-content/80 font-semibold">
                      Lokasi Database &amp; Data Aplikasi:
                    </span>
                    {customDataDir ? (
                      <button
                        type="button"
                        onClick={() => setCustomDataDir("")}
                        className="btn btn-ghost btn-xs h-7 px-2 text-xs text-accent hover:underline"
                      >
                        Reset ke Default (Drive C:)
                      </button>
                    ) : (
                      <span className="text-xs font-mono text-base-content/70">
                        Default (Drive C:)
                      </span>
                    )}
                  </div>

                  <input
                    type="text"
                    value={customDataDir}
                    onChange={(e) => setCustomDataDir(e.target.value)}
                    placeholder={
                      cacheStats?.storage_dir ||
                      "D:\\RadioBOSS-Data (kosongkan untuk default)"
                    }
                    className="input input-bordered input-sm h-9 w-full bg-base-200 rounded-md text-xs font-mono text-base-content placeholder:text-base-content/60"
                  />

                  <p className="text-xs text-base-content/70 leading-normal">
                    Database aktif:{" "}
                    <code className="font-mono text-accent break-all">
                      {cacheStats?.db_path || "Memuat..."}
                    </code>
                  </p>
                </div>

                {/* Custom Cache Folder */}
                <div className="form-control space-y-1.5 pt-2 border-t border-base-300">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-base-content/80 font-semibold">
                      Folder Cache Audio MP3:
                    </span>
                    {customCacheDir ? (
                      <button
                        type="button"
                        onClick={() => setCustomCacheDir("")}
                        className="btn btn-ghost btn-xs h-7 px-2 text-xs text-accent hover:underline"
                      >
                        Reset ke Default (Drive C:)
                      </button>
                    ) : (
                      <span className="text-xs font-mono text-base-content/70">
                        Default (Drive C:)
                      </span>
                    )}
                  </div>

                  <div className="flex items-stretch gap-2">
                    <input
                      type="text"
                      value={customCacheDir}
                      onChange={(e) => setCustomCacheDir(e.target.value)}
                      placeholder={
                        cacheStats?.cache_dir ||
                        "D:\\RadioCache (kosongkan untuk default)"
                      }
                      className="input input-bordered input-sm h-9 flex-1 min-w-0 bg-base-200 rounded-md text-xs font-mono text-base-content placeholder:text-base-content/60"
                    />
                    <button
                      type="button"
                      onClick={handleOpenFolder}
                      disabled={isOpeningFolder}
                      className="btn btn-sm h-9 px-3 rounded-md bg-secondary border border-base-300 text-secondary-content hover:bg-base-300 gap-1.5 shrink-0 text-xs font-semibold"
                      title="Buka folder cache aktif di File Explorer"
                    >
                      <FolderOpen className="h-3.5 w-3.5 text-primary" />
                      <span>Buka Folder</span>
                    </button>
                  </div>

                  <p className="text-xs text-base-content/70 leading-normal">
                    Folder aktif:{" "}
                    <code className="font-mono text-accent break-all">
                      {cacheStats?.cache_dir || "Memuat..."}
                    </code>
                  </p>
                </div>

                {/* Cache Management Actions */}
                <div className="pt-2.5 border-t border-base-300 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={handleToggleCacheList}
                      className="btn btn-xs h-8 px-3 rounded-md bg-base-200 border border-base-300 text-base-content gap-1.5 text-xs font-semibold hover:bg-base-300"
                    >
                      <ListMusic className="h-3.5 w-3.5 text-primary" />
                      <span>
                        {showCacheList ? "Tutup Daftar Cache" : "Lihat Lagu Cache"}
                      </span>
                    </button>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={handleTrimCache}
                        disabled={
                          isTrimmingCache ||
                          !cacheStats ||
                          cacheStats.total_files === 0
                        }
                        className="btn btn-xs h-8 px-2.5 rounded-md bg-base-200 border border-base-300 text-primary gap-1 hover:bg-base-300 text-xs font-semibold"
                      >
                        {isTrimmingCache ? (
                          <span className="loading loading-spinner loading-xs" />
                        ) : (
                          <Scissors className="h-3.5 w-3.5" />
                        )}
                        <span>Pangkas ke Batas</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleClearCache(7)}
                        disabled={
                          isClearingCache ||
                          !cacheStats ||
                          cacheStats.total_files === 0
                        }
                        className="btn btn-xs h-8 px-2.5 rounded-md bg-base-200 border border-base-300 text-warning hover:bg-warning/15 text-xs font-semibold"
                      >
                        <span>Hapus &gt; 7 Hari</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleClearCache()}
                        disabled={
                          isClearingCache ||
                          !cacheStats ||
                          cacheStats.total_files === 0
                        }
                        className="btn btn-xs h-8 px-2.5 rounded-md bg-base-200 border border-base-300 text-error gap-1 hover:bg-error/15 text-xs font-semibold"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>Kosongkan Semua</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Expandable Cached Tracks List */}
                {showCacheList && (
                  <div className="pt-2.5 border-t border-base-300 space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold text-base-content">
                      <span>
                        Daftar Lagu Cache ({cachedTracks.length} lagu):
                      </span>
                      {isLoadingCachedTracks && (
                        <span className="loading loading-spinner loading-xs text-primary" />
                      )}
                    </div>
                    {cachedTracks.length === 0 ? (
                      <p className="text-xs text-base-content/70 py-3 text-center">
                        Belum ada lagu yang tersimpan di cache lokal.
                      </p>
                    ) : (
                      <div className="max-h-48 overflow-y-auto divide-y divide-base-300 rounded-md border border-base-300 bg-base-200 text-xs">
                        {cachedTracks.map((t, idx) => (
                          <div
                            key={t.video_id || idx}
                            className="flex items-center justify-between gap-2 px-3 py-2"
                          >
                            <div className="min-w-0 flex-1 truncate">
                              <p className="font-semibold text-xs text-base-content truncate">
                                {t.title}
                              </p>
                              <p className="text-xs text-base-content/70 truncate">
                                {t.artist || t.artists?.join(", ") || "Artis"}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0 text-xs font-mono tabular-nums">
                              {t.play_count > 0 && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-warning/15 text-warning font-bold">
                                  <Flame className="h-3 w-3 fill-current" />
                                  <span>{t.play_count}x</span>
                                </span>
                              )}
                              {t.is_cached && (
                                <span className="px-1.5 py-0.5 rounded bg-success/15 text-success font-medium">
                                  {t.file_size_mb} MB
                                </span>
                              )}
                              {t.last_played_relative && (
                                <span className="text-base-content/70 hidden sm:inline">
                                  {t.last_played_relative}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Loudness Normalization Toggle */}
              <div className="flex items-center justify-between p-3.5 rounded-lg bg-base-100 border border-base-300 gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-base-content">
                      Normalisasi Kenyaringan Siaran (EBU R128)
                    </span>
                    <span className="px-2 py-0.5 rounded bg-primary/15 border border-primary/40 text-primary font-mono text-xs font-bold">
                      -14 LUFS
                    </span>
                  </div>
                  <p className="text-xs text-base-content/70 leading-relaxed">
                    Menyeragamkan level kenyaringan semua lagu YouTube Music ke standar siaran radio agar volume antar lagu tetap stabil.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={enableLoudnorm}
                  onChange={(e) => setEnableLoudnorm(e.target.checked)}
                  className="toggle toggle-primary toggle-sm shrink-0"
                />
              </div>
            </div>

            {/* Modal Actions */}
            <div className="modal-action border-t border-base-300 pt-3 flex items-center justify-between">
              <div>
                {onOpenUpdateModal && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenUpdateModal();
                    }}
                    className="btn btn-ghost btn-sm h-9 px-3 rounded-lg bg-base-100 border border-base-300 text-xs font-semibold text-base-content/80 gap-1.5 hover:text-base-content"
                  >
                    <Download className="h-3.5 w-3.5 text-accent" />
                    <span>Cek Pembaruan</span>
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="btn btn-ghost btn-sm h-9 px-4 rounded-lg text-xs font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="btn btn-primary btn-sm h-9 px-4 rounded-lg gap-1.5 text-xs font-bold text-primary-content"
                >
                  {isSaving ? (
                    <>
                      <span className="loading loading-spinner loading-xs" />
                      <span>Menyimpan...</span>
                    </>
                  ) : (
                    <>
                      <Save className="h-3.5 w-3.5" />
                      <span>Simpan Pengaturan</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
      <form method="dialog" className="modal-backdrop">
        <button onClick={onClose}>close</button>
      </form>
    </dialog>
  );
}
