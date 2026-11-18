use eframe::egui::{self, CornerRadius, Stroke};

use crate::app::{RadioCasterApp, SettingsTab};
use crate::events::AppCommand;
use crate::models::config::{AppConfig, TitleFormatMode};
use crate::models::APP_VERSION;
use crate::services::system_service;
use crate::ui::theme::{
    amber_button, bold_text, danger_button, dialog_frame, lcd_frame, mono_text, semibold_text,
    slate_button, status_pill, AMBER_DARK_TEXT, AMBER_PRIMARY, BORDER_COLOR, CONTROL_BG,
    SIGNAL_CYAN, STATUS_ERROR, STATUS_SUCCESS, TEXT_MUTED, TEXT_PRIMARY, TEXT_SECONDARY,
};
use crate::ui::toast::ToastItem;

pub fn render_settings_modal(ctx: &egui::Context, app: &mut RadioCasterApp) {
    if !app.is_settings_open {
        return;
    }

    let mut is_open = app.is_settings_open;
    egui::Window::new("Pengaturan")
        .open(&mut is_open)
        .collapsible(false)
        .resizable(true)
        .movable(true)
        .frame(dialog_frame())
        .default_width(740.0)
        .default_height(540.0)
        .show(ctx, |ui| {
            ui.horizontal_top(|ui| {
                // Left Sidebar Navigation (5 Tabs)
                ui.vertical(|ui| {
                    ui.set_width(175.0);
                    let tabs = [
                        (SettingsTab::Connection, "Koneksi RadioBOSS"),
                        (SettingsTab::Broadcast, "Format & Audio"),
                        (SettingsTab::Storage, "Penyimpanan & Disk"),
                        (SettingsTab::CasterHub, "CasterHub Cloud"),
                        (SettingsTab::System, "Sistem & Info"),
                    ];
                    for (t, label) in tabs {
                        let active = app.settings_tab == t;
                        if ui
                            .add_sized(
                                [170.0, 34.0],
                                egui::Button::new(bold_text(
                                    label,
                                    12.0,
                                    if active { AMBER_DARK_TEXT } else { TEXT_PRIMARY },
                                ))
                                .fill(if active { AMBER_PRIMARY } else { CONTROL_BG })
                                .stroke(Stroke::new(
                                    1.0,
                                    if active { AMBER_PRIMARY } else { BORDER_COLOR },
                                ))
                                .corner_radius(CornerRadius::same(8)),
                            )
                            .clicked()
                        {
                            app.settings_tab = t;
                            if t == SettingsTab::Storage {
                                app.send_cmd(AppCommand::RefreshCacheStats);
                            }
                        }
                        ui.add_space(4.0);
                    }
                });

                ui.add_space(12.0);

                // Right Content Area
                ui.vertical(|ui| {
                    ui.set_min_width(510.0);
                    egui::ScrollArea::vertical()
                        .id_salt("settings_content_scroll")
                        .max_height(430.0)
                        .show(ui, |ui| match app.settings_tab {
                            SettingsTab::Connection => render_connection_tab(ui, app),
                            SettingsTab::Broadcast => render_broadcast_tab(ui, app),
                            SettingsTab::Storage => render_storage_tab(ui, app),
                            SettingsTab::CasterHub => render_casterhub_tab(ctx, ui, app),
                            SettingsTab::System => render_system_tab(ui, app),
                        });

                    ui.add_space(10.0);
                    ui.separator();
                    ui.add_space(6.0);

                    ui.horizontal(|ui| {
                        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                            if amber_button(ui, "Simpan Pengaturan").clicked() {
                                let cfg = app.draft_config.clone();
                                app.send_cmd(AppCommand::SaveSettings(cfg));
                                app.is_settings_open = false;
                            }
                            if slate_button(ui, "Batal").clicked() {
                                app.is_settings_open = false;
                            }
                        });
                    });
                });
            });
        });

    if !is_open {
        app.is_settings_open = false;
    }
}

