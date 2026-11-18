use eframe::egui::{self, CornerRadius, Margin, Stroke};

use crate::app::{RadioCasterApp, RecSubTab};
use crate::events::AppCommand;
use crate::models::track::TrackItem;
use crate::ui::theme::{
    amber_button, bold_text, danger_button, lcd_frame, module_frame, mono_text, semibold_text,
    slate_button, status_pill, AMBER_DARK_TEXT, AMBER_PRIMARY, BORDER_COLOR, CONTROL_BG,
    SIGNAL_CYAN, STATUS_SUCCESS, TEXT_MUTED, TEXT_PRIMARY, TEXT_SECONDARY,
};

const MOOD_OPTIONS: &[(&str, &str, &str)] = &[
    ("morning", "Semangat Pagi", "indonesia pop hits upbeat semangat"),
    ("chill", "Akustik Santai", "chill acoustic pop indonesia"),
    ("tophits", "Top Hits Indo", "lagu pop indonesia terbaru hits"),
    ("melow", "Pop Melankolis", "lagu galau indonesia viral sedih"),
    ("nostalgia", "Era 2000an", "pop indonesia hits tahun 2000an"),
];

const CASTERHUB_CATS: &[(&str, &str)] = &[
    ("top50", "Top 50 Global"),
    ("trending", "Trending 48h"),
    ("morning", "Siaran Pagi"),
    ("afternoon", "Santai Sore"),
    ("night", "Siaran Malam"),
];

pub fn render_recommendations(ui: &mut egui::Ui, app: &mut RadioCasterApp) {
    module_frame().show(ui, |ui| {
        // 7 Sub-tabs bar
        ui.horizontal_wrapped(|ui| {
            let tabs = [
                (RecSubTab::UpNext, "Up Next"),
                (RecSubTab::Artist, "Top Artis"),
                (RecSubTab::GlobalCharts, "Global Charts"),
                (RecSubTab::ListenerInbox, "Request Masuk"),
                (RecSubTab::DjTopChart, "DJ Top Chart"),
                (RecSubTab::DjSmartRotation, "Rotasi Cerdas"),
                (RecSubTab::Moods, "Mood Siaran"),
            ];

            for (tab_id, label) in tabs {
                let active = app.rec_sub_tab == tab_id;
                let badge_suffix = if tab_id == RecSubTab::ListenerInbox && !app.listener_requests.is_empty() {
                    format!(" ({})", app.listener_requests.len())
                } else {
                    String::new()
                };
                let txt = format!("{label}{badge_suffix}");
                if ui
                    .add(
                        egui::Button::new(bold_text(
                            txt,
                            11.5,
                            if active {
                                AMBER_DARK_TEXT
                            } else {
                                TEXT_SECONDARY
                            },
                        ))
                        .fill(if active { AMBER_PRIMARY } else { CONTROL_BG })
                        .stroke(Stroke::new(1.0, if active { AMBER_PRIMARY } else { BORDER_COLOR }))
                        .corner_radius(CornerRadius::same(7))
                        .min_size(egui::vec2(0.0, 28.0)),
                    )
                    .clicked()
                {
                    app.rec_sub_tab = tab_id;
                    match tab_id {
                        RecSubTab::GlobalCharts => {
                            app.send_cmd(AppCommand::LoadCasterHubCharts(
                                app.casterhub_category.clone(),
                            ));
                        }
                        RecSubTab::ListenerInbox => {
                            app.send_cmd(AppCommand::LoadListenerRequests);
                        }
                        RecSubTab::DjTopChart | RecSubTab::DjSmartRotation => {
                            app.send_cmd(AppCommand::LoadDjLocalStats);
                        }
                        _ => {}
                    }
                }
            }
        });

        ui.add_space(10.0);

        match app.rec_sub_tab {
            RecSubTab::UpNext => render_up_next_tab(ui, app),
            RecSubTab::Artist => render_artist_tab(ui, app),
            RecSubTab::GlobalCharts => render_casterhub_charts_tab(ui, app),
            RecSubTab::ListenerInbox => render_listener_inbox_tab(ui, app),
            RecSubTab::DjTopChart => render_dj_chart_tab(ui, app),
            RecSubTab::DjSmartRotation => render_dj_rotation_tab(ui, app),
            RecSubTab::Moods => render_mood_tab(ui, app),
        }
    });
}

