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
        style.animation_time = 0.15;
        style.spacing.item_spacing = egui::vec2(8.0, 8.0);
        style.spacing.button_padding = egui::vec2(10.0, 6.0);
        style.spacing.scroll.bar_width = 6.0;
    });
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

pub fn amber_button(ui: &mut egui::Ui, label: &str) -> egui::Response {
    let btn = egui::Button::new(bold_text(label, 12.5, AMBER_DARK_TEXT))
        .fill(AMBER_PRIMARY)
        .stroke(Stroke::NONE)
        .corner_radius(CornerRadius::same(8))
        .min_size(egui::vec2(0.0, 32.0));
    ui.add(btn)
}

pub fn slate_button(ui: &mut egui::Ui, label: &str) -> egui::Response {
    let btn = egui::Button::new(semibold_text(label, 12.0, TEXT_PRIMARY))
        .fill(SLATE_BTN)
        .stroke(Stroke::new(1.0, BORDER_COLOR))
        .corner_radius(CornerRadius::same(8))
        .min_size(egui::vec2(0.0, 30.0));
    ui.add(btn)
}

pub fn danger_button(ui: &mut egui::Ui, label: &str) -> egui::Response {
    let fill = Color32::from_rgba_unmultiplied(248, 113, 113, 28);
    let btn = egui::Button::new(semibold_text(label, 12.0, STATUS_ERROR))
        .fill(fill)
        .stroke(Stroke::new(1.0, Color32::from_rgba_unmultiplied(248, 113, 113, 90)))
        .corner_radius(CornerRadius::same(8))
        .min_size(egui::vec2(0.0, 30.0));
    ui.add(btn)
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
            ui.label(bold_text(text, 11.0, accent));
        });
}
