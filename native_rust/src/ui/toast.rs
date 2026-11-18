use std::time::{Duration, Instant};

use eframe::egui::{self, Align2, Color32, CornerRadius, Frame, Margin, Stroke};

use crate::ui::theme::{semibold_text, DECK_BG, STATUS_ERROR, STATUS_SUCCESS};

#[derive(Debug, Clone)]
pub struct ToastItem {
    pub id: String,
    pub is_error: bool,
    pub text: String,
    pub created_at: Instant,
}

impl ToastItem {
    pub fn success(text: impl Into<String>) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            is_error: false,
            text: text.into(),
            created_at: Instant::now(),
        }
    }

    pub fn error(text: impl Into<String>) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            is_error: true,
            text: text.into(),
            created_at: Instant::now(),
        }
    }
}

/// Renders top-center floating glassmorphic toast pills with 3.2s auto-dismiss & click-to-close.
pub fn render_toasts(ctx: &egui::Context, toasts: &mut Vec<ToastItem>) {
    toasts.retain(|t| t.created_at.elapsed() < Duration::from_millis(3200));
    if toasts.is_empty() {
        return;
    }

    let mut dismiss_id: Option<String> = None;

    egui::Area::new(egui::Id::NULL.with("studio_toast_overlay"))
        .anchor(Align2::CENTER_TOP, egui::vec2(0.0, 14.0))
        .order(egui::Order::Foreground)
        .show(ctx, |ui| {
            ui.vertical_centered(|ui| {
                for toast in toasts.iter().take(3) {
                    let accent = if toast.is_error {
                        STATUS_ERROR
                    } else {
                        STATUS_SUCCESS
                    };
                    let bg = Color32::from_rgba_unmultiplied(
                        DECK_BG.r(),
                        DECK_BG.g(),
                        DECK_BG.b(),
                        245,
                    );
                    let resp = Frame::NONE
                        .fill(bg)
                        .stroke(Stroke::new(1.0, accent))
                        .corner_radius(CornerRadius::same(10))
                        .inner_margin(Margin::symmetric(14, 8))
                        .show(ui, |ui| {
                            ui.horizontal(|ui| {
                                let icon = if toast.is_error { "!" } else { "✓" };
                                ui.label(semibold_text(icon, 13.0, accent));
                                ui.label(semibold_text(&toast.text, 12.5, crate::ui::theme::TEXT_PRIMARY));
                            });
                        })
                        .response;

                    if resp.interact(egui::Sense::click()).clicked() {
                        dismiss_id = Some(toast.id.clone());
                    }
                    ui.add_space(4.0);
                }
            });
        });

    if let Some(id) = dismiss_id {
        toasts.retain(|t| t.id != id);
    }

    ctx.request_repaint_after(Duration::from_millis(200));
}
