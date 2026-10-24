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
  Sparkles,
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
    desc: "Mengikuti metadata ID3 tag file / bawaan decoder RadioBOSS",
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

  // Cached tracks list state
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

  // Synchronize loading and feedback states when modal opens
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen) {
      setIsLoading(true);
      setFeedback(null);
    }
  }

  // Load existing configuration on modal open
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
        message: `${res.deleted_count} file cache audio berhasil dibersihkan!`,
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
              ? "Pengaturan disimpan dan koneksi RadioBOSS terverifikasi!"
              : "Pengaturan disimpan, tetapi RadioBOSS belum terhubung. Periksa port & password."),
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
      <div className="modal-box rounded-2xl bg-base-200 border border-base-300 max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl p-5 sm:p-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-base-300 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-base-300 text-base-content">
              <SettingsIcon className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-bold text-base text-base-content">
                Pengaturan Sistem
              </h3>
              <p className="text-xs text-base-content/60">
                Konfigurasi koneksi RadioBOSS &amp; format judul
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="btn btn-ghost btn-circle btn-sm text-base-content/60 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Feedback Alert */}
        {feedback && (
          <div
            className={`alert ${
              feedback.type === "success" ? "alert-success text-success-content" : "alert-error text-error-content"
            } mt-4 text-xs py-2.5 rounded-xl font-medium`}
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
            <span className="loading loading-spinner loading-md text-base-content" />
            <p className="text-xs text-base-content/60">Memuat konfigurasi...</p>
          </div>
        ) : (
          <form onSubmit={handleSave} className="mt-4 space-y-5">
            {/* Section 1: RadioBOSS Connection */}
            <div className="space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-bold text-base-content uppercase tracking-wider">
                <Radio className="h-3.5 w-3.5" />
                <span>Koneksi RadioBOSS API</span>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 form-control">
                  <label className="label py-1">
                    <span className="label-text text-xs font-medium">Host RadioBOSS</span>
                  </label>
                  <input
                    type="text"
                    value={host}
                    onChange={(e) => setHost(e.target.value)}
                    placeholder="http://127.0.0.1"
                    required
                    className="input input-bordered input-sm bg-base-100 text-xs"
                  />
                </div>

                <div className="form-control">
                  <label className="label py-1">
                    <span className="label-text text-xs font-medium">Port</span>
                  </label>
                  <input
                    type="number"
                    value={port}
                    onChange={(e) => setPort(Number(e.target.value))}
                    placeholder="9000"
                    required
                    className="input input-bordered input-sm bg-base-100 text-xs"
                  />
                </div>
              </div>

              <div className="form-control">
                <label className="label py-1">
                  <span className="label-text text-xs font-medium">Password Web Remote Control</span>
                </label>
                <div className="join w-full">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Kosongkan jika tanpa password"
                    className="input input-bordered input-sm join-item w-full bg-base-100 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="btn btn-sm join-item bg-base-300 text-base-content/70"
                    title={showPassword ? "Sembunyikan password" : "Tampilkan password"}
                  >
                    {showPassword ? (
                      <EyeOff className="h-3.5 w-3.5" />
                    ) : (
                      <Eye className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
                <label className="label py-1">
                  <span className="label-text-alt text-[10px] text-base-content/50">
                    Sesuai menu Options &gt; Network di RadioBOSS.
                  </span>
                </label>
              </div>
            </div>

            {/* Section 2: Metadata Format */}
            <div className="space-y-3 pt-1 border-t border-base-300">
              <div className="flex items-center gap-1.5 text-xs font-bold text-base-content uppercase tracking-wider pt-2">
                <Tag className="h-3.5 w-3.5" />
                <span>Format Metadata Siaran</span>
              </div>

              <div className="form-control relative">
                <label className="label py-1">
                  <span className="label-text text-xs font-medium">Pilihan Format</span>
                </label>

                {/* Custom Styled Select Trigger */}
                <button
                  type="button"
                  onClick={() => setIsFormatDropdownOpen(!isFormatDropdownOpen)}
                  className="input input-bordered input-sm w-full bg-base-100 flex items-center justify-between text-xs px-3 focus:outline-none hover:border-base-content/50 transition-colors"
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="font-semibold text-base-content truncate">
                      {FORMAT_OPTIONS.find((opt) => opt.value === titleFormatMode)?.label || "RadioBOSS Standar"}
                    </span>
                    {FORMAT_OPTIONS.find((opt) => opt.value === titleFormatMode)?.badge && (
                      <span className="badge badge-accent badge-xs text-accent-content">
                        {FORMAT_OPTIONS.find((opt) => opt.value === titleFormatMode)?.badge}
                      </span>
                    )}
                  </div>
                  <ChevronDown
                    className={`h-3.5 w-3.5 text-base-content/50 transition-transform ${
                      isFormatDropdownOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {/* Dropdown Menu Options */}
                {isFormatDropdownOpen && (
                  <div className="absolute top-[102%] left-0 right-0 z-50 mt-1 bg-base-100 border border-base-300 rounded-xl shadow-2xl p-1.5 space-y-1">
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
                          className={`w-full flex items-center justify-between gap-3 p-2 rounded-lg text-left transition-colors ${
                            isSelected
                              ? "bg-base-300 text-white font-semibold"
                              : "hover:bg-base-200 text-base-content"
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold truncate">
                                {opt.label}
                              </span>
                              {opt.badge && (
                                <span className="badge badge-accent badge-xs scale-90 text-accent-content">
                                  {opt.badge}
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-base-content/60 truncate mt-0.5">
                              {opt.desc}
                            </p>
                          </div>
                          {isSelected && (
                            <Check className="h-3.5 w-3.5 text-success shrink-0" />
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
                    <span className="label-text text-xs font-medium">Template Kustom</span>
                  </label>
                  <input
                    type="text"
                    value={customFormat}
                    onChange={(e) => setCustomFormat(e.target.value)}
                    placeholder="{artist} - {title}"
                    className="input input-bordered input-sm bg-base-100 text-xs"
                  />
                  <label className="label py-1">
                    <span className="label-text-alt text-[10px] text-base-content/50">
                      Gunakan variabel &#123;artist&#125; dan &#123;title&#125;.
                    </span>
                  </label>
                </div>
              )}
            </div>

            {/* Section 3: Studio Audio Cache & Storage */}
            <div className="space-y-3 pt-1 border-t border-base-300">
              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-base-content uppercase tracking-wider">
                  <HardDrive className="h-3.5 w-3.5" />
                  <span>Penyimpanan &amp; Cache Audio Studio</span>
                </div>
                <button
                  type="button"
                  onClick={loadCacheStats}
                  className="btn btn-ghost btn-xs text-[10px] text-base-content/60 gap-1 hover:text-white"
                  title="Perbarui ukuran cache"
                >
                  <RefreshCw className="h-2.5 w-2.5" />
                  <span>Cek Ukuran</span>
                </button>
              </div>

              <div className="bg-base-100 border border-base-300 rounded-xl p-3 space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-base-content/70">Status Penyimpanan:</span>
                  <span className="font-bold text-accent">
                    {cacheStats
                      ? `${cacheStats.total_files} file tersimpan (${cacheStats.total_size_mb} MB)`
                      : "Memuat..."}
                  </span>
                </div>

                {/* Cache Usage & Storage Progress Bar */}
                <div className="space-y-1.5 pt-0.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-base-content/70">Kapasitas Terpakai:</span>
                    <span className="font-mono font-semibold text-base-content">
                      {cacheStats ? (
                        maxCacheSizeMb > 0 ? (
                          <>
                            {cacheStats.total_size_mb} MB / {maxCacheSizeMb} MB{" "}
                            <span
                              className={`text-[10px] ml-1 font-bold ${
                                (cacheStats.total_size_mb / maxCacheSizeMb) * 100 > 90
                                  ? "text-error"
                                  : (cacheStats.total_size_mb / maxCacheSizeMb) * 100 > 70
                                  ? "text-warning"
                                  : "text-success"
                              }`}
                            >
                              ({Math.min(
                                100,
                                Math.round((cacheStats.total_size_mb / maxCacheSizeMb) * 100)
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
                      className={`progress w-full h-1.5 ${
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
                <div className="space-y-2 pt-2 border-t border-base-300/40">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-4">
                    <div className="min-w-0">
                      <span className="text-xs font-semibold text-base-content block">
                        Batas Kapasitas Cache
                      </span>
                      <span className="text-[10px] text-base-content/60 block">
                        Kapasitas maksimal disk untuk cache lagu MP3
                      </span>
                    </div>
                    <select
                      value={maxCacheSizeMb}
                      onChange={(e) => setMaxCacheSizeMb(Number(e.target.value))}
                      className="select select-bordered select-xs w-full sm:w-60 bg-base-200 text-xs font-semibold shrink-0"
                    >
                      <option value={500}>500 MB (Hemat Ruang Disk)</option>
                      <option value={1024}>1 GB / 1024 MB</option>
                      <option value={2048}>2 GB / 2048 MB (Standar)</option>
                      <option value={5120}>5 GB / 5120 MB (Koleksi Besar)</option>
                      <option value={10240}>10 GB / 10240 MB</option>
                      <option value={0}>Tanpa Batas (Unlimited)</option>
                    </select>
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer select-none pt-0.5">
                    <input
                      type="checkbox"
                      checked={autoCleanupCache}
                      onChange={(e) => setAutoCleanupCache(e.target.checked)}
                      className="checkbox checkbox-primary checkbox-xs rounded"
                    />
                    <span className="text-[11px] text-base-content/80">
                      Otomatis pangkas saat penuh (menghapus lagu yang paling jarang diputar)
                    </span>
                  </label>
                </div>

                {/* Custom Database & Data Root Directory */}
                <div className="form-control space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="label py-0">
                      <span className="label-text text-[11px] text-base-content/70 font-medium">
                        Lokasi Database SQLite &amp; Data App (Disk D: / Kustom):
                      </span>
                    </label>
                    {customDataDir ? (
                      <button
                        type="button"
                        onClick={() => setCustomDataDir("")}
                        className="btn btn-ghost btn-xs text-[10px] text-info hover:underline py-0 h-5 min-h-0"
                        title="Kembalikan lokasi database ke default %APPDATA% di Drive C:"
                      >
                        Reset ke Default (Drive C:)
                      </button>
                    ) : (
                      <span className="text-[10px] text-base-content/40">Default (Drive C:)</span>
                    )}
                  </div>

                  <input
                    type="text"
                    value={customDataDir}
                    onChange={(e) => setCustomDataDir(e.target.value)}
                    placeholder={cacheStats?.storage_dir || "D:\\RadioBOSS-Data (atau kosongkan untuk default C:)"}
                    className="input input-bordered input-xs w-full bg-base-100 text-[11px] font-mono text-base-content placeholder:text-base-content/30"
                  />

                  <p className="text-[10px] text-base-content/50 leading-tight">
                    Database aktif: <code className="text-accent break-all">{cacheStats?.db_path || "Memuat..."}</code>. Menyimpan konfigurasi, riwayat, dan playlist set secara mandiri.
                  </p>
                </div>

                <div className="form-control space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="label py-0">
                      <span className="label-text text-[11px] text-base-content/70 font-medium">
                        Kustom Folder Cache Audio:
                      </span>
                    </label>
                    {customCacheDir ? (
                      <button
                        type="button"
                        onClick={() => setCustomCacheDir("")}
                        className="btn btn-ghost btn-xs text-[10px] text-info hover:underline py-0 h-5 min-h-0"
                        title="Kembalikan lokasi penyimpanan ke default %APPDATA% di Drive C:"
                      >
                        Reset ke Default (Drive C:)
                      </button>
                    ) : (
                      <span className="text-[10px] text-base-content/40">Default (Drive C:)</span>
                    )}
                  </div>

                  <div className="join w-full">
                    <input
                      type="text"
                      value={customCacheDir}
                      onChange={(e) => setCustomCacheDir(e.target.value)}
                      placeholder={cacheStats?.cache_dir || "D:\\RadioCache (atau kosongkan untuk default C:)"}
                      className="input input-bordered input-xs join-item flex-1 min-w-0 bg-base-100 text-[11px] font-mono text-base-content placeholder:text-base-content/30"
                    />
                    <button
                      type="button"
                      onClick={handleOpenFolder}
                      disabled={isOpeningFolder}
                      className="btn btn-xs join-item btn-primary gap-1 shrink-0 font-medium text-primary-content"
                      title="Buka folder cache aktif saat ini di Windows File Explorer"
                    >
                      <FolderOpen className="h-3 w-3" />
                      <span>Buka Folder</span>
                    </button>
                  </div>

                  <p className="text-[10px] text-base-content/50 leading-tight">
                    Folder aktif: <code className="text-accent break-all">{cacheStats?.cache_dir || "Memuat..."}</code>. Anda bisa mengalihkan folder ke partisi D: atau harddisk lain jika drive C: mulai penuh.
                  </p>
                </div>

                {/* Cache Management Action Buttons & Info Note */}
                <div className="pt-2 border-t border-base-300/40 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={handleToggleCacheList}
                      className="btn btn-outline btn-xs text-base-content gap-1.5 font-semibold hover:bg-base-300"
                      title="Lihat daftar lagu yang tersimpan di cache lokal beserta frekuensi putarnya"
                    >
                      <ListMusic className="h-3.5 w-3.5" />
                      <span>{showCacheList ? "Tutup Daftar" : "Lihat Lagu Cache"}</span>
                    </button>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={handleTrimCache}
                        disabled={isTrimmingCache || !cacheStats || cacheStats.total_files === 0}
                        className="btn btn-ghost btn-xs text-primary gap-1 hover:bg-primary/10 font-semibold"
                        title="Pangkas audio cache agar tidak melebihi batas kapasitas yang ditentukan"
                      >
                        {isTrimmingCache ? (
                          <span className="loading loading-spinner loading-xs" />
                        ) : (
                          <Scissors className="h-3 w-3" />
                        )}
                        <span>Pangkas ke Batas</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleClearCache(7)}
                        disabled={isClearingCache || !cacheStats || cacheStats.total_files === 0}
                        className="btn btn-ghost btn-xs text-warning hover:bg-warning/10 font-medium"
                        title="Hapus cache lagu yang tidak pernah dibuka selama lebih dari 7 hari"
                      >
                        <span>Hapus &gt; 7 Hari</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleClearCache()}
                        disabled={isClearingCache || !cacheStats || cacheStats.total_files === 0}
                        className="btn btn-ghost btn-xs text-error gap-1 hover:bg-error/10 font-medium"
                        title="Kosongkan SEMUA file MP3 lokal untuk menghemat disk"
                      >
                        <Trash2 className="h-3 w-3" />
                        <span>Kosongkan Semua</span>
                      </button>
                    </div>
                  </div>

                  <p className="text-[11px] text-base-content/50 leading-relaxed">
                    💡 File MP3 tersimpan permanen di PC Anda. Riwayat &amp; cache tidak hilang saat aplikasi ditutup.
                  </p>
                </div>

                {/* Expandable Cached Tracks & Play Count List */}
                {showCacheList && (
                  <div className="pt-2 border-t border-base-300/40 space-y-2">
                    <div className="flex items-center justify-between text-[11px] font-bold text-base-content/80">
                      <span>Daftar Lagu Cache &amp; Riwayat Putar ({cachedTracks.length} Lagu):</span>
                      {isLoadingCachedTracks && (
                        <span className="loading loading-spinner loading-xs text-primary" />
                      )}
                    </div>
                    {cachedTracks.length === 0 ? (
                      <p className="text-[10px] text-base-content/50 py-2 text-center">
                        Belum ada lagu yang tersimpan di cache lokal.
                      </p>
                    ) : (
                      <div className="max-h-48 overflow-y-auto space-y-1 pr-1 text-xs">
                        {cachedTracks.map((t, idx) => (
                          <div
                            key={t.video_id || idx}
                            className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-base-200/50 hover:bg-base-200 border border-base-300/40"
                          >
                            <div className="min-w-0 flex-1 truncate">
                              <p className="font-semibold text-[11px] text-base-content truncate">
                                {t.title}
                              </p>
                              <p className="text-[9px] text-base-content/60 truncate">
                                {t.artist || t.artists?.join(", ") || "Unknown Artist"}
                              </p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0 text-[10px]">
                              {t.play_count > 0 && (
                                <span className="badge badge-warning/20 text-warning badge-xs font-bold gap-0.5 py-1">
                                  <Flame className="h-2.5 w-2.5 fill-current" />
                                  <span>{t.play_count}x</span>
                                </span>
                              )}
                              {t.is_cached && (
                                <span className="badge badge-success/20 text-success badge-xs font-medium py-1">
                                  {t.file_size_mb} MB
                                </span>
                              )}
                              {t.last_played_relative && (
                                <span className="text-base-content/40 text-[9px] hidden sm:inline">
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
              <div className="flex items-center justify-between p-3 rounded-xl bg-base-100 border border-base-300">
                <div className="space-y-0.5 pr-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-base-content">
                      Normalisasi Audio Siaran (EBU R128)
                    </span>
                    <span className="badge badge-accent badge-xs font-bold">
                      -14 LUFS
                    </span>
                  </div>
                  <p className="text-[10px] text-base-content/60 leading-relaxed">
                    Menyeragamkan level kenyaringan semua lagu YouTube Music ke standar siaran radio internasional agar volume lagu stabil dan seragam.
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
                    className="btn btn-ghost btn-xs text-base-content/70 gap-1.5 hover:text-white"
                    title="Cek pembaruan aplikasi dari server resmi"
                  >
                    <Sparkles className="h-3 w-3 text-accent" />
                    <span>Cek Pembaruan</span>
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="btn btn-ghost btn-sm text-xs font-medium"
                >
                  Tutup
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="btn btn-primary btn-sm rounded-xl gap-1.5 text-xs font-bold shadow-md text-primary-content"
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
