use eframe::egui::{self, Color32, CornerRadius, Frame, Margin, Stroke};

use crate::app::RadioCasterApp;
use crate::events::AppCommand;
use crate::models::radioboss::PlaybackAction;
use crate::models::system::UpdateDownloadState;
use crate::services::title_cleaner::clean_broadcast_title;
use crate::services::ytmusic_service::parse_duration_str;
use crate::ui::theme::{
    amber_button, bold_text, danger_button, module_frame, mono_text, semibold_text, slate_button,
    status_pill, AMBER_PRIMARY, CONTROL_BG, SIGNAL_CYAN, STATUS_ERROR, STATUS_SUCCESS,
    STATUS_WARNING, TEXT_MUTED, TEXT_PRIMARY, TEXT_SECONDARY,
};

pub fn render_top_rack(ui: &mut egui::Ui, app: &mut RadioCasterApp) {
    // Row 1: Unified Frameless Titlebar + Studio Controls
    let bar_h = 30.0_f32;
    let (bar_rect, bar_resp) = ui.allocate_exact_size(
        egui::vec2(ui.available_width(), bar_h),
        egui::Sense::click_and_drag(),
    );

    if bar_resp.drag_started_by(egui::PointerButton::Primary) {
        ui.ctx().send_viewport_cmd(egui::ViewportCommand::StartDrag);
    }
    if bar_resp.double_clicked() {
        let is_max = ui
            .ctx()
            .input(|i| i.viewport().maximized.unwrap_or(false));
        ui.ctx()
            .send_viewport_cmd(egui::ViewportCommand::Maximized(!is_max));
    }

    let mut bar_ui = ui.new_child(
        egui::UiBuilder::new()
            .max_rect(bar_rect)
            .layout(egui::Layout::left_to_right(egui::Align::Center)),
    );
    bar_ui.spacing_mut().item_spacing.x = 10.0;

    if let Some(ref tex) = app.logo_texture {
        bar_ui.add(
            egui::Image::new(tex)
                .fit_to_exact_size(egui::vec2(22.0, 22.0))
                .corner_radius(CornerRadius::same(6)),
        );
    }

    // Compact RadioBOSS connection status with vector dot
    let (dot_col, status_txt) = if app.rb_status.connected {
        (STATUS_SUCCESS, "RadioBOSS Terhubung")
    } else {
        (STATUS_ERROR, "RadioBOSS Terputus")
    };
    let (dot_rect, _) = bar_ui.allocate_exact_size(egui::vec2(8.0, 8.0), egui::Sense::hover());
    if app.rb_status.connected {
        bar_ui.painter().circle_filled(dot_rect.center(), 4.0, dot_col);
    } else {
        bar_ui
            .painter()
            .circle_stroke(dot_rect.center(), 3.5, Stroke::new(1.4, dot_col));
    }
    bar_ui.label(semibold_text(status_txt, 11.5, dot_col));

    bar_ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
        ui.spacing_mut().item_spacing.x = 4.0;
        let is_max = ui.ctx().input(|i| i.viewport().maximized.unwrap_or(false));

        if titlebar_win_btn(ui, WinBtnKind::Close).clicked() {
            ui.ctx().send_viewport_cmd(egui::ViewportCommand::Close);
        }
        if titlebar_win_btn(ui, WinBtnKind::Maximize(is_max)).clicked() {
            ui.ctx()
                .send_viewport_cmd(egui::ViewportCommand::Maximized(!is_max));
        }
        if titlebar_win_btn(ui, WinBtnKind::Minimize).clicked() {
            ui.ctx()
                .send_viewport_cmd(egui::ViewportCommand::Minimized(true));
        }

        ui.add_space(6.0);
        let sep_rect = ui.allocate_exact_size(egui::vec2(1.0, 16.0), egui::Sense::hover()).0;
        ui.painter().line_segment(
            [sep_rect.center_top(), sep_rect.center_bottom()],
            Stroke::new(1.0, Color32::from_rgb(44, 44, 54)),
        );
        ui.add_space(6.0);

        if slate_button(ui, "Pengaturan").clicked() {
            app.draft_config = app.config.clone();
            app.ping_result = None;
            app.is_settings_open = true;
            app.send_cmd(AppCommand::RefreshCacheStats);
        }

        if app.update_dl_status.state == UpdateDownloadState::Downloaded
            && restart_update_button(ui).clicked()
        {
            app.send_cmd(AppCommand::InstallUpdate);
        }
    });

    ui.add_space(6.0);

    // Offline / Password Warning Banner
    if !app.rb_status.connected {
        if let Some(ref err_msg) = app.rb_status.error {
            Frame::NONE
                .fill(Color32::from_rgba_unmultiplied(248, 113, 113, 18))
                .stroke(Stroke::new(1.0, STATUS_ERROR))
                .corner_radius(CornerRadius::same(8))
                .inner_margin(Margin::symmetric(12, 6))
                .show(ui, |ui| {
                    ui.horizontal_wrapped(|ui| {
                        ui.label(bold_text("Koneksi terputus:", 11.5, STATUS_ERROR));
                        ui.label(semibold_text(err_msg, 11.5, TEXT_PRIMARY));
                        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                            if slate_button(ui, "Cek Koneksi").clicked() {
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
            .fill(Color32::from_rgba_unmultiplied(251, 191, 36, 18))
            .stroke(Stroke::new(1.0, STATUS_WARNING))
            .corner_radius(CornerRadius::same(8))
            .inner_margin(Margin::symmetric(12, 6))
            .show(ui, |ui| {
                ui.horizontal_wrapped(|ui| {
                    ui.label(bold_text("Antrean menipis:", 11.5, STATUS_WARNING));
                    ui.label(semibold_text(
                        "Sisa antrean RadioBOSS <= 1 lagu. Tambahkan lagu agar siaran tidak terputus.",
                        11.5,
                        TEXT_PRIMARY,
                    ));
                });
            });
        ui.add_space(6.0);
    }

    // Row 2: Clean Single-Surface Now Playing Bar + Transport Deck
    module_frame()
        .inner_margin(Margin::symmetric(14, 10))
        .show(ui, |ui| {
            let np = app.rb_status.now_playing.clone();
            let status_str = np
                .as_ref()
                .map(|n| n.status.as_str())
                .unwrap_or("disconnected");

            let (badge_txt, badge_color) = if !app.rb_status.connected {
                ("OFFLINE", STATUS_ERROR)
            } else {
                match status_str {
                    "playing" => ("ON-AIR", STATUS_ERROR),
                    "paused" => ("JEDA", STATUS_WARNING),
                    _ => ("STANDBY", TEXT_SECONDARY),
                }
            };

            let avail_w = ui.available_width();
            let transport_w = 290.0_f32;
            let lcd_w = (avail_w - transport_w - 14.0).max(240.0);

            ui.horizontal(|ui| {
                ui.allocate_ui_with_layout(
                    egui::vec2(lcd_w, 46.0),
                    egui::Layout::top_down(egui::Align::Min),
                    |ui| {
                        ui.horizontal(|ui| {
                            // State-driven live ON-AIR pulse indicator (0% CPU when idle)
                            if status_str == "playing" && app.rb_status.connected {
                                let t = ui.ctx().input(|i| i.time);
                                let pulse = ((t * 3.5).sin() * 0.5 + 0.5) as f32;
                                let dot_alpha = (110.0 + pulse * 145.0) as u8;
                                let dot_col = Color32::from_rgba_unmultiplied(
                                    STATUS_ERROR.r(),
                                    STATUS_ERROR.g(),
                                    STATUS_ERROR.b(),
                                    dot_alpha,
                                );
                                let (dot_rect, _) = ui.allocate_exact_size(
                                    egui::vec2(8.0, 8.0),
                                    egui::Sense::hover(),
                                );
                                ui.painter().circle_filled(dot_rect.center(), 4.0, dot_col);
                                ui.ctx()
                                    .request_repaint_after(std::time::Duration::from_millis(33));
                            }
                            status_pill(ui, badge_txt, badge_color);

                            if let Some(listeners) = np.as_ref().and_then(|n| n.listeners) {
                                if listeners > 0 {
                                    ui.label(mono_text(
                                        format!("{listeners} pendengar"),
                                        11.0,
                                        SIGNAL_CYAN,
                                    ));
                                }
                            }

                            ui.add_space(4.0);

                            if app.is_editing_cast_title {
                                ui.add(
                                    egui::TextEdit::singleline(&mut app.cast_title_input)
                                        .desired_width(210.0)
                                        .hint_text("Judul siaran..."),
                                );
                                if slate_button(ui, "Rapikan").clicked() {
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
                                let edit_btn_reserve =
                                    if app.rb_status.connected { 92.0 } else { 8.0 };
                                let title_txt = np
                                    .as_ref()
                                    .map(|n| n.title.as_str())
                                    .unwrap_or("RadioBOSS belum terhubung");
                                ui.allocate_ui_with_layout(
                                    egui::vec2(
                                        (ui.available_width() - edit_btn_reserve).max(80.0),
                                        22.0,
                                    ),
                                    egui::Layout::left_to_right(egui::Align::Center),
                                    |ui| {
                                        ui.add(
                                            egui::Label::new(bold_text(
                                                title_txt,
                                                14.0,
                                                TEXT_PRIMARY,
                                            ))
                                            .truncate(),
                                        );
                                    },
                                );

                                if app.rb_status.connected {
                                    ui.with_layout(
                                        egui::Layout::right_to_left(egui::Align::Center),
                                        |ui| {
                                            if ui
                                                .add(
                                                    egui::Button::new(semibold_text(
                                                        "Ubah Judul",
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
                                        },
                                    );
                                }
                            }
                        });

                        if let Some(ref info) = np {
                            let pos_s = info.position.as_deref().unwrap_or("00:00");
                            let dur_s = info.duration.as_deref().unwrap_or("00:00");
                            let pos_sec = parse_duration_str(pos_s) as f32;
                            let dur_sec = parse_duration_str(dur_s).max(1) as f32;
                            let ratio = (pos_sec / dur_sec).clamp(0.0, 1.0);
                            let smooth_ratio = ui.ctx().animate_value_with_time(
                                egui::Id::NULL.with("now_playing_progress"),
                                ratio,
                                0.22,
                            );

                            ui.add_space(5.0);
                            ui.horizontal(|ui| {
                                ui.label(mono_text(
                                    format!("{pos_s} / {dur_s}"),
                                    11.5,
                                    AMBER_PRIMARY,
                                ));
                                let bar_w = ui.available_width().max(60.0);
                                let (rect, _) = ui.allocate_exact_size(
                                    egui::vec2(bar_w, 4.0),
                                    egui::Sense::hover(),
                                );
                                ui.painter().rect_filled(
                                    rect,
                                    CornerRadius::same(2),
                                    CONTROL_BG,
                                );
                                let mut fill_rect = rect;
                                fill_rect.set_width(rect.width() * smooth_ratio);
                                ui.painter().rect_filled(
                                    fill_rect,
                                    CornerRadius::same(2),
                                    if info.status == "playing" {
                                        AMBER_PRIMARY
                                    } else {
                                        TEXT_MUTED
                                    },
                                );
                            });
                        }
                    },
                );

                ui.add_space(10.0);

                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    ui.add_enabled_ui(app.rb_status.connected, |ui| {
                        if danger_button(ui, "■ Stop").clicked() {
                            app.send_cmd(AppCommand::PlaybackControl(PlaybackAction::Stop));
                        }
                        if slate_button(ui, ">> Lewati").clicked() {
                            app.send_cmd(AppCommand::PlaybackControl(PlaybackAction::Next));
                        }
                        if slate_button(ui, "|| Jeda").clicked() {
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

#[derive(Clone, Copy)]
enum WinBtnKind {
    Minimize,
    Maximize(bool),
    Close,
}

fn titlebar_win_btn(ui: &mut egui::Ui, kind: WinBtnKind) -> egui::Response {
    let (rect, resp) = ui.allocate_exact_size(egui::vec2(30.0, 26.0), egui::Sense::click());
    let resp = resp.on_hover_cursor(egui::CursorIcon::PointingHand);
    let is_close = matches!(kind, WinBtnKind::Close);
    if resp.hovered() {
        let fill = if is_close {
            Color32::from_rgba_unmultiplied(239, 68, 68, 215)
        } else {
            CONTROL_BG
        };
        ui.painter()
            .rect_filled(rect, CornerRadius::same(6), fill);
    }

    let col = if resp.hovered() {
        Color32::WHITE
    } else {
        TEXT_SECONDARY
    };
    let c = rect.center();
    let stroke = Stroke::new(1.3, col);
    let p = ui.painter();

    match kind {
        WinBtnKind::Minimize => {
            p.line_segment(
                [c - egui::vec2(4.5, 0.0), c + egui::vec2(4.5, 0.0)],
                stroke,
            );
        }
        WinBtnKind::Maximize(true) => {
            let r1 = egui::Rect::from_center_size(c + egui::vec2(-1.0, 1.0), egui::vec2(7.0, 7.0));
            p.rect_stroke(r1, CornerRadius::same(1), stroke, egui::StrokeKind::Inside);
            p.line_segment(
                [c + egui::vec2(-1.5, -3.5), c + egui::vec2(3.5, -3.5)],
                stroke,
            );
            p.line_segment(
                [c + egui::vec2(3.5, -3.5), c + egui::vec2(3.5, 1.5)],
                stroke,
            );
        }
        WinBtnKind::Maximize(false) => {
            let r = egui::Rect::from_center_size(c, egui::vec2(8.5, 8.5));
            p.rect_stroke(r, CornerRadius::same(1), stroke, egui::StrokeKind::Inside);
        }
        WinBtnKind::Close => {
            let d = 4.2_f32;
            p.line_segment([c - egui::vec2(d, d), c + egui::vec2(d, d)], stroke);
            p.line_segment([c + egui::vec2(d, -d), c + egui::vec2(-d, d)], stroke);
        }
    }
    resp
}

fn restart_update_button(ui: &mut egui::Ui) -> egui::Response {
    let label = "Restart to Update";
    let font = egui::FontId::new(12.0, egui::FontFamily::Name("bold".into()));
    let dark_txt = Color32::from_rgb(18, 14, 8);
    let galley = ui.painter().layout_no_wrap(label.to_string(), font, dark_txt);
    let desired = egui::vec2(galley.size().x + 38.0, 28.0);
    let (rect, resp) = ui.allocate_exact_size(desired, egui::Sense::click());
    let resp = resp.on_hover_cursor(egui::CursorIcon::PointingHand);

    let hov_t = ui.ctx().animate_bool_responsive(resp.id, resp.hovered());
    let fill = crate::ui::theme::lerp_color(
        AMBER_PRIMARY,
        Color32::from_rgb(251, 184, 52),
        hov_t,
    );
    ui.painter()
        .rect_filled(rect, CornerRadius::same(7), fill);

    // Vector circular arrow / update icon on the left
    let ic = rect.left_center() + egui::vec2(14.0, 0.0);
    let stroke = Stroke::new(1.5, dark_txt);
    let p = ui.painter();
    p.circle_stroke(ic, 5.0, stroke);
    p.line_segment([ic + egui::vec2(2.5, -4.5), ic + egui::vec2(5.5, -4.0)], stroke);
    p.line_segment([ic + egui::vec2(5.5, -4.0), ic + egui::vec2(4.0, -1.2)], stroke);

    p.galley(
        egui::pos2(rect.left() + 26.0, rect.center().y - galley.size().y * 0.5),
        galley,
        dark_txt,
    );
    resp
}