fn render_connection_tab(ui: &mut egui::Ui, app: &mut RadioCasterApp) {
    ui.label(bold_text("Koneksi Web Remote API RadioBOSS", 13.5, TEXT_PRIMARY));
    ui.label(semibold_text(
        "Pastikan opsi Remote Control aktif di RadioBOSS (Options -> Settings -> Remote Control).",
        11.5,
        TEXT_SECONDARY,
    ));
    ui.add_space(8.0);

    lcd_frame().show(ui, |ui| {
        ui.label(semibold_text("Host / IP Address RadioBOSS", 11.5, TEXT_SECONDARY));
        ui.add_sized(
            [ui.available_width(), 30.0],
            egui::TextEdit::singleline(&mut app.draft_config.radioboss_host),
        );
        ui.add_space(6.0);

        ui.horizontal(|ui| {
            ui.vertical(|ui| {
                ui.label(semibold_text("Port Remote API", 11.5, TEXT_SECONDARY));
                let mut port_str = app.draft_config.radioboss_port.to_string();
                if ui
                    .add_sized([120.0, 30.0], egui::TextEdit::singleline(&mut port_str))
                    .changed()
                {
                    if let Ok(p) = port_str.trim().parse::<u16>() {
                        app.draft_config.radioboss_port = p;
                    }
                }
            });
            ui.add_space(12.0);
            ui.vertical(|ui| {
                ui.label(semibold_text("Password Web Remote", 11.5, TEXT_SECONDARY));
                ui.horizontal(|ui| {
                    ui.add_sized(
                        [240.0, 30.0],
                        egui::TextEdit::singleline(&mut app.draft_config.radioboss_password)
                            .password(!app.show_rb_password),
                    );
                    if slate_button(ui, if app.show_rb_password { "Sembunyi" } else { "Lihat" })
                        .clicked()
                    {
                        app.show_rb_password = !app.show_rb_password;
                    }
                });
            });
        });

        ui.add_space(10.0);
        ui.horizontal(|ui| {
            if amber_button(ui, "Ping / Tes Koneksi Live").clicked() {
                let test_cfg = app.draft_config.clone();
                app.send_cmd(AppCommand::PingRadioBoss(test_cfg));
            }
            if let Some((ok, ref msg)) = app.ping_result {
                status_pill(
                    ui,
                    if ok { "TERHUBUNG" } else { "GAGAL" },
                    if ok { STATUS_SUCCESS } else { STATUS_ERROR },
                );
                ui.label(semibold_text(msg, 11.5, TEXT_PRIMARY));
            }
        });
    });

    ui.add_space(10.0);
    lcd_frame().show(ui, |ui| {
        ui.label(bold_text("Target Tab Playlist Default", 12.5, TEXT_PRIMARY));
        ui.horizontal_wrapped(|ui| {
            let is_auto = app.draft_config.target_playlist_tab.is_empty();
            if ui
                .selectable_label(is_auto, "Auto (Tab Aktif RadioBOSS)")
                .clicked()
            {
                app.draft_config.target_playlist_tab.clear();
            }
            let tabs = app.available_tabs.clone();
            for tab in tabs {
                let selected = app.draft_config.target_playlist_tab == tab;
                if ui.selectable_label(selected, &tab).clicked() {
                    app.draft_config.target_playlist_tab = tab;
                }
            }
        });
    });
}

