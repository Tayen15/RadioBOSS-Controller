"""Cue Deck Widget (Center Zone): Track inspector, audio preview, lyrics & on-air cue sheet."""
import re
import urllib.request
from typing import Dict, Any, Optional

from PySide6.QtCore import Qt, Signal, QUrl, QThread
from PySide6.QtGui import QPixmap, QImage, QGuiApplication, QFont, QCursor
from PySide6.QtWidgets import (
    QWidget,
    QVBoxLayout,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QPushButton,
    QComboBox,
    QProgressBar,
    QSlider,
    QTextEdit,
    QFrame,
    QScrollArea,
)
from PySide6.QtMultimedia import QMediaPlayer, QAudioOutput

from native_gui.workers import QueueWorker, CrowdMetadataWorker
from app.services.ytmusic_service import ytmusic_service
from app.services.ytdlp_service import ytdlp_service


class ThumbnailLoaderThread(QThread):
    """Loads track thumbnail in background without freezing UI."""
    loaded = Signal(QPixmap)

    def __init__(self, url: str):
        super().__init__()
        self.url = url

    def run(self):
        try:
            req = urllib.request.Request(self.url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=5) as resp:
                data = resp.read()
                img = QImage.fromData(data)
                if not img.isNull():
                    pix = QPixmap.fromImage(img)
                    self.loaded.emit(pix)
        except Exception:
            pass


class LyricsLoaderThread(QThread):
    """Fetches lyrics & announcer talking points in background."""
    finished = Signal(dict)

    def __init__(self, video_id: str):
        super().__init__()
        self.video_id = video_id

    def run(self):
        try:
            data = ytmusic_service.get_lyrics_and_talking_points(self.video_id)
            self.finished.emit(data or {})
        except Exception:
            self.finished.emit({})


class StreamResolveThread(QThread):
    """Resolves direct stream URL for headphone audio preview."""
    resolved = Signal(str)
    error = Signal(str)

    def __init__(self, video_id: str):
        super().__init__()
        self.video_id = video_id

    def run(self):
        try:
            url, _ = ytdlp_service.get_live_stream_details(self.video_id)
            if url:
                self.resolved.emit(url)
            else:
                self.error.emit("Stream audio tidak dapat diekstrak.")
        except Exception as e:
            self.error.emit(str(e))


