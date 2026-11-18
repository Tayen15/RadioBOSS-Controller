use eframe::egui::{self, Color32, CornerRadius, Frame, Margin, Stroke};

use crate::app::{LyricsModalTab, RadioCasterApp};
use crate::ui::theme::{
    bold_text, dialog_frame, lcd_frame, semibold_text, slate_button, status_pill, window_close_dot,
    AMBER_DARK_TEXT, AMBER_PRIMARY, BORDER_COLOR, DECK_BG, SIGNAL_CYAN, STATUS_SUCCESS,
    TEXT_PRIMARY, TEXT_SECONDARY,
};
use crate::ui::toast::ToastItem;

pub fn render_lyrics_modal(ctx: &egui::Context, app: &mut RadioCasterApp) {
    if !app.is_lyrics_open {
        return;
    }

    if ctx.input(|i| i.key_pressed(egui::Key::Escape)) {
        app.is_lyrics_open = false;
        return;
    }

    let Some(data) = app.lyrics_data.clone() else {
        app.is_lyrics_open = false;
        return;
    };

    let mut is_open = app.is_lyrics_open;
    egui::Window::new("Lembar Cue Penyiar & Lirik Lagu")
        .open(&mut is_open)
        .title_bar(false)
        .collapsible(false)
        .resizable(true)
        .movable(true)
        .frame(dialog_frame())
        .default_width(700.0)
        .default_height(540.0)
        .show(ctx, |ui| {
            let tp = &data.talking_points;
            ui.horizontal(|ui| {
                if window_close_dot(ui) {
                    app.is_lyrics_open = false;
                }
                ui.add_space(6.0);
                ui.label(bold_text("Cue Penyiar & Lirik", 16.0, TEXT_PRIMARY));
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    if tp.play_count > 0 {
                        status_pill(
                            ui,
                            &format!("Diputar {}x", tp.play_count),
                            STATUS_SUCCESS,
                        );
                    }
                    status_pill(ui, &tp.vibe_badge, AMBER_PRIMARY);
                });
            });

            ui.add_space(8.0);

            // 2-Tab Switcher inside the single dialog (Cue Penyiar vs Lirik Lagu)
            Frame::NONE
                .fill(DECK_BG)
                .stroke(Stroke::new(1.0, BORDER_COLOR))
                .corner_radius(CornerRadius::same(9))
                .inner_margin(Margin::same(4))
                .show(ui, |ui| {
                    let half_w = (ui.available_width() - 6.0) / 2.0;
                    ui.horizontal(|ui| {
                        let cue_active = app.lyrics_modal_tab == LyricsModalTab::CueSheet;
                        if ui
                            .add_sized(
                                [half_w, 30.0],
                                egui::Button::new(bold_text(
                                    "Cue Penyiar & Naskah",
                                    12.0,
                                    if cue_active {
                                        AMBER_DARK_TEXT
                                    } else {
                                        TEXT_SECONDARY
                                    },
                                ))
                                .fill(if cue_active {
                                    AMBER_PRIMARY
                                } else {
                                    Color32::TRANSPARENT
                                })
                                .stroke(Stroke::NONE)
                                .corner_radius(CornerRadius::same(6)),
                            )
                            .clicked()
                        {
                            app.lyrics_modal_tab = LyricsModalTab::CueSheet;
                        }

                        let lyr_active = app.lyrics_modal_tab == LyricsModalTab::Lyrics;
                        if ui
                            .add_sized(
                                [half_w, 30.0],
                                egui::Button::new(bold_text(
                                    "Lirik Lagu",
                                    12.0,
                                    if lyr_active {
                                        AMBER_DARK_TEXT
                                    } else {
                                        TEXT_SECONDARY
                                    },
                                ))
                                .fill(if lyr_active {
                                    AMBER_PRIMARY
                                } else {
                                    Color32::TRANSPARENT
                                })
                                .stroke(Stroke::NONE)
                                .corner_radius(CornerRadius::same(6)),
                            )
                            .clicked()
                        {
                            app.lyrics_modal_tab = LyricsModalTab::Lyrics;
                        }
                    });
                });

            ui.add_space(8.0);

            egui::ScrollArea::vertical()
                .id_salt("lyrics_modal_scroll")
                .max_height(410.0)
                .show(ui, |ui| {
                    let full_w = ui.available_width();
                    match app.lyrics_modal_tab {
                        LyricsModalTab::CueSheet => {
                            // 1. Timing Ramp Windows (Full Width)
                            lcd_frame().show(ui, |ui| {
                                ui.set_min_width((full_w - 22.0).max(200.0));
                                ui.label(bold_text(
                                    "Jendela Bicara Penyiar (Timing Cue)",
                                    12.5,
                                    SIGNAL_CYAN,
                                ));
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
                                ui.set_min_width((full_w - 22.0).max(200.0));
                                ui.horizontal(|ui| {
                                    ui.label(bold_text(
                                        "Naskah Intro Siap Baca",
                                        12.5,
                                        AMBER_PRIMARY,
                                    ));
                                    ui.with_layout(
                                        egui::Layout::right_to_left(egui::Align::Center),
                                        |ui| {
                                            if slate_button(ui, "Salin Intro").clicked() {
                                                ctx.copy_text(tp.intro_script.clone());
                                                app.toasts.push(ToastItem::success(
                                                    "Naskah intro disalin ke clipboard",
                                                ));
                                            }
                                        },
                                    );
                                });
                                ui.label(semibold_text(&tp.intro_script, 12.0, TEXT_PRIMARY));

                                ui.add_space(8.0);

                                ui.horizontal(|ui| {
                                    ui.label(bold_text(
                                        "Naskah Outro / Backsell",
                                        12.5,
                                        AMBER_PRIMARY,
                                    ));
                                    ui.with_layout(
                                        egui::Layout::right_to_left(egui::Align::Center),
                                        |ui| {
                                            if slate_button(ui, "Salin Outro").clicked() {
                                                ctx.copy_text(tp.outro_script.clone());
                                                app.toasts.push(ToastItem::success(
                                                    "Naskah outro disalin ke clipboard",
                                                ));
                                            }
                                        },
                                    );
                                });
                                ui.label(semibold_text(&tp.outro_script, 12.0, TEXT_PRIMARY));
                            });

                            ui.add_space(8.0);

                            // 3. Broadcaster Tips & Key Lyric
                            if !tp.key_lyric_quote.is_empty() || !tp.broadcaster_tips.is_empty() {
                                lcd_frame().show(ui, |ui| {
                                    ui.set_min_width((full_w - 22.0).max(200.0));
                                    if !tp.key_lyric_quote.is_empty() {
                                        ui.label(bold_text(
                                            "Kutipan Lirik Kunci:",
                                            12.0,
                                            SIGNAL_CYAN,
                                        ));
                                        ui.label(semibold_text(
                                            format!("\"{}\"", tp.key_lyric_quote),
                                            12.5,
                                            AMBER_PRIMARY,
                                        ));
                                        ui.add_space(6.0);
                                    }
                                    ui.label(bold_text(
                                        "Tips Teknis Siaran:",
                                        12.0,
                                        TEXT_PRIMARY,
                                    ));
                                    for tip in &tp.broadcaster_tips {
                                        ui.label(semibold_text(
                                            format!("• {tip}"),
                                            11.5,
                                            TEXT_SECONDARY,
                                        ));
                                    }
                                });
                            }
                        }

                        LyricsModalTab::Lyrics => {
                            // Full Lyrics Tab
                            lcd_frame().show(ui, |ui| {
                                ui.set_min_width((full_w - 22.0).max(200.0));
                                ui.horizontal(|ui| {
                                    ui.label(bold_text("Lirik Lengkap Lagu", 12.5, TEXT_PRIMARY));
                                    ui.with_layout(
                                        egui::Layout::right_to_left(egui::Align::Center),
                                        |ui| {
                                            if slate_button(ui, "Salin Lirik").clicked() {
                                                ctx.copy_text(data.lyrics.clone());
                                                app.toasts.push(ToastItem::success(
                                                    "Lirik disalin ke clipboard",
                                                ));
                                            }
                                            ui.label(semibold_text(
                                                format!("Sumber: {}", data.source),
                                                11.0,
                                                TEXT_SECONDARY,
                                            ));
                                        },
                                    );
                                });
                                ui.add_space(6.0);
                                ui.label(semibold_text(&data.lyrics, 12.5, TEXT_PRIMARY));
                            });
                        }
                    }
                });
        });

    app.is_lyrics_open = is_open;
}
