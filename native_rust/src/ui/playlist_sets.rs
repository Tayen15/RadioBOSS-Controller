use eframe::egui::{self, CornerRadius, Margin, Stroke};

use crate::app::RadioCasterApp;
use crate::events::AppCommand;
use crate::models::track::TrackItem;
use crate::services::ytmusic_service::format_seconds;
use crate::ui::theme::{
    amber_button, bold_text, danger_button, lcd_frame, module_frame, mono_text, semibold_text,
    slate_button, status_pill, AMBER_DARK_TEXT, AMBER_PRIMARY, BORDER_COLOR, CONTROL_BG,
    SIGNAL_CYAN, TEXT_MUTED, TEXT_PRIMARY, TEXT_SECONDARY,
};

pub fn render_playlist_sets(ui: &mut egui::Ui, app: &mut RadioCasterApp) {
    module_frame().show(ui, |ui| {
        ui.horizontal(|ui| {
            ui.label(bold_text("KOLEKSI SET PLAYLIST STUDIO", 13.0, TEXT_PRIMARY));
            ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                if amber_button(
                    ui,
                    if app.show_create_set_form {
                        "Tutup Form"
                    } else {
                        "+ Buat Set Baru"
                    },
                )
                .clicked()
                {
                    app.show_create_set_form = !app.show_create_set_form;
                }
            });
        });

        // Create Set inline form
        if app.show_create_set_form {
            ui.add_space(6.0);
            lcd_frame().show(ui, |ui| {
                ui.horizontal(|ui| {
                    ui.add(
                        egui::TextEdit::singleline(&mut app.new_set_name)
                            .desired_width(180.0)
                            .hint_text("Nama Set (misal: Siaran Pagi)..."),
                    );
                    ui.add(
                        egui::TextEdit::singleline(&mut app.new_set_desc)
                            .desired_width(180.0)
                            .hint_text("Deskripsi singkat..."),
                    );
                    if amber_button(ui, "Simpan Set").clicked() && !app.new_set_name.trim().is_empty()
                    {
                        app.send_cmd(AppCommand::CreatePlaylistSet {
                            name: app.new_set_name.clone(),
                            description: app.new_set_desc.clone(),
                        });
                        app.new_set_name.clear();
                        app.new_set_desc.clear();
                        app.show_create_set_form = false;
                    }
                });
            });
        }

        ui.add_space(8.0);

        // Set Selector Chips
        if app.playlist_sets.is_empty() {
            ui.label(semibold_text(
                "Belum ada Set Playlist tersimpan. Buat set baru di atas atau simpan lagu dengan tombol '+Set'.",
                12.0,
                TEXT_SECONDARY,
            ));
            return;
        }

        ui.horizontal_wrapped(|ui| {
            let sets = app.playlist_sets.clone();
            for s in sets {
                let active = app.active_set_id.as_deref() == Some(&s.id);
                let label = format!("{} ({})", s.name, s.track_count);
                if ui
                    .add(
                        egui::Button::new(bold_text(
                            label,
                            11.5,
                            if active { AMBER_DARK_TEXT } else { TEXT_PRIMARY },
                        ))
                        .fill(if active { AMBER_PRIMARY } else { CONTROL_BG })
                        .stroke(Stroke::new(1.0, if active { AMBER_PRIMARY } else { BORDER_COLOR }))
                        .corner_radius(CornerRadius::same(7)),
                    )
                    .clicked()
                {
                    app.active_set_id = Some(s.id.clone());
                    app.send_cmd(AppCommand::LoadPlaylistSetItems(s.id));
                }
            }
        });

        let Some(active_set_id) = app.active_set_id.clone() else {
            return;
        };

        ui.add_space(8.0);

        // Bulk YouTube Playlist Importer + Set Toolbar
        lcd_frame().show(ui, |ui| {
            ui.horizontal(|ui| {
                let imp_w = (ui.available_width() - 160.0).max(140.0);
                ui.add_sized(
                    [imp_w, 28.0],
                    egui::TextEdit::singleline(&mut app.import_playlist_url)
                        .hint_text("Impor massal URL Playlist YouTube / YT Music..."),
                );
                let importing = app.is_loading("import_set");
                if slate_button(ui, if importing { "Mengimpor..." } else { "Impor Playlist" })
                    .clicked()
                    && !importing
                    && !app.import_playlist_url.trim().is_empty()
                {
                    app.send_cmd(AppCommand::ImportYouTubePlaylist {
                        set_id: active_set_id.clone(),
                        url: app.import_playlist_url.clone(),
                    });
                    app.import_playlist_url.clear();
                }
            });

            ui.add_space(6.0);

            let total_secs: u64 = app.active_set_items.iter().map(|i| i.duration_seconds).sum();
            ui.horizontal(|ui| {
                ui.add(
                    egui::TextEdit::singleline(&mut app.set_filter_query)
                        .desired_width(160.0)
                        .hint_text("Filter lagu di set..."),
                );
                status_pill(
                    ui,
                    &format!(
                        "{} LAGU • {}",
                        app.active_set_items.len(),
                        format_seconds(total_secs)
                    ),
                    SIGNAL_CYAN,
                );

                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    if danger_button(ui, "Hapus Set").clicked() {
                        app.send_cmd(AppCommand::DeletePlaylistSet(active_set_id.clone()));
                        app.active_set_id = None;
                        app.active_set_items.clear();
                    }
                    if !app.active_set_items.is_empty() {
                        if slate_button(ui, "Kosongkan").clicked() {
                            app.send_cmd(AppCommand::ClearPlaylistSet(active_set_id.clone()));
                        }
                        if amber_button(ui, "Kirim Semua").clicked() {
                            let batch: Vec<TrackItem> =
                                app.active_set_items.iter().map(TrackItem::from).collect();
                            app.send_cmd(AppCommand::AutoFillTracks {
                                tracks: batch,
                                pos: -1,
                                label: "Kirim Set Playlist".to_string(),
                            });
                        }
                    }
                });
            });
        });

        ui.add_space(6.0);

        let filter = app.set_filter_query.trim().to_lowercase();
        let items: Vec<_> = app
            .active_set_items
            .iter()
            .filter(|i| {
                if filter.is_empty() {
                    true
                } else {
                    i.title.to_lowercase().contains(&filter)
                        || i.artists.join(" ").to_lowercase().contains(&filter)
                }
            })
            .cloned()
            .collect();

        if items.is_empty() {
            ui.label(semibold_text(
                "Set ini masih kosong.",
                12.0,
                TEXT_SECONDARY,
            ));
            return;
        }

        egui::ScrollArea::vertical()
            .id_salt("playlist_set_items_scroll")
            .max_height(260.0)
            .show(ui, |ui| {
                for (idx, item) in items.iter().enumerate() {
                    let track = TrackItem::from(item);
                    lcd_frame().inner_margin(Margin::symmetric(10, 6)).show(ui, |ui| {
                        ui.horizontal(|ui| {
                            ui.label(mono_text(format!("{:02}", idx + 1), 11.5, TEXT_MUTED));
                            ui.vertical(|ui| {
                                ui.spacing_mut().item_spacing.y = 1.0;
                                ui.set_max_width((ui.available_width() - 250.0).max(90.0));
                                ui.add(
                                    egui::Label::new(semibold_text(&item.title, 12.5, TEXT_PRIMARY))
                                        .truncate(),
                                );
                                ui.add(
                                    egui::Label::new(semibold_text(
                                        format!(
                                            "{} • {}",
                                            item.artists.join(", "),
                                            item.duration_formatted
                                        ),
                                        11.0,
                                        TEXT_SECONDARY,
                                    ))
                                    .truncate(),
                                );
                            });

                            ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                                if ui.button("✕").clicked() {
                                    app.send_cmd(AppCommand::RemoveTrackFromSet {
                                        set_id: active_set_id.clone(),
                                        item_id: item.id.clone(),
                                    });
                                }
                                if ui.button("↓").clicked() {
                                    app.send_cmd(AppCommand::MoveSetItem {
                                        set_id: active_set_id.clone(),
                                        item_id: item.id.clone(),
                                        direction: 1,
                                    });
                                }
                                if ui.button("↑").clicked() {
                                    app.send_cmd(AppCommand::MoveSetItem {
                                        set_id: active_set_id.clone(),
                                        item_id: item.id.clone(),
                                        direction: -1,
                                    });
                                }
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
                                            .min_size(egui::vec2(42.0, 26.0)),
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
                            });
                        });
                    });
                    ui.add_space(4.0);
                }
            });
    });
}
