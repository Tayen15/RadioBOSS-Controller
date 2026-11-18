use std::time::{Duration, Instant};

use eframe::egui::{self, Align2, Color32, CornerRadius, Frame, Margin, Stroke};

use crate::ui::theme::{semibold_text, DECK_BG, STATUS_ERROR, STATUS_SUCCESS, TEXT_PRIMARY};

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

/// Renders top-center floating pills with smooth slide/fade-in and fade-out transitions.
pub fn render_toasts(ctx: &egui::Context, toasts: &mut Vec<ToastItem>) {
    let total_ttl = 3.2_f32;
    toasts.retain(|t| t.created_at.elapsed().as_secs_f32() < total_ttl);
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
                    let age = toast.created_at.elapsed().as_secs_f32();
                    let fade_in = (age / 0.18).clamp(0.0, 1.0);
                    let fade_out = ((total_ttl - age) / 0.35).clamp(0.0, 1.0);
                    let alpha = (fade_in * fade_out).clamp(0.0, 1.0);
                    let slide_y = (1.0 - fade_in) * -6.0;
                    if slide_y.abs() > 0.1 {
                        ui.add_space(slide_y.max(0.0));
                    }

                    let a_u8 = (alpha * 255.0) as u8;
                    let bg_a = (alpha * 245.0) as u8;
                    let base_accent = if toast.is_error {
                        STATUS_ERROR
                    } else {
                        STATUS_SUCCESS
                    };
                    let accent = Color32::from_rgba_unmultiplied(
                        base_accent.r(),
                        base_accent.g(),
                        base_accent.b(),
                        a_u8,
                    );
                    let text_col = Color32::from_rgba_unmultiplied(
                        TEXT_PRIMARY.r(),
                        TEXT_PRIMARY.g(),
                        TEXT_PRIMARY.b(),
                        a_u8,
                    );
                    let bg = Color32::from_rgba_unmultiplied(
                        DECK_BG.r(),
                        DECK_BG.g(),
                        DECK_BG.b(),
                        bg_a,
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
                                ui.label(semibold_text(&toast.text, 12.5, text_col));
                            });
                        })
                        .response
                        .interact(egui::Sense::click())
                        .on_hover_cursor(egui::CursorIcon::PointingHand);

                    if resp.clicked() {
                        dismiss_id = Some(toast.id.clone());
                    }
                    ui.add_space(4.0);
                }
            });
        });

    if let Some(id) = dismiss_id {
        toasts.retain(|t| t.id != id);
    }

    ctx.request_repaint_after(Duration::from_millis(16));
}
