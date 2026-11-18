use eframe::egui;

use crate::app::RadioCasterApp;
use crate::ui::theme::{
    bold_text, lcd_frame, semibold_text, slate_button, status_pill, AMBER_PRIMARY, SIGNAL_CYAN,
    STATUS_SUCCESS, TEXT_PRIMARY, TEXT_SECONDARY,
};
use crate::ui::toast::ToastItem;

pub fn render_lyrics_modal(ctx: &egui::Context, app: &mut RadioCasterApp) {
    if !app.is_lyrics_open {
        return;
    }

    let Some(data) = app.lyrics_data.clone() else {
        app.is_lyrics_open = false;
        return;
    };

    let mut is_open = app.is_lyrics_open;
    egui::Window::new("Lembar Cue Penyiar & Lirik Lagu")
        .open(&mut is_open)
        .collapsible(false)
        .resizable(true)
        .default_width(700.0)
        .default_height(520.0)
        .anchor(egui::Align2::CENTER_CENTER, egui::vec2(0.0, 0.0))
        .show(ctx, |ui| {
            let tp = &data.talking_points;
            ui.horizontal(|ui| {
                status_pill(ui, &tp.vibe_badge, AMBER_PRIMARY);
                ui.label(bold_text(&tp.vibe, 13.5, TEXT_PRIMARY));
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    if tp.play_count > 0 {
                        status_pill(
                            ui,
                            &format!("Diputar {}x", tp.play_count),
                            STATUS_SUCCESS,
                        );
                    }
                });
            });

            ui.add_space(8.0);

            egui::ScrollArea::vertical()
                .id_salt("lyrics_modal_scroll")
                .max_height(460.0)
                .show(ui, |ui| {
                    // 1. Timing Ramp Windows
                    lcd_frame().show(ui, |ui| {
                        ui.label(bold_text("Jendela Bicara Penyiar (Timing Cue)", 12.5, SIGNAL_CYAN));
                        ui.add_space(4.0);
                        ui.label(semibold_text(
                            format!("Intro Ramp: {}", tp.intro_talk_window),
                            12.0,
                            TEXT_PRIMARY,
                        ));
                        ui.label(semibold_text(
                            format!("Midpoint Cue: {}", tp.station_id_cue),
                            12.0,
                            TEXT_PRIMARY,
                        ));
                        ui.label(semibold_text(
                            format!("Outro Fade: {}", tp.outro_talk_window),
                            12.0,
                            TEXT_PRIMARY,
                        ));
                    });

                    ui.add_space(8.0);

                    // 2. Ready-to-Read On-Air Scripts
                    lcd_frame().show(ui, |ui| {
                        ui.horizontal(|ui| {
                            ui.label(bold_text("Naskah Intro Siap Baca", 12.5, AMBER_PRIMARY));
                            ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                                if slate_button(ui, "Salin Intro").clicked() {
                                    ctx.copy_text(tp.intro_script.clone());
                                    app.toasts.push(ToastItem::success("Naskah intro disalin ke clipboard"));
                                }
                            });
                        });
                        ui.label(semibold_text(&tp.intro_script, 12.0, TEXT_PRIMARY));

                        ui.add_space(8.0);

                        ui.horizontal(|ui| {
                            ui.label(bold_text("Naskah Outro / Backsell", 12.5, AMBER_PRIMARY));
                            ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                                if slate_button(ui, "Salin Outro").clicked() {
                                    ctx.copy_text(tp.outro_script.clone());
                                    app.toasts.push(ToastItem::success("Naskah outro disalin ke clipboard"));
                                }
                            });
                        });
                        ui.label(semibold_text(&tp.outro_script, 12.0, TEXT_PRIMARY));
                    });

                    ui.add_space(8.0);

                    // 3. Broadcaster Tips & Key Lyric
                    if !tp.key_lyric_quote.is_empty() || !tp.broadcaster_tips.is_empty() {
                        lcd_frame().show(ui, |ui| {
                            if !tp.key_lyric_quote.is_empty() {
                                ui.label(bold_text("Kutipan Lirik Kunci:", 12.0, SIGNAL_CYAN));
                                ui.label(semibold_text(
                                    format!("\"{}\"", tp.key_lyric_quote),
                                    12.5,
                                    AMBER_PRIMARY,
                                ));
                                ui.add_space(6.0);
                            }
                            ui.label(bold_text("Tips Teknis Siaran:", 12.0, TEXT_PRIMARY));
                            for tip in &tp.broadcaster_tips {
                                ui.label(semibold_text(format!("• {tip}"), 11.5, TEXT_SECONDARY));
                            }
                        });
                        ui.add_space(8.0);
                    }

                    // 4. Full Lyrics
                    lcd_frame().show(ui, |ui| {
                        ui.horizontal(|ui| {
                            ui.label(bold_text("Lirik Lengkap Lagu", 12.5, TEXT_PRIMARY));
                            ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                                ui.label(semibold_text(
                                    format!("Sumber: {}", data.source),
                                    11.0,
                                    TEXT_SECONDARY,
                                ));
                            });
                        });
                        ui.add_space(4.0);
                        ui.label(semibold_text(&data.lyrics, 12.0, TEXT_PRIMARY));
                    });
                });
        });

    app.is_lyrics_open = is_open;
}
