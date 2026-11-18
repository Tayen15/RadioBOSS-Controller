use eframe::egui::{
    self, Color32, CornerRadius, FontData, FontDefinitions, FontFamily, Frame, Margin, RichText,
    Stroke, Visuals,
};

// Studio Broadcast Console Colors (DESIGN.md)
pub const CHASSIS_BG: Color32 = Color32::from_rgb(9, 9, 11); // #09090B
pub const DECK_BG: Color32 = Color32::from_rgb(18, 18, 22); // #121216
pub const CONTROL_BG: Color32 = Color32::from_rgb(28, 28, 34); // #1C1C22
pub const BORDER_COLOR: Color32 = Color32::from_rgb(39, 39, 48); // #272730
pub const SLATE_BTN: Color32 = Color32::from_rgb(39, 39, 48); // #272730

pub const TEXT_PRIMARY: Color32 = Color32::from_rgb(244, 244, 246); // #F4F4F6
pub const TEXT_SECONDARY: Color32 = Color32::from_rgb(161, 161, 170); // #A1A1AA
pub const TEXT_MUTED: Color32 = Color32::from_rgb(113, 113, 122); // #71717A

pub const AMBER_PRIMARY: Color32 = Color32::from_rgb(245, 158, 11); // #F59E0B
pub const AMBER_DARK_TEXT: Color32 = Color32::from_rgb(9, 9, 11); // #09090B
pub const SIGNAL_CYAN: Color32 = Color32::from_rgb(56, 189, 248); // #38BDF8

pub const STATUS_SUCCESS: Color32 = Color32::from_rgb(52, 211, 153); // #34D399
pub const STATUS_ERROR: Color32 = Color32::from_rgb(248, 113, 113); // #F87171
pub const STATUS_WARNING: Color32 = Color32::from_rgb(251, 191, 36); // #FBBF24

