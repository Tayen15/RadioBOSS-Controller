use std::collections::HashMap;
use std::time::Duration;

use regex::Regex;
use reqwest::Client;
use serde_json::{json, Value};

use crate::models::track::{LyricsResponse, TalkingPoints, TrackItem};
use crate::services::db_service::DatabaseService;

const INNERTUBE_BASE: &str = "https://music.youtube.com/youtubei/v1";
const YTMUSIC_CLIENT_VERSION: &str = "1.20250101.01.00";
// InnerTube base64 filter params:
// "songs" filter = EgWKAQIIAWoKEAkQBRAKEAMQBA%3D%3D -> decoded: EgWKAQIIAWoKEAkQBRAKEAMQBA==
const FILTER_SONGS: &str = "EgWKAQIIAWoKEAkQBRAKEAMQBA==";
const FILTER_ARTISTS: &str = "EgWKAQIgAWoKEAkQBRAKEAMQBA==";

/// Native Rust YouTube Music InnerTube API client & Announcer Cue Sheet generator.
#[derive(Clone)]
pub struct YtMusicService {
    client: Client,
}

impl Default for YtMusicService {
    fn default() -> Self {
        Self::new()
    }
}

impl YtMusicService {
    pub fn new() -> Self {
        let client = Client::builder()
            .timeout(Duration::from_secs(12))
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
            .build()
            .unwrap_or_else(|_| Client::new());
        Self { client }
    }

    fn web_remix_context() -> Value {
        json!({
            "client": {
                "clientName": "WEB_REMIX",
                "clientVersion": YTMUSIC_CLIENT_VERSION,
                "hl": "id",
                "gl": "ID"
            }
        })
    }

    async fn post_innertube(&self, endpoint: &str, body: Value) -> Result<Value, String> {
        let url = format!("{INNERTUBE_BASE}/{endpoint}?prettyPrint=false");
        let resp = self
            .client
            .post(&url)
            .header("Content-Type", "application/json")
            .header("Origin", "https://music.youtube.com")
            .header("Referer", "https://music.youtube.com/")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Gagal menghubungi YouTube Music: {e}"))?;

        if !resp.status().is_success() {
            return Err(format!("YouTube Music HTTP {}", resp.status()));
        }
        resp.json::<Value>()
            .await
            .map_err(|e| format!("Format JSON YouTube Music tidak valid: {e}"))
    }

    /// Searches YouTube Music specifically for official studio master songs (`filter="songs"`).
    pub async fn search_songs(&self, query: &str, limit: usize) -> Result<Vec<TrackItem>, String> {
        let clean_q = query.trim();
        if clean_q.is_empty() {
            return Ok(Vec::new());
        }

        let body = json!({
            "context": Self::web_remix_context(),
            "query": clean_q,
            "params": FILTER_SONGS
        });

        let data = self.post_innertube("search", body).await?;
        let mut results = Vec::new();
        Self::collect_music_list_items(&data, &mut results, "Pop");
        results.truncate(limit);
        Ok(results)
    }

    /// Fetches "Up Next" / radio mix recommendations for a seed video_id.
    pub async fn get_recommendations(&self, video_id: &str, limit: usize) -> Result<Vec<TrackItem>, String> {
        let clean_id = video_id.trim().trim_end_matches(".mp3");
        let body = json!({
            "context": Self::web_remix_context(),
            "videoId": clean_id,
            "playlistId": format!("RDAMVM{clean_id}"),
            "isAudioOnly": true
        });

        let data = self.post_innertube("next", body).await?;
        let mut results = Vec::new();
        Self::collect_watch_playlist_tracks(&data, &mut results, Some(clean_id), "Radio Recommendation");
        results.truncate(limit);
        Ok(results)
    }

    /// Fetches top songs for an artist via artist search + browse, falling back to song search.
    pub async fn get_artist_top_tracks(&self, artist_name: &str, limit: usize) -> Result<Vec<TrackItem>, String> {
        let clean = artist_name.trim();
        if clean.is_empty() {
            return Ok(Vec::new());
        }

        let search_body = json!({
            "context": Self::web_remix_context(),
            "query": clean,
            "params": FILTER_ARTISTS
        });

        if let Ok(search_json) = self.post_innertube("search", search_body).await {
            if let Some(browse_id) = Self::find_first_artist_browse_id(&search_json) {
                let browse_body = json!({
                    "context": Self::web_remix_context(),
                    "browseId": browse_id
                });
                if let Ok(artist_json) = self.post_innertube("browse", browse_body).await {
                    let mut tracks = Vec::new();
                    Self::collect_music_list_items(&artist_json, &mut tracks, "Artist Top Track");
                    if !tracks.is_empty() {
                        tracks.truncate(limit);
                        return Ok(tracks);
                    }
                }
            }
        }

        self.search_songs(clean, limit).await
    }