fn render_up_next_tab(ui: &mut egui::Ui, app: &mut RadioCasterApp) {
    ui.horizontal(|ui| {
        ui.label(bold_text("Rekomendasi Serupa (Up Next)", 12.5, TEXT_PRIMARY));
        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
            if !app.recommendations.is_empty() && amber_button(ui, "⚡ Auto-Fill 3 Lagu").clicked() {
                let batch: Vec<TrackItem> = app.recommendations.iter().take(3).cloned().collect();
                app.send_cmd(AppCommand::AutoFillTracks {
                    tracks: batch,
                    pos: -1,
                    label: "Auto-Fill Up Next".to_string(),
                });
            }
        });
    });
    ui.add_space(6.0);

    if app.is_loading("recs") {
        ui.label(semibold_text("Memuat rekomendasi lagu serupa...", 12.0, AMBER_PRIMARY));
        return;
    }
    if app.recommendations.is_empty() {
        ui.label(semibold_text(
            "Pilih lagu dari pencarian di atas untuk melihat daftar rekomendasi yang senada.",
            12.0,
            TEXT_SECONDARY,
        ));
        return;
    }

    let list = app.recommendations.clone();
    render_rec_track_list(ui, app, &list, "upnext_list");
}

fn render_artist_tab(ui: &mut egui::Ui, app: &mut RadioCasterApp) {
    let artist_name = app
        .selected_track
        .as_ref()
        .map(|t| t.primary_artist().to_string())
        .or_else(|| app.last_seed_artist.clone())
        .unwrap_or_else(|| "NIKI".to_string());

    ui.horizontal(|ui| {
        ui.label(bold_text(
            format!("Lagu Terpopuler: {artist_name}"),
            12.5,
            TEXT_PRIMARY,
        ));
        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
            if !app.artist_tracks.is_empty() && amber_button(ui, "⚡ Auto-Fill 3 Lagu").clicked() {
                let batch: Vec<TrackItem> = app.artist_tracks.iter().take(3).cloned().collect();
                app.send_cmd(AppCommand::AutoFillTracks {
                    tracks: batch,
                    pos: -1,
                    label: format!("Top Artis {artist_name}"),
                });
            }
        });
    });
    ui.add_space(6.0);

    if app.is_loading("artist") {
        ui.label(semibold_text("Mengambil katalog artis...", 12.0, AMBER_PRIMARY));
        return;
    }
    if app.artist_tracks.is_empty() {
        ui.label(semibold_text(
            "Belum ada lagu artis yang dimuat.",
            12.0,
            TEXT_SECONDARY,
        ));
        return;
    }

    let list = app.artist_tracks.clone();
    render_rec_track_list(ui, app, &list, "artist_list");
}

