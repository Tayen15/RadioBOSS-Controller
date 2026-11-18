use eframe::egui;

use crate::app::RadioCasterApp;
use crate::events::AppCommand;
use crate::ui::theme::{
    amber_button, bold_text, dialog_frame, lcd_frame, semibold_text, slate_button, status_pill,
    window_close_dot, STATUS_WARNING, TEXT_PRIMARY, TEXT_SECONDARY,
};

pub fn render_confirm_modals(ctx: &egui::Context, app: &mut RadioCasterApp) {
    // 1. Anti-Repeat Safety Guard Confirmation
    if let Some(pending) = app.pending_repeat.clone() {
        if ctx.input(|i| i.key_pressed(egui::Key::Escape)) {
            app.pending_repeat = None;
            return;
        }
        let mut keep_open = true;
        egui::Window::new("Lagu Sudah di Antrean")
            .open(&mut keep_open)
            .title_bar(false)
            .collapsible(false)
            .resizable(false)
            .movable(true)
            .frame(dialog_frame())
            .default_width(420.0)
            .show(ctx, |ui| {
                ui.horizontal(|ui| {
                    if window_close_dot(ui) {
                        app.pending_repeat = None;
                    }
                    ui.add_space(6.0);
                    ui.label(bold_text("Lagu Sudah di Antrean", 15.0, TEXT_PRIMARY));
                    ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                        status_pill(ui, "Duplikat", STATUS_WARNING);
                    });
                });
                ui.add_space(6.0);
                ui.label(bold_text(&pending.reason, 13.0, TEXT_PRIMARY));
                ui.label(semibold_text(
                    "Tetap kirim lagu ini ke antrean RadioBOSS?",
                    12.0,
                    TEXT_SECONDARY,
                ));
                ui.add_space(10.0);
                ui.horizontal(|ui| {
                    if amber_button(ui, "Ya, Tetap Antrekan").clicked() {
                        app.send_cmd(AppCommand::QueueTrack {
                            track: pending.track.clone(),
                            pos: pending.pos,
                            use_cache: app.use_studio_cache,
                            target_tab: pending.target_tab.clone(),
                            skip_repeat_check: true,
                        });
                        app.pending_repeat = None;
                    }
                    if slate_button(ui, "Batal").clicked() {
                        app.pending_repeat = None;
                    }
                });
            });
        if !keep_open {
            app.pending_repeat = None;
        }
    }

    // 2. "+Set" Playlist Set Picker Modal
    if let Some(track) = app.add_to_set_picker_track.clone() {
        let mut keep_open = true;
        egui::Window::new("Simpan ke Koleksi Set Playlist")
            .open(&mut keep_open)
            .title_bar(false)
            .collapsible(false)
            .resizable(false)
            .movable(true)
            .frame(dialog_frame())
            .default_width(380.0)
            .show(ctx, |ui| {
                ui.horizontal(|ui| {
                    if window_close_dot(ui) {
                        app.add_to_set_picker_track = None;
                    }
                    ui.add_space(6.0);
                    ui.label(bold_text("Simpan ke Set Playlist", 15.0, TEXT_PRIMARY));
                });
                ui.add_space(6.0);
                ui.label(bold_text(
                    format!("{} - {}", track.artists_joined(), track.title),
                    12.5,
                    TEXT_PRIMARY,
                ));
                ui.add_space(8.0);

                if app.playlist_sets.is_empty() {
                    ui.label(semibold_text(
                        "Belum ada Set Playlist. Buka tab 'Koleksi Set Playlist' untuk membuat set baru.",
                        11.5,
                        TEXT_SECONDARY,
                    ));
                } else {
                    let sets = app.playlist_sets.clone();
                    for s in sets {
                        lcd_frame().show(ui, |ui| {
                            ui.horizontal(|ui| {
                                ui.label(semibold_text(
                                    format!("{} ({} lagu)", s.name, s.track_count),
                                    12.0,
                                    TEXT_PRIMARY,
                                ));
                                ui.with_layout(
                                    egui::Layout::right_to_left(egui::Align::Center),
                                    |ui| {
                                        if amber_button(ui, "+ Simpan").clicked() {
                                            app.send_cmd(AppCommand::AddTrackToSet {
                                                set_id: s.id.clone(),
                                                track: track.clone(),
                                            });
                                            app.add_to_set_picker_track = None;
                                        }
                                    },
                                );
                            });
                        });
                        ui.add_space(4.0);
                    }
                }
            });
        if !keep_open {
            app.add_to_set_picker_track = None;
        }
    }
}
