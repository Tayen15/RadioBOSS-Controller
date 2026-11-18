use eframe::egui::{self, CornerRadius, Frame, Margin, Stroke};

use crate::app::{LyricsModalTab, RadioCasterApp};
use crate::ui::theme::{
    animated_segment_tab, bold_text, copy_feedback_button, dialog_frame, lcd_frame, mono_text,
    semibold_text, setting_group_frame, status_pill, window_close_x, AMBER_PRIMARY, BORDER_COLOR,
    DECK_BG, SIGNAL_CYAN, STATUS_SUCCESS, TEXT_MUTED, TEXT_PRIMARY, TEXT_SECONDARY,
};

pub fn render_lyrics_modal(ctx: &egui::Context, app: &mut RadioCasterApp) {
    let just_opened_id = egui::Id::unique("rcb_lyrics_just_opened");
    if !app.is_lyrics_open {
        ctx.data_mut(|d| d.insert_temp(just_opened_id, false));
        return;
    }

    if ctx.input(|i| i.key_pressed(egui::Key::Escape)) {
        app.is_lyrics_open = false;
        ctx.data_mut(|d| d.insert_temp(just_opened_id, false));
        return;
    }

    let Some(data) = app.lyrics_data.clone() else {
        app.is_lyrics_open = false;
        ctx.data_mut(|d| d.insert_temp(just_opened_id, false));
        return;
    };

    let was_open = ctx.data(|d| d.get_temp::<bool>(just_opened_id).unwrap_or(false));
    let mut is_open = app.is_lyrics_open;
    let mut win = egui::Window::new("Lembar Cue Penyiar & Lirik Lagu")
        .id(egui::Id::unique("rcb_lyrics_dialog_v2"))
        .open(&mut is_open)
        .title_bar(false)
        .collapsible(false)
        .resizable(false)
        .movable(true)
        .frame(dialog_frame())
        .fixed_size(egui::vec2(720.0, 560.0));

    if !was_open {
        let center = ctx.content_rect().center() - egui::vec2(360.0, 280.0);
        win = win.current_pos(center);
        ctx.data_mut(|d| d.insert_temp(just_opened_id, true));
    }

    win.show(ctx, |ui| {
            let pane_w = 692.0_f32;
            ui.set_width(pane_w);
            let tp = &data.talking_points;

            ui.allocate_ui_with_layout(
                egui::vec2(pane_w, 28.0),
                egui::Layout::left_to_right(egui::Align::Center),
                |ui| {
                    ui.label(bold_text("Cue Penyiar & Lirik", 16.5, TEXT_PRIMARY));
                    ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                        if window_close_x(ui) {
                            app.is_lyrics_open = false;
                        }
                        if tp.play_count > 0 {
                            status_pill(
                                ui,
                                &format!("Diputar {}x", tp.play_count),
                                STATUS_SUCCESS,
                            );
                        }
                        status_pill(ui, &tp.vibe_badge, AMBER_PRIMARY);
                    });
                },
            );

            ui.add_space(8.0);

            // 2-Tab Switcher inside the single dialog (Cue Penyiar vs Lirik Lagu)
            Frame::NONE
                .fill(DECK_BG)
                .stroke(Stroke::new(1.0, BORDER_COLOR))
                .corner_radius(CornerRadius::same(9))
                .inner_margin(Margin::same(4))
                .show(ui, |ui| {
                    ui.set_width(pane_w - 8.0);
                    let half_w = (pane_w - 16.0) / 2.0;
                    ui.horizontal(|ui| {
                        let cue_active = app.lyrics_modal_tab == LyricsModalTab::CueSheet;
                        if animated_segment_tab(
                            ui,
                            egui::vec2(half_w, 30.0),
                            "Cue Penyiar & Naskah",
                            cue_active,
                            true,
                            6,
                        )
                        .clicked()
                        {
                            app.lyrics_modal_tab = LyricsModalTab::CueSheet;
                        }

                        let lyr_active = app.lyrics_modal_tab == LyricsModalTab::Lyrics;
                        if animated_segment_tab(
                            ui,
                            egui::vec2(half_w, 30.0),
                            "Lirik Lagu",
                            lyr_active,
                            true,
                            6,
                        )
                        .clicked()
                        {
                            app.lyrics_modal_tab = LyricsModalTab::Lyrics;
                        }
                    });
                });

            ui.add_space(10.0);

            egui::ScrollArea::vertical()
                .id_salt("lyrics_modal_scroll")
                .max_height(462.0)
                .show(ui, |ui| {
                    ui.set_width(pane_w);
                    match app.lyrics_modal_tab {
                        LyricsModalTab::CueSheet => {
                            // 1. Timing Cue Strip (3 clean scannable cards)
                            let card_w = (pane_w - 16.0) / 3.0;
                            ui.horizontal(|ui| {
                                cue_timing_card(
                                    ui,
                                    card_w,
                                    "INTRO RAMP",
                                    &tp.intro_talk_window,
                                    SIGNAL_CYAN,
                                );
                                cue_timing_card(
                                    ui,
                                    card_w,
                                    "MIDPOINT CUE",
                                    &tp.station_id_cue,
                                    AMBER_PRIMARY,
                                );
                                cue_timing_card(
                                    ui,
                                    card_w,
                                    "OUTRO FADE",
                                    &tp.outro_talk_window,
                                    TEXT_SECONDARY,
                                );
                            });

                            ui.add_space(10.0);

                            // 2. Naskah Intro Siap Baca
                            setting_group_frame().show(ui, |ui| {
                                ui.set_width(pane_w - 28.0);
                                ui.horizontal(|ui| {
                                    ui.label(bold_text(
                                        "Naskah Intro Siap Baca",
                                        13.0,
                                        AMBER_PRIMARY,
                                    ));
                                    ui.with_layout(
                                        egui::Layout::right_to_left(egui::Align::Center),
                                        |ui| {
                                            if copy_feedback_button(
                                                ui,
                                                "copy_intro_btn",
                                                "Salin Intro",
                                                "Tersalin!",
                                            ) {
                                                ctx.copy_text(tp.intro_script.clone());
                                            }
                                        },
                                    );
                                });
                                ui.add_space(6.0);
                                ui.add(
                                    egui::Label::new(semibold_text(
                                        &tp.intro_script,
                                        13.5,
                                        TEXT_PRIMARY,
                                    ))
                                    .wrap(),
                                );
                            });

                            ui.add_space(10.0);

                            // 3. Naskah Outro / Backsell
                            setting_group_frame().show(ui, |ui| {
                                ui.set_width(pane_w - 28.0);
                                ui.horizontal(|ui| {
                                    ui.label(bold_text(
                                        "Naskah Outro / Backsell",
                                        13.0,
                                        AMBER_PRIMARY,
                                    ));
                                    ui.with_layout(
                                        egui::Layout::right_to_left(egui::Align::Center),
                                        |ui| {
                                            if copy_feedback_button(
                                                ui,
                                                "copy_outro_btn",
                                                "Salin Outro",
                                                "Tersalin!",
                                            ) {
                                                ctx.copy_text(tp.outro_script.clone());
                                            }
                                        },
                                    );
                                });
                                ui.add_space(6.0);
                                ui.add(
                                    egui::Label::new(semibold_text(
                                        &tp.outro_script,
                                        13.5,
                                        TEXT_PRIMARY,
                                    ))
                                    .wrap(),
                                );
                            });

                            // 4. Broadcaster Tips & Key Lyric
                            if !tp.key_lyric_quote.is_empty() || !tp.broadcaster_tips.is_empty() {
                                ui.add_space(10.0);
                                setting_group_frame().show(ui, |ui| {
                                    ui.set_width(pane_w - 28.0);
                                    if !tp.key_lyric_quote.is_empty() {
                                        ui.label(bold_text(
                                            "Kutipan Lirik Kunci",
                                            12.0,
                                            SIGNAL_CYAN,
                                        ));
                                        ui.add_space(4.0);
                                        Frame::NONE
                                            .fill(egui::Color32::from_rgb(20, 20, 26))
                                            .stroke(Stroke::new(
                                                1.0,
                                                egui::Color32::from_rgba_unmultiplied(
                                                    245, 158, 11, 90,
                                                ),
                                            ))
                                            .corner_radius(CornerRadius::same(7))
                                            .inner_margin(Margin::symmetric(12, 8))
                                            .show(ui, |ui| {
                                                ui.set_width(pane_w - 54.0);
                                                ui.add(
                                                    egui::Label::new(semibold_text(
                                                        format!("\"{}\"", tp.key_lyric_quote),
                                                        13.0,
                                                        AMBER_PRIMARY,
                                                    ))
                                                    .wrap(),
                                                );
                                            });
                                        ui.add_space(8.0);
                                    }
                                    if !tp.broadcaster_tips.is_empty() {
                                        ui.label(bold_text(
                                            "Tips Teknis Siaran",
                                            12.0,
                                            TEXT_MUTED,
                                        ));
                                        ui.add_space(4.0);
                                        for tip in &tp.broadcaster_tips {
                                            ui.add(
                                                egui::Label::new(semibold_text(
                                                    format!("• {tip}"),
                                                    12.0,
                                                    TEXT_SECONDARY,
                                                ))
                                                .wrap(),
                                            );
                                            ui.add_space(2.0);
                                        }
                                    }
                                });
                            }
                        }

                        LyricsModalTab::Lyrics => {
                            // Full Lyrics Tab
                            setting_group_frame().show(ui, |ui| {
                                ui.set_width(pane_w - 28.0);
                                ui.horizontal(|ui| {
                                    ui.label(bold_text("Lirik Lengkap Lagu", 13.0, TEXT_PRIMARY));
                                    ui.with_layout(
                                        egui::Layout::right_to_left(egui::Align::Center),
                                        |ui| {
                                            if copy_feedback_button(
                                                ui,
                                                "copy_lyrics_btn",
                                                "Salin Lirik",
                                                "Tersalin!",
                                            ) {
                                                ctx.copy_text(data.lyrics.clone());
                                            }
                                            ui.label(semibold_text(
                                                format!("Sumber: {}", data.source),
                                                11.0,
                                                TEXT_SECONDARY,
                                            ));
                                        },
                                    );
                                });
                                ui.add_space(8.0);
                                ui.add(
                                    egui::Label::new(semibold_text(&data.lyrics, 13.0, TEXT_PRIMARY))
                                        .wrap(),
                                );
                            });
                        }
                    }
                });
        });

    if !is_open {
        app.is_lyrics_open = false;
    }
    if !app.is_lyrics_open {
        ctx.data_mut(|d| d.insert_temp(just_opened_id, false));
    }
}

fn cue_timing_card(
    ui: &mut egui::Ui,
    width: f32,
    title: &str,
    value: &str,
    accent: egui::Color32,
) {
    lcd_frame().show(ui, |ui| {
        ui.set_width((width - 20.0).max(120.0));
        ui.vertical(|ui| {
            ui.spacing_mut().item_spacing.y = 3.0;
            ui.label(mono_text(title, 10.0, accent));
            ui.add(egui::Label::new(semibold_text(value, 11.5, TEXT_PRIMARY)).wrap());
        });
    });
}