fn render_casterhub_charts_tab(ui: &mut egui::Ui, app: &mut RadioCasterApp) {
    ui.horizontal(|ui| {
        ui.label(bold_text("CasterHub Global Charts (Live Network)", 12.5, TEXT_PRIMARY));
        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
            if slate_button(ui, "↻ Segarkan").clicked() {
                app.send_cmd(AppCommand::LoadCasterHubCharts(
                    app.casterhub_category.clone(),
                ));
            }
        });
    });
    ui.add_space(6.0);

    ui.horizontal_wrapped(|ui| {
        for (cat_id, label) in CASTERHUB_CATS {
            let active = app.casterhub_category == *cat_id;
            if ui
                .add(
                    egui::Button::new(semibold_text(
                        *label,
                        11.0,
                        if active { AMBER_DARK_TEXT } else { TEXT_PRIMARY },
                    ))
                    .fill(if active { AMBER_PRIMARY } else { CONTROL_BG })
                    .corner_radius(CornerRadius::same(6)),
                )
                .clicked()
            {
                app.casterhub_category = (*cat_id).to_string();
                app.send_cmd(AppCommand::LoadCasterHubCharts((*cat_id).to_string()));
            }
        }
    });
    ui.add_space(8.0);

    if app.is_loading("casterhub") {
        ui.label(semibold_text("Menghubungi CasterHub (rcb.oktaa.my.id)...", 12.0, AMBER_PRIMARY));
        return;
    }
    if app.casterhub_charts.is_empty() {
        ui.label(semibold_text(
            "Belum ada data chart global saat ini.",
            12.0,
            TEXT_SECONDARY,
        ));
        return;
    }

    let charts = app.casterhub_charts.clone();
    egui::ScrollArea::vertical()
        .id_salt("casterhub_charts_scroll")
        .max_height(310.0)
        .show(ui, |ui| {
            for item in charts {
                let as_track = TrackItem {
                    video_id: item.video_id.clone(),
                    title: item.title.clone(),
                    artists: vec![item.artist.clone()],
                    album: item.album.clone(),
                    duration_seconds: None,
                    duration_formatted: item.duration_formatted.clone(),
                    thumbnail_url: None,
                    url: format!("https://music.youtube.com/watch?v={}", item.video_id),
                    year: None,
                    genre: item.genre.clone(),
                };
                lcd_frame().inner_margin(Margin::symmetric(10, 7)).show(ui, |ui| {
                    ui.horizontal(|ui| {
                        ui.label(mono_text(format!("#{:02}", item.rank), 12.5, AMBER_PRIMARY));
                        ui.vertical(|ui| {
                            ui.spacing_mut().item_spacing.y = 1.0;
                            ui.set_max_width((ui.available_width() - 210.0).max(110.0));
                            ui.add(egui::Label::new(semibold_text(&item.title, 12.5, TEXT_PRIMARY)).truncate());
                            ui.add(
                                egui::Label::new(semibold_text(
                                    format!(
                                        "{} • {} putar • {} stasiun",
                                        item.artist, item.total_plays, item.unique_stations
                                    ),
                                    11.0,
                                    TEXT_SECONDARY,
                                ))
                                .truncate(),
                            );
                        });
                        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                            render_quick_row_actions(ui, app, &as_track);
                        });
                    });
                });
                ui.add_space(4.0);
            }
        });
}

