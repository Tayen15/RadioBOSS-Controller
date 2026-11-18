use std::io::Cursor;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Instant;

use rodio::{Decoder, DeviceSinkBuilder, MixerDeviceSink, Player, Source};

#[derive(Clone)]
struct SharedBytes(Arc<Vec<u8>>);

impl AsRef<[u8]> for SharedBytes {
    fn as_ref(&self) -> &[u8] {
        &self.0
    }
}

#[derive(Debug, Clone, Default)]
pub struct AudioPreviewState {
    pub active_video_id: Option<String>,
    pub active_title: String,
    pub is_playing: bool,
    pub is_loading: bool,
    pub volume: f32,
    pub elapsed_secs: f32,
    pub total_secs: f32,
    pub error: Option<String>,
}

/// Native WASAPI/ALSA Headphone Audio Preview player powered by `rodio` + `symphonia`.
#[derive(Clone)]
pub struct AudioPlayerService {
    inner: Arc<Mutex<AudioInner>>,
}

struct AudioInner {
    _sink_handle: Option<MixerDeviceSink>,
    player: Option<Player>,
    active_bytes: Option<Arc<Vec<u8>>>,
    state: AudioPreviewState,
    started_at: Option<Instant>,
    paused_offset: f32,
}

unsafe impl Send for AudioInner {}

impl Default for AudioPlayerService {
    fn default() -> Self {
        Self::new()
    }
}

impl AudioPlayerService {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(AudioInner {
                _sink_handle: None,
                player: None,
                active_bytes: None,
                state: AudioPreviewState {
                    volume: 0.85,
                    ..Default::default()
                },
                started_at: None,
                paused_offset: 0.0,
            })),
        }
    }

    pub fn get_state(&self) -> AudioPreviewState {
        let mut guard = self.inner.lock().unwrap();
        if let Some(ref player) = guard.player {
            if player.empty() && guard.state.is_playing {
                guard.state.is_playing = false;
                guard.paused_offset = 0.0;
                guard.started_at = None;
            }
        }
        if guard.state.is_playing {
            if let Some(start) = guard.started_at {
                guard.state.elapsed_secs = guard.paused_offset + start.elapsed().as_secs_f32();
            }
        } else {
            guard.state.elapsed_secs = guard.paused_offset;
        }
        guard.state.clone()
    }

    pub fn set_loading(&self, video_id: &str, title: &str) {
        let mut guard = self.inner.lock().unwrap();
        if let Some(player) = guard.player.take() {
            player.stop();
        }
        guard.state.active_video_id = Some(video_id.to_string());
        guard.state.active_title = title.to_string();
        guard.active_bytes = None;
        guard.state.is_loading = true;
        guard.state.is_playing = false;
        guard.state.error = None;
        guard.paused_offset = 0.0;
        guard.started_at = None;
    }

    pub fn set_error(&self, err: String) {
        let mut guard = self.inner.lock().unwrap();
        guard.state.is_loading = false;
        guard.state.is_playing = false;
        guard.state.error = Some(err);
    }

    pub fn play_bytes(&self, video_id: &str, title: &str, bytes: Vec<u8>, fallback_dur: f32) {
        let mut guard = self.inner.lock().unwrap();
        if guard.state.active_video_id.as_deref() != Some(video_id) {
            return;
        }

        if let Some(player) = guard.player.take() {
            player.stop();
        }

        let sink_handle = match DeviceSinkBuilder::open_default_sink() {
            Ok(s) => s,
            Err(e) => {
                guard.state.is_loading = false;
                guard.state.error = Some(format!("Audio device error: {e}"));
                return;
            }
        };

        let player = Player::connect_new(sink_handle.mixer());
        player.set_volume(guard.state.volume);

        let estimated_mp3_dur = estimate_mp3_duration_secs(&bytes);
        let shared_bytes = Arc::new(bytes);

        match Decoder::new(Cursor::new(SharedBytes(Arc::clone(&shared_bytes)))) {
            Ok(source) => {
                let dur = source
                    .total_duration()
                    .map(|d| d.as_secs_f32())
                    .filter(|&s| s > 1.0)
                    .or(if fallback_dur > 1.0 {
                        Some(fallback_dur)
                    } else {
                        None
                    })
                    .or(estimated_mp3_dur)
                    .unwrap_or(0.0);
                player.append(source);
                guard._sink_handle = Some(sink_handle);
                guard.player = Some(player);
                guard.active_bytes = Some(shared_bytes);
                guard.state.active_title = title.to_string();
                guard.state.is_loading = false;
                guard.state.is_playing = true;
                guard.state.total_secs = dur;
                guard.paused_offset = 0.0;
                guard.started_at = Some(Instant::now());
            }
            Err(e) => {
                guard.state.is_loading = false;
                guard.state.error = Some(format!("Gagal mendekode audio: {e}"));
            }
        }
    }

    pub fn play_file(&self, video_id: &str, title: &str, path: PathBuf, fallback_dur: f32) {
        match std::fs::read(&path) {
            Ok(bytes) => self.play_bytes(video_id, title, bytes, fallback_dur),
            Err(e) => self.set_error(format!("Gagal membaca file cache: {e}")),
        }
    }

    pub fn toggle_pause(&self) {
        let mut guard = self.inner.lock().unwrap();
        let is_playing = guard.state.is_playing;
        let start_elapsed = guard
            .started_at
            .map(|s| s.elapsed().as_secs_f32())
            .unwrap_or(0.0);
        if let Some(ref player) = guard.player {
            if is_playing {
                player.pause();
                guard.paused_offset += start_elapsed;
                guard.started_at = None;
                guard.state.is_playing = false;
            } else {
                player.play();
                guard.started_at = Some(Instant::now());
                guard.state.is_playing = true;
            }
        }
    }

    pub fn stop(&self) {
        let mut guard = self.inner.lock().unwrap();
        if let Some(player) = guard.player.take() {
            player.stop();
        }
        guard._sink_handle = None;
        guard.active_bytes = None;
        guard.state.is_playing = false;
        guard.state.is_loading = false;
        guard.state.active_video_id = None;
        guard.paused_offset = 0.0;
        guard.started_at = None;
    }

    pub fn set_volume(&self, vol: f32) {
        let clamped = vol.clamp(0.0, 1.0);
        let mut guard = self.inner.lock().unwrap();
        guard.state.volume = clamped;
        if let Some(ref player) = guard.player {
            player.set_volume(clamped);
        }
    }

    /// Seeks the active preview track forward or backward to `target_secs`.
    pub fn seek(&self, target_secs: f32) {
        let mut guard = self.inner.lock().unwrap();
        let max_dur = guard.state.total_secs.max(0.0);
        let clamped = target_secs.clamp(0.0, max_dur);
        let is_playing = guard.state.is_playing;
        let target_dur = std::time::Duration::from_secs_f32(clamped);

        let fast_seek_ok = guard
            .player
            .as_ref()
            .map(|p| p.try_seek(target_dur).is_ok())
            .unwrap_or(false);

        if fast_seek_ok {
            guard.paused_offset = clamped;
            guard.state.elapsed_secs = clamped;
            if is_playing {
                guard.started_at = Some(Instant::now());
            }
            return;
        }

        // Fallback for streams without a seek index (e.g. backward seek on piped MP3):
        // recreate decoder from in-memory bytes and skip_duration to `clamped`.
        let Some(bytes_arc) = guard.active_bytes.clone() else {
            return;
        };
        if let Some(old_player) = guard.player.take() {
            old_player.stop();
        }
        let Some(ref sink_handle) = guard._sink_handle else {
            return;
        };
        let new_player = Player::connect_new(sink_handle.mixer());
        new_player.set_volume(guard.state.volume);
        if let Ok(source) = Decoder::new(Cursor::new(SharedBytes(bytes_arc))) {
            new_player.append(source.skip_duration(target_dur));
            if !is_playing {
                new_player.pause();
            }
            guard.player = Some(new_player);
            guard.paused_offset = clamped;
            guard.state.elapsed_secs = clamped;
            guard.started_at = if is_playing {
                Some(Instant::now())
            } else {
                None
            };
        }
    }
}

