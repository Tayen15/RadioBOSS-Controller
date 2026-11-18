use std::io::Cursor;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Instant;

use rodio::{Decoder, DeviceSinkBuilder, MixerDeviceSink, Player, Source};

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
    state: AudioPreviewState,
    started_at: Option<Instant>,
    paused_offset: f32,
}

unsafe impl Send for AudioInner {}

impl AudioPlayerService {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(AudioInner {
                _sink_handle: None,
                player: None,
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

        match Decoder::new(Cursor::new(bytes)) {
            Ok(source) => {
                let dur = source
                    .total_duration()
                    .map(|d| d.as_secs_f32())
                    .unwrap_or(fallback_dur);
                player.append(source);
                guard._sink_handle = Some(sink_handle);
                guard.player = Some(player);
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
}
