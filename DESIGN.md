# Design System & Direction: Radio Caster Bridge

## 1. Identity & Design Read

**Design Read:** Live Radio Broadcast & Cue Controller for on-air Radio DJs/Casters, in a tactile hardware broadcast console style, dial `ENERGY 2 / RHYTHM 2 / MOTION 1`.

- **Product Category:** Broadcast Studio Automation & Audio Cue Controller (Desktop WebView2 + Web Remote).
- **Target Audience:** On-air radio announcers, studio operators, and broadcast producers working in dim studio environments under live time pressure.
- **Brand Character:** Tactile, reliable, high-contrast studio hardware (inspired by physical broadcast consoles such as RødeCaster, Lawo, and Pioneer DJ decks). Every control communicates immediate broadcast state without decorative clutter.

## 2. Three Dials (Liveliness & Restraint)

- **Dial:** `ENERGY 2 / RHYTHM 2 / MOTION 1`
- **ENERGY 2 (Balanced Hardware Contrast):** Visual depth comes from stepped surface luminance (recessed digital displays `#09090B`, module decks `#121216`, tactile controls `#1C1C22`) paired with one deliberate warm signal accent (`#F59E0B` Broadcast Amber).
- **RHYTHM 2 (Functional Asymmetric Split):** Each functional zone uses a distinct composition suited to its task: a full-width horizontal On-Air Rack Strip at the top, a dense single-column Discovery & Catalog table on the left (7 columns), and a vertical Cue & Live Queue channel strip on the right (5 columns).
- **MOTION 1 (State-Driven Only):** Zero perpetual decorative loops. Indicators pulse or spin exclusively when an actual hardware/stream state is active (such as live on-air playback or active audio buffering).

## 3. Color Palette & Contrast System

Reason for palette: Dark carbon surfaces reduce eye strain in dim broadcast booths while Broadcast Amber (`#F59E0B`) provides the highest visual legibility for primary cue actions without washing out night vision.

### Core Surfaces (Neutral Base)
- **Chassis / Recessed Display (`base-100`):** `#09090B` (Deep Carbon)
- **Module Deck Surface (`base-200`):** `#121216` (Studio Slate)
- **Elevated Control & Hairline Border (`base-300`):** `#1C1C22` (Control Surface) / `#272730` (Border)
- **Primary Text (`base-content`):** `#F4F4F6` (18.11:1 on `base-100`, 17.01:1 on `base-200` - WCAG AAA)
- **Secondary / Metadata Text:** `#A1A1AA` or `base-content/70` (7.29:1 to 8.65:1 on `base-200` - WCAG AA/AAA)

### Deliberate Accent & Semantic Signals (2 Core + 1 Accent)
- **One Deliberate Accent (`primary` - Broadcast Amber):** `#F59E0B` with `#09090B` text (9.26:1 contrast). Reserved for the primary studio action (`Putar Berikutnya`, active mode indicator, and keyboard focus rings).
- **Secondary Control (`secondary` - Hardware Key):** `#272730` with `#F4F4F6` text (12.8:1 contrast). Used for secondary queue actions (`Antrean Bawah`, batch tools).
- **Technical Highlight (`accent` / `info` - Signal Cyan):** `#38BDF8` with `#09090B` fill text (8.72:1 on `base-200`). Used for cue point markers and technical file/database indicators.
- **Semantic Broadcast States:**
  - **Live / On-Air / Stop (`error`):** `#F87171` (6.76:1 on `base-200`). Used strictly when on-air transmission is active or for destructive/stop controls.
  - **Connected / Ready (`success`):** `#34D399` (9.72:1 on `base-200`). Used strictly for verified RadioBOSS connection and local studio cache readiness.
  - **Caution / Dead-Air Guard (`warning`):** `#FBBF24` (11.4:1 on `base-200`). Used when playlist queue drops to 1 track or fewer.

## 4. Typography & Identity Motif

Reason for typography: Pairing a clean geometric UI sans-serif for song titles with a tabular monospace typeface for timecodes and cue ramps separates human-readable music catalog data from precision broadcast timing.

