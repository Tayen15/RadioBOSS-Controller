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
} from "lucide-react";
import { AppConfig, TitleFormatMode, CacheStats } from "@/lib/types";
import {
  getAppSettings,
  saveAppSettings,
  fetchCacheStats,
  openCacheFolder,
  clearAudioCache,
} from "@/lib/api";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSettingsSaved: () => void;
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

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
  const [isOpeningFolder, setIsOpeningFolder] = useState(false);
  const [isClearingCache, setIsClearingCache] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

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
      <div className="modal-box bg-base-200 border border-base-300 max-w-lg shadow-2xl p-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-base-300 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
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
            className="btn btn-ghost btn-circle btn-sm text-base-content/60 hover:text-base-content"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Feedback Alert */}
        {feedback && (
          <div
            className={`alert ${
              feedback.type === "success" ? "alert-success" : "alert-error"
            } mt-4 text-xs py-2.5 rounded-xl`}
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
            <p className="text-xs text-base-content/60">Memuat konfigurasi...</p>
          </div>
        ) : (
          <form onSubmit={handleSave} className="mt-4 space-y-5">
            {/* Section 1: RadioBOSS Connection */}
            <div className="space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-bold text-primary uppercase tracking-wider">
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
              <div className="flex items-center gap-1.5 text-xs font-bold text-primary uppercase tracking-wider pt-2">
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
                  className="input input-bordered input-sm w-full bg-base-100 flex items-center justify-between text-xs px-3 focus:outline-none hover:border-primary/50 transition-colors"
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="font-semibold text-base-content truncate">
                      {FORMAT_OPTIONS.find((opt) => opt.value === titleFormatMode)?.label || "RadioBOSS Standar"}
                    </span>
                    {FORMAT_OPTIONS.find((opt) => opt.value === titleFormatMode)?.badge && (
                      <span className="badge badge-primary badge-xs">
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
                              ? "bg-primary/10 text-primary"
                              : "hover:bg-base-200 text-base-content"
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold truncate">
                                {opt.label}
                              </span>
                              {opt.badge && (
                                <span className="badge badge-primary badge-xs scale-90">
                                  {opt.badge}
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-base-content/60 truncate mt-0.5">
                              {opt.desc}
                            </p>
                          </div>
                          {isSelected && (
                            <Check className="h-3.5 w-3.5 text-primary shrink-0" />
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
                <div className="flex items-center gap-1.5 text-xs font-bold text-primary uppercase tracking-wider">
                  <HardDrive className="h-3.5 w-3.5" />
                  <span>Penyimpanan & Cache Audio Studio</span>
                </div>
                <button
                  type="button"
                  onClick={loadCacheStats}
                  className="btn btn-ghost btn-xs text-[10px] text-base-content/60 gap-1 hover:text-primary"
                  title="Perbarui ukuran cache"
                >
                  <RefreshCw className="h-2.5 w-2.5" />
                  <span>Cek Ukuran</span>
                </button>
              </div>

              <div className="bg-base-200/60 border border-base-300/80 rounded-xl p-3 space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-base-content/70">Status Penyimpanan:</span>
                  <span className="font-bold text-accent">
                    {cacheStats
                      ? `${cacheStats.total_files} file tersimpan (${cacheStats.total_size_mb} MB)`
                      : "Memuat..."}
                  </span>
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
                        className="btn btn-ghost btn-xs text-[10px] text-primary hover:underline py-0 h-5 min-h-0"
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
                      className="input input-bordered input-xs join-item w-full bg-base-100 text-[11px] font-mono text-base-content placeholder:text-base-content/30"
                    />
                    <button
                      type="button"
                      onClick={handleOpenFolder}
                      disabled={isOpeningFolder}
                      className="btn btn-xs join-item btn-primary gap-1 shrink-0 font-medium"
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

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 border-t border-base-300/40">
                  <p className="text-[10px] text-base-content/50 leading-relaxed">
                    File MP3 tersimpan permanen di PC Anda. Riwayat &amp; cache tidak hilang saat aplikasi ditutup.
                  </p>
                  <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
                    <button
                      type="button"
                      onClick={() => handleClearCache(7)}
                      disabled={isClearingCache || !cacheStats || cacheStats.total_files === 0}
                      className="btn btn-ghost btn-xs text-warning/90 hover:bg-warning/10 font-normal"
                      title="Hapus cache lagu yang tidak pernah dibuka selama lebih dari 7 hari"
                    >
                      <span>Hapus &gt; 7 Hari</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleClearCache()}
                      disabled={isClearingCache || !cacheStats || cacheStats.total_files === 0}
                      className="btn btn-ghost btn-xs text-error gap-1 hover:bg-error/10 font-normal"
                      title="Kosongkan SEMUA file MP3 lokal untuk menghemat disk"
                    >
                      <Trash2 className="h-3 w-3" />
                      <span>Kosongkan Semua</span>
                    </button>
                  </div>
                </div>
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
            <div className="modal-action border-t border-base-300 pt-3">
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
                className="btn btn-primary btn-sm gap-1.5 text-xs font-bold shadow-md"
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
