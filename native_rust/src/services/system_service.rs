use std::path::Path;
use sysinfo::System;

use crate::models::system::SystemSpecs;

/// Detects local host OS, CPU cores, and RAM to recommend Low-Spec vs Studio High audio preset.
pub fn get_system_specs() -> SystemSpecs {
    let mut ram_gb = 8.0;
    if let Ok(mut sys) = System::new_all() {
        sys.refresh_memory();
        ram_gb = ((sys.total_memory() as f64 / (1024.0 * 1024.0 * 1024.0)) * 10.0).round() / 10.0;
    }

    let cpu_cores = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(2);
    let os_name = System::long_os_version()
        .ok()
        .or_else(|| System::name().ok())
        .unwrap_or_else(|| std::env::consts::OS.to_string());

    let is_low_spec = cpu_cores <= 4 || ram_gb < 6.0;
    let (recommended_preset, recommended_loudnorm, recommended_bitrate, reason) = if is_low_spec {
        (
            "low_spec".to_string(),
            false,
            "192k".to_string(),
            format!(
                "Terdeteksi perangkat spesifikasi standar ({cpu_cores} Core CPU, {ram_gb} GB RAM). \
                 Direkomendasikan menonaktifkan normalisasi volume EBU R128 dan memakai bitrate 192 kbps \
                 agar proses transfer lagu instan dan tidak membebani prosesor (mencegah timeout FFmpeg)."
            ),
        )
    } else {
        (
            "studio_high".to_string(),
            true,
            "320k".to_string(),
            format!(
                "Spesifikasi perangkat sangat mumpuni ({cpu_cores} Core CPU, {ram_gb} GB RAM). \
                 Mendukung normalisasi audio EBU R128 (-14 LUFS) dan kualitas master 320 kbps secara mulus."
            ),
        )
    };

    SystemSpecs {
        os_name,
        cpu_cores,
        ram_gb,
        is_low_spec,
        recommended_preset,
        recommended_loudnorm,
        recommended_bitrate,
        reason,
    }
}

/// Opens a native OS folder selection dialog and returns the selected directory path.
pub fn pick_folder_dialog(initial_dir: Option<&str>) -> Option<String> {
    let mut dialog = rfd::FileDialog::new();
    if let Some(dir) = initial_dir {
        if !dir.trim().is_empty() && Path::new(dir).exists() {
            dialog = dialog.set_directory(dir);
        }
    }
    dialog
        .pick_folder()
        .map(|p| p.to_string_lossy().to_string())
}

/// Opens a local folder or URL in the system file manager / default browser.
pub fn open_in_system(target: &str) {
    let _ = open::that(target);
}