/// Installs embedded Plus Jakarta Sans & JetBrains Mono fonts and configures `DESIGN.md` Studio visuals.
pub fn configure_studio_theme(ctx: &egui::Context) {
    let mut fonts = FontDefinitions::default();

    fonts.font_data.insert(
        "jakarta_regular".to_owned(),
        FontData::from_static(include_bytes!(
            "../../assets/fonts/PlusJakartaSans-Regular.ttf"
        ))
        .into(),
    );
    fonts.font_data.insert(
        "jakarta_semibold".to_owned(),
        FontData::from_static(include_bytes!(
            "../../assets/fonts/PlusJakartaSans-SemiBold.ttf"
        ))
        .into(),
    );
    fonts.font_data.insert(
        "jakarta_bold".to_owned(),
        FontData::from_static(include_bytes!(
            "../../assets/fonts/PlusJakartaSans-Bold.ttf"
        ))
        .into(),
    );
    fonts.font_data.insert(
        "jetbrains_mono".to_owned(),
        FontData::from_static(include_bytes!(
            "../../assets/fonts/JetBrainsMono-Regular.ttf"
        ))
        .into(),
    );

    fonts
        .families
        .entry(FontFamily::Proportional)
        .or_default()
        .insert(0, "jakarta_regular".to_owned());

    fonts
        .families
        .entry(FontFamily::Monospace)
        .or_default()
        .insert(0, "jetbrains_mono".to_owned());

    fonts
        .families
        .insert(FontFamily::Name("semibold".into()), vec!["jakarta_semibold".into()]);
    fonts
        .families
        .insert(FontFamily::Name("bold".into()), vec!["jakarta_bold".into()]);

    ctx.set_fonts(fonts);

    let mut visuals = Visuals::dark();
    visuals.dark_mode = true;
    visuals.panel_fill = CHASSIS_BG;
    visuals.window_fill = DECK_BG;
    visuals.extreme_bg_color = CHASSIS_BG;
    visuals.faint_bg_color = CONTROL_BG;

    visuals.window_stroke = Stroke::new(1.0, BORDER_COLOR);
    visuals.window_corner_radius = CornerRadius::same(12);
    visuals.selection.bg_fill = Color32::from_rgba_unmultiplied(245, 158, 11, 50);
    visuals.selection.stroke = Stroke::new(1.0, AMBER_PRIMARY);

    visuals.widgets.noninteractive.bg_fill = DECK_BG;
    visuals.widgets.noninteractive.bg_stroke = Stroke::new(1.0, BORDER_COLOR);
    visuals.widgets.noninteractive.fg_stroke = Stroke::new(1.0, TEXT_PRIMARY);
    visuals.widgets.noninteractive.corner_radius = CornerRadius::same(8);

    visuals.widgets.inactive.bg_fill = CONTROL_BG;
    visuals.widgets.inactive.bg_stroke = Stroke::new(1.0, BORDER_COLOR);
    visuals.widgets.inactive.fg_stroke = Stroke::new(1.0, TEXT_PRIMARY);
    visuals.widgets.inactive.corner_radius = CornerRadius::same(8);

    visuals.widgets.hovered.bg_fill = Color32::from_rgb(39, 39, 48);
    visuals.widgets.hovered.bg_stroke = Stroke::new(1.0, AMBER_PRIMARY);
    visuals.widgets.hovered.fg_stroke = Stroke::new(1.0, TEXT_PRIMARY);
    visuals.widgets.hovered.corner_radius = CornerRadius::same(8);

    visuals.widgets.active.bg_fill = AMBER_PRIMARY;
    visuals.widgets.active.bg_stroke = Stroke::new(1.0, AMBER_PRIMARY);
    visuals.widgets.active.fg_stroke = Stroke::new(1.0, AMBER_DARK_TEXT);
    visuals.widgets.active.corner_radius = CornerRadius::same(8);

    ctx.set_visuals(visuals);

    ctx.global_style_mut(|style| {
        style.animation_time = 0.18;
        style.spacing.item_spacing = egui::vec2(8.0, 8.0);
        style.spacing.button_padding = egui::vec2(10.0, 6.0);
        style.spacing.scroll.bar_width = 6.0;
    });
}

/// Linearly interpolates two `Color32` values (`t` in `0.0..=1.0`).
pub fn lerp_color(a: Color32, b: Color32, t: f32) -> Color32 {
    let t = t.clamp(0.0, 1.0);
    Color32::from_rgba_unmultiplied(
        (a.r() as f32 + (b.r() as f32 - a.r() as f32) * t) as u8,
        (a.g() as f32 + (b.g() as f32 - a.g() as f32) * t) as u8,
        (a.b() as f32 + (b.b() as f32 - a.b() as f32) * t) as u8,
        (a.a() as f32 + (b.a() as f32 - a.a() as f32) * t) as u8,
    )
}

/// Studio module card (`#121216`, border `#272730`, `12px` corner radius).
pub fn module_frame() -> Frame {
    Frame::NONE
        .fill(DECK_BG)
        .stroke(Stroke::new(1.0, BORDER_COLOR))
        .corner_radius(CornerRadius::same(12))
        .inner_margin(Margin::same(14))
}

/// Compact recessed LCD / slot frame (`#09090B`, border `#272730`, `8px` radius).
pub fn lcd_frame() -> Frame {
    Frame::NONE
        .fill(CHASSIS_BG)
        .stroke(Stroke::new(1.0, BORDER_COLOR))
        .corner_radius(CornerRadius::same(8))
        .inner_margin(Margin::same(10))
}

/// Borderless minimalist row frame (only highlights when selected).
pub fn list_row_frame(selected: bool) -> Frame {
    let fill = if selected {
        Color32::from_rgba_unmultiplied(245, 158, 11, 20)
    } else {
        Color32::from_rgb(14, 14, 18)
    };
    let stroke = if selected {
        Stroke::new(1.0, AMBER_PRIMARY)
    } else {
        Stroke::NONE
    };
    Frame::NONE
        .fill(fill)
        .stroke(stroke)
        .corner_radius(CornerRadius::same(7))
        .inner_margin(Margin::symmetric(10, 7))
}