    /// Fetches lyrics from YouTube Music (with LRCLIB fallback) and generates tailored Indonesian announcer cues.
    pub async fn get_lyrics_and_talking_points(
        &self,
        video_id: &str,
        fallback_track: Option<&TrackItem>,
        db: &DatabaseService,
    ) -> LyricsResponse {
        let clean_id = video_id.trim().trim_end_matches(".mp3").to_string();
        let mut song_title = fallback_track.map(|t| t.title.clone()).unwrap_or_default();
        let mut artist_name = fallback_track.map(|t| t.artists_joined()).unwrap_or_default();
        let mut album_name = fallback_track
            .and_then(|t| t.album.clone())
            .unwrap_or_default();
        let mut year = fallback_track
            .and_then(|t| t.year.clone())
            .unwrap_or_default();
        let mut duration_str = fallback_track
            .and_then(|t| t.duration_formatted.clone())
            .unwrap_or_else(|| "00:00".to_string());
        let mut play_count: u64 = 0;

        if let Some(cached) = db.get_cached_track(&clean_id) {
            if song_title.is_empty() {
                song_title = cached.title;
            }
            if artist_name.is_empty() || artist_name == "Unknown Artist" {
                artist_name = cached.artist;
            }
            if album_name.is_empty() {
                album_name = cached.album;
            }
            if year.is_empty() {
                year = cached.year;
            }
            if (duration_str.is_empty() || duration_str == "00:00") && !cached.duration_formatted.is_empty() {
                duration_str = cached.duration_formatted;
            }
            play_count = cached.play_count;
        }

        let mut lyrics_text: Option<String> = None;
        let mut lyrics_source = "YouTube Music / LyricFind".to_string();

        // 1. Try YouTube Music InnerTube `next` -> lyrics `browseId`
        let next_body = json!({
            "context": Self::web_remix_context(),
            "videoId": clean_id,
            "isAudioOnly": true
        });
        if let Ok(next_json) = self.post_innertube("next", next_body).await {
            if song_title.is_empty() || duration_str == "00:00" {
                let mut tmp = Vec::new();
                Self::collect_watch_playlist_tracks(&next_json, &mut tmp, None, "Pop");
                if let Some(first) = tmp.first() {
                    if song_title.is_empty() {
                        song_title = first.title.clone();
                    }
                    if artist_name.is_empty() || artist_name == "Unknown Artist" {
                        artist_name = first.artists_joined();
                    }
                    if album_name.is_empty() {
                        album_name = first.album.clone().unwrap_or_default();
                    }
                    if year.is_empty() {
                        year = first.year.clone().unwrap_or_default();
                    }
                    if duration_str == "00:00" {
                        duration_str = first.display_duration().to_string();
                    }
                }
            }

            if let Some(lyrics_browse_id) = Self::find_lyrics_browse_id(&next_json) {
                let browse_body = json!({
                    "context": Self::web_remix_context(),
                    "browseId": lyrics_browse_id
                });
                if let Ok(lyrics_json) = self.post_innertube("browse", browse_body).await {
                    if let Some((txt, src)) = Self::extract_lyrics_text(&lyrics_json) {
                        lyrics_text = Some(txt);
                        if !src.is_empty() {
                            lyrics_source = src;
                        }
                    }
                }
            }
        }

        // 2. Fallback to LRCLIB public API if YouTube Music has no lyrics
        if lyrics_text.is_none() && !song_title.is_empty() {
            if let Ok(resp) = self
                .client
                .get("https://lrclib.net/api/get")
                .query(&[
                    ("track_name", song_title.as_str()),
                    ("artist_name", artist_name.as_str()),
                ])
                .timeout(Duration::from_secs(5))
                .send()
                .await
            {
                if resp.status().is_success() {
                    if let Ok(val) = resp.json::<Value>().await {
                        if let Some(plain) = val.get("plainLyrics").and_then(|v| v.as_str()) {
                            let t = plain.trim();
                            if !t.is_empty() {
                                lyrics_text = Some(t.to_string());
                                lyrics_source = "LRCLIB Studio Database".to_string();
                            }
                        }
                    }
                }
            }
        }

        let talking_points = Self::build_talking_points(
            &song_title,
            &artist_name,
            &album_name,
            &year,
            &duration_str,
            play_count,
            lyrics_text.as_deref(),
        );

        LyricsResponse {
            video_id: clean_id,
            has_lyrics: lyrics_text.is_some(),
            lyrics: lyrics_text.unwrap_or_else(|| {
                "Lirik lagu ini belum tersedia di katalog YouTube Music maupun LRCLIB.".to_string()
            }),
            source: lyrics_source,
            talking_points,
        }
    }

