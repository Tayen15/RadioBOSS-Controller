use eframe::egui::{self, Color32, CornerRadius, Stroke};

use crate::app::{format_float_time, RadioCasterApp};
use crate::events::AppCommand;
use crate::services::audio_player::AudioPreviewState;
use crate::services::title_cleaner::clean_broadcast_title;
use crate::ui::theme::{
    amber_button, bold_text, lcd_frame, module_frame, mono_text, semibold_text, slate_button,
    status_pill, AMBER_DARK_TEXT, AMBER_PRIMARY, BORDER_COLOR, CONTROL_BG, SIGNAL_CYAN,
    STATUS_ERROR, STATUS_SUCCESS, TEXT_MUTED, TEXT_PRIMARY, TEXT_SECONDARY,
};

pub fn render_cue_deck(
    ui: &mut egui::Ui,
    app: &mut RadioCasterApp,
    audio_st: &AudioPreviewState,
) {
    module_frame().show(ui, |ui| {
        ui.horizontal(|ui| {
            ui.label(bold_text("STUDIO CUE & DISPATCH DECK", 13.0, TEXT_PRIMARY));
            ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                if app.selected_track.is_some() {
                    status_pill(ui, "SIAP SIAR", AMBER_PRIMARY);
                } else {
                    status_pill(ui, "STANDBY", TEXT_SECONDARY);
                }
            });
        });
        ui.add_space(6.0);

        let Some(mut track) = app.selected_track.clone() else {
            lcd_frame().show(ui, |ui| {
                ui.label(semibold_text(
                    "Klik lagu dari hasil pencarian atau daftar rekomendasi di sebelah kiri untuk memuat pratinjau headphone, lembar cue penyiar, dan tombol kirim ke RadioBOSS.",
                    12.0,
                    TEXT_SECONDARY,
                ));
                if let Some(first) = app.search_results.first().cloned() {
                    ui.add_space(6.0);
                    if slate_button(ui, "▶ Muat Hasil #01").clicked() {
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

        // Pre-Queue Metadata Editor + Magic Clean
        ui.horizontal(|ui| {
            ui.label(semibold_text("Editor Metadata RadioBOSS", 11.5, TEXT_SECONDARY));
            ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                if slate_button(ui, "Magic Clean").clicked() {
                    app.edit_title = clean_broadcast_title(&app.edit_title);
                }
                let lyrics_busy = app.is_loading("lyrics");
                if slate_button(
                    ui,
                    if lyrics_busy {
                        "Memuat Cue..."
                    } else {
                        "Lirik & Cue Sheet"
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
                if is_this_track && audio_st.is_loading {
                    ui.label(semibold_text("Memuat audio headphone...", 11.5, AMBER_PRIMARY));
                } else if is_this_track && audio_st.is_playing {
                    if amber_button(ui, "|| Jeda Headphone").clicked() {
                        app.audio.toggle_pause();
                    }
                    if slate_button(ui, "■ Stop").clicked() {
                        app.audio.stop();
                    }
                } else if is_this_track && audio_st.elapsed_secs > 0.0 {
                    if amber_button(ui, "▶ Lanjutkan").clicked() {
                        app.audio.toggle_pause();
                    }
                    if slate_button(ui, "■ Stop").clicked() {
                        app.audio.stop();
                    }
                } else if slate_button(ui, "▶ Pratinjau Headphone").clicked() {
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
                } else if audio_st.total_secs > 0.0 {
                    ui.add_space(4.0);
                    let pct = (audio_st.elapsed_secs / audio_st.total_secs).clamp(0.0, 1.0);
                    ui.horizontal(|ui| {
                        ui.label(mono_text(
                            format!(
                                "{} / {}",
                                format_float_time(audio_st.elapsed_secs),
                                format_float_time(audio_st.total_secs)
                            ),
                            11.0,
                            AMBER_PRIMARY,
                        ));
                        let bw = ui.available_width().max(60.0);
                        let (rect, _) =
                            ui.allocate_exact_size(egui::vec2(bw, 5.0), egui::Sense::hover());
                        ui.painter()
                            .rect_filled(rect, CornerRadius::same(3), CONTROL_BG);
                        let mut fr = rect;
                        fr.set_width(rect.width() * pct);
                        ui.painter()
                            .rect_filled(fr, CornerRadius::same(3), AMBER_PRIMARY);
                    });
                }
            }
        });

        ui.add_space(8.0);

        // Studio Master Cache Toggle
        ui.checkbox(
            &mut app.use_studio_cache,
            semibold_text(
                "Simpan di Studio Master Cache (MP3 320k + ID3v2 + Cover Art .jpg)",
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
                            "+ Antrean Bawah",
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
