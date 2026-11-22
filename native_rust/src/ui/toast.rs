use std::time::{Duration, Instant};

use eframe::egui::{self, Align2, Color32, CornerRadius, Frame, Margin, Stroke};

use crate::ui::theme::{
    semibold_text, BORDER_COLOR, DECK_BG, STATUS_ERROR, STATUS_SUCCESS, TEXT_PRIMARY,
};

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

/// Renders compact bottom-right native studio notifications (max 2, fast auto-dismiss).
pub fn render_toasts(ctx: &egui::Context, toasts: &mut Vec<ToastItem>) {
    toasts.retain(|t| {
        let ttl = if t.is_error { 3.5_f32 } else { 2.2_f32 };
        t.created_at.elapsed().as_secs_f32() < ttl
    });
    if toasts.is_empty() {
        return;
    }

    let mut dismiss_id: Option<String> = None;
    let visible: Vec<_> = toasts.iter().rev().take(2).cloned().collect();

    egui::Area::new(egui::Id::unique("studio_toast_overlay"))
        .anchor(Align2::RIGHT_BOTTOM, egui::vec2(-16.0, -16.0))
        .order(egui::Order::Foreground)
        .show(ctx, |ui| {
            ui.with_layout(egui::Layout::bottom_up(egui::Align::Max), |ui| {
                for toast in visible.iter() {
                    let ttl = if toast.is_error { 3.5_f32 } else { 2.2_f32 };
                    let age = toast.created_at.elapsed().as_secs_f32();
                    let fade_in = (age / 0.16).clamp(0.0, 1.0);
                    let fade_out = ((ttl - age) / 0.28).clamp(0.0, 1.0);
                    let alpha = (fade_in * fade_out).clamp(0.0, 1.0);

                    let a_u8 = (alpha * 255.0) as u8;
                    let bg_a = (alpha * 246.0) as u8;
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
                    let border = Color32::from_rgba_unmultiplied(
                        BORDER_COLOR.r(),
                        BORDER_COLOR.g(),
                        BORDER_COLOR.b(),
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
                        .stroke(Stroke::new(1.0, if toast.is_error { accent } else { border }))
                        .corner_radius(CornerRadius::same(8))
                        .inner_margin(Margin::symmetric(12, 8))
                        .show(ui, |ui| {
                            ui.set_max_width(340.0);
                            ui.horizontal(|ui| {
                                ui.spacing_mut().item_spacing.x = 8.0;
                                // Vector status dot/check so we never depend on font glyphs
                                let (icon_r, _) = ui.allocate_exact_size(
                                    egui::vec2(14.0, 14.0),
                                    egui::Sense::hover(),
                                );
                                let c = icon_r.center();
                                let p = ui.painter();
                                p.circle_filled(
                                    c,
                                    7.0,
                                    Color32::from_rgba_unmultiplied(
                                        base_accent.r(),
                                        base_accent.g(),
                                        base_accent.b(),
                                        (alpha * 42.0) as u8,
                                    ),
                                );
                                if toast.is_error {
                                    p.line_segment(
                                        [c - egui::vec2(0.0, 3.5), c + egui::vec2(0.0, 1.0)],
                                        Stroke::new(1.6, accent),
                                    );
                                    p.circle_filled(c + egui::vec2(0.0, 3.2), 1.0, accent);
                                } else {
                                    p.line_segment(
                                        [c + egui::vec2(-3.2, 0.2), c + egui::vec2(-0.8, 2.6)],
                                        Stroke::new(1.6, accent),
                                    );
                                    p.line_segment(
                                        [c + egui::vec2(-0.8, 2.6), c + egui::vec2(3.5, -2.5)],
                                        Stroke::new(1.6, accent),
                                    );
                                }
                                ui.add(
                                    egui::Label::new(semibold_text(&toast.text, 12.0, text_col))
                                        .wrap(),
                                );
                            });
                        })
                        .response
                        .interact(egui::Sense::click())
                        .on_hover_cursor(egui::CursorIcon::PointingHand);

                    if resp.clicked() {
                        dismiss_id = Some(toast.id.clone());
                    }
                    ui.add_space(6.0);
                }
            });
        });

    if let Some(id) = dismiss_id {
        toasts.retain(|t| t.id != id);
    }

    ctx.request_repaint_after(Duration::from_millis(16));
}