    fn build_talking_points(
        song_title: &str,
        artist_name: &str,
        album_name: &str,
        year: &str,
        duration_str: &str,
        play_count: u64,
        lyrics: Option<&str>,
    ) -> TalkingPoints {
        let total_seconds = parse_duration_str(duration_str).max(210);
        let (intro_sec, intro_desc) = if total_seconds < 160 {
            (8, "Intro Singkat")
        } else if total_seconds > 260 {
            (18, "Intro Musik Panjang")
        } else {
            (14, "Intro Standar Radio")
        };

        let intro_talk_window = format!("00:00 - {} ({intro_desc})", format_seconds(intro_sec));
        let mid_sec = total_seconds / 2;
        let station_id_cue = format!("{} (Sweep / Station ID)", format_seconds(mid_sec));
        let outro_start = total_seconds.saturating_sub(18);
        let outro_talk_window = format!(
            "{} - {} (Backsell Fade-Out)",
            format_seconds(outro_start),
            format_seconds(total_seconds)
        );

        let (vibe_cat, vibe_title, vibe_badge) = analyze_song_vibe(lyrics, year);
        let key_quote = extract_key_lyric_quote(lyrics).unwrap_or_default();

        let artist_display = if artist_name.is_empty() || artist_name == "Unknown Artist" {
            "musisi terbaik"
        } else {
            artist_name
        };
        let title_display = if song_title.is_empty() {
            "karya pilihan"
        } else {
            song_title
        };
        let year_phrase = if year.is_empty() {
            String::new()
        } else {
            format!(" rilisan tahun {year}")
        };
        let album_phrase = if album_name.is_empty() {
            String::new()
        } else {
            format!(" dari album '{album_name}'")
        };
        let quote_phrase = if key_quote.is_empty() {
            String::new()
        } else {
            format!("Kutipan liriknya yang berbunyi \"{key_quote}\" begitu berkesan.")
        };

        let (intro_script, outro_script) = match vibe_cat {
            "sad" => (
                format!(
                    "Halo Sobat Radio, kita putarkan lagu melankolis penuh penghayatan dari {artist_display} berjudul '{title_display}'{year_phrase}. Buat kamu yang lagi butuh teman syahdu di saat sepi atau lagi mencoba merelakan, selamat mendengarkan..."
                ),
                format!(
                    "Baru saja kita dengarkan hits '{title_display}' dari {artist_display}{album_phrase}. {quote_phrase} Menusuk banget di hati ya. Tetap bersama kami, masih banyak deretan lagu penenang jiwa lainnya."
                ),
            ),
            "romance" => (
                format!(
                    "Halo Sobat Radio, saatnya kita nikmati lantunan manis penuh cinta dari {artist_display} berjudul '{title_display}'{year_phrase}. Pas banget buat kamu dedikasikan ke orang terkasih. Selamat menikmati alunan indahnya..."
                ),
                format!(
                    "Baru saja terdengar '{title_display}' dari {artist_display}{album_phrase}. {quote_phrase} Hangat dan manis banget lagunya. Tetap stay tune di radio kesayangan kamu!"
                ),
            ),
            "party" => (
                format!(
                    "Halo pendengar setia, saatnya kita naikkan energi dan semangat bareng track ritmis dari {artist_display} berjudul '{title_display}'{year_phrase}! Bikin suasana makin hidup dan siap bikin harimu makin seru. Let's enjoy the groove!"
                ),
                format!(
                    "Itu dia track berenergi '{title_display}' dari {artist_display}! Beat-nya bener-bener bikin suasana kembali fresh dan bersemangat. Tetap stay tune untuk deretan hits terbaik selanjutnya!"
                ),
            ),
            "chill" => (
                format!(
                    "Halo Sobat Radio, mari rehat sejenak ditemani alunan santai dan syahdu dari {artist_display} berjudul '{title_display}'{album_phrase}. Pas banget buat nemenin waktu rileks atau santai sore kamu..."
                ),
                format!(
                    "Baru saja kita nikmati kesyahduan lagu '{title_display}' dari {artist_display}. {quote_phrase} Bikin pikiran jadi tenang dan adem. Terus dengarkan siaran kami untuk playlist santai lainnya."
                ),
            ),
            "nostalgia" => (
                format!(
                    "Halo pendengar setia, saatnya kita bernostalgia dengan karya legendaris dari {artist_display} berjudul '{title_display}'{year_phrase}. Membawa kembali memori manis masa lalu, selamat mendengarkan..."
                ),
                format!(
                    "Baru saja kita bernostalgia bersama lagu legendaris '{title_display}' dari {artist_display}{year_phrase}. Lagu klasik yang nggak pernah gagal bikin kangen. Tetap pantengin siaran kami!"
                ),
            ),
            _ => (
                format!(
                    "Halo Sobat Radio, berikut lagu hits pilihan spesial dari {artist_display} berjudul '{title_display}'{album_phrase}. Teman setia buat menemani aktivitas kamu hari ini, selamat menikmati..."
                ),
                format!(
                    "Baru saja kita dengarkan karya apik '{title_display}' dari {artist_display}{album_phrase}. {quote_phrase} Tetap setia bersama kami, playlist terbaik hari ini masih akan terus berlanjut!"
                ),
            ),
        };

        let mut tips = vec![
            format!("Intro Ramp ({intro_talk_window}): Selesaikan sapaan sebelum detik ke-{intro_sec} agar vokal pertama {artist_display} terdengar jernih."),
            format!("Midpoint Cue ({station_id_cue}): Titik ideal untuk menyisipkan jingle stasiun atau callout ID penyiar saat jeda instrumen."),
            format!("Outro Backsell ({outro_talk_window}): Mulai bicara kembali saat instrumen mulai memudar sebelum lagu berikutnya dimulai."),
        ];
        if play_count > 0 {
            tips.push(format!(
                "Statistik Studio: Lagu ini sudah diputar sebanyak {play_count} kali di stasiun radio Anda."
            ));
        }
        tips.push(
            "Gunakan mic ducking otomatis RadioBOSS agar musik melirih saat Anda berbicara."
                .to_string(),
        );

        TalkingPoints {
            intro_talk_window,
            outro_talk_window,
            station_id_cue,
            vibe: vibe_title,
            vibe_badge,
            vibe_category: vibe_cat.to_string(),
            key_lyric_quote: key_quote,
            intro_script,
            outro_script,
            broadcaster_tips: tips,
            play_count,
        }
    }

