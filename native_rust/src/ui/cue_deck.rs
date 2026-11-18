use eframe::egui::{self, Color32, CornerRadius, Stroke};

use crate::app::{format_float_time, RadioCasterApp};
use crate::events::AppCommand;
use crate::services::audio_player::AudioPreviewState;
use crate::services::title_cleaner::clean_broadcast_title;
use crate::ui::theme::{
    bold_text, lcd_frame, lerp_color, module_frame, mono_text, semibold_text, slate_button, status_pill, AMBER_DARK_TEXT, AMBER_PRIMARY, BORDER_COLOR, CONTROL_BG,
    SIGNAL_CYAN, SLATE_BTN, STATUS_ERROR, STATUS_SUCCESS, TEXT_MUTED, TEXT_PRIMARY, TEXT_SECONDARY,
};

pub fn render_cue_deck(
    ui: &mut egui::Ui,
    app: &mut RadioCasterApp,
    audio_st: &AudioPreviewState,
) {
    module_frame().show(ui, |ui| {
        ui.horizontal(|ui| {
            ui.label(bold_text("Deck Persiapan", 13.5, TEXT_PRIMARY));
            ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                if app.selected_track.is_some() {
                    status_pill(ui, "Siap", AMBER_PRIMARY);
                } else {
                    status_pill(ui, "Standby", TEXT_SECONDARY);
                }
            });
        });
        ui.add_space(6.0);

        let Some(mut track) = app.selected_track.clone() else {
            lcd_frame().show(ui, |ui| {
                ui.label(semibold_text(
                    "Pilih lagu dari daftar di sebelah kiri untuk pratinjau, lihat lirik, atau kirim ke antrean.",
                    12.0,
                    TEXT_SECONDARY,
                ));
                if let Some(first) = app.search_results.first().cloned() {
                    ui.add_space(6.0);
                    if slate_button(ui, "▶ Muat Lagu #01").clicked() {
                        app.select_track(first);
                    }
                }
            });
            return;
        };

        let is_cached = app.cached_video_ids.contains(&track.video_id);
        let crowd_meta = app.crowd_meta_cache.get(&track.video_id).cloned();

        // Top Metadata Summary Card
        lcd_frame().show(ui, |ui| {
            ui.horizontal(|ui| {
                if let Some(ref thumb) = track.thumbnail_url {
                    ui.add(
                        egui::Image::from_uri(thumb)
                            .fit_to_exact_size(egui::vec2(72.0, 72.0))
                            .corner_radius(CornerRadius::same(8)),
                    );
                }
                ui.vertical(|ui| {
                    ui.spacing_mut().item_spacing.y = 3.0;
                    ui.horizontal_wrapped(|ui| {
                        if is_cached {
                            status_pill(ui, "TERSIMPAN DI DISK", STATUS_SUCCESS);
                        }
                        if let Some(ref yr) = track.year {
                            if !yr.is_empty() {
                                status_pill(ui, yr, SIGNAL_CYAN);
                            }
                        }
                        status_pill(ui, track.display_duration(), AMBER_PRIMARY);
                    });
                    ui.label(bold_text(&app.edit_title, 15.0, TEXT_PRIMARY));
                    ui.label(semibold_text(
                        format!(
                            "{}{}",
                            app.edit_artist,
                            track
                                .album
                                .as_deref()
                                .filter(|a| !a.is_empty())
                                .map(|a| format!(" • {a}"))
                                .unwrap_or_default()
                        ),
                        12.0,
                        TEXT_SECONDARY,
                    ));
                });
            });

            // Crowd-Cleaned Suggestion Pill
            if let Some(ref cm) = crowd_meta {
                if cm.is_crowd_cleaned
                    && (cm.clean_title != app.edit_title || cm.clean_artist != app.edit_artist)
                {
                    ui.add_space(6.0);
                    ui.horizontal(|ui| {
                        status_pill(
                            ui,
                            &format!("CROWD-CLEANED ({} votes)", cm.votes_count),
                            SIGNAL_CYAN,
                        );
                        ui.label(semibold_text(
                            format!("{} - {}", cm.clean_artist, cm.clean_title),
                            11.5,
                            TEXT_PRIMARY,
                        ));
                        if slate_button(ui, "Terapkan").clicked() {
                            app.edit_title = cm.clean_title.clone();
                            app.edit_artist = cm.clean_artist.clone();
                        }
                    });
                }
            }
        });

        ui.add_space(8.0);

        // Pre-Queue Metadata Editor + Rapikan Judul
        ui.horizontal(|ui| {
            ui.label(semibold_text("Metadata Siaran", 11.5, TEXT_SECONDARY));
            ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                if slate_button(ui, "Rapikan Judul").clicked() {
                    app.edit_title = clean_broadcast_title(&app.edit_title);
                }
                let lyrics_busy = app.is_loading("lyrics");
                if slate_button(
                    ui,
                    if lyrics_busy {
                        "Memuat..."
                    } else {
                        "Cue & Lirik"
                    },
                )
                .clicked()
                    && !lyrics_busy
                {
                    track.title = app.edit_title.clone();
                    track.artists = vec![app.edit_artist.clone()];
                    app.send_cmd(AppCommand::FetchLyrics(track.clone()));
                }
            });
        });

        ui.add_space(4.0);
        let half = ((ui.available_width() - 8.0) / 2.0).max(110.0);
        ui.horizontal(|ui| {
            ui.vertical(|ui| {
                ui.label(semibold_text("Artis", 11.0, TEXT_MUTED));
                ui.add_sized([half, 28.0], egui::TextEdit::singleline(&mut app.edit_artist));
            });
            ui.vertical(|ui| {
                ui.label(semibold_text("Judul Lagu", 11.0, TEXT_MUTED));
                ui.add_sized([half, 28.0], egui::TextEdit::singleline(&mut app.edit_title));
            });
        });

        ui.add_space(8.0);

        // Native Headphone Audio Preview Deck (rodio)
        let is_this_track = audio_st.active_video_id.as_deref() == Some(&track.video_id);
        lcd_frame().show(ui, |ui| {
            ui.horizontal(|ui| {
                ui.spacing_mut().item_spacing.x = 6.0;
                if is_this_track && audio_st.is_loading {
                    ui.label(semibold_text("Memuat audio headphone...", 11.5, AMBER_PRIMARY));
                } else if is_this_track && audio_st.is_playing {
                    if preview_btn(ui, "|| Jeda", true).clicked() {
                        app.audio.toggle_pause();
                    }
                    if preview_btn(ui, "■ Stop", false).clicked() {
                        app.audio.stop();
                    }
                } else if is_this_track && audio_st.elapsed_secs > 0.0 {
                    if preview_btn(ui, "▶ Lanjutkan", true).clicked() {
                        app.audio.toggle_pause();
                    }
                    if preview_btn(ui, "■ Stop", false).clicked() {
                        app.audio.stop();
                    }
                } else if preview_btn(ui, "▶ Pratinjau Headphone", false).clicked() {
                    app.send_cmd(AppCommand::StartAudioPreview(track.clone()));
                }

                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    let mut vol = audio_st.volume;
                    if ui
                        .add(
                            egui::Slider::new(&mut vol, 0.0..=1.0)
                                .show_value(false)
                                .fixed_decimals(2),
                        )
                        .changed()
                    {
                        app.audio.set_volume(vol);
                    }
                    ui.label(mono_text(
                        format!("Vol {}%", (vol * 100.0) as u32),
                        11.0,
                        TEXT_SECONDARY,
                    ));
                });
            });

            if is_this_track {
                if let Some(ref err) = audio_st.error {
                    ui.add_space(4.0);
                    ui.label(semibold_text(err, 11.0, STATUS_ERROR));
                } else if !audio_st.is_loading
                    && (audio_st.is_playing || audio_st.elapsed_secs > 0.0 || audio_st.total_secs > 0.0)
                {
                    ui.add_space(6.0);
                    let total = audio_st.total_secs;
                    let has_dur = total > 0.0;
                    let drag_id = egui::Id::unique("headphone_seek_drag");
                    let mut drag_pct = ui.ctx().data(|d| d.get_temp::<Option<f32>>(drag_id).flatten());
                    let actual_pct = if has_dur {
                        (audio_st.elapsed_secs / total).clamp(0.0, 1.0)
                    } else {
                        0.0
                    };
                    let display_pct = drag_pct.unwrap_or(actual_pct);
                    let display_secs = if has_dur {
                        display_pct * total
                    } else {
                        audio_st.elapsed_secs
                    };

                    ui.horizontal(|ui| {
                        let total_str = if has_dur {
                            format_float_time(total)
                        } else {
                            "--:--".to_string()
                        };
                        ui.label(mono_text(
                            format!("{} / {}", format_float_time(display_secs), total_str),
                            11.0,
                            AMBER_PRIMARY,
                        ));
                        let bw = ui.available_width().max(80.0);
                        let sense = if has_dur {
                            egui::Sense::click_and_drag()
                        } else {
                            egui::Sense::hover()
                        };
                        let (hit_rect, resp) = ui.allocate_exact_size(egui::vec2(bw, 16.0), sense);
                        let resp = if has_dur {
                            resp.on_hover_cursor(egui::CursorIcon::PointingHand)
                        } else {
                            resp
                        };

                        if has_dur {
                            if let Some(pos) = resp.interact_pointer_pos() {
                                let new_pct =
                                    ((pos.x - hit_rect.left()) / hit_rect.width()).clamp(0.0, 1.0);
                                if resp.dragged() {
                                    drag_pct = Some(new_pct);
                                    ui.ctx().data_mut(|d| d.insert_temp(drag_id, Some(new_pct)));
                                } else if resp.clicked() {
                                    app.audio.seek(new_pct * total);
                                }
                            }
                            if resp.drag_stopped() {
                                if let Some(pct) = drag_pct.take() {
                                    app.audio.seek(pct * total);
                                }
                                ui.ctx().data_mut(|d| d.remove::<Option<f32>>(drag_id));
                            }

                            if resp.hovered() {
                                if let Some(hpos) = ui.ctx().input(|i| i.pointer.hover_pos()) {
                                    let hpct = ((hpos.x - hit_rect.left()) / hit_rect.width())
                                        .clamp(0.0, 1.0);
                                    resp.clone().on_hover_text(format_float_time(hpct * total));
                                }
                            }
                        }

                        let bar_rect = egui::Rect::from_center_size(
                            hit_rect.center(),
                            egui::vec2(hit_rect.width(), 5.0),
                        );
                        ui.painter()
                            .rect_filled(bar_rect, CornerRadius::same(3), CONTROL_BG);
                        if has_dur {
                            let mut fill_rect = bar_rect;
                            fill_rect.set_width((bar_rect.width() * display_pct).max(0.0));
                            ui.painter()
                                .rect_filled(fill_rect, CornerRadius::same(3), AMBER_PRIMARY);

                            let thumb_r = if resp.hovered() || resp.dragged() {
                                5.5
                            } else {
                                3.5
                            };
                            let thumb_x = bar_rect.left() + bar_rect.width() * display_pct;
                            ui.painter().circle_filled(
                                egui::pos2(thumb_x, bar_rect.center().y),
                                thumb_r,
                                Color32::WHITE,
                            );
                        }
                    });
                }
            }
        });

        ui.add_space(8.0);

        // Studio Master Cache Toggle
        ui.checkbox(
            &mut app.use_studio_cache,
            semibold_text(
                "Simpan MP3 ke disk (ID3v2 + Sampul)",
                11.5,
                TEXT_PRIMARY,
            ),
        );

        ui.add_space(6.0);

        // Target Playlist Tab Selector
        ui.horizontal_wrapped(|ui| {
            ui.label(semibold_text("Target Tab:", 11.5, TEXT_SECONDARY));
            let auto_active = app.active_tab.is_empty();
            if ui
                .add(
                    egui::Button::new(semibold_text(
                        "Auto/Aktif",
                        11.0,
                        if auto_active {
                            AMBER_DARK_TEXT
                        } else {
                            TEXT_PRIMARY
                        },
                    ))
                    .fill(if auto_active {
                        AMBER_PRIMARY
                    } else {
                        CONTROL_BG
                    })
                    .corner_radius(CornerRadius::same(6)),
                )
                .clicked()
            {
                app.active_tab = String::new();
                app.send_cmd(AppCommand::SelectPlaylistTab(String::new()));
            }
            let tabs = app.available_tabs.clone();
            for tab in tabs {
                let active = app.active_tab == tab;
                if ui
                    .add(
                        egui::Button::new(semibold_text(
                            &tab,
                            11.0,
                            if active {
                                AMBER_DARK_TEXT
                            } else {
                                TEXT_PRIMARY
                            },
                        ))
                        .fill(if active { AMBER_PRIMARY } else { CONTROL_BG })
                        .corner_radius(CornerRadius::same(6)),
                    )
                    .clicked()
                {
                    app.active_tab = tab.clone();
                    app.send_cmd(AppCommand::SelectPlaylistTab(tab));
                }
            }
        });

        ui.add_space(8.0);

        // Primary Dispatch Actions
        track.title = app.edit_title.trim().to_string();
        track.artists = if app.edit_artist.trim().is_empty() {
            vec!["Unknown Artist".to_string()]
        } else {
            vec![app.edit_artist.trim().to_string()]
        };

        let is_queueing = app.is_loading("queue");
        let btn_w = ((ui.available_width() - 8.0) / 2.0).max(110.0);
        ui.horizontal(|ui| {
            ui.add_enabled_ui(!is_queueing, |ui| {
                if ui
                    .add_sized(
                        [btn_w, 38.0],
                        egui::Button::new(bold_text(
                            if is_queueing {
                                "Mengirim..."
                            } else {
                                "Putar Berikutnya"
                            },
                            12.5,
                            AMBER_DARK_TEXT,
                        ))
                        .fill(AMBER_PRIMARY)
                        .corner_radius(CornerRadius::same(8)),
                    )
                    .clicked()
                {
                    app.selected_track = Some(track.clone());
                    app.send_cmd(AppCommand::QueueTrack {
                        track: track.clone(),
                        pos: -2,
                        use_cache: app.use_studio_cache,
                        target_tab: app.active_tab.clone(),
                        skip_repeat_check: false,
                    });
                }

                if ui
                    .add_sized(
                        [btn_w, 38.0],
                        egui::Button::new(bold_text(
                            "Tambah ke Antrean",
                            12.5,
                            TEXT_PRIMARY,
                        ))
                        .fill(Color32::from_rgb(39, 39, 48))
                        .stroke(Stroke::new(1.0, BORDER_COLOR))
                        .corner_radius(CornerRadius::same(8)),
                    )
                    .clicked()
                {
                    app.selected_track = Some(track.clone());
                    app.send_cmd(AppCommand::QueueTrack {
                        track: track.clone(),
                        pos: -1,
                        use_cache: app.use_studio_cache,
                        target_tab: app.active_tab.clone(),
                        skip_repeat_check: false,
                    });
                }
            });
        });
    });
}

