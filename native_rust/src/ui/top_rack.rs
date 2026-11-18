use eframe::egui::{self, Color32, CornerRadius, Frame, Margin, Stroke};

use crate::app::RadioCasterApp;
use crate::events::AppCommand;
use crate::models::radioboss::PlaybackAction;
use crate::services::title_cleaner::clean_broadcast_title;
use crate::services::ytmusic_service::parse_duration_str;
use crate::ui::theme::{
    amber_button, bold_text, danger_button, lcd_frame, module_frame, mono_text, semibold_text,
    slate_button, status_pill, AMBER_PRIMARY, BORDER_COLOR, CONTROL_BG, SIGNAL_CYAN,
    STATUS_ERROR, STATUS_SUCCESS, STATUS_WARNING, TEXT_MUTED, TEXT_PRIMARY, TEXT_SECONDARY,
};

pub fn render_top_rack(ui: &mut egui::Ui, app: &mut RadioCasterApp) {
    // Row 1: Studio Navbar Strip
    ui.horizontal(|ui| {
        if let Some(ref tex) = app.logo_texture {
            ui.add(
                egui::Image::new(tex)
                    .fit_to_exact_size(egui::vec2(26.0, 26.0))
                    .corner_radius(CornerRadius::same(6)),
            );
        }
        ui.vertical(|ui| {
            ui.spacing_mut().item_spacing.y = 1.0;
            ui.horizontal(|ui| {
                ui.label(bold_text("RADIO CASTER BRIDGE STUDIO", 14.5, TEXT_PRIMARY));
                status_pill(ui, "RCB STUDIO", SIGNAL_CYAN);
            });
            ui.label(semibold_text(
                "YouTube Music Studio Streamer & RadioBOSS Controller",
                11.0,
                TEXT_SECONDARY,
            ));
        });

        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
            // Settings Button
            if slate_button(ui, "⚙ Pengaturan").clicked() {
                app.draft_config = app.config.clone();
                app.ping_result = None;
                app.is_settings_open = true;
                app.send_cmd(AppCommand::RefreshCacheStats);
            }

            // Manual Sync Button
            if slate_button(ui, "↻ Sync").clicked() {
                app.send_cmd(AppCommand::SyncStatus { silent: false });
                app.send_cmd(AppCommand::SyncPlaylist {
                    manual: true,
                    override_tab: None,
                });
            }

            // Auto-Sync 1s Toggle
            let sync_label = if app.auto_refresh {
                "● Auto-Sync 1s"
            } else {
                "○ Auto-Sync Jeda"
            };
            let sync_color = if app.auto_refresh {
                STATUS_SUCCESS
            } else {
                TEXT_SECONDARY
            };
            if ui
                .add(
                    egui::Button::new(semibold_text(sync_label, 11.5, sync_color))
                        .fill(CONTROL_BG)
                        .stroke(Stroke::new(1.0, BORDER_COLOR))
                        .corner_radius(CornerRadius::same(8))
                        .min_size(egui::vec2(0.0, 30.0)),
                )
                .clicked()
            {
                app.auto_refresh = !app.auto_refresh;
                app.send_cmd(AppCommand::SetAutoRefresh(app.auto_refresh));
            }

            // Update Notification Badge if newer version available
            if let Some(ref upd) = app.update_check {
                if upd.update_available {
                    if amber_button(ui, &format!("Update v{}", upd.latest_version)).clicked() {
                        app.is_update_open = true;
                    }
                }
            }

            // Live RadioBOSS Connectivity Pill
            if app.rb_status.connected {
                status_pill(ui, "RADIOBOSS TERHUBUNG", STATUS_SUCCESS);
            } else {
                status_pill(ui, "RADIOBOSS TERPUTUS", STATUS_ERROR);
            }
        });
    });

    ui.add_space(6.0);

    // Offline / Password Warning Banner
    if !app.rb_status.connected {
        if let Some(ref err_msg) = app.rb_status.error {
            Frame::NONE
                .fill(Color32::from_rgba_unmultiplied(248, 113, 113, 20))
                .stroke(Stroke::new(1.0, STATUS_ERROR))
                .corner_radius(CornerRadius::same(8))
                .inner_margin(Margin::symmetric(12, 6))
                .show(ui, |ui| {
                    ui.horizontal(|ui| {
                        ui.label(bold_text("PERINGATAN KONEKSI:", 11.5, STATUS_ERROR));
                        ui.label(semibold_text(err_msg, 11.5, TEXT_PRIMARY));
                        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                            if slate_button(ui, "Buka Pengaturan Koneksi").clicked() {
                                app.draft_config = app.config.clone();
                                app.settings_tab = crate::app::SettingsTab::Connection;
                                app.is_settings_open = true;
                            }
                        });
                    });
                });
            ui.add_space(6.0);
        }
    }

    // Dead-Air Safety Guard Banner
    let is_playing = app
        .rb_status
        .now_playing
        .as_ref()
        .map(|np| np.status == "playing")
        .unwrap_or(false);
    if app.rb_status.connected && is_playing && app.playlist_tracks.len() <= 1 {
        Frame::NONE
            .fill(Color32::from_rgba_unmultiplied(251, 191, 36, 20))
            .stroke(Stroke::new(1.0, STATUS_WARNING))
            .corner_radius(CornerRadius::same(8))
            .inner_margin(Margin::symmetric(12, 6))
            .show(ui, |ui| {
                ui.horizontal(|ui| {
                    ui.label(bold_text("DEAD-AIR GUARD:", 11.5, STATUS_WARNING));
                    ui.label(semibold_text(
                        "Antrean RadioBOSS hampir habis! Segera tambahkan lagu atau gunakan 1-Click Auto-Fill.",
                        11.5,
                        TEXT_PRIMARY,
                    ));
                });
            });
        ui.add_space(6.0);
    }

    // Row 2: Live On-Air LCD Readout & Transport Deck
    module_frame()
        .inner_margin(Margin::symmetric(12, 10))
        .show(ui, |ui| {
            ui.horizontal(|ui| {
                let np = app.rb_status.now_playing.clone();
                let status_str = np
                    .as_ref()
                    .map(|n| n.status.as_str())
                    .unwrap_or("disconnected");

                let (badge_txt, badge_color) = if !app.rb_status.connected {
                    ("OFFLINE", STATUS_ERROR)
                } else {
                    match status_str {
                        "playing" => ("LIVE ON-AIR", STATUS_ERROR),
                        "paused" => ("JEDA SIARAN", STATUS_WARNING),
                        _ => ("STANDBY", TEXT_SECONDARY),
                    }
                };

                // Left: LCD Display Frame
                lcd_frame()
                    .inner_margin(Margin::symmetric(12, 8))
                    .show(ui, |ui| {
                        ui.set_min_width((ui.available_width() - 320.0).max(260.0));
                        ui.horizontal(|ui| {
                            status_pill(ui, badge_txt, badge_color);

                            if let Some(listeners) = np.as_ref().and_then(|n| n.listeners) {
                                if listeners > 0 {
                                    ui.label(mono_text(
                                        format!("{listeners} Pendengar"),
                                        11.0,
                                        SIGNAL_CYAN,
                                    ));
                                }
                            }

                            ui.add_space(6.0);

                            if app.is_editing_cast_title {
                                ui.add(
                                    egui::TextEdit::singleline(&mut app.cast_title_input)
                                        .desired_width(240.0)
                                        .hint_text("Judul siaran live..."),
                                );
                                if slate_button(ui, "Magic Clean").clicked() {
                                    app.cast_title_input =
                                        clean_broadcast_title(&app.cast_title_input);
                                }
                                if amber_button(ui, "Simpan").clicked() {
                                    let val = app.cast_title_input.trim().to_string();
                                    if !val.is_empty() {
                                        app.send_cmd(AppCommand::SetLiveCastTitle(val));
                                    }
                                    app.is_editing_cast_title = false;
                                }
                                if slate_button(ui, "Batal").clicked() {
                                    app.is_editing_cast_title = false;
                                }
                            } else {
                                let title_txt = np
                                    .as_ref()
                                    .map(|n| n.title.as_str())
                                    .unwrap_or("RadioBOSS tidak terhubung");
                                ui.label(bold_text(title_txt, 14.0, TEXT_PRIMARY));

                                if app.rb_status.connected {
                                    if ui
                                        .add(
                                            egui::Button::new(semibold_text(
                                                "✎ Edit Cast Title",
                                                11.0,
                                                TEXT_SECONDARY,
                                            ))
                                            .fill(CONTROL_BG)
                                            .corner_radius(CornerRadius::same(6)),
                                        )
                                        .clicked()
                                    {
                                        app.cast_title_input = np
                                            .as_ref()
                                            .map(|n| n.title.clone())
                                            .unwrap_or_default();
                                        app.is_editing_cast_title = true;
                                    }
                                }
                            }
                        });

                        // Timecode & Progress Bar
                        if let Some(ref info) = np {
                            let pos_s = info.position.as_deref().unwrap_or("00:00");
                            let dur_s = info.duration.as_deref().unwrap_or("00:00");
                            let pos_sec = parse_duration_str(pos_s) as f32;
                            let dur_sec = parse_duration_str(dur_s).max(1) as f32;
                            let ratio = (pos_sec / dur_sec).clamp(0.0, 1.0);

                            ui.add_space(4.0);
                            ui.horizontal(|ui| {
                                ui.label(mono_text(
                                    format!("{pos_s} / {dur_s}"),
                                    11.5,
                                    AMBER_PRIMARY,
                                ));
                                let bar_w = ui.available_width().max(80.0);
                                let (rect, _) = ui.allocate_exact_size(
                                    egui::vec2(bar_w, 5.0),
                                    egui::Sense::hover(),
                                );
                                ui.painter().rect_filled(
                                    rect,
                                    CornerRadius::same(3),
                                    CONTROL_BG,
                                );
                                let mut fill_rect = rect;
                                fill_rect.set_width(rect.width() * ratio);
                                ui.painter().rect_filled(
                                    fill_rect,
                                    CornerRadius::same(3),
                                    if info.status == "playing" {
                                        AMBER_PRIMARY
                                    } else {
                                        TEXT_MUTED
                                    },
                                );
                            });
                        }
                    });

                // Right: Physical RadioBOSS Transport Keys
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    ui.add_enabled_ui(app.rb_status.connected, |ui| {
                        if danger_button(ui, "■ Stop").clicked() {
                            app.send_cmd(AppCommand::PlaybackControl(PlaybackAction::Stop));
                        }
                        if slate_button(ui, "⏭ Lewati").clicked() {
                            app.send_cmd(AppCommand::PlaybackControl(PlaybackAction::Next));
                        }
                        if slate_button(ui, "⏸ Jeda").clicked() {
                            app.send_cmd(AppCommand::PlaybackControl(PlaybackAction::Pause));
                        }
                        if amber_button(ui, "▶ Putar").clicked() {
                            app.send_cmd(AppCommand::PlaybackControl(PlaybackAction::Play));
                        }
                    });
                });
            });
        });
}