fn render_listener_inbox_tab(ui: &mut egui::Ui, app: &mut RadioCasterApp) {
    ui.horizontal(|ui| {
        ui.label(bold_text("Kotak Request Pendengar Online (CasterHub)", 12.5, TEXT_PRIMARY));
        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
            if slate_button(ui, "↻ Cek Inbox").clicked() {
                app.send_cmd(AppCommand::LoadListenerRequests);
            }
        });
    });
    ui.add_space(6.0);

    if app.is_loading("requests") {
        ui.label(semibold_text("Mengambil request masuk...", 12.0, AMBER_PRIMARY));
        return;
    }

    if app.listener_requests.is_empty() {
        ui.label(semibold_text(
            "Tidak ada request pendengar yang menunggu saat ini.",
            12.0,
            TEXT_SECONDARY,
        ));
        return;
    }

    let reqs = app.listener_requests.clone();
    egui::ScrollArea::vertical()
        .id_salt("listener_inbox_scroll")
        .max_height(310.0)
        .show(ui, |ui| {
            for req in reqs {
                let track = TrackItem {
                    video_id: req.video_id.clone(),
                    title: req.title.clone(),
                    artists: vec![req.artist.clone()],
                    album: None,
                    duration_seconds: None,
                    duration_formatted: req.duration_formatted.clone(),
                    thumbnail_url: req.thumbnail_url.clone(),
                    url: format!("https://music.youtube.com/watch?v={}", req.video_id),
                    year: None,
                    genre: Some("Listener Request".to_string()),
                };

                lcd_frame().show(ui, |ui| {
                    ui.horizontal(|ui| {
                        status_pill(ui, &req.sender_name, SIGNAL_CYAN);
                        ui.label(bold_text(
                            format!("{} - {}", req.artist, req.title),
                            12.5,
                            TEXT_PRIMARY,
                        ));
                    });
                    if !req.message.trim().is_empty() {
                        ui.add_space(3.0);
                        ui.label(semibold_text(
                            format!("Pesan Salam: \"{}\"", req.message),
                            11.5,
                            AMBER_PRIMARY,
                        ));
                    }
                    ui.add_space(4.0);
                    ui.horizontal(|ui| {
                        if amber_button(ui, "✓ Terima & Putar Next").clicked() {
                            app.send_cmd(AppCommand::ActionListenerRequest {
                                request_id: req.id.clone(),
                                action: "accept".to_string(),
                                track_to_queue: Some((track.clone(), -2)),
                            });
                        }
                        if slate_button(ui, "+ Antrean Bawah").clicked() {
                            app.send_cmd(AppCommand::ActionListenerRequest {
                                request_id: req.id.clone(),
                                action: "accept".to_string(),
                                track_to_queue: Some((track.clone(), -1)),
                            });
                        }
                        if danger_button(ui, "Tolak").clicked() {
                            app.send_cmd(AppCommand::ActionListenerRequest {
                                request_id: req.id.clone(),
                                action: "reject".to_string(),
                                track_to_queue: None,
                            });
                        }
                    });
                });
                ui.add_space(6.0);
            }
        });
}

fn render_dj_chart_tab(ui: &mut egui::Ui, app: &mut RadioCasterApp) {
    ui.horizontal(|ui| {
        ui.label(bold_text("DJ Top Chart Lokal (Database Studio)", 12.5, TEXT_PRIMARY));
        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
            if slate_button(ui, "↻ Segarkan").clicked() {
                app.send_cmd(AppCommand::LoadDjLocalStats);
            }
        });
    });
    ui.add_space(6.0);

    if app.dj_chart.is_empty() {
        ui.label(semibold_text(
            "Belum ada lagu yang tercatat diputar di studio lokal.",
            12.0,
            TEXT_SECONDARY,
        ));
        return;
    }

    let list = app.dj_chart.clone();
    egui::ScrollArea::vertical()
        .id_salt("dj_chart_scroll")
        .max_height(310.0)
        .show(ui, |ui| {
            for c in list {
                let rank = c.rank.unwrap_or(0);
                let (rot_txt, rot_color) = match c.rotation_status.as_str() {
                    "heavy" => ("HEAVY", AMBER_PRIMARY),
                    "medium" => ("MEDIUM", SIGNAL_CYAN),
                    _ => ("LIGHT", TEXT_SECONDARY),
                };
                let as_track = TrackItem::from(&c);
                lcd_frame().inner_margin(Margin::symmetric(10, 7)).show(ui, |ui| {
                    ui.horizontal(|ui| {
                        ui.label(mono_text(format!("#{rank:02}"), 12.5, AMBER_PRIMARY));
                        status_pill(ui, rot_txt, rot_color);
                        ui.vertical(|ui| {
                            ui.spacing_mut().item_spacing.y = 1.0;
                            ui.set_max_width((ui.available_width() - 220.0).max(100.0));
                            ui.add(egui::Label::new(semibold_text(&c.title, 12.5, TEXT_PRIMARY)).truncate());
                            ui.add(
                                egui::Label::new(semibold_text(
                                    format!(
                                        "{} • {}x putar ({})",
                                        c.artist, c.play_count, c.last_played_relative
                                    ),
                                    11.0,
                                    TEXT_SECONDARY,
                                ))
                                .truncate(),
                            );
                        });
                        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                            render_quick_row_actions(ui, app, &as_track);
                        });
                    });
                });
                ui.add_space(4.0);
            }
        });
}

