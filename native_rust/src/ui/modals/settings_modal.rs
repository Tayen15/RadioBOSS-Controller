use eframe::egui::{self, Color32, CornerRadius, Frame, Margin, Stroke};

use crate::app::{RadioCasterApp, SettingsTab};
use crate::events::AppCommand;
use crate::models::config::{AppConfig, TitleFormatMode};
use crate::models::APP_VERSION;
use crate::services::system_service;
use crate::ui::theme::{
    amber_button, bold_text, danger_button, list_row_frame, mono_text, semibold_text,
    setting_group_frame, slate_button, split_dialog_frame, status_pill, studio_toggle,
    window_close_x, AMBER_PRIMARY, SIGNAL_CYAN, STATUS_ERROR, STATUS_SUCCESS, TEXT_MUTED,
    TEXT_PRIMARY, TEXT_SECONDARY,
};
use crate::ui::toast::ToastItem;

pub fn render_settings_modal(ctx: &egui::Context, app: &mut RadioCasterApp) {
    if !app.is_settings_open {
        return;
    }

    if ctx.input(|i| i.key_pressed(egui::Key::Escape)) {
        app.is_settings_open = false;
        return;
    }

    let mut is_open = app.is_settings_open;
    egui::Window::new("Pengaturan")
        .id(egui::Id::unique("rcb_settings_dialog_v2"))
        .open(&mut is_open)
        .title_bar(false)
        .collapsible(false)
        .resizable(false)
        .movable(true)
        .frame(split_dialog_frame())
        .fixed_size(egui::vec2(760.0, 560.0))
        .show(ctx, |ui| {
            let total_h = 560.0_f32;
            ui.horizontal_top(|ui| {
                ui.spacing_mut().item_spacing.x = 0.0;

                // Left Recessed Sidebar (#121216)
                Frame::NONE
                    .fill(Color32::from_rgb(16, 16, 20))
                    .stroke(Stroke::new(1.0, Color32::from_rgb(36, 36, 44)))
                    .corner_radius(CornerRadius {
                        nw: 12,
                        sw: 12,
                        ne: 0,
                        se: 0,
                    })
                    .inner_margin(Margin::symmetric(12, 14))
                    .show(ui, |ui| {
                        ui.set_width(176.0);
                        ui.set_min_height(total_h - 28.0);

                        ui.add_space(6.0);

                        let tabs = [
                            (SettingsTab::Connection, "Koneksi RadioBOSS"),
                            (SettingsTab::Broadcast, "Format & Audio"),
                            (SettingsTab::Storage, "Penyimpanan & Disk"),
                            (SettingsTab::CasterHub, "CasterHub Cloud"),
                            (SettingsTab::System, "Sistem & Info"),
                        ];

                        for (t, label) in tabs {
                            let active = app.settings_tab == t;
                            let fill = if active {
                                Color32::from_rgb(38, 38, 46)
                            } else {
                                Color32::TRANSPARENT
                            };
                            let text_col = if active { TEXT_PRIMARY } else { TEXT_SECONDARY };
                            let resp = ui
                                .add_sized(
                                    [174.0, 34.0],
                                    egui::Button::new(semibold_text(label, 12.5, text_col))
                                        .fill(fill)
                                        .stroke(Stroke::NONE)
                                        .corner_radius(CornerRadius::same(8)),
                                )
                                .on_hover_cursor(egui::CursorIcon::PointingHand);
                            if resp.clicked() {
                                app.settings_tab = t;
                                if t == SettingsTab::Storage {
                                    app.send_cmd(AppCommand::RefreshCacheStats);
                                }
                            }
                            ui.add_space(3.0);
                        }
                    });

                // Right Content Pane
                Frame::NONE
                    .fill(Color32::TRANSPARENT)
                    .inner_margin(Margin::symmetric(22, 18))
                    .show(ui, |ui| {
                        let pane_w = 516.0_f32;
                        ui.set_width(pane_w);
                        ui.set_min_height(total_h - 36.0);

                        // Section Title matching active tab
                        let heading = match app.settings_tab {
                            SettingsTab::Connection => "Koneksi RadioBOSS",
                            SettingsTab::Broadcast => "Format & Audio",
                            SettingsTab::Storage => "Penyimpanan & Disk",
                            SettingsTab::CasterHub => "CasterHub Cloud",
                            SettingsTab::System => "Sistem & Info",
                        };
                        ui.allocate_ui_with_layout(
                            egui::vec2(pane_w, 28.0),
                            egui::Layout::left_to_right(egui::Align::Center),
                            |ui| {
                                ui.label(bold_text(heading, 18.0, TEXT_PRIMARY));
                                ui.with_layout(
                                    egui::Layout::right_to_left(egui::Align::Center),
                                    |ui| {
                                        if window_close_x(ui) {
                                            app.is_settings_open = false;
                                        }
                                    },
                                );
                            },
                        );
                        ui.add_space(12.0);

                        egui::ScrollArea::vertical()
                            .id_salt("settings_content_scroll")
                            .max_height(430.0)
                            .show(ui, |ui| {
                                ui.set_width(pane_w);
                                match app.settings_tab {
                                    SettingsTab::Connection => render_connection_tab(ui, app),
                                    SettingsTab::Broadcast => render_broadcast_tab(ui, app),
                                    SettingsTab::Storage => render_storage_tab(ui, app),
                                    SettingsTab::CasterHub => render_casterhub_tab(ctx, ui, app),
                                    SettingsTab::System => render_system_tab(ui, app),
                                }
                            });

                        ui.add_space(10.0);
                        ui.allocate_ui_with_layout(
                            egui::vec2(pane_w, 32.0),
                            egui::Layout::right_to_left(egui::Align::Center),
                            |ui| {
                                if amber_button(ui, "Simpan Pengaturan").clicked() {
                                    let cfg = app.draft_config.clone();
                                    app.send_cmd(AppCommand::SaveSettings(cfg));
                                    app.is_settings_open = false;
                                }
                                if slate_button(ui, "Batal").clicked() {
                                    app.is_settings_open = false;
                                }
                            },
                        );
                    });
            });
        });

    if !is_open {
        app.is_settings_open = false;
    }
}