/// Elevated studio dialog frame with crisp border & subtle drop shadow.
pub fn dialog_frame() -> Frame {
    Frame::NONE
        .fill(DECK_BG)
        .stroke(Stroke::new(1.0, Color32::from_rgb(56, 56, 68)))
        .corner_radius(CornerRadius::same(12))
        .inner_margin(Margin::same(14))
        .shadow(egui::Shadow {
            offset: [0, 8],
            blur: 24,
            spread: 0,
            color: Color32::from_black_alpha(170),
        })
}

/// Frameless split-pane dialog frame (0 outer margin so sidebar meets edge-to-edge).
pub fn split_dialog_frame() -> Frame {
    Frame::NONE
        .fill(Color32::from_rgb(20, 20, 25))
        .stroke(Stroke::new(1.0, Color32::from_rgb(56, 56, 68)))
        .corner_radius(CornerRadius::same(12))
        .inner_margin(Margin::same(0))
        .shadow(egui::Shadow {
            offset: [0, 10],
            blur: 28,
            spread: 0,
            color: Color32::from_black_alpha(185),
        })
}

/// Grouped setting card (`#1C1C23`, `10px` radius, subtle hairline border).
pub fn setting_group_frame() -> Frame {
    Frame::NONE
        .fill(Color32::from_rgb(26, 26, 32))
        .stroke(Stroke::new(1.0, Color32::from_rgb(40, 40, 49)))
        .corner_radius(CornerRadius::same(10))
        .inner_margin(Margin::symmetric(14, 10))
}

/// Smooth animated macOS/studio-style pill toggle switch.
pub fn studio_toggle(ui: &mut egui::Ui, on: &mut bool) -> egui::Response {
    let desired_size = egui::vec2(38.0, 20.0);
    let (rect, mut response) = ui.allocate_exact_size(desired_size, egui::Sense::click());
    response = response.on_hover_cursor(egui::CursorIcon::PointingHand);
    if response.clicked() {
        *on = !*on;
        response.mark_changed();
    }

    let how_on = ui.ctx().animate_bool_responsive(response.id, *on);
    let off_bg = Color32::from_rgb(52, 52, 62);
    let on_bg = STATUS_SUCCESS;
    let bg = Color32::from_rgb(
        (off_bg.r() as f32 + (on_bg.r() as f32 - off_bg.r() as f32) * how_on) as u8,
        (off_bg.g() as f32 + (on_bg.g() as f32 - off_bg.g() as f32) * how_on) as u8,
        (off_bg.b() as f32 + (on_bg.b() as f32 - off_bg.b() as f32) * how_on) as u8,
    );

    let radius = rect.height() * 0.5;
    ui.painter().rect_filled(rect, radius, bg);
    let circle_x = egui::lerp((rect.left() + radius)..=(rect.right() - radius), how_on);
    let center = egui::pos2(circle_x, rect.center().y);
    ui.painter()
        .circle_filled(center, radius - 2.5, Color32::WHITE);

    response
}

/// Clean flat `X` close button for frameless studio dialogs (vector-drawn so it never depends on font glyphs).
pub fn window_close_x(ui: &mut egui::Ui) -> bool {
    let (rect, resp) = ui.allocate_exact_size(egui::vec2(26.0, 26.0), egui::Sense::click());
    let resp = resp.on_hover_cursor(egui::CursorIcon::PointingHand);
    if resp.hovered() {
        ui.painter()
            .rect_filled(rect, CornerRadius::same(6), CONTROL_BG);
    }
    let col = if resp.hovered() {
        TEXT_PRIMARY
    } else {
        TEXT_SECONDARY
    };
    let c = rect.center();
    let d = 4.5_f32;
    let stroke = Stroke::new(1.6, col);
    ui.painter()
        .line_segment([c - egui::vec2(d, d), c + egui::vec2(d, d)], stroke);
    ui.painter()
        .line_segment([c + egui::vec2(d, -d), c + egui::vec2(-d, d)], stroke);
    resp.clicked()
}