fn preview_btn(ui: &mut egui::Ui, label: &str, is_amber: bool) -> egui::Response {
    let text_col = if is_amber { AMBER_DARK_TEXT } else { TEXT_PRIMARY };
    let font = egui::FontId::new(
        12.0,
        egui::FontFamily::Name(if is_amber { "bold" } else { "semibold" }.into()),
    );
    let galley = ui
        .painter()
        .layout_no_wrap(label.to_string(), font, text_col);
    let desired = egui::vec2(galley.size().x + 20.0, 28.0);
    let (rect, resp) = ui.allocate_exact_size(desired, egui::Sense::click());
    let resp = resp.on_hover_cursor(egui::CursorIcon::PointingHand);

    let hov_t = ui.ctx().animate_bool_responsive(resp.id, resp.hovered());
    let prs_t = ui
        .ctx()
        .animate_bool_responsive(resp.id.with("p"), resp.is_pointer_button_down_on());

    let (base_fill, hov_fill, prs_fill, base_str, hov_str) = if is_amber {
        (
            AMBER_PRIMARY,
            Color32::from_rgb(251, 184, 52),
            Color32::from_rgb(217, 119, 6),
            Color32::TRANSPARENT,
            Color32::TRANSPARENT,
        )
    } else {
        (
            SLATE_BTN,
            Color32::from_rgb(54, 54, 67),
            Color32::from_rgb(31, 31, 39),
            BORDER_COLOR,
            Color32::from_rgb(84, 84, 102),
        )
    };
    let fill = lerp_color(lerp_color(base_fill, hov_fill, hov_t), prs_fill, prs_t);
    let stroke_col = lerp_color(base_str, hov_str, hov_t);
    let stroke = if stroke_col.a() == 0 {
        Stroke::NONE
    } else {
        Stroke::new(1.0, stroke_col)
    };

    ui.painter()
        .rect(rect, CornerRadius::same(7), fill, stroke, egui::StrokeKind::Inside);
    ui.painter()
        .galley(rect.center() - galley.size() * 0.5, galley, text_col);
    resp
}