fn render_broadcast_tab(ui: &mut egui::Ui, app: &mut RadioCasterApp) {
    ui.label(bold_text("Format Judul Siaran & Kualitas Audio", 13.5, TEXT_PRIMARY));
    ui.add_space(6.0);

    // Hardware Spec Auto-Detection Card
    if let Some(ref specs) = app.system_specs.clone() {
        lcd_frame().show(ui, |ui| {
            ui.horizontal(|ui| {
                status_pill(
                    ui,
                    if specs.is_low_spec {
                        "REKOMENDASI: LOW-SPEC"
                    } else {
                        "REKOMENDASI: STUDIO HIGH"
                    },
                    if specs.is_low_spec {
                        AMBER_PRIMARY
                    } else {
                        STATUS_SUCCESS
                    },
                );
                ui.label(mono_text(
                    format!("{} • {} Cores • {:.1} GB RAM", specs.os_name, specs.cpu_cores, specs.ram_gb),
                    11.0,
                    TEXT_SECONDARY,
                ));
            });
            ui.add_space(4.0);
            ui.label(semibold_text(&specs.reason, 11.5, TEXT_PRIMARY));
            ui.add_space(6.0);
            if slate_button(ui, "Terapkan Preset Rekomendasi Hardware").clicked() {
                app.draft_config.enable_loudnorm = specs.recommended_loudnorm;
                app.draft_config.audio_quality = specs.recommended_bitrate.clone();
            }
        });
        ui.add_space(8.0);
    }

    // Audio Quality Selector
    lcd_frame().show(ui, |ui| {
        ui.label(bold_text("Kualitas Bitrate Transcode MP3", 12.5, TEXT_PRIMARY));
        ui.add_space(4.0);
        ui.horizontal_wrapped(|ui| {
            let bitrates = [
                ("320k", "320 kbps (Studio Master)"),
                ("256k", "256 kbps (Tinggi)"),
                ("192k", "192 kbps (Standar)"),
                ("128k", "128 kbps (Hemat)"),
            ];
            for (val, lbl) in bitrates {
                let active = app.draft_config.audio_quality == val;
                if ui
                    .add(
                        egui::Button::new(semibold_text(
                            lbl,
                            11.5,
                            if active { AMBER_DARK_TEXT } else { TEXT_PRIMARY },
                        ))
                        .fill(if active { AMBER_PRIMARY } else { CONTROL_BG })
                        .corner_radius(CornerRadius::same(6)),
                    )
                    .clicked()
                {
                    app.draft_config.audio_quality = val.to_string();
                }
            }
        });

        ui.add_space(8.0);
        ui.checkbox(
            &mut app.draft_config.enable_loudnorm,
            semibold_text(
                "Aktifkan Normalisasi Volume Broadcast EBU R128 (-14 LUFS)",
                12.0,
                TEXT_PRIMARY,
            ),
        );
    });

    ui.add_space(8.0);

    // Title Format Mode
    lcd_frame().show(ui, |ui| {
        ui.label(bold_text("Format Judul Siaran RadioBOSS (streamingtitle)", 12.5, TEXT_PRIMARY));
        ui.add_space(4.0);
        let modes = [
            TitleFormatMode::RadiobossNative,
            TitleFormatMode::ArtistTitle,
            TitleFormatMode::TitleArtist,
            TitleFormatMode::TitleOnly,
            TitleFormatMode::Custom,
        ];
        for m in modes {
            let val_str = m.as_str();
            let active = app.draft_config.title_format_mode == val_str;
            if ui
                .radio(active, format!("{} — Contoh: {}", m.label(), m.example()))
                .clicked()
            {
                app.draft_config.title_format_mode = val_str.to_string();
            }
        }
        if app.draft_config.title_format_mode == "custom" {
            ui.add_space(4.0);
            ui.add(
                egui::TextEdit::singleline(&mut app.draft_config.custom_title_format)
                    .hint_text("{artist} - {title}"),
            );
        }
    });
}