- **UI & Editorial Sans (`--font-sans`):** `Plus Jakarta Sans`
  - On-Air / Selected Track Title: `18px` to `20px` (`text-lg` / `text-xl`), `font-bold`, `tracking-tight` (`-0.015em`).
  - Tracklist Row Title: `14px` (`text-sm`), `font-semibold`, `#F4F4F6`.
  - Artist & Album Subtitle: `12px` (`text-xs`), `font-medium`, `base-content/70`.
  - Minimum readable body/label size: `12px` (`text-xs`). Micro-text below `11px` is prohibited.
- **Technical Monospace & Identity Motif (`--font-mono`):** `JetBrains Mono` with `font-variant-numeric: tabular-nums`
  - Used consistently as the product's **Identity Motif** across all timing and technical readouts:
  - Live On-Air Timecode (`01:24 / 03:45`), track durations (`03:45`), 2-digit tracklist indices (`01`, `02`, `03`), announcer ramp windows (`00:00 - 00:14`), and network endpoints (`127.0.0.1:9000`).

## 5. Layout Architecture & Component Rules

Reason for layout: A 3-zone broadcast workbench eliminates vertical page scrolling and maps left-to-right to the announcer's mental workflow (Discover on the left, Cue and Monitor on the right).

1. **Zone 1: Top Master On-Air Rack Strip (`ConnectionBar` + `NowPlayingWidget`)**
   - Compact console header combining station identity, RadioBOSS connection status, live On-Air LCD readout with inline title editor, tabular timecode display, and physical transport buttons (`Putar/Jeda`, `Lewati`, `Stop`).
2. **Zone 2: Left Discovery & Library Deck (7 Columns)**
   - **Smart Omnibox:** Single unified input that searches official YouTube Music studio tracks when given text, or automatically resolves direct YouTube/YT Music URLs when a link is pasted.
   - **Single-Column Tracklist:** Search results, Smart Recommendations, and Playlist Sets render as full-width horizontal rows with 2-digit monospace index numbers (`01`, `02`), persistent headphone preview triggers, full song titles without cramped 2-column truncation, and tabular durations.
3. **Zone 3: Right Cue & Live Broadcast Deck (5 Columns, Sticky)**
   - **Top Module (`TrackPreviewCard`):** Channel-strip Cue Deck for the selected song, featuring headphone preview, announcer lyrics/cue sheet trigger, metadata cleaner, and high-priority dispatch buttons (`Putar Berikutnya` in Broadcast Amber, `Tambahkan ke Antrean Bawah` in Hardware Slate). When no track is selected, displays a compact standby readout rather than a 3-step tutorial card.
   - **Bottom Module (`PlaylistQueueWidget` + `QueueHistory`):** Directly beneath the dispatch buttons so the announcer immediately sees queued tracks appear in the live RadioBOSS playlist or request log without looking across the screen.

## 6. Explicit Decisions Log (R-31)

- **Why Carbon + Broadcast Amber palette?** Dim broadcast studios require low-glare dark surfaces (`#09090B` / `#121216`) and a single high-contrast warm focal accent (`#F59E0B`) for instant target acquisition.
- **Why Plus Jakarta Sans + JetBrains Mono?** Geometric sans maximizes legibility for Indonesian and international song titles, while tabular monospace (`JetBrains Mono`) prevents layout jitter on 1-second real-time broadcast clocks.
- **Why 3-Zone Console Workbench layout?** Placing the Cue Deck directly above the Live RadioBOSS Queue on the right column gives immediate visual confirmation when a DJ dispatches a song.
- **Why single-column tracklist rows instead of 2-column cards?** Song titles and artist names are horizontal strings that get truncated in narrow 2-column grids; full-width rows with `tabular-nums` durations read like professional DJ software.
- **Why functional Lucide broadcast icons (and zero emojis/sparkles)?** Hardware iconography (`Radio`, `Disc3`, `Headphones`, `Mic2`, `Sliders`) reinforces studio utility, whereas decorative emojis and AI sparkles add visual noise.
- **Why controlled border radii (`8px` controls, `12px` modules)?** Differentiating module containers (`12px` / `rounded-xl`) from interactive keys and inputs (`8px` / `rounded-lg`) establishes tactile hierarchy instead of uniform pill shapes.
