use eframe::egui::{self, CornerRadius, Frame, Margin, Stroke};

use crate::app::{CatalogMainTab, RadioCasterApp};
use crate::events::AppCommand;
use crate::models::track::TrackItem;
use crate::ui::theme::{
    amber_button, animated_segment_tab, bold_text, lcd_frame, list_row_frame, module_frame,
    mono_text, semibold_text, slate_button, status_pill, AMBER_PRIMARY, BORDER_COLOR, CONTROL_BG,
    SIGNAL_CYAN, STATUS_SUCCESS, TEXT_MUTED, TEXT_PRIMARY, TEXT_SECONDARY,
};

pub fn render_discovery_deck(ui: &mut egui::Ui, app: &mut RadioCasterApp) {
    // 1. Smart Omnibox & Search Tracklist
    module_frame().show(ui, |ui| {
        ui.horizontal(|ui| {
            ui.label(bold_text("Cari Lagu", 13.5, TEXT_PRIMARY));
            ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                if !app.search_results.is_empty() {
                    status_pill(
                        ui,
                        &format!("{} Lagu", app.search_results.len()),
                        SIGNAL_CYAN,
                    );
                }
            });
        });
        ui.add_space(6.0);

        let is_busy = app.is_loading("search") || app.is_loading("resolve");

        ui.horizontal(|ui| {
            let input_w = (ui.available_width() - 110.0).max(160.0);
            let edit_resp = ui.add_sized(
                [input_w, 34.0],
                egui::TextEdit::singleline(&mut app.omnibox_input)
                    .hint_text("Cari lagu atau tempel tautan YouTube..."),
            );
            let focus_id = egui::Id::unique("rcb_focus_omnibox");
            if ui
                .ctx()
                .data(|d| d.get_temp::<bool>(focus_id).unwrap_or(false))
            {
                edit_resp.request_focus();
                ui.ctx().data_mut(|d| d.insert_temp(focus_id, false));
            }

            let submitted = (edit_resp.lost_focus()
                && ui.input(|i| i.key_pressed(egui::Key::Enter)))
                || amber_button(
                    ui,
                    if is_busy { "Memproses..." } else { "Cari" },
                )
                .clicked();

            if submitted && !is_busy {
                let q = app.omnibox_input.trim().to_string();
                if !q.is_empty() {
                    if q.starts_with("http://") || q.starts_with("https://") {
                        app.send_cmd(AppCommand::ResolveUrl(q));
                    } else {
                        app.send_cmd(AppCommand::SearchSongs(q));
                    }
                }
            }
        });

        // Search Results Single-Column Studio Tracklist
        if !app.search_results.is_empty() {
            ui.add_space(8.0);
            let results = app.search_results.clone();
            egui::ScrollArea::vertical()
                .id_salt("search_results_list")
                .max_height(275.0)
                .auto_shrink([false, true])
                .show(ui, |ui| {
                    for (idx, track) in results.iter().enumerate() {
                        render_tracklist_row(ui, app, idx + 1, track);
                        ui.add_space(4.0);
                    }
                });
        }
    });

    ui.add_space(10.0);

    // 2. Catalog & Rotation Tab Switcher
    Frame::NONE
        .fill(crate::ui::theme::DECK_BG)
        .stroke(Stroke::new(1.0, BORDER_COLOR))
        .corner_radius(CornerRadius::same(10))
        .inner_margin(Margin::same(4))
        .show(ui, |ui| {
            let half_w = (ui.available_width() - 6.0) / 2.0;
            ui.horizontal(|ui| {
                let rec_active = app.catalog_tab == CatalogMainTab::Recommendations;
                if animated_segment_tab(
                    ui,
                    egui::vec2(half_w, 30.0),
                    "Rekomendasi",
                    rec_active,
                    true,
                    7,
                )
                .clicked()
                {
                    app.catalog_tab = CatalogMainTab::Recommendations;
                }

                let sets_active = app.catalog_tab == CatalogMainTab::PlaylistSets;
                if animated_segment_tab(
                    ui,
                    egui::vec2(half_w, 30.0),
                    "Set Playlist",
                    sets_active,
                    true,
                    7,
                )
                .clicked()
                {
                    app.catalog_tab = CatalogMainTab::PlaylistSets;
                    app.send_cmd(AppCommand::LoadPlaylistSets);
                }
            });
        });
}