fn section_label(ui: &mut egui::Ui, text: &str) {
    ui.label(semibold_text(text, 11.5, TEXT_MUTED));
    ui.add_space(4.0);
}

fn toggle_row(
    ui: &mut egui::Ui,
    title: &str,
    subtitle: &str,
    value: &mut bool,
) {
    ui.horizontal(|ui| {
        ui.vertical(|ui| {
            ui.spacing_mut().item_spacing.y = 1.0;
            ui.set_max_width((ui.available_width() - 56.0).max(180.0));
            ui.label(semibold_text(title, 12.5, TEXT_PRIMARY));
            if !subtitle.is_empty() {
                ui.label(semibold_text(subtitle, 11.0, TEXT_SECONDARY));
            }
        });
        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
            studio_toggle(ui, value);
        });
    });
}

fn render_connection_tab(ui: &mut egui::Ui, app: &mut RadioCasterApp) {
    section_label(ui, "Server Web Remote API");
    setting_group_frame().show(ui, |ui| {
        ui.label(semibold_text("Host / IP Address", 11.5, TEXT_SECONDARY));
        ui.add_sized(
            [ui.available_width(), 30.0],
            egui::TextEdit::singleline(&mut app.draft_config.radioboss_host),
        );
        ui.add_space(8.0);

        ui.horizontal(|ui| {
            ui.vertical(|ui| {
                ui.label(semibold_text("Port", 11.5, TEXT_SECONDARY));
                let mut port_str = app.draft_config.radioboss_port.to_string();
                if ui
                    .add_sized([110.0, 30.0], egui::TextEdit::singleline(&mut port_str))
                    .changed()
                {
                    if let Ok(p) = port_str.trim().parse::<u16>() {
                        app.draft_config.radioboss_port = p;
                    }
                }
            });
            ui.add_space(12.0);
            ui.vertical(|ui| {
                ui.label(semibold_text("Password Remote Control", 11.5, TEXT_SECONDARY));
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
            if amber_button(ui, "Tes Koneksi Live").clicked() {
                let test_cfg = app.draft_config.clone();
                app.send_cmd(AppCommand::PingRadioBoss(test_cfg));
            }
            if let Some((ok, ref msg)) = app.ping_result {
                status_pill(
                    ui,
                    if ok { "Terhubung" } else { "Gagal" },
                    if ok { STATUS_SUCCESS } else { STATUS_ERROR },
                );
                ui.label(semibold_text(msg, 11.5, TEXT_PRIMARY));
            }
        });
    });

    ui.add_space(12.0);
    section_label(ui, "Target Tab Playlist");
    setting_group_frame().show(ui, |ui| {
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
    if let Some(ref specs) = app.system_specs.clone() {
        section_label(ui, "Rekomendasi Perangkat");
        setting_group_frame().show(ui, |ui| {
            ui.horizontal(|ui| {
                status_pill(
                    ui,
                    if specs.is_low_spec {
                        "Low-Spec"
                    } else {
                        "Studio High"
                    },
                    if specs.is_low_spec {
                        AMBER_PRIMARY
                    } else {
                        STATUS_SUCCESS
                    },
                );
                ui.label(mono_text(
                    format!("{} • {} Core • {:.1} GB RAM", specs.os_name, specs.cpu_cores, specs.ram_gb),
                    11.0,
                    TEXT_SECONDARY,
                ));
            });
            ui.add_space(4.0);
            ui.label(semibold_text(&specs.reason, 11.5, TEXT_PRIMARY));
            ui.add_space(6.0);
            if slate_button(ui, "Terapkan Preset Rekomendasi").clicked() {
                app.draft_config.enable_loudnorm = specs.recommended_loudnorm;
                app.draft_config.audio_quality = specs.recommended_bitrate.clone();
            }
        });
        ui.add_space(12.0);
    }

    section_label(ui, "Kualitas & Normalisasi Audio");
    setting_group_frame().show(ui, |ui| {
        ui.label(semibold_text("Bitrate Transcode MP3", 12.5, TEXT_PRIMARY));
        ui.label(semibold_text(
            "Menentukan kualitas audio saat menyimpan cache atau merelai stream",
            11.0,
            TEXT_SECONDARY,
        ));
        ui.add_space(6.0);

        // Segmented pill strip matching reference image
        Frame::NONE
            .fill(Color32::from_rgb(18, 18, 22))
            .corner_radius(CornerRadius::same(7))
            .inner_margin(Margin::same(3))
            .show(ui, |ui| {
                let bitrates = [
                    ("320k", "320 kbps"),
                    ("256k", "256 kbps"),
                    ("192k", "192 kbps"),
                    ("128k", "128 kbps"),
                ];
                let seg_w = ((ui.available_width() - 12.0) / 4.0).max(70.0);
                ui.horizontal(|ui| {
                    for (val, lbl) in bitrates {
                        let active = app.draft_config.audio_quality == val;
                        if ui
                            .add_sized(
                                [seg_w, 26.0],
                                egui::Button::new(semibold_text(
                                    lbl,
                                    11.5,
                                    if active { TEXT_PRIMARY } else { TEXT_SECONDARY },
                                ))
                                .fill(if active {
                                    Color32::from_rgb(56, 56, 66)
                                } else {
                                    Color32::TRANSPARENT
                                })
                                .stroke(Stroke::NONE)
                                .corner_radius(CornerRadius::same(5)),
                            )
                            .clicked()
                        {
                            app.draft_config.audio_quality = val.to_string();
                        }
                    }
                });
            });

        ui.add_space(10.0);
        toggle_row(
            ui,
            "Normalisasi Volume EBU R128 (-14 LUFS)",
            "Menjaga level kekerasan audio tetap seragam antar lagu",
            &mut app.draft_config.enable_loudnorm,
        );
    });

    ui.add_space(12.0);
    section_label(ui, "Format Judul Siaran");
    setting_group_frame().show(ui, |ui| {
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
                .radio(active, format!("{} — {}", m.label(), m.example()))
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
    section_label(ui, "Lokasi Penyimpanan");
    setting_group_frame().show(ui, |ui| {
        ui.label(semibold_text("Folder Cache Audio MP3", 12.0, TEXT_PRIMARY));
        ui.label(mono_text(&app.cache_stats.cache_dir, 10.5, SIGNAL_CYAN));
        ui.add_space(4.0);
        ui.horizontal(|ui| {
            ui.add(
                egui::TextEdit::singleline(&mut app.draft_config.custom_cache_dir)
                    .desired_width(250.0)
                    .hint_text("Default AppData / Portable"),
            );
            if slate_button(ui, "Pilih").clicked() {
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

        ui.add_space(10.0);
        ui.label(semibold_text("Folder Database SQLite", 12.0, TEXT_PRIMARY));
        ui.label(mono_text(&app.cache_stats.storage_dir, 10.5, SIGNAL_CYAN));
        ui.add_space(4.0);
        ui.horizontal(|ui| {
            ui.add(
                egui::TextEdit::singleline(&mut app.draft_config.custom_data_dir)
                    .desired_width(250.0)
                    .hint_text("Default AppData / Portable"),
            );
            if slate_button(ui, "Pilih").clicked() {
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

    ui.add_space(12.0);
    section_label(ui, "Kuota & Pembersihan Otomatis");
    setting_group_frame().show(ui, |ui| {
        ui.horizontal(|ui| {
            ui.label(semibold_text(
                format!(
                    "Terpakai {:.2} MB ({} file)",
                    app.cache_stats.total_size_mb, app.cache_stats.total_files
                ),
                12.5,
                TEXT_PRIMARY,
            ));
            ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                ui.label(mono_text(
                    if app.draft_config.max_cache_size_mb == 0 {
                        "Tanpa Batas".to_string()
                    } else {
                        format!("Maks {} MB", app.draft_config.max_cache_size_mb)
                    },
                    11.0,
                    AMBER_PRIMARY,
                ));
            });
        });

        let pct = (app.cache_stats.used_percent as f32 / 100.0).clamp(0.0, 1.0);
        ui.add(egui::ProgressBar::new(pct).show_percentage());
        ui.add_space(8.0);

        Frame::NONE
            .fill(Color32::from_rgb(18, 18, 22))
            .corner_radius(CornerRadius::same(7))
            .inner_margin(Margin::same(3))
            .show(ui, |ui| {
                let limits = [
                    (500u64, "500 MB"),
                    (1024, "1 GB"),
                    (2048, "2 GB"),
                    (5120, "5 GB"),
                    (10240, "10 GB"),
                    (0, "Tanpa Batas"),
                ];
                let seg_w = ((ui.available_width() - 18.0) / 6.0).max(54.0);
                ui.horizontal(|ui| {
                    for (mb, lbl) in limits {
                        let active = app.draft_config.max_cache_size_mb == mb;
                        if ui
                            .add_sized(
                                [seg_w, 24.0],
                                egui::Button::new(semibold_text(
                                    lbl,
                                    11.0,
                                    if active { TEXT_PRIMARY } else { TEXT_SECONDARY },
                                ))
                                .fill(if active {
                                    Color32::from_rgb(56, 56, 66)
                                } else {
                                    Color32::TRANSPARENT
                                })
                                .stroke(Stroke::NONE)
                                .corner_radius(CornerRadius::same(5)),
                            )
                            .clicked()
                        {
                            app.draft_config.max_cache_size_mb = mb;
                        }
                    }
                });
            });

        ui.add_space(10.0);
        toggle_row(
            ui,
            "Hapus otomatis lagu paling jarang diputar",
            "Berjalan otomatis saat kapasitas cache melebihi batas maksimal",
            &mut app.draft_config.auto_cleanup_cache,
        );

        ui.add_space(8.0);
        ui.horizontal(|ui| {
            if slate_button(ui, "Pangkas Cache").clicked() {
                app.send_cmd(AppCommand::TrimCache);
            }
            if danger_button(ui, "Hapus Semua Cache").clicked() {
                app.send_cmd(AppCommand::ClearCache);
            }
        });
    });

    let cached_only: Vec<_> = app
        .cached_tracks_list
        .iter()
        .filter(|c| c.is_cached)
        .cloned()
        .collect();

    if !cached_only.is_empty() {
        ui.add_space(12.0);
        section_label(ui, "Lagu Tersimpan di Disk");
        setting_group_frame().show(ui, |ui| {
            ui.horizontal(|ui| {
                ui.label(semibold_text(
                    "Diputar instan tanpa mengunduh ulang.",
                    11.5,
                    TEXT_SECONDARY,
                ));
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    status_pill(
                        ui,
                        &format!(
                            "{} file • {:.1} MB",
                            cached_only.len(),
                            app.cache_stats.total_size_mb
                        ),
                        SIGNAL_CYAN,
                    );
                });
            });
            ui.add_space(6.0);

            for c in cached_only {
                list_row_frame(false).show(ui, |ui| {
                    ui.horizontal(|ui| {
                        ui.vertical(|ui| {
                            ui.spacing_mut().item_spacing.y = 1.0;
                            ui.set_max_width((ui.available_width() - 185.0).max(120.0));
                            ui.add(
                                egui::Label::new(semibold_text(&c.title, 12.0, TEXT_PRIMARY))
                                    .truncate(),
                            );
                            ui.add(
                                egui::Label::new(semibold_text(&c.artist, 11.0, TEXT_SECONDARY))
                                    .truncate(),
                            );
                        });
                        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                            if danger_button(ui, "Hapus").clicked() {
                                app.send_cmd(AppCommand::DeleteCachedFile(c.video_id.clone()));
                            }
                            ui.label(mono_text(
                                format!("{:.1} MB", c.file_size_mb),
                                11.0,
                                SIGNAL_CYAN,
                            ));
                            ui.label(mono_text(
                                format!("{}x putar", c.play_count),
                                11.0,
                                AMBER_PRIMARY,
                            ));
                        });
                    });
                });
                ui.add_space(3.0);
            }
        });
    }
}

fn render_casterhub_tab(ctx: &egui::Context, ui: &mut egui::Ui, app: &mut RadioCasterApp) {
    section_label(ui, "Identitas Stasiun");
    setting_group_frame().show(ui, |ui| {
        ui.label(semibold_text("Station ID (Zero-PII)", 11.5, TEXT_SECONDARY));
        ui.label(mono_text(&app.station_hash, 10.5, SIGNAL_CYAN));
        ui.add_space(6.0);
        ui.horizontal(|ui| {
            if slate_button(ui, "Salin ID").clicked() {
                ctx.copy_text(app.station_hash.clone());
                app.toasts.push(ToastItem::success("Station ID disalin"));
            }
            if slate_button(ui, "Buka Halaman Stasiun").clicked() {
                let base = app.draft_config.casterhub_url.trim_end_matches('/');
                system_service::open_in_system(&format!("{base}/station/{}", app.station_hash));
            }
            if amber_button(ui, "Sinkronkan").clicked() {
                app.send_cmd(AppCommand::TriggerTelemetrySync);
            }
        });
    });

    ui.add_space(12.0);
    section_label(ui, "Telemetri & Fitur Online");
    setting_group_frame().show(ui, |ui| {
        toggle_row(
            ui,
            "Telemetri Anonim & Global Charts",
            "Berbagi statistik pemutaran lagu secara anonim ke CasterHub",
            &mut app.draft_config.enable_telemetry,
        );
        ui.add_space(8.0);
        toggle_row(
            ui,
            "Kotak Request Pendengar Online",
            "Pendengar dapat mengirim request lagu melalui halaman publik stasiun",
            &mut app.draft_config.enable_online_requests,
        );
        ui.add_space(8.0);
        toggle_row(
            ui,
            "Saran Metadata Crowd-Cleaned",
            "Menggunakan judul bersih hasil kurasi komunitas CasterHub",
            &mut app.draft_config.enable_crowd_metadata,
        );
    });

    ui.add_space(12.0);
    section_label(ui, "Profil Publik & Server");
    setting_group_frame().show(ui, |ui| {
        ui.label(semibold_text("Nama Stasiun Publik (Opsional)", 11.5, TEXT_SECONDARY));
        ui.add_sized(
            [ui.available_width(), 28.0],
            egui::TextEdit::singleline(&mut app.draft_config.station_public_name)
                .hint_text("Kosongkan untuk tampil sebagai Stasiun Anonim"),
        );

        ui.add_space(6.0);
        ui.label(semibold_text("URL Audio Stream Publik (Opsional)", 11.5, TEXT_SECONDARY));
        ui.add_sized(
            [ui.available_width(), 28.0],
            egui::TextEdit::singleline(&mut app.draft_config.public_stream_url)
                .hint_text("https://stream.radioanda.id/live"),
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
    section_label(ui, "Tentang Aplikasi");
    setting_group_frame().show(ui, |ui| {
        ui.label(bold_text(
            format!("Radio Caster Bridge Studio (RCB Studio) v{APP_VERSION}"),
            13.5,
            AMBER_PRIMARY,
        ));
        ui.label(semibold_text(
            "Copyright © 2026 Radio Caster Bridge Studio • Tayen (hi.oktaa.my.id)",
            11.5,
            TEXT_SECONDARY,
        ));
    });

    ui.add_space(12.0);
    section_label(ui, "Jaringan & Pembaruan");
    setting_group_frame().show(ui, |ui| {
        ui.label(semibold_text("Port Stream Relay Lokal / LAN", 12.0, TEXT_PRIMARY));
        ui.label(semibold_text(
            "Memerlukan restart aplikasi jika nomor port diubah",
            11.0,
            TEXT_SECONDARY,
        ));
        ui.add_space(4.0);
        let mut srv_port = app.draft_config.server_port.to_string();
        if ui
            .add_sized([110.0, 28.0], egui::TextEdit::singleline(&mut srv_port))
            .changed()
        {
            if let Ok(p) = srv_port.trim().parse::<u16>() {
                app.draft_config.server_port = p;
            }
        }

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