fn render_storage_tab(ui: &mut egui::Ui, app: &mut RadioCasterApp) {
    ui.label(bold_text("Penyimpanan Cache Audio & Database Studio", 13.5, TEXT_PRIMARY));
    ui.add_space(6.0);

    // Cache Folder Picker
    lcd_frame().show(ui, |ui| {
        ui.label(bold_text("Direktori Cache Audio MP3", 12.0, TEXT_PRIMARY));
        ui.label(mono_text(
            format!("Aktif: {}", app.cache_stats.cache_dir),
            10.5,
            SIGNAL_CYAN,
        ));
        ui.add_space(4.0);
        ui.horizontal(|ui| {
            ui.add(
                egui::TextEdit::singleline(&mut app.draft_config.custom_cache_dir)
                    .desired_width(250.0)
                    .hint_text("Default AppData / Portable"),
            );
            if slate_button(ui, "Pilih Folder").clicked() {
                if let Some(p) =
                    system_service::pick_folder_dialog(Some(&app.draft_config.custom_cache_dir))
                {
                    app.draft_config.custom_cache_dir = p;
                }
            }
            if slate_button(ui, "Buka Explorer").clicked() {
                system_service::open_in_system(&app.cache_stats.cache_dir);
            }
        });

        ui.add_space(8.0);
        ui.label(bold_text("Direktori Database SQLite (radioboss_caster.db)", 12.0, TEXT_PRIMARY));
        ui.label(mono_text(
            format!("Aktif: {}", app.cache_stats.storage_dir),
            10.5,
            SIGNAL_CYAN,
        ));
        ui.add_space(4.0);
        ui.horizontal(|ui| {
            ui.add(
                egui::TextEdit::singleline(&mut app.draft_config.custom_data_dir)
                    .desired_width(250.0)
                    .hint_text("Default AppData / Portable"),
            );
            if slate_button(ui, "Pilih Folder").clicked() {
                if let Some(p) =
                    system_service::pick_folder_dialog(Some(&app.draft_config.custom_data_dir))
                {
                    app.draft_config.custom_data_dir = p;
                }
            }
            if slate_button(ui, "Buka Explorer").clicked() {
                system_service::open_in_system(&app.cache_stats.storage_dir);
            }
        });
    });

    ui.add_space(8.0);

    // Cache Limit & Usage Bar
    lcd_frame().show(ui, |ui| {
        ui.horizontal(|ui| {
            ui.label(bold_text(
                format!(
                    "Pemakaian Cache: {:.2} MB ({} file)",
                    app.cache_stats.total_size_mb, app.cache_stats.total_files
                ),
                12.0,
                TEXT_PRIMARY,
            ));
            ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                ui.label(mono_text(
                    if app.draft_config.max_cache_size_mb == 0 {
                        "Batas: Unlimited".to_string()
                    } else {
                        format!("Batas: {} MB", app.draft_config.max_cache_size_mb)
                    },
                    11.0,
                    AMBER_PRIMARY,
                ));
            });
        });

        let pct = (app.cache_stats.used_percent as f32 / 100.0).clamp(0.0, 1.0);
        ui.add(egui::ProgressBar::new(pct).show_percentage());
        ui.add_space(6.0);

        ui.horizontal_wrapped(|ui| {
            ui.label(semibold_text("Batas Maksimal:", 11.5, TEXT_SECONDARY));
            for (mb, lbl) in [
                (500u64, "500 MB"),
                (1024, "1 GB"),
                (2048, "2 GB"),
                (5120, "5 GB"),
                (10240, "10 GB"),
                (0, "Unlimited"),
            ] {
                let active = app.draft_config.max_cache_size_mb == mb;
                if ui
                    .selectable_label(active, lbl)
                    .clicked()
                {
                    app.draft_config.max_cache_size_mb = mb;
                }
            }
        });

        ui.checkbox(
            &mut app.draft_config.auto_cleanup_cache,
            semibold_text(
                "Hapus otomatis lagu paling jarang diputar (LRU) saat melebihi batas",
                11.5,
                TEXT_PRIMARY,
            ),
        );

        ui.add_space(6.0);
        ui.horizontal(|ui| {
            if slate_button(ui, "Pangkas Cache Sekarang").clicked() {
                app.send_cmd(AppCommand::TrimCache);
            }
            if danger_button(ui, "Hapus Semua Cache").clicked() {
                app.send_cmd(AppCommand::ClearCache);
            }
        });
    });

    if !app.cached_tracks_list.is_empty() {
        ui.add_space(8.0);
        ui.label(bold_text("Daftar File Cache Audio Studio", 12.0, TEXT_PRIMARY));
        egui::ScrollArea::vertical()
            .id_salt("settings_cached_files_scroll")
            .max_height(130.0)
            .show(ui, |ui| {
                for c in &app.cached_tracks_list {
                    if !c.is_cached {
                        continue;
                    }
                    ui.horizontal(|ui| {
                        ui.label(mono_text(format!("{:.1} MB", c.file_size_mb), 11.0, SIGNAL_CYAN));
                        ui.label(mono_text(format!("{}x", c.play_count), 11.0, AMBER_PRIMARY));
                        ui.label(semibold_text(
                            format!("{} - {}", c.artist, c.title),
                            11.5,
                            TEXT_PRIMARY,
                        ));
                    });
                }
            });
    }
}