pub fn render_tracklist_row(
    ui: &mut egui::Ui,
    app: &mut RadioCasterApp,
    index: usize,
    track: &TrackItem,
) {
    let is_selected = app
        .selected_track
        .as_ref()
        .map(|s| s.video_id == track.video_id)
        .unwrap_or(false);
    let is_cached = app.cached_video_ids.contains(&track.video_id);
    let audio_st = app.audio.get_state();
    let is_previewing = audio_st.active_video_id.as_deref() == Some(&track.video_id)
        && (audio_st.is_playing || audio_st.is_loading);

    let row_resp = list_row_frame(is_selected)
        .show(ui, |ui| {
            ui.horizontal(|ui| {
                // 2-Digit Monospace Index
                ui.label(mono_text(
                    format!("{index:02}"),
                    12.0,
                    if is_selected {
                        AMBER_PRIMARY
                    } else {
                        TEXT_MUTED
                    },
                ));

                // Album Thumbnail
                if let Some(ref thumb) = track.thumbnail_url {
                    ui.add(
                        egui::Image::from_uri(thumb)
                            .fit_to_exact_size(egui::vec2(38.0, 38.0))
                            .corner_radius(CornerRadius::same(6)),
                    );
                } else {
                    lcd_frame()
                        .inner_margin(Margin::same(0))
                        .show(ui, |ui| {
                            ui.allocate_exact_size(egui::vec2(38.0, 38.0), egui::Sense::hover());
                        });
                }

                // Title & Artist/Album Info
                ui.vertical(|ui| {
                    ui.spacing_mut().item_spacing.y = 1.0;
                    let right_reserve = if is_cached { 225.0 } else { 175.0 };
                    ui.set_max_width((ui.available_width() - right_reserve).max(110.0));
                    ui.add(
                        egui::Label::new(semibold_text(&track.title, 13.0, TEXT_PRIMARY))
                            .truncate(),
                    );
                    let mut meta_str = track.artists_joined();
                    if let Some(ref alb) = track.album {
                        if !alb.is_empty() {
                            meta_str.push_str(&format!(" • {alb}"));
                        }
                    }
                    if let Some(ref yr) = track.year {
                        if !yr.is_empty() {
                            meta_str.push_str(&format!(" ({yr})"));
                        }
                    }
                    ui.add(
                        egui::Label::new(semibold_text(meta_str, 11.5, TEXT_SECONDARY)).truncate(),
                    );
                });

                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    // Load Cue Button
                    if slate_button(ui, if is_selected { "Aktif" } else { "Muat" }).clicked() {
                        app.select_track(track.clone());
                    }

                    // Headphone Preview Trigger
                    let prev_lbl = if is_previewing { "||" } else { "▶" };
                    if ui
                        .add(
                            egui::Button::new(semibold_text(
                                prev_lbl,
                                12.0,
                                if is_previewing {
                                    AMBER_PRIMARY
                                } else {
                                    TEXT_PRIMARY
                                },
                            ))
                            .fill(CONTROL_BG)
                            .stroke(Stroke::new(1.0, BORDER_COLOR))
                            .corner_radius(CornerRadius::same(6))
                            .min_size(egui::vec2(30.0, 28.0)),
                        )
                        .clicked()
                    {
                        if is_previewing {
                            app.audio.toggle_pause();
                        } else {
                            app.send_cmd(AppCommand::StartAudioPreview(track.clone()));
                        }
                    }

                    // Duration Tabular
                    ui.label(mono_text(
                        track.display_duration(),
                        11.5,
                        TEXT_SECONDARY,
                    ));

                    if is_cached {
                        status_pill(ui, "DISK", STATUS_SUCCESS);
                    }
                });
            });
        })
        .response;

    if row_resp
        .interact(egui::Sense::click())
        .on_hover_cursor(egui::CursorIcon::PointingHand)
        .clicked()
    {
        app.select_track(track.clone());
    }
}