    // -------------------------------------------------------------------------
    // InnerTube JSON Recursive Parsers
    // -------------------------------------------------------------------------

    fn collect_music_list_items(node: &Value, out: &mut Vec<TrackItem>, default_genre: &str) {
        match node {
            Value::Object(map) => {
                if let Some(renderer) = map.get("musicResponsiveListItemRenderer") {
                    if let Some(track) = Self::parse_responsive_list_item(renderer, default_genre) {
                        out.push(track);
                    }
                    return;
                }
                for v in map.values() {
                    Self::collect_music_list_items(v, out, default_genre);
                }
            }
            Value::Array(arr) => {
                for v in arr {
                    Self::collect_music_list_items(v, out, default_genre);
                }
            }
            _ => {}
        }
    }

    fn parse_responsive_list_item(renderer: &Value, default_genre: &str) -> Option<TrackItem> {
        let video_id = renderer
            .pointer("/playlistItemData/videoId")
            .and_then(|v| v.as_str())
            .or_else(|| {
                renderer.pointer("/overlay/musicItemThumbnailOverlayRenderer/content/musicPlayButtonRenderer/playNavigationEndpoint/watchEndpoint/videoId")
                    .and_then(|v| v.as_str())
            })?
            .to_string();

        if video_id.is_empty() {
            return None;
        }

        let flex_cols = renderer.get("flexColumns").and_then(|v| v.as_array())?;
        let title = flex_cols
            .first()
            .and_then(|c| c.pointer("/musicResponsiveListItemFlexColumnRenderer/text/runs/0/text"))
            .and_then(|v| v.as_str())
            .unwrap_or("Unknown Title")
            .to_string();

        let mut artists: Vec<String> = Vec::new();
        let mut album: Option<String> = None;
        let mut duration_str: Option<String> = None;
        let mut year: Option<String> = None;

        for (idx, col) in flex_cols.iter().enumerate().skip(1) {
            if let Some(runs) = col
                .pointer("/musicResponsiveListItemFlexColumnRenderer/text/runs")
                .and_then(|v| v.as_array())
            {
                for run in runs {
                    let text = run.get("text").and_then(|v| v.as_str()).unwrap_or("").trim();
                    if text.is_empty() || text == "•" || text == "," || text == "&" {
                        continue;
                    }
                    if let Some(page_type) = run
                        .pointer("/navigationEndpoint/browseEndpoint/browseEndpointContextSupportedConfigs/browseEndpointContextMusicConfig/pageType")
                        .and_then(|v| v.as_str())
                    {
                        if page_type == "MUSIC_PAGE_TYPE_ARTIST" {
                            artists.push(text.to_string());
                        } else if page_type == "MUSIC_PAGE_TYPE_ALBUM" {
                            album = Some(text.to_string());
                        }
                    } else if text.contains(':') && text.chars().all(|c| c.is_ascii_digit() || c == ':') {
                        duration_str = Some(text.to_string());
                    } else if text.len() == 4 && text.chars().all(|c| c.is_ascii_digit()) {
                        year = Some(text.to_string());
                    }
                }

                // Fallback: if no artist had MUSIC_PAGE_TYPE_ARTIST navigation endpoint, pick first segment before •
                if idx == 1 && artists.is_empty() {
                    if let Some(first_run) = runs.first().and_then(|r| r.get("text")).and_then(|t| t.as_str()) {
                        let t = first_run.trim();
                        if !t.is_empty() && t != "Song" && t != "Lagu" {
                            artists.push(t.to_string());
                        }
                    }
                }
            }
        }

        // Fixed columns sometimes hold duration (runs or simpleText)
        if duration_str.is_none() {
            if let Some(fixed_cols) = renderer.get("fixedColumns").and_then(|v| v.as_array()) {
                for fc in fixed_cols {
                    let t = fc
                        .pointer("/musicResponsiveListItemFixedColumnRenderer/text/runs/0/text")
                        .or_else(|| fc.pointer("/musicResponsiveListItemFixedColumnRenderer/text/simpleText"))
                        .and_then(|v| v.as_str());
                    if let Some(t) = t {
                        if t.contains(':') {
                            duration_str = Some(t.trim().to_string());
                            break;
                        }
                    }
                }
            }
        }

        let dur_sec = duration_str.as_deref().map(parse_duration_str).unwrap_or(0);
        let dur_fmt = if dur_sec > 0 {
            format_seconds(dur_sec)
        } else {
            duration_str.unwrap_or_else(|| "00:00".to_string())
        };

        let thumbs = renderer
            .pointer("/thumbnail/musicThumbnailRenderer/thumbnail/thumbnails")
            .and_then(|v| v.as_array());
        let thumbnail_url = thumbs.and_then(|arr| extract_best_thumbnail(arr));

        Some(TrackItem {
            video_id: video_id.clone(),
            title,
            artists,
            album,
            duration_seconds: Some(dur_sec),
            duration_formatted: Some(dur_fmt),
            thumbnail_url,
            url: format!("https://music.youtube.com/watch?v={video_id}"),
            year,
            genre: Some(default_genre.to_string()),
        })
    }

