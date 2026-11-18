use eframe::egui;

use crate::app::RadioCasterApp;
use crate::events::AppCommand;
use crate::models::system::UpdateDownloadState;
use crate::models::APP_VERSION;
use crate::services::system_service;
use crate::ui::theme::{
    amber_button, bold_text, lcd_frame, mono_text, semibold_text, slate_button, status_pill,
    AMBER_PRIMARY, SIGNAL_CYAN, STATUS_ERROR, STATUS_SUCCESS, TEXT_PRIMARY, TEXT_SECONDARY,
};

pub fn render_update_modal(ctx: &egui::Context, app: &mut RadioCasterApp) {
    if !app.is_update_open {
        return;
    }

    let mut is_open = app.is_update_open;
    egui::Window::new("Pembaruan Aplikasi (Auto-Update)")
        .open(&mut is_open)
        .collapsible(false)
        .resizable(false)
        .default_width(500.0)
        .anchor(egui::Align2::CENTER_CENTER, egui::vec2(0.0, 0.0))
        .show(ctx, |ui| {
            ui.horizontal(|ui| {
                ui.label(bold_text(
                    format!("Versi Terpasang: v{APP_VERSION}"),
                    12.5,
                    TEXT_PRIMARY,
                ));
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    if slate_button(ui, "↻ Cek Ulang").clicked() {
                        app.send_cmd(AppCommand::CheckForUpdates { manual: true });
                    }
                });
            });

            ui.add_space(8.0);

            let Some(upd) = app.update_check.clone() else {
                ui.label(semibold_text("Memeriksa rilis GitHub...", 12.0, AMBER_PRIMARY));
                return;
            };

            if let Some(ref err) = upd.error {
                ui.label(semibold_text(format!("Error: {err}"), 12.0, STATUS_ERROR));
                return;
            }

            lcd_frame().show(ui, |ui| {
                ui.horizontal(|ui| {
                    if upd.update_available {
                        status_pill(
                            ui,
                            &format!("TERSEDIA v{}", upd.latest_version),
                            AMBER_PRIMARY,
                        );
                    } else {
                        status_pill(ui, "SUDAH TERBARU", STATUS_SUCCESS);
                    }
                    ui.label(bold_text(&upd.release_name, 13.0, TEXT_PRIMARY));
                });

                if !upd.release_notes.trim().is_empty() {
                    ui.add_space(6.0);
                    egui::ScrollArea::vertical()
                        .id_salt("update_notes_scroll")
                        .max_height(180.0)
                        .show(ui, |ui| {
                            ui.label(semibold_text(&upd.release_notes, 11.5, TEXT_SECONDARY));
                        });
                }
            });

            ui.add_space(10.0);

            match app.update_dl_status.state {
                UpdateDownloadState::Idle => {
                    ui.horizontal(|ui| {
                        if let Some(ref asset) = upd.asset {
                            if upd.update_available
                                && amber_button(
                                    ui,
                                    &format!("Unduh & Pasang ({})", asset.name),
                                )
                                .clicked()
                            {
                                app.send_cmd(AppCommand::DownloadUpdate(asset.clone()));
                            }
                        }
                        if slate_button(ui, "Buka Halaman GitHub Releases").clicked() {
                            system_service::open_in_system(&upd.html_url);
                        }
                    });
                }
                UpdateDownloadState::Downloading => {
                    let st = &app.update_dl_status;
                    let mb_done = st.downloaded_bytes as f64 / (1024.0 * 1024.0);
                    let mb_total = st.total_bytes as f64 / (1024.0 * 1024.0);
                    ui.label(mono_text(
                        format!(
                            "Mengunduh: {:.1}% ({:.1} / {:.1} MB) • {:.2} MB/s",
                            st.progress * 100.0,
                            mb_done,
                            mb_total,
                            st.speed_mbps
                        ),
                        11.5,
                        SIGNAL_CYAN,
                    ));
                    ui.add(egui::ProgressBar::new(st.progress).show_percentage());
                }
                UpdateDownloadState::Downloaded => {
                    ui.label(semibold_text(
                        "Installer selesai diunduh dan siap dijalankan!",
                        12.0,
                        STATUS_SUCCESS,
                    ));
                    ui.add_space(4.0);
                    if amber_button(ui, "Pasang & Muat Ulang Sekarang").clicked() {
                        app.send_cmd(AppCommand::InstallUpdate);
                    }
                }
                UpdateDownloadState::Error => {
                    ui.label(semibold_text(
                        format!(
                            "Unduhan gagal: {}",
                            app.update_dl_status
                                .error
                                .as_deref()
                                .unwrap_or("Unknown error")
                        ),
                        12.0,
                        STATUS_ERROR,
                    ));
                }
            }
        });

    app.is_update_open = is_open;
}
