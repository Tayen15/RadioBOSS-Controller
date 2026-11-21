use eframe::egui::{self, Color32, CornerRadius, Frame, Margin, Stroke};

use crate::app::{QueueMonitorTab, RadioCasterApp};
use crate::events::AppCommand;
use crate::models::track::TrackItem;
use crate::ui::theme::{
    animated_segment_tab, bold_text, danger_button, lcd_frame, lerp_color, module_frame,
    mono_text, semibold_text, slate_button, status_pill, AMBER_DARK_TEXT, AMBER_PRIMARY,
    BORDER_COLOR, CHASSIS_BG, CONTROL_BG, DECK_BG, SIGNAL_CYAN, STATUS_ERROR, TEXT_MUTED,
    TEXT_PRIMARY, TEXT_SECONDARY,
};

pub fn render_queue_monitor(ui: &mut egui::Ui, app: &mut RadioCasterApp) {
    // 1. Switcher Tab (Antrean RadioBOSS vs Log Pengiriman)
    Frame::NONE
        .fill(DECK_BG)
        .stroke(Stroke::new(1.0, BORDER_COLOR))
        .corner_radius(CornerRadius::same(10))
        .inner_margin(Margin::same(4))
        .show(ui, |ui| {
            let half_w = (ui.available_width() - 6.0) / 2.0;
            ui.horizontal(|ui| {
                let pl_active = app.queue_tab == QueueMonitorTab::Playlist;
                let pl_lbl = format!("Antrean ({})", app.playlist_tracks.len());
                if animated_segment_tab(ui, egui::vec2(half_w, 30.0), &pl_lbl, pl_active, true, 7)
                    .clicked()
                {
                    app.queue_tab = QueueMonitorTab::Playlist;
                }

                let hist_active = app.queue_tab == QueueMonitorTab::History;
                let hist_lbl = format!("Riwayat ({})", app.history.len());
                if animated_segment_tab(
                    ui,
                    egui::vec2(half_w, 30.0),
                    &hist_lbl,
                    hist_active,
                    true,
                    7,
                )
                .clicked()
                {
                    app.queue_tab = QueueMonitorTab::History;
                }
            });
        });

    ui.add_space(10.0);

    match app.queue_tab {
        QueueMonitorTab::Playlist => render_live_playlist(ui, app),
        QueueMonitorTab::History => render_dispatch_history(ui, app),
    }
}

fn render_live_playlist(ui: &mut egui::Ui, app: &mut RadioCasterApp) {
    module_frame().show(ui, |ui| {
        ui.label(bold_text("Antrean Aktif", 13.0, TEXT_PRIMARY));
        ui.add_space(6.0);

        // 1:1 RadioBOSS Tab Bar (smooth animated pills)
        ui.horizontal_wrapped(|ui| {
            let auto_act = app.active_tab.is_empty();
            if animated_tab_chip(ui, "Auto / Aktif", auto_act).clicked() {
                app.active_tab = String::new();
                app.send_cmd(AppCommand::SelectPlaylistTab(String::new()));
            }
            let tabs = app.available_tabs.clone();
            for tab in tabs {
                let active = app.active_tab == tab;
                if animated_tab_chip(ui, &tab, active).clicked() {
                    app.active_tab = tab.clone();
                    app.send_cmd(AppCommand::SelectPlaylistTab(tab));
                }
            }
        });

        ui.add_space(8.0);

        if !app.rb_status.connected {
            ui.label(semibold_text(
                "Hubungkan RadioBOSS untuk memantau daftar putar secara real-time.",
                12.0,
                TEXT_SECONDARY,
            ));
            return;
        }

        if app.playlist_tracks.is_empty() {
            ui.label(semibold_text(
                "Antrean RadioBOSS pada tab ini masih kosong.",
                12.0,
                TEXT_SECONDARY,
            ));
            return;
        }

        let tracks = app.playlist_tracks.clone();
        egui::ScrollArea::vertical()
            .id_salt("rb_live_playlist_scroll")
            .max_height(280.0)
            .show(ui, |ui| {
                for item in tracks {
                    let bg = if item.is_playing {
                        Color32::from_rgba_unmultiplied(245, 158, 11, 24)
                    } else {
                        CHASSIS_BG
                    };
                    let stroke = if item.is_playing {
                        AMBER_PRIMARY
                    } else {
                        BORDER_COLOR
                    };
                    Frame::NONE
                        .fill(bg)
                        .stroke(Stroke::new(1.0, stroke))
                        .corner_radius(CornerRadius::same(7))
                        .inner_margin(Margin::symmetric(10, 6))
                        .show(ui, |ui| {
                            ui.horizontal(|ui| {
                                ui.label(mono_text(
                                    format!("{:02}", item.index),
                                    11.5,
                                    if item.is_playing {
                                        AMBER_PRIMARY
                                    } else {
                                        TEXT_MUTED
                                    },
                                ));
                                if item.is_playing {
                                    status_pill(ui, "ON-AIR", STATUS_ERROR);
                                }
                                ui.vertical(|ui| {
                                    ui.set_max_width((ui.available_width() - 65.0).max(90.0));
                                    ui.add(
                                        egui::Label::new(semibold_text(
                                            &item.display_title,
                                            12.0,
                                            TEXT_PRIMARY,
                                        ))
                                        .truncate(),
                                    );
                                    if !item.start_time.is_empty() {
                                        ui.label(mono_text(
                                            format!("Jam Tayang: {}", item.start_time),
                                            10.5,
                                            SIGNAL_CYAN,
                                        ));
                                    }
                                });
                                ui.with_layout(
                                    egui::Layout::right_to_left(egui::Align::Center),
                                    |ui| {
                                        ui.label(mono_text(
                                            &item.duration,
                                            11.5,
                                            TEXT_SECONDARY,
                                        ));
                                    },
                                );
                            });
                        });
                    ui.add_space(4.0);
                }
            });
    });
}

