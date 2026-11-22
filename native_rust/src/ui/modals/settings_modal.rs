use eframe::egui::{self, Color32, CornerRadius, Frame, Margin, Stroke};

use crate::app::{RadioCasterApp, SettingsTab};
use crate::events::AppCommand;
use crate::models::config::{AppConfig, TitleFormatMode};
use crate::models::system::UpdateDownloadState;
use crate::models::APP_VERSION;
use crate::services::system_service;
use crate::ui::theme::{
    amber_button, animated_segment_tab, bold_text, copy_feedback_button, danger_button, lerp_color,
    list_row_frame, mono_text, semibold_text, setting_group_frame, slate_button,
    split_dialog_frame, status_pill, studio_toggle, window_close_x, AMBER_PRIMARY, SIGNAL_CYAN,
    STATUS_ERROR, STATUS_SUCCESS, TEXT_MUTED, TEXT_PRIMARY, TEXT_SECONDARY,
};

pub fn render_settings_modal(ctx: &egui::Context, app: &mut RadioCasterApp) {
    let just_opened_id = egui::Id::unique("rcb_settings_just_opened");
    if !app.is_settings_open {
        ctx.data_mut(|d| d.insert_temp(just_opened_id, false));
        return;
    }

    if ctx.input(|i| i.key_pressed(egui::Key::Escape)) {
        app.is_settings_open = false;
        ctx.data_mut(|d| d.insert_temp(just_opened_id, false));
        return;
    }

    let was_open = ctx.data(|d| d.get_temp::<bool>(just_opened_id).unwrap_or(false));
    let mut is_open = app.is_settings_open;
    let mut win = egui::Window::new("Pengaturan")
        .id(egui::Id::unique("rcb_settings_dialog_v2"))
        .open(&mut is_open)
        .title_bar(false)
        .collapsible(false)
        .resizable(false)
        .movable(true)
        .frame(split_dialog_frame())
        .fixed_size(egui::vec2(760.0, 560.0));

    if !was_open {
        let center = ctx.content_rect().center() - egui::vec2(380.0, 280.0);
        win = win.current_pos(center);
        ctx.data_mut(|d| d.insert_temp(just_opened_id, true));
    }

    win.show(ctx, |ui| {
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
                        ui.vertical(|ui| {
                            ui.spacing_mut().item_spacing.x = 8.0;
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
                                if sidebar_tab_button(ui, t, label, active).clicked() {
                                    app.settings_tab = t;
                                    if t == SettingsTab::Storage {
                                        app.send_cmd(AppCommand::RefreshCacheStats);
                                    }
                                }
                                ui.add_space(3.0);
                            }
                        });
                    });

                // Right Content Pane
                Frame::NONE
                    .fill(Color32::TRANSPARENT)
                    .inner_margin(Margin::symmetric(22, 18))
                    .show(ui, |ui| {
                        ui.vertical(|ui| {
                            ui.spacing_mut().item_spacing.x = 8.0;
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

                            let prev_cfg = app.draft_config.clone();

                            egui::ScrollArea::vertical()
                                .id_salt("settings_content_scroll")
                                .max_height(472.0)
                                .show(ui, |ui| {
                                    ui.set_width(pane_w);
                                    match app.settings_tab {
                                        SettingsTab::Connection => render_connection_tab(ui, app),
                                        SettingsTab::Broadcast => render_broadcast_tab(ui, app),
                                        SettingsTab::Storage => render_storage_tab(ui, app),
                                        SettingsTab::CasterHub => {
                                            render_casterhub_tab(ctx, ui, app)
                                        }
                                        SettingsTab::System => render_system_tab(ui, app),
                                    }
                                });

                            let pending_id = egui::Id::unique("rcb_settings_autosave_pending");
                            let changed = app.draft_config != prev_cfg;
                            let typing = ctx.egui_wants_keyboard_input();

                            if changed {
                                if !typing {
                                    app.config = app.draft_config.clone();
                                    app.send_cmd(AppCommand::SaveSettings(app.draft_config.clone()));
                                    ctx.data_mut(|d| {
                                        d.remove::<std::time::Instant>(pending_id);
                                    });
                                } else {
                                    ctx.data_mut(|d| {
                                        d.insert_temp(pending_id, std::time::Instant::now());
                                    });
                                }
                            } else if let Some(at) =
                                ctx.data(|d| d.get_temp::<std::time::Instant>(pending_id))
                            {
                                if !typing || at.elapsed().as_millis() >= 450 {
                                    app.config = app.draft_config.clone();
                                    app.send_cmd(AppCommand::SaveSettings(app.draft_config.clone()));
                                    ctx.data_mut(|d| {
                                        d.remove::<std::time::Instant>(pending_id);
                                    });
                                } else {
                                    ctx.request_repaint_after(std::time::Duration::from_millis(120));
                                }
                            }
                        });
                    });
            });
        });

    if !is_open {
        app.is_settings_open = false;
    }
    if !app.is_settings_open {
        let pending_id = egui::Id::unique("rcb_settings_autosave_pending");
        if ctx
            .data(|d| d.get_temp::<std::time::Instant>(pending_id))
            .is_some()
        {
            app.config = app.draft_config.clone();
            app.send_cmd(AppCommand::SaveSettings(app.draft_config.clone()));
            ctx.data_mut(|d| {
                d.remove::<std::time::Instant>(pending_id);
            });
        }
        ctx.data_mut(|d| d.insert_temp(just_opened_id, false));
    }
}