fn render_dj_rotation_tab(ui: &mut egui::Ui, app: &mut RadioCasterApp) {
    ui.horizontal(|ui| {
        ui.label(bold_text("Rotasi Cerdas & Afiliasi Selera DJ", 12.5, TEXT_PRIMARY));
        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
            if !app.dj_rotation_ready.is_empty() && amber_button(ui, "⚡ Auto-Fill Rotasi").clicked() {
                let batch: Vec<TrackItem> = app
                    .dj_rotation_ready
                    .iter()
                    .take(3)
                    .map(TrackItem::from)
                    .collect();
                app.send_cmd(AppCommand::AutoFillTracks {
                    tracks: batch,
                    pos: -1,
                    label: "Auto-Fill Rotasi DJ".to_string(),
                });
            }
        });
    });
    ui.add_space(6.0);

    if !app.dj_top_artists.is_empty() {
        ui.horizontal_wrapped(|ui| {
            ui.label(semibold_text("Artis Favorit Studio:", 11.5, TEXT_SECONDARY));
            for a in app.dj_top_artists.clone() {
                status_pill(ui, &format!("{} ({}x)", a.artist, a.play_count), STATUS_SUCCESS);
            }
        });
        ui.add_space(8.0);
    }

    let rot_tracks: Vec<TrackItem> = app.dj_rotation_ready.iter().map(TrackItem::from).collect();
    if rot_tracks.is_empty() {
        ui.label(semibold_text(
            "Putar beberapa lagu terlebih dahulu untuk mengaktifkan mesin Rotasi Cerdas DJ.",
            12.0,
            TEXT_SECONDARY,
        ));
    } else {
        ui.label(semibold_text(
            "Lagu Siap Rotasi (Tersimpan & Sudah Lama Tidak Mengudara):",
            11.5,
            TEXT_SECONDARY,
        ));
        ui.add_space(4.0);
        render_rec_track_list(ui, app, &rot_tracks, "dj_rot_list");
    }

    if !app.dj_affinity_recs.is_empty() {
        ui.add_space(8.0);
        ui.label(semibold_text(
            "Eksplorasi Sesuai Selera DJ:",
            11.5,
            SIGNAL_CYAN,
        ));
        ui.add_space(4.0);
        let aff = app.dj_affinity_recs.clone();
        render_rec_track_list(ui, app, &aff, "dj_aff_list");
    }
}

fn render_mood_tab(ui: &mut egui::Ui, app: &mut RadioCasterApp) {
    ui.horizontal(|ui| {
        ui.label(bold_text("Kurasi Mood & Suasana Siaran", 12.5, TEXT_PRIMARY));
        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
            if !app.mood_tracks.is_empty() && amber_button(ui, "⚡ Auto-Fill Mood").clicked() {
                let batch: Vec<TrackItem> = app.mood_tracks.iter().take(3).cloned().collect();
                app.send_cmd(AppCommand::AutoFillTracks {
                    tracks: batch,
                    pos: -1,
                    label: "Auto-Fill Mood Siaran".to_string(),
                });
            }
        });
    });
    ui.add_space(6.0);

    ui.horizontal_wrapped(|ui| {
        for (mood_id, label, query) in MOOD_OPTIONS {
            let active = app.selected_mood_id == *mood_id;
            if ui
                .add(
                    egui::Button::new(semibold_text(
                        *label,
                        11.5,
                        if active { AMBER_DARK_TEXT } else { TEXT_PRIMARY },
                    ))
                    .fill(if active { AMBER_PRIMARY } else { CONTROL_BG })
                    .corner_radius(CornerRadius::same(7)),
                )
                .clicked()
            {
                app.selected_mood_id = (*mood_id).to_string();
                app.send_cmd(AppCommand::LoadMoodTracks((*query).to_string()));
            }
        }
    });
    ui.add_space(8.0);

    if app.is_loading("mood") {
        ui.label(semibold_text("Menyiapkan lagu sesuai mood...", 12.0, AMBER_PRIMARY));
        return;
    }

    let list = app.mood_tracks.clone();
    render_rec_track_list(ui, app, &list, "mood_list");
}