class CueDeckWidget(QFrame):
    """
    Cue Deck Zone:
    - Cover Art, Editable Title with Magic Clean, Artist, Album, Year, Genre chips
    - Headphone Audio Preview (QMediaPlayer + QAudioOutput)
    - Action buttons: 'Putar Berikutnya' (pos=-2) and 'Antrean Bawah' (pos=-1)
    - Target playlist tab selector
    - Expandable Announcer Cue Sheet / Lyrics with 1-click script copy
    """
    track_queued = Signal(str, str)   # action_label, title
    status_message = Signal(str)      # message for status bar

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setObjectName("CueModule")
        self.current_track: Dict[str, Any] = {}
        self.available_tabs: list = []
        self._thumb_worker: Optional[ThumbnailLoaderThread] = None
        self._lyrics_worker: Optional[LyricsLoaderThread] = None
        self._stream_worker: Optional[StreamResolveThread] = None
        self._queue_worker: Optional[QueueWorker] = None

        # Setup Audio Preview Player
        self.player = QMediaPlayer(self)
        self.audio_output = QAudioOutput(self)
        self.player.setAudioOutput(self.audio_output)
        self.audio_output.setVolume(0.85)

        self.player.playbackStateChanged.connect(self._on_player_state_changed)
        self.player.positionChanged.connect(self._on_player_position_changed)
        self.player.durationChanged.connect(self._on_player_duration_changed)

        self._init_ui()

    def _init_ui(self):
        main_layout = QVBoxLayout(self)
        main_layout.setContentsMargins(14, 14, 14, 14)
        main_layout.setSpacing(10)

        # Header zone banner
        hdr_box = QHBoxLayout()
        hdr_lbl = QLabel("CUE DECK & AUDISI")
        hdr_lbl.setObjectName("SectionHeader")
        hdr_box.addWidget(hdr_lbl)
        hdr_box.addStretch()

        self.lbl_headphone_state = QLabel("HEADPHONE MONITOR: READY")
        self.lbl_headphone_state.setObjectName("BadgeEmerald")
        hdr_box.addWidget(self.lbl_headphone_state)
        main_layout.addLayout(hdr_box)

        # Scroll area for entire center content
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QFrame.NoFrame)
        scroll.setStyleSheet("background-color: transparent;")

        container = QWidget()
        c_layout = QVBoxLayout(container)
        c_layout.setContentsMargins(0, 0, 4, 0)
        c_layout.setSpacing(12)

        # === 1. TRACK HERO CARD ===
        hero_frame = QFrame()
        hero_frame.setObjectName("InnerPanel")
        h_layout = QHBoxLayout(hero_frame)
        h_layout.setContentsMargins(12, 12, 12, 12)
        h_layout.setSpacing(12)

        # Thumbnail
        self.lbl_thumb = QLabel()
        self.lbl_thumb.setFixedSize(110, 110)
        self.lbl_thumb.setObjectName("InnerPanel")
        self.lbl_thumb.setAlignment(Qt.AlignCenter)
        self.lbl_thumb.setText("NO ART")
        self.lbl_thumb.setStyleSheet("color: #71717A; font-family: 'JetBrains Mono'; font-size: 11px;")
        h_layout.addWidget(self.lbl_thumb)

        # Meta Fields
        meta_box = QVBoxLayout()
        meta_box.setSpacing(6)

        # Title Edit row + Magic Clean Button
        t_row = QHBoxLayout()
        t_row.setSpacing(6)
        self.txt_title = QLineEdit()
        self.txt_title.setPlaceholderText("Pilih lagu dari pencarian...")
        t_row.addWidget(self.txt_title, 1)

        self.btn_clean = QPushButton("Magic Clean")
        self.btn_clean.setObjectName("BtnSecondary")
        self.btn_clean.setToolTip("Bersihkan teks YouTube (Official Video, HD, 4K, dsb)")
        self.btn_clean.clicked.connect(self._magic_clean_title)
        t_row.addWidget(self.btn_clean)
        meta_box.addLayout(t_row)

        # Artist row
        self.txt_artist = QLineEdit()
        self.txt_artist.setPlaceholderText("Nama Artis / Musisi")
        meta_box.addWidget(self.txt_artist)

        # Metadata Chips Row (Album, Year, Duration, Genre)
        chips_row = QHBoxLayout()
        chips_row.setSpacing(6)

        self.lbl_chip_album = QLabel("Album: -")
        self.lbl_chip_album.setObjectName("SubtleText")
        chips_row.addWidget(self.lbl_chip_album)

        self.lbl_chip_year = QLabel("Tahun: -")
        self.lbl_chip_year.setObjectName("SubtleText")
        chips_row.addWidget(self.lbl_chip_year)

        self.lbl_chip_duration = QLabel("Durasi: 00:00")
        self.lbl_chip_duration.setObjectName("MonoClock")
        self.lbl_chip_duration.setStyleSheet("color: #F59E0B; font-weight: 700;")
        chips_row.addWidget(self.lbl_chip_duration)

        chips_row.addStretch()
        meta_box.addLayout(chips_row)

        # CasterHub Global vs Local Intelligence Row
        intel_row = QHBoxLayout()
        intel_row.setSpacing(6)

        self.lbl_global_badge = QLabel("CasterHub: Global Top Track")
        self.lbl_global_badge.setObjectName("BadgeAmber")
        intel_row.addWidget(self.lbl_global_badge)

        self.lbl_local_badge = QLabel("Lokal: 0x Diputar")
        self.lbl_local_badge.setObjectName("BadgeEmerald")
        intel_row.addWidget(self.lbl_local_badge)

        intel_row.addStretch()
        meta_box.addLayout(intel_row)

        # Crowd-Cleaned Metadata Suggestion Button
        self.btn_crowd_suggestion = QPushButton("✨ Saran Judul Komunitas...")
        self.btn_crowd_suggestion.setStyleSheet("""
            QPushButton {
                background-color: rgba(245, 158, 11, 0.12);
                border: 1px solid rgba(245, 158, 11, 0.35);
                border-radius: 4px;
                color: #F59E0B;
                font-size: 11px;
                font-weight: 600;
                padding: 4px 8px;
                text-align: left;
            }
            QPushButton:hover {
                background-color: rgba(245, 158, 11, 0.22);
            }
        """)
        self.btn_crowd_suggestion.setVisible(False)
        self.btn_crowd_suggestion.clicked.connect(self._apply_crowd_suggestion)
        self._suggested_clean_title = ""
        self._suggested_clean_artist = ""
        meta_box.addWidget(self.btn_crowd_suggestion)

        h_layout.addLayout(meta_box, 1)
        c_layout.addWidget(hero_frame)

        # === 2. AUDIO PREVIEW PLAYER (Headphone Cue) ===
        player_frame = QFrame()
        player_frame.setObjectName("InnerPanel")
        p_layout = QVBoxLayout(player_frame)
        p_layout.setContentsMargins(12, 10, 12, 10)
        p_layout.setSpacing(8)

        # Controls & Timecodes
        ctl_row = QHBoxLayout()
        ctl_row.setSpacing(8)

        self.btn_preview_play = QPushButton("Audisi CUE")
        self.btn_preview_play.setObjectName("BtnTransport")
        self.btn_preview_play.setFixedWidth(110)
        self.btn_preview_play.clicked.connect(self._toggle_preview)
        ctl_row.addWidget(self.btn_preview_play)

        self.lbl_preview_time = QLabel("00:00 / 00:00")
        self.lbl_preview_time.setObjectName("MonoClock")
        ctl_row.addWidget(self.lbl_preview_time)

        # Seek slider
        self.slider_seek = QSlider(Qt.Horizontal)
        self.slider_seek.setRange(0, 1000)
        self.slider_seek.setValue(0)
        self.slider_seek.sliderMoved.connect(self._on_seek_moved)
        ctl_row.addWidget(self.slider_seek, 1)

        # Volume slider
        lbl_vol = QLabel("Vol:")
        lbl_vol.setObjectName("SubtleText")
        ctl_row.addWidget(lbl_vol)

        self.slider_vol = QSlider(Qt.Horizontal)
        self.slider_vol.setRange(0, 100)
        self.slider_vol.setValue(85)
        self.slider_vol.setFixedWidth(60)
        self.slider_vol.valueChanged.connect(self._on_vol_changed)
        ctl_row.addWidget(self.slider_vol)

        p_layout.addLayout(ctl_row)
        c_layout.addWidget(player_frame)

        # === 3. TARGET PLAYLIST & DISPATCH ACTIONS ===
        action_frame = QFrame()
        action_frame.setObjectName("InnerPanel")
        a_layout = QVBoxLayout(action_frame)
        a_layout.setContentsMargins(12, 12, 12, 12)
        a_layout.setSpacing(10)

        # Target Tab Selector
        tab_row = QHBoxLayout()
        tab_row.setSpacing(8)
        lbl_tab = QLabel("Target Playlist Tab:")
        lbl_tab.setObjectName("SubtleText")
        tab_row.addWidget(lbl_tab)

        self.cmb_tabs = QComboBox()
        self.cmb_tabs.addItem("Auto / Tab Aktif")
        tab_row.addWidget(self.cmb_tabs, 1)
        a_layout.addLayout(tab_row)

        # Primary Push Buttons
        btn_box = QHBoxLayout()
        btn_box.setSpacing(10)

        # Putar Berikutnya (Priority insert pos=-2)
        self.btn_queue_next = QPushButton("Putar Berikutnya")
        self.btn_queue_next.setFixedHeight(40)
        self.btn_queue_next.setObjectName("BtnPrimary")
        self.btn_queue_next.setCursor(QCursor(Qt.PointingHandCursor))
        self.btn_queue_next.setToolTip("Sisipkan lagu tepat setelah lagu yang sedang mengudara (pos = -2)")
        self.btn_queue_next.clicked.connect(lambda: self._dispatch_queue(pos=-2))
        btn_box.addWidget(self.btn_queue_next, 1)

        # Antrean Bawah (Append pos=-1)
        self.btn_queue_bottom = QPushButton("Antrean Bawah")
        self.btn_queue_bottom.setFixedHeight(40)
        self.btn_queue_bottom.setObjectName("BtnSecondary")
        self.btn_queue_bottom.setCursor(QCursor(Qt.PointingHandCursor))
        self.btn_queue_bottom.setToolTip("Masukkan lagu di urutan paling akhir playlist RadioBOSS (pos = -1)")
        self.btn_queue_bottom.clicked.connect(lambda: self._dispatch_queue(pos=-1))
        btn_box.addWidget(self.btn_queue_bottom, 1)

        a_layout.addLayout(btn_box)

        # Progress indicator during queuing / cache generation
        self.queue_progress = QProgressBar()
        self.queue_progress.setFixedHeight(4)
        self.queue_progress.setTextVisible(False)
        self.queue_progress.setRange(0, 0)
        self.queue_progress.setVisible(False)
        a_layout.addWidget(self.queue_progress)

        c_layout.addWidget(action_frame)

        # === 4. ANNOUNCER CUE SHEET & LYRICS ===
        cue_frame = QFrame()
        cue_frame.setObjectName("InnerPanel")
        cu_layout = QVBoxLayout(cue_frame)
        cu_layout.setContentsMargins(12, 10, 12, 10)
        cu_layout.setSpacing(8)

        cue_top = QHBoxLayout()
        lbl_cue = QLabel("ON-AIR TALKING POINTS & LIRIK")
        lbl_cue.setObjectName("SectionHeader")
        cue_top.addWidget(lbl_cue)
        cue_top.addStretch()

        self.btn_copy_script = QPushButton("Salin Naskah")
        self.btn_copy_script.setObjectName("BtnSecondary")
        self.btn_copy_script.clicked.connect(self._copy_talking_script)
        cue_top.addWidget(self.btn_copy_script)
        cu_layout.addLayout(cue_top)

        # Talking Script Preview Text
        self.txt_script = QTextEdit()
        self.txt_script.setReadOnly(True)
        self.txt_script.setFixedHeight(95)
        self.txt_script.setPlaceholderText("Naskah siaran otomatis bahasa Indonesia akan tampil saat lagu dipilih.")
        cu_layout.addWidget(self.txt_script)

        # Full Lyrics Viewer
        self.txt_lyrics = QTextEdit()
        self.txt_lyrics.setReadOnly(True)
        self.txt_lyrics.setMinimumHeight(130)
        self.txt_lyrics.setPlaceholderText("Lirik lengkap lagu.")
        cu_layout.addWidget(self.txt_lyrics)

        c_layout.addWidget(cue_frame)
        c_layout.addStretch()

        scroll.setWidget(container)
        main_layout.addWidget(scroll, 1)

    def set_track(self, track: Dict[str, Any]):
        """Load selected song into Cue Deck."""
        self.current_track = track
        title = track.get("title", "")
        artists = track.get("artists", [])
        artist_str = ", ".join(artists) if isinstance(artists, list) else str(artists or "")

        self.txt_title.setText(title)
        self.txt_artist.setText(artist_str)
        self.lbl_chip_album.setText(f"Album: {track.get('album') or '-'}")
        self.lbl_chip_year.setText(f"Tahun: {track.get('year') or '-'}")
        self.lbl_chip_duration.setText(f"Durasi: {track.get('duration_formatted') or track.get('duration') or '00:00'}")

        # Update CasterHub Intelligence Badges
        rank_val = track.get("rank")
        unique_stn = track.get("unique_stations")
        if rank_val:
            self.lbl_global_badge.setText(f"CasterHub Global #{rank_val:02d} ({unique_stn or 1} Stasiun)")
            self.lbl_global_badge.setVisible(True)
        else:
            self.lbl_global_badge.setVisible(False)

        # Check local play count
        clean_id = (track.get("video_id") or "").replace(".mp3", "").strip()
        local_plays = 0
        try:
            from app.services.db_service import db_service
            with db_service.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT play_count FROM cached_tracks WHERE video_id = ?;", (clean_id,))
                row = cursor.fetchone()
                if row:
                    local_plays = row["play_count"] or 0
        except Exception:
            pass
        self.lbl_local_badge.setText(f"Lokal: {local_plays}x Diputar")

        # Reset and query crowd-cleaned metadata suggestion
        self.btn_crowd_suggestion.setVisible(False)
        self._suggested_clean_title = ""
        self._suggested_clean_artist = ""
        if clean_id:
            self._crowd_meta_worker = CrowdMetadataWorker(clean_id, title, artist_str)
            self._crowd_meta_worker.result.connect(self._on_crowd_meta_result)
            self._crowd_meta_worker.start()

        # Stop active preview
        self.player.stop()
        self.btn_preview_play.setText("Audisi CUE")
        self.slider_seek.setValue(0)
        self.lbl_preview_time.setText(f"00:00 / {track.get('duration') or '00:00'}")

        # Load Thumbnail
        thumb_url = track.get("thumbnail_url")
        if thumb_url:
            self._thumb_worker = ThumbnailLoaderThread(thumb_url)
            self._thumb_worker.loaded.connect(self._on_thumbnail_loaded)
            self._thumb_worker.start()
        else:
            self.lbl_thumb.setText("NO ART")

        # Load Lyrics & Talking Points
        video_id = track.get("video_id")
        if video_id:
            self.txt_script.setText("Mengambil naskah siar & lirik...")
            self.txt_lyrics.setText("")
            self._lyrics_worker = LyricsLoaderThread(video_id)
            self._lyrics_worker.finished.connect(self._on_lyrics_loaded)
            self._lyrics_worker.start()

    def update_tabs(self, tabs: list, active_tab: str):
        """Update playlist tabs dropdown from RadioBOSS."""
        self.available_tabs = tabs
        current_selection = self.cmb_tabs.currentText()
        self.cmb_tabs.clear()
        self.cmb_tabs.addItem("Auto / Tab Aktif")
        for t in tabs:
            self.cmb_tabs.addItem(t)

        idx = self.cmb_tabs.findText(current_selection)
        if idx >= 0:
            self.cmb_tabs.setCurrentIndex(idx)

    def _on_crowd_meta_result(self, data: dict):
        """Handle crowd metadata response from CasterHub."""
        if not data:
            return
        clean_title = (data.get("clean_title") or "").strip()
        clean_artist = (data.get("clean_artist") or "").strip()
        curr_title = self.txt_title.text().strip()

        # If suggestion is cleaner/different than current title
        if clean_title and clean_title.lower() != curr_title.lower():
            self._suggested_clean_title = clean_title
            self._suggested_clean_artist = clean_artist
            votes = data.get("votes_count", 0)
            votes_badge = f" ({votes} stasiun)" if votes > 1 else ""
            self.btn_crowd_suggestion.setText(f"✨ Saran Komunitas: \"{clean_title}\"{votes_badge} (Klik Terapkan)")
            self.btn_crowd_suggestion.setVisible(True)

    def _apply_crowd_suggestion(self):
        """Apply crowd-cleaned metadata suggestion to inputs."""
        if self._suggested_clean_title:
            self.txt_title.setText(self._suggested_clean_title)
            if self._suggested_clean_artist:
                self.txt_artist.setText(self._suggested_clean_artist)
            self.btn_crowd_suggestion.setVisible(False)
            self.status_message.emit(f"Judul komunitas diterapkan: {self._suggested_clean_title}")

    def _magic_clean_title(self):
        """Clean noise tags from track title."""
        raw = self.txt_title.text()
        clean = re.sub(
            r"(?i)\s*[\(\[].*?(official|video|clip|lirik|lyrics|hd|4k|audio|remastered|visualizer).*?[\)\]]",
            "",
            raw,
        ).strip()
        self.txt_title.setText(clean)

    def _on_thumbnail_loaded(self, pix: QPixmap):
        """Scale and render loaded thumbnail."""
        scaled = pix.scaled(110, 110, Qt.KeepAspectRatioByExpanding, Qt.SmoothTransformation)
        self.lbl_thumb.setPixmap(scaled)

    def _on_lyrics_loaded(self, data: dict):
        """Display talking script and lyrics."""
        intro_script = data.get("talking_points", {}).get("intro_script", "") if isinstance(data.get("talking_points"), dict) else data.get("intro_script", "")
        lyrics = data.get("lyrics", "")
        self.txt_script.setText(intro_script if intro_script else "Tidak ada naskah siar khusus.")
        self.txt_lyrics.setText(lyrics if lyrics else "Lirik tidak ditemukan di YouTube Music.")

    def _copy_talking_script(self):
        """Copy announcer script to clipboard."""
        text = self.txt_script.toPlainText()
        if text:
            clipboard = QGuiApplication.clipboard()
            clipboard.setText(text)
            self.status_message.emit("Naskah siaran berhasil disalin ke clipboard.")

    def _toggle_preview(self):
        """Play or pause headphone audio preview."""
        if not self.current_track:
            return

        if self.player.playbackState() == QMediaPlayer.PlayingState:
            self.player.pause()
            self.btn_preview_play.setText("Audisi CUE")
            self.lbl_headphone_state.setText("HEADPHONE MONITOR: PAUSED")
            return

        if self.player.playbackState() == QMediaPlayer.PausedState:
            self.player.play()
            self.btn_preview_play.setText("Jeda CUE")
            self.lbl_headphone_state.setText("HEADPHONE MONITOR: AUDISI")
            return

        video_id = self.current_track.get("video_id")
        if not video_id:
            return

        self.lbl_headphone_state.setText("HEADPHONE MONITOR: RESOLVING")
        self._stream_worker = StreamResolveThread(video_id)
        self._stream_worker.resolved.connect(self._on_stream_resolved)
        self._stream_worker.error.connect(self._on_stream_error)
        self._stream_worker.start()

    def _on_stream_resolved(self, url: str):
        self.player.setSource(QUrl(url))
        self.player.play()
        self.btn_preview_play.setText("Jeda CUE")
        self.lbl_headphone_state.setText("HEADPHONE MONITOR: AUDISI")

    def _on_stream_error(self, err: str):
        self.lbl_headphone_state.setText("HEADPHONE MONITOR: ERROR")
        self.status_message.emit(f"Error preview: {err}")

    def _on_player_state_changed(self, state):
        if state == QMediaPlayer.StoppedState:
            self.btn_preview_play.setText("Audisi CUE")
            self.lbl_headphone_state.setText("HEADPHONE MONITOR: READY")

    def _on_player_position_changed(self, pos: int):
        dur = self.player.duration()
        if dur > 0 and not self.slider_seek.isSliderDown():
            self.slider_seek.setValue(int(pos * 1000 / dur))

        pos_sec = pos // 1000
        dur_sec = dur // 1000
        self.lbl_preview_time.setText(
            f"{pos_sec // 60:02d}:{pos_sec % 60:02d} / {dur_sec // 60:02d}:{dur_sec % 60:02d}"
        )

    def _on_player_duration_changed(self, dur: int):
        dur_sec = dur // 1000
        self.lbl_preview_time.setText(f"00:00 / {dur_sec // 60:02d}:{dur_sec % 60:02d}")

    def _on_seek_moved(self, val: int):
        dur = self.player.duration()
        if dur > 0:
            target_ms = int(val * dur / 1000)
            self.player.setPosition(target_ms)

    def _on_vol_changed(self, val: int):
        self.audio_output.setVolume(val / 100.0)

    def _dispatch_queue(self, pos: int):
        if not self.current_track:
            self.status_message.emit("Pilih lagu terlebih dahulu sebelum menambahkan ke antrean.")
            return

        video_id = self.current_track.get("video_id")
        title = self.txt_title.text().strip()
        artist = self.txt_artist.text().strip()
        album = self.current_track.get("album", "")
        thumb = self.current_track.get("thumbnail_url", "")
        year = self.current_track.get("year", "")
        genre = self.current_track.get("genre", "")

        sel_tab = self.cmb_tabs.currentText()
        target_tab = "" if "Auto" in sel_tab else sel_tab

        self.btn_queue_next.setEnabled(False)
        self.btn_queue_bottom.setEnabled(False)
        self.queue_progress.setVisible(True)

        self._queue_worker = QueueWorker(
            video_id=video_id,
            song_title=title,
            artist=artist,
            album=album,
            thumbnail_url=thumb,
            pos=pos,
            target_tab=target_tab,
            year=year,
            genre=genre,
        )
        self._queue_worker.started_task.connect(lambda msg: self.status_message.emit(msg))
        self._queue_worker.success.connect(self._on_queue_success)
        self._queue_worker.error.connect(self._on_queue_error)
        self._queue_worker.start()

    def _on_queue_success(self, action_label: str, title: str):
        self.btn_queue_next.setEnabled(True)
        self.btn_queue_bottom.setEnabled(True)
        self.queue_progress.setVisible(False)
        self.status_message.emit(f"Berhasil: '{title}' dimasukkan ke ({action_label})")
        self.track_queued.emit(action_label, title)

    def _on_queue_error(self, err: str):
        self.btn_queue_next.setEnabled(True)
        self.btn_queue_bottom.setEnabled(True)
        self.queue_progress.setVisible(False)
        self.status_message.emit(f"Gagal mengirim ke RadioBOSS: {err}")
