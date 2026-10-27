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
  Check,
  Folder,
  FolderOpen,
  HardDrive,
  Trash2,
  RefreshCw,
  Flame,
  ListMusic,
  Scissors,
  Download,
  Activity,
  Sliders,
  Info,
  ExternalLink,
  RotateCcw,
} from "lucide-react";
import {
  AppConfig,
  TitleFormatMode,
  CacheStats,
  CachedTrackItem,
  APP_VERSION,
} from "@/lib/types";
import {
  getAppSettings,
  saveAppSettings,
  fetchCacheStats,
  openSpecificFolder,
  browseFolder,
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

type SettingsTab = "connection" | "broadcast" | "storage" | "system";

const TABS: { id: SettingsTab; label: string; icon: React.ElementType }[] = [
  { id: "connection", label: "Koneksi RadioBOSS", icon: Radio },
  { id: "broadcast", label: "Format & Audio", icon: Sliders },
  { id: "storage", label: "Penyimpanan & Disk", icon: HardDrive },
  { id: "system", label: "Sistem & Info", icon: Info },
];

const FORMAT_OPTIONS: {
  value: TitleFormatMode;
  label: string;
  example: string;
  badge?: string;
}[] = [
  {
    value: "radioboss_native",
    label: "Standar RadioBOSS (%artist - %title)",
    example: "NIKI - Backburner",
    badge: "Rekomendasi",
  },
  {
    value: "artist_title",
    label: "Nama Artis - Judul Lagu",
    example: "Coldplay - Yellow",
  },
  {
    value: "title_artist",
    label: "Judul Lagu - Nama Artis",
    example: "Yellow - Coldplay",
  },
  {
    value: "title_only",
    label: "Hanya Judul Lagu",
    example: "Yellow",
  },
  {
    value: "custom",
    label: "Format Kustom Manual",
    example: "{artist} - {title}",
  },
];

const BITRATE_OPTIONS: {
  value: "128k" | "192k" | "256k" | "320k";
  label: string;
  desc: string;
}[] = [
  { value: "320k", label: "320 kbps", desc: "Studio Master" },
  { value: "256k", label: "256 kbps", desc: "Kualitas Tinggi" },
  { value: "192k", label: "192 kbps", desc: "Standar Siaran" },
  { value: "128k", label: "128 kbps", desc: "Hemat Bandwidth" },
];

export function SettingsModal({
  isOpen,
  onClose,
  onSettingsSaved,
  onOpenUpdateModal,
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("connection");

  const [host, setHost] = useState("http://127.0.0.1");
  const [port, setPort] = useState(9000);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [titleFormatMode, setTitleFormatMode] =
    useState<TitleFormatMode>("radioboss_native");
  const [customFormat, setCustomFormat] = useState("{artist} - {title}");

  const [serverPort, setServerPort] = useState(8000);
  const [audioQuality, setAudioQuality] = useState<
    "128k" | "192k" | "256k" | "320k"
  >("320k");
  const [enableLoudnorm, setEnableLoudnorm] = useState(true);

  const [customCacheDir, setCustomCacheDir] = useState<string>("");
  const [customDataDir, setCustomDataDir] = useState<string>("");
  const [maxCacheSizeMb, setMaxCacheSizeMb] = useState<number>(2048);
  const [autoCleanupCache, setAutoCleanupCache] = useState<boolean>(true);

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);

  const [isOpeningFolder, setIsOpeningFolder] = useState(false);
  const [isOpeningDataFolder, setIsOpeningDataFolder] = useState(false);
  const [isBrowsingCache, setIsBrowsingCache] = useState(false);
  const [isBrowsingData, setIsBrowsingData] = useState(false);

  const [isClearingCache, setIsClearingCache] = useState(false);
  const [isTrimmingCache, setIsTrimmingCache] = useState(false);

  const [testStatus, setTestStatus] = useState<
    "idle" | "testing" | "connected" | "failed"
  >("idle");
  const [testMsg, setTestMsg] = useState<string>("");

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
      setTestStatus("idle");
      setTestMsg("");
    }
  }

  // Close modal on Escape key
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

  // Load active settings on mount/open
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
        setAudioQuality(
          (cfg.audio_quality as "128k" | "192k" | "256k" | "320k") || "320k"
        );
        setEnableLoudnorm(
          cfg.enable_loudnorm !== undefined ? cfg.enable_loudnorm : true
        );
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
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  // Direct Interactive Connection Ping
  const handleTestConnection = async () => {
    setTestStatus("testing");
    setTestMsg("");
    try {
      const config: AppConfig = {
        radioboss_host: host.trim(),
        radioboss_port: Number(port) || 9000,
        radioboss_password: password,
        title_format_mode: titleFormatMode,
        custom_title_format: customFormat.trim(),
        server_port: Number(serverPort) || 8000,
        audio_quality: audioQuality,
        enable_loudnorm: enableLoudnorm,
        custom_cache_dir: customCacheDir.trim(),
        custom_data_dir: customDataDir.trim(),
        max_cache_size_mb: Number(maxCacheSizeMb) ?? 2048,
        auto_cleanup_cache: autoCleanupCache,
      };
      const res = await saveAppSettings(config);
      if (res.connected) {
        setTestStatus("connected");
        setTestMsg("Koneksi ke RadioBOSS berhasil!");
      } else {
        setTestStatus("failed");
        setTestMsg(res.message || "RadioBOSS belum merespons.");
      }
    } catch (err) {
      setTestStatus("failed");
      setTestMsg(
        err instanceof Error ? err.message : "Gagal menghubungi backend."
      );
    }
  };

  const handleBrowseCacheDir = async () => {
    setIsBrowsingCache(true);
    try {
      const res = await browseFolder(
        customCacheDir || cacheStats?.cache_dir,
        "Pilih Folder Cache Audio MP3"
      );
      if (res.success && res.path) {
        setCustomCacheDir(res.path);
      }
    } catch (err) {
      setFeedback({
        type: "error",
        message:
          err instanceof Error
            ? err.message
            : "Gagal membuka dialog pilih folder.",
      });
    } finally {
      setIsBrowsingCache(false);
    }
  };

  const handleBrowseDataDir = async () => {
    setIsBrowsingData(true);
    try {
      const res = await browseFolder(
        customDataDir || cacheStats?.storage_dir,
        "Pilih Folder Database & Data Aplikasi"
      );
      if (res.success && res.path) {
        setCustomDataDir(res.path);
      }
    } catch (err) {
      setFeedback({
        type: "error",
        message:
          err instanceof Error
            ? err.message
            : "Gagal membuka dialog pilih folder.",
      });
    } finally {
      setIsBrowsingData(false);
    }
  };

  const handleOpenDataFolder = async () => {
    setIsOpeningDataFolder(true);
    try {
      await openSpecificFolder(customDataDir || cacheStats?.storage_dir);
    } catch (err) {
      setFeedback({
        type: "error",
        message:
          err instanceof Error ? err.message : "Gagal membuka folder di Explorer.",
      });
    } finally {
      setIsOpeningDataFolder(false);
    }
  };

  const handleOpenCacheFolder = async () => {
    setIsOpeningFolder(true);
    try {
      await openSpecificFolder(customCacheDir || cacheStats?.cache_dir);
    } catch (err) {
      setFeedback({
        type: "error",
        message:
          err instanceof Error ? err.message : "Gagal membuka folder di Explorer.",
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
      ? `Hapus file cache audio yang lebih lama dari ${days} hari?`
      : "Hapus SEMUA file audio cache di penyimpanan lokal?";
    if (!window.confirm(confirmMsg)) return;

    setIsClearingCache(true);
    try {
      const res = await clearAudioCache(days);
      loadCacheStats();
      setFeedback({
        type: "success",
        message: `${res.deleted_count} file cache audio dibersihkan.`,
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
      audio_quality: audioQuality,
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
          message: res.message || "Pengaturan berhasil disimpan.",
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

  if (!isOpen) return null;

  return (
    <dialog className="modal modal-open z-50">
      <div className="modal-box rounded-2xl bg-base-200 border border-base-300 max-w-3xl w-full p-0 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Top Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-base-300 bg-base-200/90 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-base-100 border border-base-300 text-primary">
              <SettingsIcon className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-base-content leading-tight">
                Pengaturan Konsol
              </h3>
              <p className="text-[11px] text-base-content/60">
                RadioBOSS Web Remote, Format Siaran, dan Audio Engine
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup pengaturan"
            className="btn btn-ghost btn-xs h-8 w-8 p-0 rounded-lg text-base-content/60 hover:text-base-content hover:bg-base-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Global Feedback Alert */}
        {feedback && (
          <div
            className={`alert ${
              feedback.type === "success"
                ? "alert-success text-success-content"
                : "alert-error text-error-content"
            } mx-4 mt-3 text-xs py-2 px-3 rounded-lg font-semibold shrink-0 flex items-center justify-between`}
          >
            <div className="flex items-center gap-2 min-w-0">
              {feedback.type === "success" ? (
                <CheckCircle2 className="h-4 w-4 shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0" />
              )}
              <span className="truncate">{feedback.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="btn btn-ghost btn-xs h-6 w-6 p-0"
            >
              ✕
            </button>
          </div>
        )}

        {/* Main Body: Tabs Navigation + Content */}
        {isLoading ? (
          <div className="py-20 text-center space-y-2">
            <span className="loading loading-spinner loading-md text-primary" />
            <p className="text-xs text-base-content/60">
              Memuat konfigurasi konsol...
            </p>
          </div>
        ) : (
          <form
            onSubmit={handleSave}
            className="flex flex-col flex-1 min-h-0 overflow-hidden"
          >
            <div className="flex flex-col md:flex-row flex-1 min-h-0 overflow-hidden">
              {/* Tab Navigation Rail */}
              <nav className="w-full md:w-52 border-b md:border-b-0 md:border-r border-base-300 bg-base-100/50 p-2 md:p-3 flex md:flex-col gap-1 overflow-x-auto shrink-0">
                {TABS.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors shrink-0 text-left ${
                        isActive
                          ? "bg-primary text-primary-content shadow-sm"
                          : "text-base-content/70 hover:text-base-content hover:bg-base-200"
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{tab.label}</span>
                    </button>
                  );
                })}
              </nav>

              {/* Tab Content Panels */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
                {/* TAB 1: KONEKSI RADIOBOSS */}
                {activeTab === "connection" && (
                  <div className="space-y-4 animate-fade-in">
                    <div>
                      <h4 className="text-xs font-bold text-base-content uppercase tracking-wider mb-1">
                        Koneksi RadioBOSS Web Remote API
                      </h4>
                      <p className="text-xs text-base-content/60">
                        Sesuaikan dengan menu Settings &gt; Remote Control di RadioBOSS.
                      </p>
                    </div>

                    <div className="p-4 rounded-xl bg-base-100 border border-base-300 space-y-3.5">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="sm:col-span-2 form-control">
                          <label className="text-xs font-semibold text-base-content mb-1 block">
                            Host URL RadioBOSS
                          </label>
                          <input
                            type="text"
                            value={host}
                            onChange={(e) => setHost(e.target.value)}
                            placeholder="http://127.0.0.1"
                            required
                            className="input input-sm input-bordered bg-base-200 rounded-lg text-xs font-mono h-9"
                          />
                        </div>

                        <div className="form-control">
                          <label className="text-xs font-semibold text-base-content mb-1 block">
                            Port API
                          </label>
                          <input
                            type="number"
                            value={port}
                            onChange={(e) => setPort(Number(e.target.value))}
                            placeholder="9000"
                            required
                            className="input input-sm input-bordered bg-base-200 rounded-lg text-xs font-mono h-9"
                          />
                        </div>
                      </div>

                      <div className="form-control">
                        <label className="text-xs font-semibold text-base-content mb-1 block">
                          Password Remote Control
                        </label>
                        <div className="flex items-stretch gap-2">
                          <input
                            type={showPassword ? "text" : "password"}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Kosongkan jika tanpa password"
                            className="input input-sm input-bordered bg-base-200 rounded-lg text-xs font-mono flex-1 h-9"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="btn btn-sm h-9 px-3 rounded-lg bg-base-200 border border-base-300 text-base-content/70 hover:text-base-content"
                            title={showPassword ? "Sembunyikan password" : "Lihat password"}
                          >
                            {showPassword ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Interactive Test Connection Ping Bar */}
                      <div className="pt-2 border-t border-base-300 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                        <div className="flex items-center gap-2 text-xs">
                          <span
                            className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                              testStatus === "connected"
                                ? "bg-success shadow-[0_0_8px_rgba(52,211,153,0.6)]"
                                : testStatus === "failed"
                                ? "bg-error"
                                : testStatus === "testing"
                                ? "bg-warning animate-pulse"
                                : "bg-base-content/30"
                            }`}
                          />
                          <span className="font-medium text-base-content/80 truncate">
                            {testStatus === "testing"
                              ? "Menguji koneksi ke RadioBOSS..."
                              : testStatus === "connected"
                              ? "✓ Terhubung dengan RadioBOSS"
                              : testStatus === "failed"
                              ? testMsg || "Koneksi gagal"
                              : "Status koneksi belum diuji"}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={handleTestConnection}
                          disabled={testStatus === "testing"}
                          className="btn btn-xs h-8 px-3 rounded-md bg-base-200 border border-base-300 hover:bg-base-300 text-xs font-semibold gap-1.5 shrink-0"
                        >
                          {testStatus === "testing" ? (
                            <span className="loading loading-spinner loading-xs text-primary" />
                          ) : (
                            <Activity className="h-3.5 w-3.5 text-primary" />
                          )}
                          <span>Tes Koneksi</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 2: FORMAT SIARAN & AUDIO */}
                {activeTab === "broadcast" && (
                  <div className="space-y-4 animate-fade-in">
                    <div>
                      <h4 className="text-xs font-bold text-base-content uppercase tracking-wider mb-1">
                        Format Siaran &amp; Kualitas Audio
                      </h4>
                      <p className="text-xs text-base-content/60">
                        Atur tampilan metadata judul siaran dan parameter transcode streaming.
                      </p>
                    </div>

                    {/* Title Format Cards */}
                    <div className="p-4 rounded-xl bg-base-100 border border-base-300 space-y-3">
                      <div className="flex items-center gap-2">
                        <Tag className="h-3.5 w-3.5 text-primary" />
                        <span className="text-xs font-bold text-base-content">
                          Format Judul Siaran (Metadata ID3)
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {FORMAT_OPTIONS.map((opt) => {
                          const isSelected = titleFormatMode === opt.value;
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => setTitleFormatMode(opt.value)}
                              className={`p-2.5 rounded-lg border text-left transition-all flex items-start justify-between gap-2 ${
                                isSelected
                                  ? "bg-primary/10 border-primary text-base-content shadow-sm"
                                  : "bg-base-200 border-base-300 text-base-content/80 hover:bg-base-300"
                              }`}
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-xs font-bold truncate">
                                    {opt.label}
                                  </span>
                                  {opt.badge && (
                                    <span className="px-1.5 py-0.2 rounded bg-primary/20 text-primary font-mono text-[10px] font-bold">
                                      {opt.badge}
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] font-mono text-base-content/60 mt-0.5 truncate">
                                  Contoh: {opt.example}
                                </p>
                              </div>
                              <span
                                className={`h-4 w-4 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${
                                  isSelected
                                    ? "border-primary bg-primary text-primary-content"
                                    : "border-base-300 bg-base-100"
                                }`}
                              >
                                {isSelected && <Check className="h-2.5 w-2.5 stroke-[3]" />}
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      {titleFormatMode === "custom" && (
                        <div className="pt-2 border-t border-base-300 space-y-1">
                          <label className="text-xs font-semibold text-base-content block">
                            Template Variabel Kustom
                          </label>
                          <input
                            type="text"
                            value={customFormat}
                            onChange={(e) => setCustomFormat(e.target.value)}
                            placeholder="{artist} - {title}"
                            className="input input-sm input-bordered bg-base-200 rounded-lg text-xs font-mono w-full h-9"
                          />
                          <p className="text-[11px] text-base-content/60">
                            Gunakan variabel <code className="text-primary font-mono">&#123;artist&#125;</code> dan <code className="text-primary font-mono">&#123;title&#125;</code>.
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Audio Transcode Bitrate Segmented Buttons */}
                    <div className="p-4 rounded-xl bg-base-100 border border-base-300 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-base-content">
                          Bitrate Transcoding Audio (FFmpeg)
                        </span>
                        <span className="font-mono text-xs font-bold text-primary">
                          {audioQuality.toUpperCase()}bps
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {BITRATE_OPTIONS.map((b) => {
                          const isSelected = audioQuality === b.value;
                          return (
                            <button
                              key={b.value}
                              type="button"
                              onClick={() => setAudioQuality(b.value)}
                              className={`py-2 px-3 rounded-lg border text-center transition-all ${
                                isSelected
                                  ? "bg-primary text-primary-content border-primary font-bold shadow-sm"
                                  : "bg-base-200 border-base-300 text-base-content/80 hover:bg-base-300"
                              }`}
                            >
                              <div className="text-xs">{b.label}</div>
                              <div
                                className={`text-[10px] truncate ${
                                  isSelected
                                    ? "text-primary-content/80 font-medium"
                                    : "text-base-content/50"
                                }`}
                              >
                                {b.desc}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Loudness Normalization Toggle */}
                    <div className="p-4 rounded-xl bg-base-100 border border-base-300 flex items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-base-content">
                            Normalisasi Volume (EBU R128)
                          </span>
                          <span className="px-1.5 py-0.5 rounded bg-primary/15 text-primary font-mono text-[10px] font-bold">
                            -14 LUFS
                          </span>
                        </div>
                        <p className="text-[11px] text-base-content/60 mt-0.5">
                          Menyamaratakan level kenyaringan antar lagu YouTube Music secara otomatis.
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
                )}

                {/* TAB 3: PENYIMPANAN & CACHE */}
                {activeTab === "storage" && (
                  <div className="space-y-4 animate-fade-in">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-xs font-bold text-base-content uppercase tracking-wider mb-1">
                          Ruang Disk &amp; Manajemen Cache
                        </h4>
                        <p className="text-xs text-base-content/60">
                          Pengaturan direktori penyimpanan lokal dan pembersihan berkas audio.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={loadCacheStats}
                        className="btn btn-ghost btn-xs h-7 px-2 rounded-md bg-base-100 border border-base-300 text-base-content/70 gap-1 text-[11px]"
                        title="Hitung ulang kapasitas disk"
                      >
                        <RefreshCw className="h-3 w-3" />
                        <span>Hitung</span>
                      </button>
                    </div>

                    {/* Storage Capacity Gauge Card */}
                    <div className="p-4 rounded-xl bg-base-100 border border-base-300 space-y-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-base-content/80">
                          Kapasitas Terpakai:
                        </span>
                        <span className="font-mono font-bold text-base-content tabular-nums">
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

                      {/* Progress Bar */}
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

                      {/* Cache Limit Controls */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-base-300">
                        <div className="text-xs font-medium text-base-content/80">
                          Batas Maksimum Cache:
                        </div>
                        <select
                          value={maxCacheSizeMb}
                          onChange={(e) => setMaxCacheSizeMb(Number(e.target.value))}
                          className="select select-bordered select-xs h-8 bg-base-200 rounded-md text-xs font-mono font-semibold"
                        >
                          <option value={500}>500 MB (Hemat)</option>
                          <option value={1024}>1 GB / 1024 MB</option>
                          <option value={2048}>2 GB / 2048 MB (Standar)</option>
                          <option value={5120}>5 GB / 5120 MB (Besar)</option>
                          <option value={10240}>10 GB / 10240 MB</option>
                          <option value={0}>Tanpa Batas (Unlimited)</option>
                        </select>
                      </div>

                      <label className="flex items-center gap-2 cursor-pointer pt-0.5">
                        <input
                          type="checkbox"
                          checked={autoCleanupCache}
                          onChange={(e) => setAutoCleanupCache(e.target.checked)}
                          className="checkbox checkbox-primary checkbox-xs rounded"
                        />
                        <span className="text-[11px] text-base-content/70">
                          Pangkas otomatis lagu jarang diputar saat kapasitas penuh
                        </span>
                      </label>
                    </div>

                    {/* Directory Folder Slot Cards */}
                    <div className="space-y-2.5">
                      {/* Cache MP3 Directory Slot */}
                      <div className="p-3.5 rounded-xl bg-base-100 border border-base-300 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-base-content flex items-center gap-1.5">
                            <Folder className="h-3.5 w-3.5 text-primary" />
                            <span>Folder Cache Audio MP3</span>
                          </span>
                          {customCacheDir && (
                            <button
                              type="button"
                              onClick={() => setCustomCacheDir("")}
                              className="text-[11px] text-accent hover:underline flex items-center gap-1"
                            >
                              <RotateCcw className="h-3 w-3" />
                              <span>Reset ke Default</span>
                            </button>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={customCacheDir}
                            onChange={(e) => setCustomCacheDir(e.target.value)}
                            placeholder={cacheStats?.cache_dir || "Drive Default (C:)"}
                            className="input input-xs input-bordered h-8 flex-1 bg-base-200 rounded-md text-xs font-mono"
                          />
                          <button
                            type="button"
                            onClick={handleBrowseCacheDir}
                            disabled={isBrowsingCache}
                            className="btn btn-xs h-8 px-2.5 rounded-md bg-base-200 border border-base-300 text-base-content hover:bg-base-300 gap-1 text-xs font-semibold shrink-0"
                            title="Pilih folder melalui dialog Windows"
                          >
                            {isBrowsingCache ? (
                              <span className="loading loading-spinner loading-xs" />
                            ) : (
                              <Folder className="h-3.5 w-3.5 text-primary" />
                            )}
                            <span>Pilih</span>
                          </button>
                          <button
                            type="button"
                            onClick={handleOpenCacheFolder}
                            disabled={isOpeningFolder}
                            className="btn btn-xs h-8 px-2.5 rounded-md bg-secondary border border-base-300 text-secondary-content hover:bg-base-300 gap-1 text-xs font-semibold shrink-0"
                            title="Buka folder di File Explorer"
                          >
                            <FolderOpen className="h-3.5 w-3.5 text-primary" />
                            <span>Buka</span>
                          </button>
                        </div>
                      </div>

                      {/* Database & Data Directory Slot */}
                      <div className="p-3.5 rounded-xl bg-base-100 border border-base-300 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-base-content flex items-center gap-1.5">
                            <HardDrive className="h-3.5 w-3.5 text-primary" />
                            <span>Folder Database &amp; Data Aplikasi</span>
                          </span>
                          {customDataDir && (
                            <button
                              type="button"
                              onClick={() => setCustomDataDir("")}
                              className="text-[11px] text-accent hover:underline flex items-center gap-1"
                            >
                              <RotateCcw className="h-3 w-3" />
                              <span>Reset ke Default</span>
                            </button>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={customDataDir}
                            onChange={(e) => setCustomDataDir(e.target.value)}
                            placeholder={cacheStats?.storage_dir || "Drive Default (C:)"}
                            className="input input-xs input-bordered h-8 flex-1 bg-base-200 rounded-md text-xs font-mono"
                          />
                          <button
                            type="button"
                            onClick={handleBrowseDataDir}
                            disabled={isBrowsingData}
                            className="btn btn-xs h-8 px-2.5 rounded-md bg-base-200 border border-base-300 text-base-content hover:bg-base-300 gap-1 text-xs font-semibold shrink-0"
                            title="Pilih folder melalui dialog Windows"
                          >
                            {isBrowsingData ? (
                              <span className="loading loading-spinner loading-xs" />
                            ) : (
                              <Folder className="h-3.5 w-3.5 text-primary" />
                            )}
                            <span>Pilih</span>
                          </button>
                          <button
                            type="button"
                            onClick={handleOpenDataFolder}
                            disabled={isOpeningDataFolder}
                            className="btn btn-xs h-8 px-2.5 rounded-md bg-secondary border border-base-300 text-secondary-content hover:bg-base-300 gap-1 text-xs font-semibold shrink-0"
                            title="Buka folder di File Explorer"
                          >
                            <FolderOpen className="h-3.5 w-3.5 text-primary" />
                            <span>Buka</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Cache Cleanup Actions */}
                    <div className="p-3.5 rounded-xl bg-base-100 border border-base-300 flex flex-wrap items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={handleToggleCacheList}
                        className="btn btn-xs h-8 px-2.5 rounded-md bg-base-200 border border-base-300 text-base-content gap-1.5 text-xs font-semibold hover:bg-base-300"
                      >
                        <ListMusic className="h-3.5 w-3.5 text-primary" />
                        <span>{showCacheList ? "Tutup Daftar" : "Lihat Lagu Cache"}</span>
                      </button>

                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={handleTrimCache}
                          disabled={isTrimmingCache || !cacheStats || cacheStats.total_files === 0}
                          className="btn btn-xs h-8 px-2.5 rounded-md bg-base-200 border border-base-300 text-primary gap-1 text-xs font-semibold hover:bg-base-300"
                        >
                          {isTrimmingCache ? (
                            <span className="loading loading-spinner loading-xs" />
                          ) : (
                            <Scissors className="h-3 w-3" />
                          )}
                          <span>Pangkas</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleClearCache(7)}
                          disabled={isClearingCache || !cacheStats || cacheStats.total_files === 0}
                          className="btn btn-xs h-8 px-2.5 rounded-md bg-base-200 border border-base-300 text-warning hover:bg-warning/15 text-xs font-semibold"
                        >
                          <span>&gt; 7 Hari</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleClearCache()}
                          disabled={isClearingCache || !cacheStats || cacheStats.total_files === 0}
                          className="btn btn-xs h-8 px-2.5 rounded-md bg-base-200 border border-base-300 text-error gap-1 hover:bg-error/15 text-xs font-semibold"
                        >
                          <Trash2 className="h-3 w-3" />
                          <span>Hapus Semua</span>
                        </button>
                      </div>
                    </div>

                    {/* Expandable Cached Tracks Inspector */}
                    {showCacheList && (
                      <div className="p-3.5 rounded-xl bg-base-100 border border-base-300 space-y-2">
                        <div className="flex items-center justify-between text-xs font-bold text-base-content">
                          <span>Daftar Berkas Cache ({cachedTracks.length} lagu):</span>
                          {isLoadingCachedTracks && (
                            <span className="loading loading-spinner loading-xs text-primary" />
                          )}
                        </div>
                        {cachedTracks.length === 0 ? (
                          <p className="text-xs text-base-content/60 py-3 text-center">
                            Belum ada file audio di cache lokal.
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
                                  <p className="text-[11px] text-base-content/60 truncate">
                                    {t.artist || t.artists?.join(", ") || "Artis"}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0 text-xs font-mono tabular-nums">
                                  {t.play_count > 0 && (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-warning/15 text-warning font-bold">
                                      <Flame className="h-3 w-3 fill-current" />
                                      <span>{t.play_count}x</span>
                                    </span>
                                  )}
                                  {t.is_cached && (
                                    <span className="px-1.5 py-0.2 rounded bg-success/15 text-success font-medium">
                                      {t.file_size_mb} MB
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
                )}

                {/* TAB 4: SISTEM & INFO */}
                {activeTab === "system" && (
                  <div className="space-y-4 animate-fade-in">
                    <div>
                      <h4 className="text-xs font-bold text-base-content uppercase tracking-wider mb-1">
                        Informasi Konsol &amp; Pembaruan
                      </h4>
                      <p className="text-xs text-base-content/60">
                        Status versi perangkat lunak dan tautan dokumentasi.
                      </p>
                    </div>

                    <div className="p-4 rounded-xl bg-base-100 border border-base-300 space-y-3">
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div className="p-2.5 rounded-lg bg-base-200 border border-base-300">
                          <span className="text-[11px] text-base-content/60 block">
                            Versi Aplikasi
                          </span>
                          <span className="font-mono font-bold text-sm text-primary">
                            v{APP_VERSION}
                          </span>
                        </div>
                        <div className="p-2.5 rounded-lg bg-base-200 border border-base-300">
                          <span className="text-[11px] text-base-content/60 block">
                            Port Server Internal
                          </span>
                          <span className="font-mono font-bold text-sm text-base-content">
                            {serverPort}
                          </span>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-base-300 flex items-center justify-between">
                        <div>
                          <span className="text-xs font-semibold text-base-content block">
                            Pembaruan Perangkat Lunak
                          </span>
                          <span className="text-[11px] text-base-content/60 block">
                            Periksa rilis installer versi terbaru di GitHub.
                          </span>
                        </div>
                        {onOpenUpdateModal && (
                          <button
                            type="button"
                            onClick={() => {
                              onClose();
                              onOpenUpdateModal();
                            }}
                            className="btn btn-sm h-8 px-3 rounded-lg bg-base-200 border border-base-300 text-xs font-semibold text-base-content hover:bg-base-300 gap-1.5 shrink-0"
                          >
                            <Download className="h-3.5 w-3.5 text-accent" />
                            <span>Cek Pembaruan</span>
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-base-100 border border-base-300 flex items-center justify-between text-xs text-base-content/70">
                      <div>
                        <span className="font-semibold text-base-content block">
                          Radio Caster Bridge
                        </span>
                        <span>YouTube Music Studio Streamer &amp; RadioBOSS Controller</span>
                      </div>
                      <a
                        href="https://hi.oktaa.my.id"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-ghost btn-xs h-7 px-2 text-xs font-semibold text-accent gap-1 hover:underline"
                      >
                        <span>hi.oktaa.my.id</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Footer Actions */}
            <div className="px-5 py-3 border-t border-base-300 bg-base-200/90 flex items-center justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="btn btn-ghost btn-sm h-9 px-4 rounded-lg text-xs font-semibold text-base-content/80 hover:text-base-content"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="btn btn-primary btn-sm h-9 px-5 rounded-lg gap-1.5 text-xs font-bold text-primary-content shadow-sm"
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
          </form>
        )}
      </div>

      <form method="dialog" className="modal-backdrop">
        <button onClick={onClose}>close</button>
      </form>
    </dialog>
  );
}