fn sidebar_tab_button(
    ui: &mut egui::Ui,
    tab: SettingsTab,
    label: &str,
    active: bool,
) -> egui::Response {
    let (rect, resp) = ui.allocate_exact_size(egui::vec2(174.0, 34.0), egui::Sense::click());
    let resp = resp.on_hover_cursor(egui::CursorIcon::PointingHand);

    let act_t = ui
        .ctx()
        .animate_bool_responsive(resp.id.with("sb_act"), active);
    let hov_t = ui
        .ctx()
        .animate_bool_responsive(resp.id.with("sb_hov"), resp.hovered() && !active);

    let hover_bg = lerp_color(Color32::TRANSPARENT, Color32::from_rgb(26, 26, 32), hov_t);
    let fill = lerp_color(hover_bg, Color32::from_rgb(38, 38, 46), act_t);
    if fill.a() > 0 {
        ui.painter()
            .rect_filled(rect, CornerRadius::same(8), fill);
    }

    if act_t > 0.02 {
        let bar_h = 16.0 * act_t;
        let bar_rect = egui::Rect::from_center_size(
            egui::pos2(rect.left() + 2.5, rect.center().y),
            egui::vec2(3.0, bar_h),
        );
        ui.painter().rect_filled(
            bar_rect,
            CornerRadius::same(2),
            lerp_color(Color32::TRANSPARENT, AMBER_PRIMARY, act_t),
        );
    }

    let col = lerp_color(
        lerp_color(TEXT_SECONDARY, TEXT_PRIMARY, hov_t),
        TEXT_PRIMARY,
        act_t,
    );
    let icon_c = rect.left_center() + egui::vec2(16.0, 0.0);
    let stroke = Stroke::new(1.4, col);
    let p = ui.painter();
    match tab {
        SettingsTab::Connection => {
            p.circle_filled(icon_c, 2.0, col);
            p.circle_stroke(icon_c, 5.5, stroke);
        }
        SettingsTab::Broadcast => {
            p.rect_filled(
                egui::Rect::from_center_size(icon_c + egui::vec2(-4.0, 1.5), egui::vec2(2.0, 7.0)),
                CornerRadius::same(1),
                col,
            );
            p.rect_filled(
                egui::Rect::from_center_size(icon_c, egui::vec2(2.0, 11.0)),
                CornerRadius::same(1),
                col,
            );
            p.rect_filled(
                egui::Rect::from_center_size(icon_c + egui::vec2(4.0, 2.5), egui::vec2(2.0, 5.0)),
                CornerRadius::same(1),
                col,
            );
        }
        SettingsTab::Storage => {
            let box_r = egui::Rect::from_center_size(icon_c, egui::vec2(12.0, 9.0));
            p.rect_stroke(box_r, CornerRadius::same(2), stroke, egui::StrokeKind::Inside);
            p.line_segment(
                [
                    egui::pos2(box_r.left() + 2.0, box_r.center().y),
                    egui::pos2(box_r.right() - 2.0, box_r.center().y),
                ],
                stroke,
            );
        }
        SettingsTab::CasterHub => {
            p.circle_stroke(icon_c, 5.5, stroke);
            p.line_segment(
                [icon_c - egui::vec2(5.0, 0.0), icon_c + egui::vec2(5.0, 0.0)],
                stroke,
            );
            p.line_segment(
                [icon_c - egui::vec2(0.0, 5.0), icon_c + egui::vec2(0.0, 5.0)],
                stroke,
            );
        }
        SettingsTab::System => {
            p.circle_stroke(icon_c, 5.5, stroke);
            p.circle_filled(icon_c + egui::vec2(0.0, -2.5), 1.0, col);
            p.line_segment(
                [icon_c + egui::vec2(0.0, -0.5), icon_c + egui::vec2(0.0, 3.0)],
                stroke,
            );
        }
    }

    p.text(
        rect.left_center() + egui::vec2(30.0, 0.0),
        egui::Align2::LEFT_CENTER,
        label,
        egui::FontId::proportional(12.5),
        col,
    );
    resp
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
                ui.add_space(4.0);
                ui.add(
                    egui::Label::new(mono_text(
                        format!(
                            "{} Core • {:.1} GB RAM • {}",
                            specs.cpu_cores, specs.ram_gb, specs.os_name
                        ),
                        11.0,
                        TEXT_SECONDARY,
                    ))
                    .truncate(),
                );
            });
            ui.add_space(6.0);
            ui.label(semibold_text(&specs.reason, 11.5, TEXT_PRIMARY));
            ui.add_space(8.0);
            ui.horizontal(|ui| {
                if slate_button(ui, "Terapkan Preset Rekomendasi").clicked() {
                    app.draft_config.enable_loudnorm = specs.recommended_loudnorm;
                    app.draft_config.audio_quality = specs.recommended_bitrate.clone();
                }
                ui.label(mono_text(
                    format!(
                        "{} • {}",
                        specs.recommended_bitrate,
                        if specs.recommended_loudnorm {
                            "Loudnorm ON"
                        } else {
                            "Loudnorm OFF"
                        }
                    ),
                    11.0,
                    TEXT_MUTED,
                ));
            });
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
                        if animated_segment_tab(
                            ui,
                            egui::vec2(seg_w, 26.0),
                            lbl,
                            active,
                            false,
                            5,
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
                        if animated_segment_tab(
                            ui,
                            egui::vec2(seg_w, 24.0),
                            lbl,
                            active,
                            false,
                            5,
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
            let filter_id = egui::Id::unique("rcb_cache_filter_query");
            let mut filter_query = ui
                .ctx()
                .data(|d| d.get_temp::<String>(filter_id).unwrap_or_default());
            ui.horizontal(|ui| {
                ui.add_sized(
                    [(ui.available_width() - if filter_query.is_empty() { 0.0 } else { 64.0 }).max(180.0), 28.0],
                    egui::TextEdit::singleline(&mut filter_query)
                        .hint_text("Cari judul atau artis di cache..."),
                );
                if !filter_query.is_empty() && slate_button(ui, "Reset").clicked() {
                    filter_query.clear();
                }
            });
            ui.ctx().data_mut(|d| d.insert_temp(filter_id, filter_query.clone()));
            ui.add_space(6.0);

            let q_lower = filter_query.trim().to_lowercase();
            let filtered: Vec<_> = cached_only
                .iter()
                .filter(|c| {
                    q_lower.is_empty()
                        || c.title.to_lowercase().contains(&q_lower)
                        || c.artist.to_lowercase().contains(&q_lower)
                })
                .collect();

            if filtered.is_empty() {
                ui.label(semibold_text(
                    "Tidak ada lagu cache yang cocok dengan pencarian.",
                    11.5,
                    TEXT_MUTED,
                ));
            } else {
                egui::ScrollArea::vertical()
                    .id_salt("cached_files_inner_scroll")
                    .max_height(210.0)
                    .show(ui, |ui| {
                        for c in filtered {
                            list_row_frame(false).show(ui, |ui| {
                                ui.horizontal(|ui| {
                                    ui.vertical(|ui| {
                                        ui.spacing_mut().item_spacing.y = 1.0;
                                        ui.set_max_width((ui.available_width() - 195.0).max(120.0));
                                        ui.add(
                                            egui::Label::new(semibold_text(&c.title, 12.0, TEXT_PRIMARY))
                                                .truncate(),
                                        );
                                        ui.add(
                                            egui::Label::new(semibold_text(
                                                &c.artist,
                                                11.0,
                                                TEXT_SECONDARY,
                                            ))
                                            .truncate(),
                                        );
                                    });
                                    ui.with_layout(
                                        egui::Layout::right_to_left(egui::Align::Center),
                                        |ui| {
                                            ui.spacing_mut().item_spacing.x = 8.0;
                                            if danger_button(ui, "Hapus").clicked() {
                                                app.send_cmd(AppCommand::DeleteCachedFile(
                                                    c.video_id.clone(),
                                                ));
                                            }
                                            ui.label(mono_text(
                                                format!("{:.1} MB", c.file_size_mb),
                                                11.0,
                                                SIGNAL_CYAN,
                                            ));
                                            ui.label(mono_text(
                                                format!("{}x", c.play_count),
                                                11.0,
                                                AMBER_PRIMARY,
                                            ));
                                        },
                                    );
                                });
                            });
                            ui.add_space(3.0);
                        }
                    });
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
            if copy_feedback_button(ui, "copy_station_id_btn", "Salin ID", "Tersalin!") {
                ctx.copy_text(app.station_hash.clone());
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
        ui.horizontal(|ui| {
            if let Some(ref tex) = app.logo_texture {
                ui.add(
                    egui::Image::new(tex)
                        .fit_to_exact_size(egui::vec2(38.0, 38.0))
                        .corner_radius(CornerRadius::same(8)),
                );
            }
            ui.vertical(|ui| {
                ui.spacing_mut().item_spacing.y = 2.0;
                ui.horizontal(|ui| {
                    ui.label(bold_text("CastDeck", 14.0, TEXT_PRIMARY));
                    status_pill(ui, &format!("v{APP_VERSION}"), AMBER_PRIMARY);
                });
                ui.label(semibold_text(
                    "Copyright © 2026 CastDeck • Tayen",
                    11.5,
                    TEXT_SECONDARY,
                ));
            });
            ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                match app.update_dl_status.state {
                    UpdateDownloadState::Downloaded => {
                        status_pill(ui, "Siap Restart", STATUS_SUCCESS);
                    }
                    UpdateDownloadState::Downloading => {
                        status_pill(
                            ui,
                            &format!(
                                "Mengunduh {:.0}%",
                                (app.update_dl_status.progress * 100.0).clamp(0.0, 100.0)
                            ),
                            SIGNAL_CYAN,
                        );
                    }
                    _ => {
                        if let Some(ref upd) = app.update_check {
                            if upd.update_available {
                                status_pill(ui, &format!("v{} Tersedia", upd.latest_version), AMBER_PRIMARY);
                            } else if upd.error.is_none() {
                                status_pill(ui, "Versi Terbaru", STATUS_SUCCESS);
                            }
                        }
                    }
                }
            });
        });

        if app.update_dl_status.state == UpdateDownloadState::Downloading {
            ui.add_space(8.0);
            let pct = app.update_dl_status.progress.clamp(0.0, 1.0);
            ui.add(egui::ProgressBar::new(pct).show_percentage());
        }

        ui.add_space(8.0);
        ui.separator();
        ui.add_space(6.0);
        ui.horizontal(|ui| {
            if ui
                .link(semibold_text("hi.oktaa.my.id", 11.5, SIGNAL_CYAN))
                .clicked()
            {
                system_service::open_in_system("https://hi.oktaa.my.id");
            }
            ui.label(mono_text("•", 11.5, TEXT_MUTED));
            if ui
                .link(semibold_text("GitHub Releases", 11.5, TEXT_SECONDARY))
                .clicked()
            {
                system_service::open_in_system(
                    "https://github.com/Tayen15/RadioBOSS-Controller/releases",
                );
            }
            ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                if app.update_dl_status.state == UpdateDownloadState::Downloaded {
                    if amber_button(ui, "Restart to Update").clicked() {
                        app.send_cmd(AppCommand::InstallUpdate);
                    }
                } else if slate_button(ui, "Cek Pembaruan").clicked() {
                    app.send_cmd(AppCommand::CheckForUpdates { manual: true });
                }
            });
        });
    });

    ui.add_space(12.0);
    section_label(ui, "Jaringan & Reset");
    setting_group_frame().show(ui, |ui| {
        ui.label(semibold_text("Port Stream Relay Lokal / LAN", 12.0, TEXT_PRIMARY));
        ui.label(semibold_text(
            "Memerlukan restart aplikasi jika nomor port diubah",
            11.0,
            TEXT_SECONDARY,
        ));
        ui.add_space(6.0);
        ui.horizontal(|ui| {
            let mut srv_port = app.draft_config.server_port.to_string();
            if ui
                .add_sized([110.0, 28.0], egui::TextEdit::singleline(&mut srv_port))
                .changed()
            {
                if let Ok(p) = srv_port.trim().parse::<u16>() {
                    app.draft_config.server_port = p;
                }
            }
            ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                if danger_button(ui, "Reset Pengaturan Default").clicked() {
                    app.draft_config = AppConfig::default();
                }
            });
        });
    });
}
