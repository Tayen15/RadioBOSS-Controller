"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import {
  Sparkles,
  Download,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  X,
  ExternalLink,
  ShieldCheck,
  ArrowRight,
  HardDrive,
} from "lucide-react";
import {
  UpdateCheckResult,
  UpdateDownloadStatus,
} from "@/lib/types";
import {
  checkForUpdates,
  startDownloadUpdate,
  getUpdateStatus,
  applyUpdate,
} from "@/lib/api";

interface UpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialCheckResult?: UpdateCheckResult | null;
  onUpdateDetected?: (result: UpdateCheckResult) => void;
}

export function UpdateModal({
  isOpen,
  onClose,
  initialCheckResult,
  onUpdateDetected,
}: UpdateModalProps) {
  const [checkResult, setCheckResult] = useState<UpdateCheckResult | null>(
    initialCheckResult || null
  );
  const [isChecking, setIsChecking] = useState<boolean>(false);
  const [downloadStatus, setDownloadStatus] = useState<UpdateDownloadStatus>({
    status: "idle",
    progress: 0,
    downloaded_bytes: 0,
    total_bytes: 0,
    speed_mbps: 0,
    file_path: null,
    file_name: null,
    error: null,
  });
  const [isApplying, setIsApplying] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Render-phase sync for initialCheckResult
  const [prevInitial, setPrevInitial] = useState<UpdateCheckResult | null>(
    initialCheckResult || null
  );
  if (initialCheckResult && initialCheckResult !== prevInitial) {
    setPrevInitial(initialCheckResult);
    setCheckResult(initialCheckResult);
  }

  const handleCheck = useCallback(async (force: boolean = true) => {
    setIsChecking(true);
    setErrorMsg(null);
    try {
      const res = await checkForUpdates(force);
      setCheckResult(res);
      if (onUpdateDetected && res.update_available) {
        onUpdateDetected(res);
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Gagal memeriksa pembaruan dari server GitHub."
      );
    } finally {
      setIsChecking(false);
    }
  }, [onUpdateDetected]);

  // Asynchronous background check when modal opens if not yet checked
  useEffect(() => {
    if (isOpen && !checkResult) {
      let cancelled = false;
      checkForUpdates(false)
        .then((res) => {
          if (!cancelled) {
            setCheckResult(res);
            if (onUpdateDetected && res.update_available) {
              onUpdateDetected(res);
            }
          }
        })
        .catch((err) => {
          if (!cancelled) {
            setErrorMsg(
              err instanceof Error
                ? err.message
                : "Gagal memeriksa pembaruan dari server GitHub."
            );
          }
        });
      return () => {
        cancelled = true;
      };
    }
  }, [isOpen, checkResult, onUpdateDetected]);

  // Polling download status
  const startPollingStatus = useCallback(() => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);

    pollIntervalRef.current = setInterval(async () => {
      try {
        const status = await getUpdateStatus();
        setDownloadStatus(status);
        if (status.status === "downloaded" || status.status === "error") {
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
        }
      } catch (err) {
        console.error("Failed to poll update status:", err);
      }
    }, 800);
  }, []);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  const handleStartDownload = async () => {
    setErrorMsg(null);
    try {
      await startDownloadUpdate();
      setDownloadStatus((prev) => ({ ...prev, status: "downloading" }));
      startPollingStatus();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Gagal memulai unduhan pembaruan."
      );
    }
  };

  const handleApply = async () => {
    setIsApplying(true);
    setErrorMsg(null);
    try {
      await applyUpdate();
    } catch (err) {
      setIsApplying(false);
      setErrorMsg(
        err instanceof Error ? err.message : "Gagal menerapkan pembaruan."
      );
    }
  };

  if (!isOpen) return null;

  const currentVer = checkResult?.current_version || "0.5.2";
  const latestVer = checkResult?.latest_version || currentVer;
  const isAvailable = checkResult?.update_available ?? false;

  const formatSize = (bytes: number) => {
    if (!bytes || bytes === 0) return "0 MB";
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <dialog className="modal modal-open z-50">
      <div className="modal-box rounded-2xl bg-base-200 border border-base-300 max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl p-5 sm:p-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-base-300 pb-3">
          <div className="flex items-center gap-3">
            <div className="relative h-10 w-10 shrink-0 rounded-xl overflow-hidden shadow-lg border border-base-300 bg-base-100 flex items-center justify-center">
              <Image
                src="/logo.png"
                alt="App Logo"
                width={40}
                height={40}
                className="object-contain p-1"
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base text-base-content">
                  Pembaruan Sistem
                </h3>
                {isAvailable && (
                  <span className="badge badge-accent badge-xs font-bold animate-pulse">
                    Baru
                  </span>
                )}
              </div>
              <p className="text-xs text-base-content/60">
                Radio Caster Bridge Auto Updater
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

        {/* Error Alert */}
        {errorMsg && (
          <div className="alert alert-error text-error-content text-xs py-2.5 rounded-xl font-medium">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Version Compare Banner */}
        <div className="flex items-center justify-between p-3.5 rounded-xl bg-base-100 border border-base-300">
          <div className="space-y-0.5">
            <span className="text-[10px] uppercase font-bold text-base-content/50 tracking-wider">
              Versi Terpasang
            </span>
            <div className="text-sm font-bold text-base-content font-mono">
              v{currentVer}
            </div>
          </div>

          <div className="flex items-center justify-center h-7 w-7 rounded-full bg-base-200 text-base-content/40">
            <ArrowRight className="h-3.5 w-3.5" />
          </div>

          <div className="space-y-0.5 text-right">
            <span className="text-[10px] uppercase font-bold text-base-content/50 tracking-wider">
              Versi Rilis Terbaru
            </span>
            <div
              className={`text-sm font-bold font-mono ${
                isAvailable ? "text-accent" : "text-success"
              }`}
            >
              v{latestVer}
            </div>
          </div>
        </div>

        {/* Status Content */}
        {isChecking ? (
          <div className="py-8 text-center space-y-2">
            <span className="loading loading-spinner loading-md text-primary" />
            <p className="text-xs text-base-content/60">
              Menghubungkan ke GitHub Releases...
            </p>
          </div>
        ) : !isAvailable ? (
          <div className="p-4 rounded-xl bg-base-100/60 border border-base-300 text-center space-y-3">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-success/15 text-success">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-base-content">
                Aplikasi Anda Sudah Menggunakan Versi Terbaru
              </h4>
              <p className="text-xs text-base-content/60 mt-1">
                Semua fitur streaming YouTube Music dan controller RadioBOSS sudah berada pada versi paling mutakhir.
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleCheck(true)}
              className="btn btn-ghost btn-xs gap-1.5 text-base-content/70 hover:text-white"
            >
              <RefreshCw className="h-3 w-3" />
              <span>Cek Pembaruan Ulang</span>
            </button>
          </div>
        ) : (
          /* Update Available View */
          <div className="space-y-3.5">
            {/* Release Info Card */}
            <div className="p-3.5 rounded-xl bg-base-100 border border-base-300 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4 text-accent" />
                  <span className="text-xs font-bold text-base-content">
                    {checkResult?.release_name || `Versi Baru ${latestVer}`}
                  </span>
                </div>
                {checkResult?.html_url && (
                  <a
                    href={checkResult.html_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] text-accent hover:underline flex items-center gap-1"
                    title="Buka rilis resmi di GitHub"
                  >
                    <span>Lihat di GitHub</span>
                    <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                )}
              </div>

              {/* Release Notes */}
              {checkResult?.release_notes && (
                <div className="space-y-1">
                  <span className="text-[10px] uppercase font-bold text-base-content/50">
                    Catatan Perubahan (Changelog):
                  </span>
                  <div className="max-h-36 overflow-y-auto rounded-lg bg-base-200/70 p-2.5 text-[11px] text-base-content/80 font-sans leading-relaxed whitespace-pre-wrap border border-base-300/50">
                    {checkResult.release_notes}
                  </div>
                </div>
              )}

              {/* Asset Details */}
              {checkResult?.asset && (
                <div className="flex items-center justify-between pt-1 text-[11px] text-base-content/60 border-t border-base-300/40">
                  <div className="flex items-center gap-1.5 truncate">
                    <HardDrive className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate font-mono">
                      {checkResult.asset.name}
                    </span>
                  </div>
                  <span className="shrink-0 font-medium">
                    {formatSize(checkResult.asset.size)}
                  </span>
                </div>
              )}
            </div>

            {/* Download Progress Card */}
            {downloadStatus.status === "downloading" && (
              <div className="p-3.5 rounded-xl bg-base-100 border border-primary/40 space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="text-primary flex items-center gap-1.5">
                    <span className="loading loading-spinner loading-xs" />
                    Mengunduh installer...
                  </span>
                  <span className="font-mono text-base-content">
                    {downloadStatus.progress}%
                  </span>
                </div>
                <progress
                  className="progress progress-primary w-full h-2 rounded-full"
                  value={downloadStatus.progress}
                  max="100"
                />
                <div className="flex items-center justify-between text-[10px] text-base-content/60 font-mono">
                  <span>
                    {formatSize(downloadStatus.downloaded_bytes)} /{" "}
                    {formatSize(downloadStatus.total_bytes)}
                  </span>
                  <span>{downloadStatus.speed_mbps} MB/s</span>
                </div>
              </div>
            )}

            {/* Downloaded State Banner */}
            {downloadStatus.status === "downloaded" && (
              <div className="p-3.5 rounded-xl bg-success/10 border border-success/30 flex items-center gap-2.5 text-xs text-success-content">
                <ShieldCheck className="h-5 w-5 text-success shrink-0" />
                <div>
                  <p className="font-bold text-success">
                    Installer Siap Dijalankan!
                  </p>
                  <p className="text-[10px] text-base-content/70">
                    Klik tombol di bawah untuk memulai instalasi pembaruan. Aplikasi akan menutup secara otomatis.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Modal Actions */}
        <div className="modal-action border-t border-base-300 pt-3 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost btn-sm text-xs font-medium"
          >
            Tutup
          </button>

          {isAvailable && (
            <div>
              {downloadStatus.status === "idle" && (
                <button
                  type="button"
                  onClick={handleStartDownload}
                  className="btn btn-primary btn-sm rounded-xl gap-1.5 text-xs font-bold shadow-lg text-primary-content"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Unduh &amp; Pasang Otomatis</span>
                </button>
              )}

              {downloadStatus.status === "downloading" && (
                <button
                  type="button"
                  disabled
                  className="btn btn-primary btn-sm rounded-xl gap-1.5 text-xs font-bold"
                >
                  <span className="loading loading-spinner loading-xs" />
                  <span>Mengunduh ({downloadStatus.progress}%)...</span>
                </button>
              )}

              {downloadStatus.status === "downloaded" && (
                <button
                  type="button"
                  onClick={handleApply}
                  disabled={isApplying}
                  className="btn btn-success btn-sm rounded-xl gap-1.5 text-xs font-bold shadow-lg animate-pulse"
                >
                  {isApplying ? (
                    <>
                      <span className="loading loading-spinner loading-xs" />
                      <span>Menjalankan Installer...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>Mulai Ulang &amp; Pasang Sekarang</span>
                    </>
                  )}
                </button>
              )}

              {downloadStatus.status === "error" && (
                <button
                  type="button"
                  onClick={handleStartDownload}
                  className="btn btn-warning btn-sm rounded-xl gap-1.5 text-xs font-bold"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>Coba Unduh Ulang</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button onClick={onClose}>close</button>
      </form>
    </dialog>
  );
}