    fn collect_watch_playlist_tracks(
        node: &Value,
        out: &mut Vec<TrackItem>,
        exclude_id: Option<&str>,
        default_genre: &str,
    ) {
        match node {
            Value::Object(map) => {
                if let Some(renderer) = map.get("playlistPanelVideoRenderer") {
                    if let Some(vid) = renderer.get("videoId").and_then(|v| v.as_str()) {
                        if exclude_id.map(|ex| ex != vid).unwrap_or(true) {
                            let title = renderer
                                .pointer("/title/runs/0/text")
                                .and_then(|v| v.as_str())
                                .unwrap_or("Unknown Title")
                                .to_string();

                            let mut artists = Vec::new();
                            let mut album = None;
                            let mut year = None;

                            if let Some(runs) = renderer
                                .pointer("/longBylineText/runs")
                                .and_then(|v| v.as_array())
                            {
                                for r in runs {
                                    let txt = r.get("text").and_then(|v| v.as_str()).unwrap_or("").trim();
                                    if txt.is_empty() || txt == "•" || txt == "," || txt == "&" {
                                        continue;
                                    }
                                    if let Some(pt) = r
                                        .pointer("/navigationEndpoint/browseEndpoint/browseEndpointContextSupportedConfigs/browseEndpointContextMusicConfig/pageType")
                                        .and_then(|v| v.as_str())
                                    {
                                        if pt == "MUSIC_PAGE_TYPE_ARTIST" {
                                            artists.push(txt.to_string());
                                        } else if pt == "MUSIC_PAGE_TYPE_ALBUM" {
                                            album = Some(txt.to_string());
                                        }
                                    } else if txt.len() == 4 && txt.chars().all(|c| c.is_ascii_digit()) {
                                        year = Some(txt.to_string());
                                    }
                                }
                                if artists.is_empty() {
                                    if let Some(first) = runs.first().and_then(|r| r.get("text")).and_then(|t| t.as_str()) {
                                        if !first.trim().is_empty() {
                                            artists.push(first.trim().to_string());
                                        }
                                    }
                                }
                            }

                            let length_str = renderer
                                .pointer("/lengthText/runs/0/text")
                                .or_else(|| renderer.pointer("/lengthText/simpleText"))
                                .and_then(|v| v.as_str())
                                .unwrap_or("00:00");
                            let dur_sec = parse_duration_str(length_str);
                            let thumbs = renderer.pointer("/thumbnail/thumbnails").and_then(|v| v.as_array());
                            let thumbnail_url = thumbs.and_then(|arr| extract_best_thumbnail(arr));

                            out.push(TrackItem {
                                video_id: vid.to_string(),
                                title,
                                artists,
                                album,
                                duration_seconds: Some(dur_sec),
                                duration_formatted: Some(format_seconds(dur_sec)),
                                thumbnail_url,
                                url: format!("https://music.youtube.com/watch?v={vid}"),
                                year,
                                genre: Some(default_genre.to_string()),
                            });
                        }
                    }
                    return;
                }
                for v in map.values() {
                    Self::collect_watch_playlist_tracks(v, out, exclude_id, default_genre);
                }
            }
            Value::Array(arr) => {
                for v in arr {
                    Self::collect_watch_playlist_tracks(v, out, exclude_id, default_genre);
                }
            }
            _ => {}
        }
    }

