"""Monitor Widget (Right Zone): RadioBOSS On-Air display, transport controls, tabs & live queue."""
import logging
from typing import List, Dict, Any, Optional

from PySide6.QtCore import Qt, Signal
from PySide6.QtGui import QColor, QFont
from PySide6.QtWidgets import (
    QWidget,
    QVBoxLayout,
    QHBoxLayout,
    QLabel,
    QPushButton,
    QProgressBar,
    QTableWidget,
    QTableWidgetItem,
    QHeaderView,
    QFrame,
    QTabWidget,
    QAbstractItemView,
)

from native_gui.workers import TransportWorker

logger = logging.getLogger(__name__)


class MonitorWidget(QFrame):
    """
    Right Zone:
    - Station identity & connection indicator badge
    - Studio On-Air LCD Display (Title, remaining time, progress bar)
    - Transport Control Rack (Play, Pause, Skip, Stop)
    - Tab Selector Bar (RadioBOSS playlist tabs)
    - Live Playlist Queue Table with Dead-Air alert banner
    - Dispatch Log Tab
    """
    tab_switched = Signal(str)
    transport_triggered = Signal(str)
    status_message = Signal(str)

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setObjectName("MonitorModule")
        self.available_tabs: List[str] = []
        self.active_tab: str = ""
        self._transport_worker: Optional[TransportWorker] = None

        self._init_ui()

    def _init_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(14, 14, 14, 14)
        layout.setSpacing(10)

        # === 1. STATION BRANDING & CONNECTION BADGE ===
        top_bar = QHBoxLayout()
        top_bar.setSpacing(8)

        self.lbl_station_name = QLabel("MONITOR SIARAN LIVE")
        self.lbl_station_name.setObjectName("SectionHeader")
        top_bar.addWidget(self.lbl_station_name)
        top_bar.addStretch()

        self.lbl_conn_status = QLabel("TERHUBUNG")
        self.lbl_conn_status.setObjectName("BadgeEmerald")
        top_bar.addWidget(self.lbl_conn_status)
        layout.addLayout(top_bar)

        # === 2. ON-AIR STUDIO LCD MONITOR ===
        self.lcd_frame = QFrame()
        self.lcd_frame.setObjectName("InnerPanel")
        lcd_layout = QVBoxLayout(self.lcd_frame)
        lcd_layout.setContentsMargins(12, 10, 12, 10)
        lcd_layout.setSpacing(6)

        lcd_header = QHBoxLayout()
        lbl_air = QLabel("ON-AIR")
        lbl_air.setObjectName("BadgeRed")
        lcd_header.addWidget(lbl_air)
        lcd_header.addStretch()

        self.lbl_playback_state = QLabel("STANDBY")
        self.lbl_playback_state.setObjectName("BadgeAmber")
        lcd_header.addWidget(self.lbl_playback_state)
        lcd_layout.addLayout(lcd_header)

        # Current On-Air Song Title
        self.lbl_current_title = QLabel("Menunggu status RadioBOSS...")
        self.lbl_current_title.setObjectName("NowPlayingTitle")
        self.lbl_current_title.setWordWrap(True)
        lcd_layout.addWidget(self.lbl_current_title)

        # Progress bar
        self.prog_track = QProgressBar()
        self.prog_track.setFixedHeight(6)
        self.prog_track.setTextVisible(False)
        self.prog_track.setRange(0, 100)
        self.prog_track.setValue(0)
        lcd_layout.addWidget(self.prog_track)

        # Timecode & Remaining
        time_row = QHBoxLayout()
        self.lbl_time_pos = QLabel("00:00")
        self.lbl_time_pos.setObjectName("MonoClock")
        self.lbl_time_pos.setFont(QFont("JetBrains Mono", 11, QFont.Bold))
        time_row.addWidget(self.lbl_time_pos)

        time_row.addStretch()

        self.lbl_time_remain = QLabel("-00:00")
        self.lbl_time_remain.setObjectName("MonoClock")
        self.lbl_time_remain.setStyleSheet("color: #A1A1AA;")
        time_row.addWidget(self.lbl_time_remain)
        lcd_layout.addLayout(time_row)

        layout.addWidget(self.lcd_frame)

        # === 3. TRANSPORT CONTROL RACK ===
        tp_box = QHBoxLayout()
        tp_box.setSpacing(6)

        self.btn_tp_play = QPushButton("PLAY")
        self.btn_tp_play.setObjectName("BtnTransport")
        self.btn_tp_play.setFixedHeight(34)
        self.btn_tp_play.clicked.connect(lambda: self._send_transport("play"))
        tp_box.addWidget(self.btn_tp_play, 1)

        self.btn_tp_pause = QPushButton("PAUSE")
        self.btn_tp_pause.setObjectName("BtnTransport")
        self.btn_tp_pause.setFixedHeight(34)
        self.btn_tp_pause.clicked.connect(lambda: self._send_transport("pause"))
        tp_box.addWidget(self.btn_tp_pause, 1)

        self.btn_tp_skip = QPushButton("NEXT")
        self.btn_tp_skip.setObjectName("BtnTransport")
        self.btn_tp_skip.setFixedHeight(34)
        self.btn_tp_skip.clicked.connect(lambda: self._send_transport("next"))
        tp_box.addWidget(self.btn_tp_skip, 1)

        self.btn_tp_stop = QPushButton("STOP")
        self.btn_tp_stop.setObjectName("BtnTransportStop")
        self.btn_tp_stop.setFixedHeight(34)
        self.btn_tp_stop.clicked.connect(lambda: self._send_transport("stop"))
        tp_box.addWidget(self.btn_tp_stop, 1)

        layout.addLayout(tp_box)

        # === 4. DEAD-AIR ALERT GUARD BANNER ===
        self.dead_air_banner = QFrame()
        self.dead_air_banner.setObjectName("InnerPanel")
        self.dead_air_banner.setStyleSheet("border-color: rgba(248, 113, 113, 0.4); background-color: rgba(248, 113, 113, 0.1);")
        da_layout = QHBoxLayout(self.dead_air_banner)
        da_layout.setContentsMargins(8, 6, 8, 6)
        lbl_da_icon = QLabel("PERINGATAN DEAD-AIR:")
        lbl_da_icon.setObjectName("BadgeRed")
        da_layout.addWidget(lbl_da_icon)

        self.lbl_da_text = QLabel("Antrean playlist tersisa 0 lagu.")
        self.lbl_da_text.setObjectName("SubtleText")
        self.lbl_da_text.setStyleSheet("color: #FCA5A5; font-weight: 600;")
        da_layout.addWidget(self.lbl_da_text, 1)
        self.dead_air_banner.setVisible(False)
        layout.addWidget(self.dead_air_banner)

        # === 5. TABBED MONITOR: UPCOMING QUEUE & DISPATCH LOG ===
        self.monitor_tabs = QTabWidget()

        # Tab 1: Live Playlist Queue
        queue_tab_widget = QWidget()
        q_tab_layout = QVBoxLayout(queue_tab_widget)
        q_tab_layout.setContentsMargins(4, 4, 4, 4)
        q_tab_layout.setSpacing(6)

        # Tabs bar info
        self.tabs_bar = QHBoxLayout()
        self.lbl_active_tab_info = QLabel("Tab Aktif: Utama")
        self.lbl_active_tab_info.setObjectName("SubtleText")
        self.lbl_active_tab_info.setStyleSheet("color: #F59E0B; font-weight: 600;")
        self.tabs_bar.addWidget(self.lbl_active_tab_info)
        self.tabs_bar.addStretch()
        q_tab_layout.addLayout(self.tabs_bar)

        # Table of upcoming songs
        self.tbl_queue = QTableWidget()
        self.tbl_queue.setColumnCount(3)
        self.tbl_queue.setHorizontalHeaderLabels(["#", "Judul Track", "Durasi"])
        self.tbl_queue.horizontalHeader().setSectionResizeMode(0, QHeaderView.Fixed)
        self.tbl_queue.horizontalHeader().setSectionResizeMode(1, QHeaderView.Stretch)
        self.tbl_queue.horizontalHeader().setSectionResizeMode(2, QHeaderView.Fixed)
        self.tbl_queue.setColumnWidth(0, 32)
        self.tbl_queue.setColumnWidth(2, 60)
        self.tbl_queue.verticalHeader().setVisible(False)
        self.tbl_queue.setSelectionBehavior(QAbstractItemView.SelectRows)
        self.tbl_queue.setEditTriggers(QAbstractItemView.NoEditTriggers)
        self.tbl_queue.setShowGrid(False)
        q_tab_layout.addWidget(self.tbl_queue)
        self.monitor_tabs.addTab(queue_tab_widget, "Antrean RadioBOSS")

        # Tab 2: Dispatch Log
        log_tab_widget = QWidget()
        l_tab_layout = QVBoxLayout(log_tab_widget)
        l_tab_layout.setContentsMargins(4, 4, 4, 4)

        self.tbl_log = QTableWidget()
        self.tbl_log.setColumnCount(3)
        self.tbl_log.setHorizontalHeaderLabels(["Jam", "Aksi", "Lagu"])
        self.tbl_log.horizontalHeader().setSectionResizeMode(0, QHeaderView.Fixed)
        self.tbl_log.horizontalHeader().setSectionResizeMode(1, QHeaderView.ResizeToContents)
        self.tbl_log.horizontalHeader().setSectionResizeMode(2, QHeaderView.Stretch)
        self.tbl_log.setColumnWidth(0, 60)
        self.tbl_log.verticalHeader().setVisible(False)
        self.tbl_log.setSelectionBehavior(QAbstractItemView.SelectRows)
        self.tbl_log.setEditTriggers(QAbstractItemView.NoEditTriggers)
        self.tbl_log.setShowGrid(False)
        l_tab_layout.addWidget(self.tbl_log)
        self.monitor_tabs.addTab(log_tab_widget, "Log Pengiriman")

        layout.addWidget(self.monitor_tabs, 1)

    def update_radioboss_status(self, status):
        """Update live status from RadioBOSSStatusResponse object."""
        if not status or not getattr(status, "connected", False):
            self.lbl_conn_status.setText("TERPUTUS")
            self.lbl_conn_status.setObjectName("BadgeRed")
            self.lbl_playback_state.setText("DISCONNECTED")
            self.lbl_playback_state.setObjectName("BadgeRed")
            return

        self.lbl_conn_status.setText("TERHUBUNG")
        self.lbl_conn_status.setObjectName("BadgeEmerald")

        np = getattr(status, "now_playing", None)
        if np:
            title = getattr(np, "title", "Tidak Ada Siaran") or "Tidak Ada Siaran"
            self.lbl_current_title.setText(title)

            state = (getattr(np, "status", "stop") or "stop").upper()
            self.lbl_playback_state.setText(state)
            if state in ("PLAY", "PLAYING"):
                self.lbl_playback_state.setObjectName("BadgeEmerald")
            elif state in ("PAUSE", "PAUSED"):
                self.lbl_playback_state.setObjectName("BadgeAmber")
            else:
                self.lbl_playback_state.setObjectName("BadgeRed")

            pos_ms = getattr(np, "playback_position_ms", 0) or 0
            dur_ms = getattr(np, "duration_ms", 0) or 0

            pos_sec = pos_ms // 1000
            dur_sec = dur_ms // 1000
            rem_sec = max(0, dur_sec - pos_sec)

            self.lbl_time_pos.setText(f"{pos_sec // 60:02d}:{pos_sec % 60:02d}")
            self.lbl_time_remain.setText(f"-{rem_sec // 60:02d}:{rem_sec % 60:02d}")

            if dur_ms > 0:
                pct = int(min(100, max(0, (pos_ms / dur_ms) * 100)))
                self.prog_track.setValue(pct)
            else:
                self.prog_track.setValue(0)

    def update_playlist_queue(self, tracks: List[Any], message: str = ""):
        """Render upcoming tracks in RadioBOSS playlist table."""
        self.tbl_queue.setRowCount(0)
        count = len(tracks)

        if count == 0:
            self.dead_air_banner.setVisible(True)
            self.lbl_da_text.setText("Antrean RadioBOSS kosong. Radio akan hening jika lagu selesai.")
        elif count <= 2:
            self.dead_air_banner.setVisible(True)
            self.lbl_da_text.setText(f"Tersisa {count} lagu dalam antrean.")
        else:
            self.dead_air_banner.setVisible(False)

        for i, tr in enumerate(tracks):
            row = self.tbl_queue.rowCount()
            self.tbl_queue.insertRow(row)

            if hasattr(tr, "title"):
                title = tr.title
                duration = getattr(tr, "duration", "00:00")
            elif isinstance(tr, dict):
                title = tr.get("title", "")
                duration = tr.get("duration", "00:00")
            else:
                title = str(tr)
                duration = "00:00"

            item_idx = QTableWidgetItem(f"{i + 1:02d}")
            item_idx.setTextAlignment(Qt.AlignCenter)
            item_idx.setForeground(QColor("#71717A"))
            item_idx.setFont(QFont("JetBrains Mono", 9))
            self.tbl_queue.setItem(row, 0, item_idx)

            item_title = QTableWidgetItem(title)
            item_title.setForeground(QColor("#FAFAFA"))
            self.tbl_queue.setItem(row, 1, item_title)

            item_dur = QTableWidgetItem(str(duration))
            item_dur.setTextAlignment(Qt.AlignRight | Qt.AlignVCenter)
            item_dur.setForeground(QColor("#A1A1AA"))
            item_dur.setFont(QFont("JetBrains Mono", 9))
            self.tbl_queue.setItem(row, 2, item_dur)

    def update_tabs_info(self, available_tabs: list, active_tab: str, active_idx: int, is_synced: bool):
        self.available_tabs = available_tabs
        self.active_tab = active_tab
        display_tab = active_tab if active_tab else "Utama"
        self.lbl_active_tab_info.setText(f"Tab Aktif: {display_tab} {'(Tersinkron)' if is_synced else ''}")

    def append_dispatch_log(self, action_label: str, title: str):
        import datetime
        now_str = datetime.datetime.now().strftime("%H:%M:%S")

        row = 0
        self.tbl_log.insertRow(row)

        item_time = QTableWidgetItem(now_str)
        item_time.setForeground(QColor("#71717A"))
        item_time.setFont(QFont("JetBrains Mono", 9))
        self.tbl_log.setItem(row, 0, item_time)

        item_act = QTableWidgetItem(action_label)
        if "Berikutnya" in action_label:
            item_act.setForeground(QColor("#F59E0B"))
        else:
            item_act.setForeground(QColor("#34D399"))
        item_act.setFont(QFont("Plus Jakarta Sans", 9, QFont.Bold))
        self.tbl_log.setItem(row, 1, item_act)

        item_title = QTableWidgetItem(title)
        item_title.setForeground(QColor("#FAFAFA"))
        self.tbl_log.setItem(row, 2, item_title)

    def _send_transport(self, action: str):
        self._transport_worker = TransportWorker(action)
        self._transport_worker.finished.connect(
            lambda ok, msg: self.status_message.emit(
                f"Perintah {action.upper()}: {'Berhasil' if ok else f'Gagal ({msg})'}"
            )
        )
        self._transport_worker.start()
        self.transport_triggered.emit(action)