fn render_dispatch_history(ui: &mut egui::Ui, app: &mut RadioCasterApp) {
    module_frame().show(ui, |ui| {
        ui.horizontal(|ui| {
            ui.label(bold_text("Riwayat Kirim", 13.0, TEXT_PRIMARY));
            ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                if !app.history.is_empty() && danger_button(ui, "Bersihkan Log").clicked() {
                    app.send_cmd(AppCommand::ClearHistory);
                }
            });
        });
        ui.add_space(6.0);

        if app.history.is_empty() {
            ui.label(semibold_text(
                "Belum ada lagu yang dikirim ke RadioBOSS.",
                12.0,
                TEXT_SECONDARY,
            ));
            return;
        }

        let hist = app.history.clone();
        egui::ScrollArea::vertical()
            .id_salt("dispatch_history_scroll")
            .max_height(280.0)
            .show(ui, |ui| {
                for h in hist {
                    let is_next = h.pos == 1 || h.pos == -2;
                    let is_ok = h.status == "success";
                    lcd_frame().inner_margin(Margin::symmetric(10, 6)).show(ui, |ui| {
                        ui.horizontal(|ui| {
                            ui.label(mono_text(&h.timestamp, 11.0, TEXT_MUTED));
                            status_pill(
                                ui,
                                if is_next { "NEXT" } else { "BAWAH" },
                                if is_next { AMBER_PRIMARY } else { SIGNAL_CYAN },
                            );
                            if !is_ok {
                                status_pill(ui, "GAGAL", STATUS_ERROR);
                            }
                            ui.vertical(|ui| {
                                ui.set_max_width((ui.available_width() - 150.0).max(80.0));
                                ui.add(
                                    egui::Label::new(semibold_text(&h.title, 12.0, TEXT_PRIMARY))
                                        .truncate(),
                                );
                                ui.add(
                                    egui::Label::new(semibold_text(
                                        h.artists.join(", "),
                                        11.0,
                                        TEXT_SECONDARY,
                                    ))
                                    .truncate(),
                                );
                            });
                            ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                                if slate_button(ui, "Kirim Lagi").clicked() {
                                    let t = TrackItem {
                                        video_id: h.video_id.clone(),
                                        title: h.title.clone(),
                                        artists: h.artists.clone(),
                                        thumbnail_url: h.thumbnail_url.clone(),
                                        url: format!(
                                            "https://music.youtube.com/watch?v={}",
                                            h.video_id
                                        ),
                                        ..Default::default()
                                    };
                                    app.send_cmd(AppCommand::QueueTrack {
                                        track: t,
                                        pos: h.pos,
                                        use_cache: true,
                                        target_tab: app.active_tab.clone(),
                                        skip_repeat_check: true,
                                    });
                                }
                            });
                        });
                    });
                    ui.add_space(4.0);
                }
            });
    });
}

fn animated_tab_chip(ui: &mut egui::Ui, label: &str, active: bool) -> egui::Response {
    let font = egui::FontId::new(
        11.0,
        egui::FontFamily::Name(if active { "bold" } else { "semibold" }.into()),
    );
    let galley = ui
        .painter()
        .layout_no_wrap(label.to_string(), font, TEXT_PRIMARY);
    let desired = egui::vec2(galley.size().x + 16.0, 24.0);
    let (rect, resp) = ui.allocate_exact_size(desired, egui::Sense::click());
    let resp = resp.on_hover_cursor(egui::CursorIcon::PointingHand);

    let act_t = ui
        .ctx()
        .animate_bool_responsive(resp.id.with("chip_act"), active);
    let hov_t = ui
        .ctx()
        .animate_bool_responsive(resp.id.with("chip_hov"), resp.hovered() && !active);

    let base_bg = lerp_color(CONTROL_BG, Color32::from_rgb(46, 46, 56), hov_t);
    let fill = lerp_color(base_bg, AMBER_PRIMARY, act_t);
    let text_col = lerp_color(TEXT_PRIMARY, AMBER_DARK_TEXT, act_t);

    ui.painter()
        .rect_filled(rect, CornerRadius::same(6), fill);
    ui.painter().text(
        rect.center(),
        egui::Align2::CENTER_CENTER,
        label,
        egui::FontId::new(
            11.0,
            egui::FontFamily::Name(if active { "bold" } else { "semibold" }.into()),
        ),
        text_col,
    );
    resp
}