/// Slate button that temporarily shows `copied_label` for 1.5s after click without spawning a toast.
pub fn copy_feedback_button(
    ui: &mut egui::Ui,
    id_key: &str,
    label: &str,
    copied_label: &str,
) -> bool {
    let id = egui::Id::unique(id_key);
    let copied_at = ui.ctx().data(|d| d.get_temp::<std::time::Instant>(id));
    let is_copied = copied_at
        .map(|t| t.elapsed().as_secs_f32() < 1.5)
        .unwrap_or(false);
    if is_copied {
        ui.ctx()
            .request_repaint_after(std::time::Duration::from_millis(100));
    }
    let resp = slate_button(ui, if is_copied { copied_label } else { label });
    if resp.clicked() {
        ui.ctx()
            .data_mut(|d| d.insert_temp(id, std::time::Instant::now()));
        true
    } else {
        false
    }
}

pub fn bold_text(text: impl Into<String>, size: f32, color: Color32) -> RichText {
    RichText::new(text)
        .size(size)
        .color(color)
        .family(FontFamily::Name("bold".into()))
}

pub fn semibold_text(text: impl Into<String>, size: f32, color: Color32) -> RichText {
    RichText::new(text)
        .size(size)
        .color(color)
        .family(FontFamily::Name("semibold".into()))
}

pub fn mono_text(text: impl Into<String>, size: f32, color: Color32) -> RichText {
    RichText::new(text)
        .size(size)
        .color(color)
        .family(FontFamily::Monospace)
}

struct PillButtonStyle {
    size_y: f32,
    base_fill: Color32,
    hover_fill: Color32,
    press_fill: Color32,
    base_stroke: Color32,
    hover_stroke: Color32,
    text_col: Color32,
    bold: bool,
}

fn animated_pill_button(ui: &mut egui::Ui, label: &str, style: PillButtonStyle) -> egui::Response {
    let font = egui::FontId::new(
        if style.bold { 12.5 } else { 12.0 },
        FontFamily::Name(if style.bold { "bold" } else { "semibold" }.into()),
    );
    let galley = ui
        .painter()
        .layout_no_wrap(label.to_string(), font, style.text_col);
    let desired = egui::vec2(galley.size().x + 22.0, style.size_y);
    let (rect, resp) = ui.allocate_exact_size(desired, egui::Sense::click());
    let resp = resp.on_hover_cursor(egui::CursorIcon::PointingHand);

    let hover_t = ui.ctx().animate_bool_responsive(resp.id, resp.hovered());
    let press_t = ui
        .ctx()
        .animate_bool_responsive(resp.id.with("press"), resp.is_pointer_button_down_on());

    let fill = lerp_color(
        lerp_color(style.base_fill, style.hover_fill, hover_t),
        style.press_fill,
        press_t,
    );
    let stroke_col = lerp_color(style.base_stroke, style.hover_stroke, hover_t);
    let stroke = if stroke_col.a() == 0 {
        Stroke::NONE
    } else {
        Stroke::new(1.0, stroke_col)
    };

    ui.painter()
        .rect(rect, CornerRadius::same(8), fill, stroke, egui::StrokeKind::Inside);
    ui.painter()
        .galley(rect.center() - galley.size() * 0.5, galley, style.text_col);
    resp
}

pub fn amber_button(ui: &mut egui::Ui, label: &str) -> egui::Response {
    animated_pill_button(
        ui,
        label,
        PillButtonStyle {
            size_y: 32.0,
            base_fill: AMBER_PRIMARY,
            hover_fill: Color32::from_rgb(251, 184, 52),
            press_fill: Color32::from_rgb(217, 119, 6),
            base_stroke: Color32::TRANSPARENT,
            hover_stroke: Color32::TRANSPARENT,
            text_col: AMBER_DARK_TEXT,
            bold: true,
        },
    )
}