    fn find_first_artist_browse_id(node: &Value) -> Option<String> {
        match node {
            Value::Object(map) => {
                if let Some(renderer) = map.get("musicResponsiveListItemRenderer") {
                    if let Some(bid) = renderer
                        .pointer("/navigationEndpoint/browseEndpoint/browseId")
                        .and_then(|v| v.as_str())
                    {
                        return Some(bid.to_string());
                    }
                }
                for v in map.values() {
                    if let Some(found) = Self::find_first_artist_browse_id(v) {
                        return Some(found);
                    }
                }
                None
            }
            Value::Array(arr) => {
                for v in arr {
                    if let Some(found) = Self::find_first_artist_browse_id(v) {
                        return Some(found);
                    }
                }
                None
            }
            _ => None,
        }
    }

    fn find_lyrics_browse_id(node: &Value) -> Option<String> {
        match node {
            Value::Object(map) => {
                if let Some(tab) = map.get("tabRenderer") {
                    let title = tab.get("title").and_then(|v| v.as_str()).unwrap_or("");
                    if title.eq_ignore_ascii_case("Lyrics") || title.eq_ignore_ascii_case("Lirik") {
                        if let Some(bid) = tab
                            .pointer("/endpoint/browseEndpoint/browseId")
                            .and_then(|v| v.as_str())
                        {
                            return Some(bid.to_string());
                        }
                    }
                }
                for v in map.values() {
                    if let Some(found) = Self::find_lyrics_browse_id(v) {
                        return Some(found);
                    }
                }
                None
            }
            Value::Array(arr) => {
                for v in arr {
                    if let Some(found) = Self::find_lyrics_browse_id(v) {
                        return Some(found);
                    }
                }
                None
            }
            _ => None,
        }
    }