fn render_rec_track_list(
    ui: &mut egui::Ui,
    app: &mut RadioCasterApp,
    tracks: &[TrackItem],
    scroll_id: &str,
) {
    egui::ScrollArea::vertical()
        .id_salt(scroll_id)
        .max_height(265.0)
        .auto_shrink([false, true])
        .show(ui, |ui| {
            for (i, t) in tracks.iter().enumerate() {
                let row = lcd_frame().inner_margin(Margin::symmetric(10, 6)).show(ui, |ui| {
                    ui.horizontal(|ui| {
                        ui.label(mono_text(format!("{:02}", i + 1), 11.5, TEXT_MUTED));
                        ui.vertical(|ui| {
                            ui.spacing_mut().item_spacing.y = 1.0;
                            ui.set_max_width((ui.available_width() - 210.0).max(100.0));
                            ui.add(
                                egui::Label::new(semibold_text(&t.title, 12.5, TEXT_PRIMARY))
                                    .truncate(),
                            );
                            ui.add(
                                egui::Label::new(semibold_text(
                                    format!("{} • {}", t.artists_joined(), t.display_duration()),
                                    11.0,
                                    TEXT_SECONDARY,
                                ))
                                .truncate(),
                            );
                        });
                        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                            render_quick_row_actions(ui, app, t);
                        });
                    });
                });
                if row.response.interact(egui::Sense::click()).clicked() {
                    app.select_track(t.clone());
                }
                ui.add_space(4.0);
            }
        });
}

fn render_quick_row_actions(ui: &mut egui::Ui, app: &mut RadioCasterApp, track: &TrackItem) {
    if slate_button(ui, "Bawah").clicked() {
        app.send_cmd(AppCommand::QueueTrack {
            track: track.clone(),
            pos: -1,
            use_cache: true,
            target_tab: app.active_tab.clone(),
            skip_repeat_check: false,
        });
    }
    if ui
        .add(
            egui::Button::new(bold_text("Next", 11.0, AMBER_DARK_TEXT))
                .fill(AMBER_PRIMARY)
                .corner_radius(CornerRadius::same(6))
                .min_size(egui::vec2(44.0, 26.0)),
        )
        .clicked()
    {
        app.send_cmd(AppCommand::QueueTrack {
            track: track.clone(),
            pos: -2,
            use_cache: true,
            target_tab: app.active_tab.clone(),
            skip_repeat_check: false,
        });
    }
    if ui
        .add(
            egui::Button::new(semibold_text("+Set", 11.0, TEXT_PRIMARY))
                .fill(CONTROL_BG)
                .stroke(Stroke::new(1.0, BORDER_COLOR))
                .corner_radius(CornerRadius::same(6))
                .min_size(egui::vec2(38.0, 26.0)),
        )
        .clicked()
    {
        app.add_to_set_picker_track = Some(track.clone());
        app.send_cmd(AppCommand::LoadPlaylistSets);
    }
    let audio_st = app.audio.get_state();
    let is_prev = audio_st.active_video_id.as_deref() == Some(&track.video_id)
        && (audio_st.is_playing || audio_st.is_loading);
    if ui
        .add(
            egui::Button::new(semibold_text(
                if is_prev { "❚❚" } else { "🎧" },
                11.0,
                if is_prev { AMBER_PRIMARY } else { TEXT_PRIMARY },
            ))
            .fill(CONTROL_BG)
            .corner_radius(CornerRadius::same(6))
            .min_size(egui::vec2(28.0, 26.0)),
        )
        .clicked()
    {
        if is_prev {
            app.audio.toggle_pause();
        } else {
            app.send_cmd(AppCommand::StartAudioPreview(track.clone()));
        }
    }
}