pub fn slate_button(ui: &mut egui::Ui, label: &str) -> egui::Response {
    animated_pill_button(
        ui,
        label,
        PillButtonStyle {
            size_y: 30.0,
            base_fill: SLATE_BTN,
            hover_fill: Color32::from_rgb(54, 54, 67),
            press_fill: Color32::from_rgb(31, 31, 39),
            base_stroke: BORDER_COLOR,
            hover_stroke: Color32::from_rgb(84, 84, 102),
            text_col: TEXT_PRIMARY,
            bold: false,
        },
    )
}

pub fn danger_button(ui: &mut egui::Ui, label: &str) -> egui::Response {
    animated_pill_button(
        ui,
        label,
        PillButtonStyle {
            size_y: 30.0,
            base_fill: Color32::from_rgba_unmultiplied(248, 113, 113, 28),
            hover_fill: Color32::from_rgba_unmultiplied(248, 113, 113, 58),
            press_fill: Color32::from_rgba_unmultiplied(220, 38, 38, 85),
            base_stroke: Color32::from_rgba_unmultiplied(248, 113, 113, 90),
            hover_stroke: Color32::from_rgba_unmultiplied(248, 113, 113, 165),
            text_col: STATUS_ERROR,
            bold: false,
        },
    )
}

/// Smoothly animated segmented tab button (cross-fades fill and text color on hover & active).
pub fn animated_segment_tab(
    ui: &mut egui::Ui,
    size: egui::Vec2,
    label: &str,
    active: bool,
    amber_accent: bool,
    corner_radius: u8,
) -> egui::Response {
    let (rect, resp) = ui.allocate_exact_size(size, egui::Sense::click());
    let resp = resp.on_hover_cursor(egui::CursorIcon::PointingHand);

    let act_t = ui
        .ctx()
        .animate_bool_responsive(resp.id.with("seg_act"), active);
    let hov_t = ui
        .ctx()
        .animate_bool_responsive(resp.id.with("seg_hov"), resp.hovered() && !active);

    let (active_fill, active_text) = if amber_accent {
        (AMBER_PRIMARY, AMBER_DARK_TEXT)
    } else {
        (Color32::from_rgb(56, 56, 66), TEXT_PRIMARY)
    };
    let base_fill = lerp_color(Color32::TRANSPARENT, Color32::from_rgb(32, 32, 40), hov_t);
    let fill = lerp_color(base_fill, active_fill, act_t);
    let hover_text = lerp_color(TEXT_SECONDARY, TEXT_PRIMARY, hov_t);
    let text_col = lerp_color(hover_text, active_text, act_t);

    if fill.a() > 0 {
        ui.painter()
            .rect_filled(rect, CornerRadius::same(corner_radius), fill);
    }

    let font = egui::FontId::new(
        12.0,
        FontFamily::Name(if active { "bold" } else { "semibold" }.into()),
    );
    ui.painter()
        .text(rect.center(), egui::Align2::CENTER_CENTER, label, font, text_col);
    resp
}

pub fn status_pill(ui: &mut egui::Ui, text: &str, accent: Color32) {
    let bg = Color32::from_rgba_unmultiplied(accent.r(), accent.g(), accent.b(), 26);
    let stroke = Color32::from_rgba_unmultiplied(accent.r(), accent.g(), accent.b(), 90);
    Frame::NONE
        .fill(bg)
        .stroke(Stroke::new(1.0, stroke))
        .corner_radius(CornerRadius::same(6))
        .inner_margin(Margin::symmetric(8, 3))
        .show(ui, |ui| {
            ui.add(
                egui::Label::new(bold_text(text, 11.0, accent))
                    .wrap_mode(egui::TextWrapMode::Extend),
            );
        });
}