fn render_casterhub_tab(ctx: &egui::Context, ui: &mut egui::Ui, app: &mut RadioCasterApp) {
    ui.label(bold_text("Integrasi CasterHub Cloud & Direktori Stasiun", 13.5, TEXT_PRIMARY));
    ui.add_space(6.0);

    lcd_frame().show(ui, |ui| {
        ui.label(semibold_text("ID Stasiun Anonim (Zero-PII Station Hash)", 11.5, TEXT_SECONDARY));
        ui.horizontal(|ui| {
            ui.label(mono_text(&app.station_hash, 10.5, SIGNAL_CYAN));
        });
        ui.add_space(4.0);
        ui.horizontal(|ui| {
            if slate_button(ui, "Salin Station ID").clicked() {
                ctx.copy_text(app.station_hash.clone());
                app.toasts.push(ToastItem::success("Station Hash disalin"));
            }
            if slate_button(ui, "Buka Halaman Publik Stasiun").clicked() {
                let base = app.draft_config.casterhub_url.trim_end_matches('/');
                system_service::open_in_system(&format!("{base}/station/{}", app.station_hash));
            }
            if amber_button(ui, "Sinkronkan Sekarang").clicked() {
                app.send_cmd(AppCommand::TriggerTelemetrySync);
            }
        });
    });

    ui.add_space(8.0);

    lcd_frame().show(ui, |ui| {
        ui.checkbox(
            &mut app.draft_config.enable_telemetry,
            semibold_text("Aktifkan Telemetri Anonim & Global Radio Charts", 12.0, TEXT_PRIMARY),
        );
        ui.checkbox(
            &mut app.draft_config.enable_online_requests,
            semibold_text("Izinkan Kotak Request Pendengar Online", 12.0, TEXT_PRIMARY),
        );
        ui.checkbox(
            &mut app.draft_config.enable_crowd_metadata,
            semibold_text("Gunakan Saran Metadata Crowd-Cleaned", 12.0, TEXT_PRIMARY),
        );

        ui.add_space(6.0);
        ui.label(semibold_text("Nama Stasiun Publik (Opsional)", 11.5, TEXT_SECONDARY));
        ui.add_sized(
            [ui.available_width(), 28.0],
            egui::TextEdit::singleline(&mut app.draft_config.station_public_name)
                .hint_text("Biarkan kosong untuk tampil sebagai Stasiun Anonim"),
        );

        ui.add_space(6.0);
        ui.label(semibold_text("URL Audio Stream Publik (Icecast / Shoutcast - Opsional)", 11.5, TEXT_SECONDARY));
        ui.add_sized(
            [ui.available_width(), 28.0],
            egui::TextEdit::singleline(&mut app.draft_config.public_stream_url)
                .hint_text("Contoh: https://stream.radioanda.id/live"),
        );

        ui.add_space(6.0);
        ui.label(semibold_text("URL Server CasterHub", 11.5, TEXT_SECONDARY));
        ui.add_sized(
            [ui.available_width(), 28.0],
            egui::TextEdit::singleline(&mut app.draft_config.casterhub_url),
        );
    });
}

fn render_system_tab(ui: &mut egui::Ui, app: &mut RadioCasterApp) {
    ui.label(bold_text("Informasi Sistem & Pembaruan Aplikasi", 13.5, TEXT_PRIMARY));
    ui.add_space(6.0);

    lcd_frame().show(ui, |ui| {
        ui.label(bold_text(
            format!("Radio Caster Bridge Studio (RCB Studio) v{APP_VERSION}"),
            13.0,
            AMBER_PRIMARY,
        ));
        ui.label(semibold_text(
            "Copyright © 2026 Radio Caster Bridge Studio • Tayen (hi.oktaa.my.id)",
            12.0,
            TEXT_PRIMARY,
        ));
        ui.add_space(6.0);

        ui.label(semibold_text("Port Server Stream Relay Lokal / LAN (Axum)", 11.5, TEXT_SECONDARY));
        let mut srv_port = app.draft_config.server_port.to_string();
        if ui
            .add_sized([120.0, 28.0], egui::TextEdit::singleline(&mut srv_port))
            .changed()
        {
            if let Ok(p) = srv_port.trim().parse::<u16>() {
                app.draft_config.server_port = p;
            }
        }
        ui.label(mono_text(
            "Memerlukan restart aplikasi jika port server relay diubah.",
            10.5,
            TEXT_MUTED,
        ));

        ui.add_space(10.0);
        ui.horizontal(|ui| {
            if amber_button(ui, "Cek Pembaruan Aplikasi").clicked() {
                app.send_cmd(AppCommand::CheckForUpdates { manual: true });
                app.is_update_open = true;
            }
            if danger_button(ui, "Reset Pengaturan Default").clicked() {
                app.draft_config = AppConfig::default();
            }
        });
    });
}