    fn extract_lyrics_text(node: &Value) -> Option<(String, String)> {
        match node {
            Value::Object(map) => {
                if let Some(renderer) = map.get("musicDescriptionShelfRenderer") {
                    let text = renderer
                        .pointer("/description/runs")
                        .and_then(|v| v.as_array())
                        .map(|runs| {
                            runs.iter()
                                .filter_map(|r| r.get("text").and_then(|t| t.as_str()))
                                .collect::<String>()
                        })
                        .unwrap_or_default()
                        .trim()
                        .to_string();
                    let source = renderer
                        .pointer("/footer/runs")
                        .and_then(|v| v.as_array())
                        .map(|runs| {
                            runs.iter()
                                .filter_map(|r| r.get("text").and_then(|t| t.as_str()))
                                .collect::<String>()
                        })
                        .unwrap_or_default()
                        .trim()
                        .to_string();
                    if !text.is_empty() {
                        return Some((text, source));
                    }
                }
                for v in map.values() {
                    if let Some(found) = Self::extract_lyrics_text(v) {
                        return Some(found);
                    }
                }
                None
            }
            Value::Array(arr) => {
                for v in arr {
                    if let Some(found) = Self::extract_lyrics_text(v) {
                        return Some(found);
                    }
                }
                None
            }
            _ => None,
        }
    }
}

pub fn format_seconds(seconds: u64) -> String {
    if seconds == 0 {
        return "00:00".to_string();
    }
    let h = seconds / 3600;
    let m = (seconds % 3600) / 60;
    let s = seconds % 60;
    if h > 0 {
        format!("{h:02}:{m:02}:{s:02}")
    } else {
        format!("{m:02}:{s:02}")
    }
}

pub fn parse_duration_str(s: &str) -> u64 {
    let parts: Vec<&str> = s.trim().split(':').collect();
    match parts.as_slice() {
        [m, sec] => {
            let mm = m.parse::<u64>().unwrap_or(0);
            let ss = sec.parse::<u64>().unwrap_or(0);
            mm * 60 + ss
        }
        [h, m, sec] => {
            let hh = h.parse::<u64>().unwrap_or(0);
            let mm = m.parse::<u64>().unwrap_or(0);
            let ss = sec.parse::<u64>().unwrap_or(0);
            hh * 3600 + mm * 60 + ss
        }
        _ => 0,
    }
}

pub fn extract_best_thumbnail(thumbs: &[Value]) -> Option<String> {
    let best = thumbs
        .iter()
        .max_by_key(|t| {
            let w = t.get("width").and_then(|v| v.as_u64()).unwrap_or(0);
            let h = t.get("height").and_then(|v| v.as_u64()).unwrap_or(0);
            w * h
        })
        .and_then(|t| t.get("url"))
        .and_then(|v| v.as_str())?;

    if best.contains("googleusercontent.com") {
        let re = Regex::new(r"=w\d+-h\d+").unwrap();
        Some(re.replace(best, "=w544-h544").to_string())
    } else {
        Some(best.to_string())
    }
}

fn analyze_song_vibe(lyrics: Option<&str>, year: &str) -> (&'static str, String, String) {
    let lower = lyrics.unwrap_or("").to_lowercase();
    let sad_kw = [
        "menangis", "air mata", "terluka", "perih", "kecewa", "lupakan", "pergi", "sakit",
        "sendiri", "sedih", "merana", "hancur", "patah hati", "menyesal", "tears", "crying",
        "cry", "pain", "heartbreak", "lonely", "broken", "goodbye", "miss you", "hurt", "hilang",
    ];
    let rom_kw = [
        "cinta", "sayang", "merindukan", "rindu", "peluk", "setia", "kekasih", "bersamamu",
        "hati", "indah", "selamanya", "kasih", "love", "heart", "forever", "darling", "kiss",
        "romantic", "sweet", "beautiful", "together", "baby",
    ];
    let party_kw = [
        "berlari", "terbang", "menari", "semangat", "pesta", "party", "dance", "beat", "jump",
        "senyum", "bahagia", "ceria", "gembira", "bangkit", "rock", "fun", "happy", "tonight",
        "groove", "energy", "fire", "electric", "disko",
    ];
    let chill_kw = [
        "kopi", "senja", "malam", "bintang", "tenang", "damai", "santai", "angin", "sunyi",
        "hujan", "mimpi", "chill", "relax", "peaceful", "night", "coffee", "stars", "calm",
        "quiet", "breeze", "rain", "ocean",
    ];

    let s_sad = sad_kw.iter().filter(|w| lower.contains(**w)).count();
    let s_rom = rom_kw.iter().filter(|w| lower.contains(**w)).count();
    let s_party = party_kw.iter().filter(|w| lower.contains(**w)).count();
    let s_chill = chill_kw.iter().filter(|w| lower.contains(**w)).count();

    let max_s = s_sad.max(s_rom).max(s_party).max(s_chill);
    if max_s >= 2 {
        if max_s == s_sad {
            return ("sad", "Melankolis & Patah Hati".into(), "[MELANKOLIS]".into());
        }
        if max_s == s_rom {
            return ("romance", "Romantis & Kasih Sayang".into(), "[ROMANTIS]".into());
        }
        if max_s == s_party {
            return ("party", "Upbeat & Berenergi".into(), "[UPBEAT]".into());
        }
        if max_s == s_chill {
            return ("chill", "Santai & Syahdu".into(), "[SANTAI]".into());
        }
    }

    if let Some(yr) = year.get(..4).and_then(|y| y.parse::<u32>().ok()) {
        if yr <= 2010 {
            return (
                "nostalgia",
                format!("Nostalgia Klasik ({yr})"),
                format!("[NOSTALGIA {yr}]"),
            );
        }
    }

    ("universal", "Radio Hits Favorit".into(), "[RADIO HITS]".into())
}