/// Estimates CBR MP3 duration from audio payload size and the first MPEG-1 Layer III frame bitrate.
fn estimate_mp3_duration_secs(bytes: &[u8]) -> Option<f32> {
    if bytes.len() < 16 {
        return None;
    }
    let mut offset = 0usize;
    if bytes.starts_with(b"ID3") && bytes.len() >= 10 {
        let sz = ((bytes[6] as usize & 0x7F) << 21)
            | ((bytes[7] as usize & 0x7F) << 14)
            | ((bytes[8] as usize & 0x7F) << 7)
            | (bytes[9] as usize & 0x7F);
        offset = (10 + sz).min(bytes.len());
    }

    const BITRATES_KBPS: [u32; 16] = [
        0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0,
    ];
    let scan_end = (offset + 8192).min(bytes.len().saturating_sub(4));
    for i in offset..scan_end {
        if bytes[i] == 0xFF
            && (bytes[i + 1] & 0xE0) == 0xE0
            && (bytes[i + 1] & 0x18) == 0x18
            && (bytes[i + 1] & 0x06) == 0x02
        {
            let br_idx = ((bytes[i + 2] >> 4) & 0x0F) as usize;
            let kbps = BITRATES_KBPS[br_idx];
            if kbps > 0 {
                let audio_bytes = bytes.len().saturating_sub(offset) as f32;
                return Some((audio_bytes * 8.0) / (kbps as f32 * 1000.0));
            }
        }
    }
    None
}