fn extract_key_lyric_quote(lyrics: Option<&str>) -> Option<String> {
    let raw = lyrics?;
    let mut cleaned = Vec::new();
    for line in raw.lines() {
        let t = line.trim();
        if t.is_empty()
            || t.starts_with('[')
            || t.starts_with('(')
            || t.starts_with('{')
            || t.ends_with(':')
            || t.ends_with(']')
            || t.len() < 14
            || t.len() > 80
        {
            continue;
        }
        let low = t.to_lowercase();
        if low.contains("writer:")
            || low.contains("lyrics by")
            || low.contains("produced by")
            || low.contains("chorus")
            || low.contains("verse")
        {
            continue;
        }
        cleaned.push(t.to_string());
    }
    if cleaned.is_empty() {
        return None;
    }

    let mut counts: HashMap<String, usize> = HashMap::new();
    for c in &cleaned {
        *counts.entry(c.clone()).or_insert(0) += 1;
    }
    for c in &cleaned {
        if counts.get(c).copied().unwrap_or(0) >= 2 {
            return Some(c.clone());
        }
    }
    cleaned.into_iter().next()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_duration_parsing_and_formatting() {
        assert_eq!(parse_duration_str("04:49"), 289);
        assert_eq!(parse_duration_str("01:02:03"), 3723);
        assert_eq!(format_seconds(289), "04:49");
        assert_eq!(format_seconds(3723), "01:02:03");
    }

    #[test]
    fn test_innertube_responsive_item_parsing_and_cue_sheet() {
        let sample = json!({
            "playlistItemData": { "videoId": "abcXYZ123" },
            "flexColumns": [
                {
                    "musicResponsiveListItemFlexColumnRenderer": {
                        "text": { "runs": [{ "text": "Hati-Hati di Jalan" }] }
                    }
                },
                {
                    "musicResponsiveListItemFlexColumnRenderer": {
                        "text": {
                            "runs": [
                                {
                                    "text": "Tulus",
                                    "navigationEndpoint": {
                                        "browseEndpoint": {
                                            "browseEndpointContextSupportedConfigs": {
                                                "browseEndpointContextMusicConfig": {
                                                    "pageType": "MUSIC_PAGE_TYPE_ARTIST"
                                                }
                                            }
                                        }
                                    }
                                },
                                { "text": " • " },
                                {
                                    "text": "Manusia",
                                    "navigationEndpoint": {
                                        "browseEndpoint": {
                                            "browseEndpointContextSupportedConfigs": {
                                                "browseEndpointContextMusicConfig": {
                                                    "pageType": "MUSIC_PAGE_TYPE_ALBUM"
                                                }
                                            }
                                        }
                                    }
                                },
                                { "text": " • " },
                                { "text": "04:02" }
                            ]
                        }
                    }
                }
            ]
        });

        let track = YtMusicService::parse_responsive_list_item(&sample, "Pop").unwrap();
        assert_eq!(track.video_id, "abcXYZ123");
        assert_eq!(track.title, "Hati-Hati di Jalan");
        assert_eq!(track.artists, vec!["Tulus".to_string()]);
        assert_eq!(track.album.as_deref(), Some("Manusia"));
        assert_eq!(track.duration_seconds, Some(242));

        let tp = YtMusicService::build_talking_points(
            &track.title,
            "Tulus",
            "Manusia",
            "2022",
            "04:02",
            3,
            Some("Ku kira kita akan bersama selamanya\nNamun air mata dan luka menyisakan perih"),
        );
        assert_eq!(tp.vibe_category, "sad");
        assert!(tp.intro_script.contains("Tulus"));
        assert!(tp.broadcaster_tips.iter().any(|t| t.contains("3 kali")));
    }
}
