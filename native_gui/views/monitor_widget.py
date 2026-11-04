"""Monitor Widget (Right Zone): RadioBOSS On-Air display, transport controls, tabs & live queue."""
import logging
from typing import List, Dict, Any, Optional

from PySide6.QtCore import Qt, Signal, QTimer
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
from app.services.history_service import history_service
from app.services.radioboss_service import PlaylistItem

logger = logging.getLogger(__name__)


class MonitorWidget(QWidget):
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
        self.available_tabs: List[str] = []
        self.active_tab: str = ""
        self._transport_worker: Optional[TransportWorker] = None

        self._init_ui()

    def _init_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(12, 12, 12, 12)
        layout.setSpacing(12)

        # === 1. STATION BRANDING & CONNECTION BADGE ===
        top_bar = QHBoxLayout()
        top_bar.setSpacing(8)

        self.lbl_station_name = QLabel("RADIO CASTER MONITOR")
        self.lbl_station_name.setStyleSheet("font-size: 11px; font-weight: 700; color: #71717A; letter-spacing: 0.5px;")
        top_bar.addWidget(self.lbl_station_name)
        top_bar.addStretch()

        self.lbl_conn_status = QLabel("● TERHUBUNG")
        self.lbl_conn_status.setObjectName("LblConnStatus")
        self.lbl_conn_status.setStyleSheet("""
            QLabel#LblConnStatus {
                background-color: rgba(16, 185, 129, 0.15);
                color: #10B981;
                border: 1px solid rgba(16, 185, 129, 0.3);
                border-radius: 4px;
                padding: 3px 8px;
                font-family: 'JetBrains Mono';
                font-size: 10px;
                font-weight: 700;
            }
        """)
        top_bar.addWidget(self.lbl_conn_status)
        layout.addLayout(top_bar)

        # === 2. ON-AIR STUDIO LCD MONITOR ===
        self.lcd_frame = QFrame()
        self.lcd_frame.setObjectName("LcdMonitor")
        self.lcd_frame.setStyleSheet("""
            QFrame#LcdMonitor {
                background-color: #000000;
                border: 2px solid #F59E0B;
                border-radius: 6px;
                padding: 10px;
            }
        """)
        lcd_layout = QVBoxLayout(self.lcd_frame)
        lcd_layout.setContentsMargins(12, 10, 12, 10)
        lcd_layout.setSpacing(6)

        lcd_header = QHBoxLayout()
        lbl_air = QLabel("ON-AIR LIVE")
        lbl_air.setStyleSheet("font-family: 'JetBrains Mono'; font-size: 10px; font-weight: 800; color: #EF4444; letter-spacing: 1px;")
        lcd_header.addWidget(lbl_air)
        lcd_header.addStretch()

        self.lbl_playback_state = QLabel("PLAYING")
        self.lbl_playback_state.setStyleSheet("font-family: 'JetBrains Mono'; font-size: 10px; font-weight: 700; color: #F59E0B;")
        lcd_header.addWidget(self.lbl_playback_state)
        lcd_layout.addLayout(lcd_header)

        # Current On-Air Song Title
        self.lbl_current_title = QLabel("Menunggu status RadioBOSS...")
        self.lbl_current_title.setStyleSheet("font-family: 'Plus Jakarta Sans', sans-serif; font-size: 14px; font-weight: 800; color: #FAFAFA;")
        self.lbl_current_title.setWordWrap(True)
        lcd_layout.addWidget(self.lbl_current_title)

        # Progress bar
        self.prog_track = QProgressBar()
        self.prog_track.setFixedHeight(6)
        self.prog_track.setTextVisible(False)
        self.prog_track.setRange(0, 100)
        self.prog_track.setValue(0)
        self.prog_track.setStyleSheet("""
            QProgressBar {
                background-color: #18181D;
                border: none;
                border-radius: 3px;
            }
            QProgressBar::chunk {
                background-color: #F59E0B;
                border-radius: 3px;
            }
        """)
        lcd_layout.addWidget(self.prog_track)

        # Timecode & Remaining
        time_row = QHBoxLayout()
        self.lbl_time_pos = QLabel("00:00")
        self.lbl_time_pos.setStyleSheet("font-family: 'JetBrains Mono'; font-size: 12px; font-weight: 700; color: #FAFAFA;")
        time_row.addWidget(self.lbl_time_pos)

        time_row.addStretch()

        self.lbl_time_remain = QLabel("-00:00")
        self.lbl_time_remain.setStyleSheet("font-family: 'JetBrains Mono'; font-size: 12px; font-weight: 700; color: #A1A1AA;")
        time_row.addWidget(self.lbl_time_remain)
        lcd_layout.addLayout(time_row)

        layout.addWidget(self.lcd_frame)

        # === 3. TRANSPORT CONTROL RACK ===
        tp_box = QHBoxLayout()
        tp_box.setSpacing(6)

        self.btn_tp_play = QPushButton("▶ PLAY")
        self.btn_tp_play.setObjectName("BtnTransportPlay")
        self.btn_tp_play.setFixedHeight(34)
        self.btn_tp_play.setToolTip("Putar playlist RadioBOSS (cmd=play)")
        self.btn_tp_play.clicked.connect(lambda: self._send_transport("play"))
        tp_box.addWidget(self.btn_tp_play, 1)

        self.btn_tp_pause = QPushButton("⏸ PAUSE")
        self.btn_tp_pause.setObjectName("BtnTransportPause")
        self.btn_tp_pause.setFixedHeight(34)
        self.btn_tp_pause.setToolTip("Jeda playlist RadioBOSS (cmd=pause)")
        self.btn_tp_pause.clicked.connect(lambda: self._send_transport("pause"))
        tp_box.addWidget(self.btn_tp_pause, 1)

        self.btn_tp_skip = QPushButton("⏭ NEXT")
        self.btn_tp_skip.setObjectName("BtnTransportNext")
        self.btn_tp_skip.setFixedHeight(34)
        self.btn_tp_skip.setToolTip("Lompat ke lagu berikutnya (cmd=next)")
        self.btn_tp_skip.clicked.connect(lambda: self._send_transport("next"))
        tp_box.addWidget(self.btn_tp_skip, 1)

        self.btn_tp_stop = QPushButton("⏹ STOP")
        self.btn_tp_stop.setObjectName("BtnTransportStop")
        self.btn_tp_stop.setFixedHeight(34)
        self.btn_tp_stop.setToolTip("Hentikan siaran RadioBOSS seketika (cmd=stop)")
        self.btn_tp_stop.clicked.connect(lambda: self._send_transport("stop"))
        tp_box.addWidget(self.btn_tp_stop, 1)

        layout.addLayout(tp_box)

        # === 4. DEAD-AIR ALERT GUARD BANNER ===
        self.dead_air_banner = QFrame()
        self.dead_air_banner.setStyleSheet("""
            QFrame {
                background-color: rgba(239, 68, 68, 0.15);
                border: 1px solid rgba(239, 68, 68, 0.4);
                border-radius: 6px;
                padding: 6px 10px;
            }
        """)
        da_layout = QHBoxLayout(self.dead_air_banner)
        da_layout.setContentsMargins(8, 6, 8, 6)
        lbl_da_icon = QLabel("⚠️ PERINGATAN DEAD-AIR:")
        lbl_da_icon.setStyleSheet("font-family: 'JetBrains Mono'; font-size: 10px; font-weight: 800; color: #EF4444;")
        da_layout.addWidget(lbl_da_icon)

        self.lbl_da_text = QLabel("Antrean playlist tersisa 0 lagu!")
        self.lbl_da_text.setStyleSheet("font-size: 11px; font-weight: 600; color: #FCA5A5;")
        da_layout.addWidget(self.lbl_da_text, 1)
        self.dead_air_banner.setVisible(False)
        layout.addWidget(self.dead_air_banner)

        # === 5. TABBED MONITOR: UPCOMING QUEUE & DISPATCH LOG ===
        self.monitor_tabs = QTabWidget()
        self.monitor_tabs.setStyleSheet("""
            QTabWidget::pane {
                background-color: #121216;
                border: 1px solid #1C1C22;
                border-radius: 6px;
            }
            QTabBar::tab {
                background-color: #18181D;
                color: #71717A;
                padding: 6px 14px;
                border: 1px solid #1C1C22;
                border-bottom: none;
                border-top-left-radius: 4px;
                border-top-right-radius: 4px;
                font-size: 11px;
                font-weight: 700;
            }
            QTabBar::tab:selected {
                background-color: #121216;
                color: #FAFAFA;
                border-bottom: 2px solid #F59E0B;
            }
        """)

        # Tab 1: Live Playlist Queue
        queue_tab_widget = QWidget()
        q_tab_layout = QVBoxLayout(queue_tab_widget)
        q_tab_layout.setContentsMargins(6, 6, 6, 6)
        q_tab_layout.setSpacing(6)

        # Tabs bar (Horizontal radio buttons/pills for RadioBOSS playlist tabs)
        self.tabs_bar = QHBoxLayout()
        self.tabs_bar.setSpacing(4)
        self.lbl_active_tab_info = QLabel("Tab Aktif: Utama")
        self.lbl_active_tab_info.setStyleSheet("font-size: 10px; font-weight: 600; color: #F59E0B;")
        self.tabs_bar.addWidget(self.lbl_active_tab_info)
        self.tabs_bar.addStretch()
        q_tab_layout.addLayout(self.tabs_bar)

        # Table of upcoming songs
        self.tbl_queue = QTableWidget()
        self.tbl_queue.setColumnCount(3)
        self.tbl_queue.setHorizontalHeaderLabels(["#", "Judul Track", "Durasi"])
        self.tbl_queue.horizontalHeader().setSectionResizeMode(0, QHeaderView.ResizeToContents)
        self.tbl_queue.horizontalHeader().setSectionResizeMode(1, QHeaderView.Stretch)
        self.tbl_queue.horizontalHeader().setSectionResizeMode(2, QHeaderView.ResizeToContents)
        self.tbl_queue.verticalHeader().setVisible(False)
        self.tbl_queue.setSelectionBehavior(QAbstractItemView.SelectRows)
        self.tbl_queue.setEditTriggers(QAbstractItemView.NoEditTriggers)
        self.tbl_queue.setShowGrid(False)
        self.tbl_queue.setStyleSheet("""
            QTableWidget {
                background-color: #0E0E11;
                border: 1px solid #1C1C22;
                border-radius: 4px;
                color: #FAFAFA;
            }
            QTableWidget::item {
                padding: 4px;
                border-bottom: 1px solid #18181D;
            }
            QTableWidget::item:selected {
                background-color: #1C1C22;
            }
            QHeaderView::section {
                background-color: #121216;
                color: #71717A;
                font-size: 10px;
                font-weight: 700;
                padding: 4px;
                border: none;
                border-bottom: 1px solid #1C1C22;
            }
        """)
        q_tab_layout.addWidget(self.tbl_queue)
        self.monitor_tabs.addTab(queue_tab_widget, "Antrean RadioBOSS")

        # Tab 2: Dispatch Log (History of requests sent this session)
        log_tab_widget = QWidget()
        l_tab_layout = QVBoxLayout(log_tab_widget)
        l_tab_layout.setContentsMargins(6, 6, 6, 6)

        self.tbl_log = QTableWidget()
        self.tbl_log.setColumnCount(3)
        self.tbl_log.setHorizontalHeaderLabels(["Jam", "Aksi", "Lagu"])
        self.tbl_log.horizontalHeader().setSectionResizeMode(0, QHeaderView.ResizeToContents)
        self.tbl_log.horizontalHeader().setSectionResizeMode(1, QHeaderView.ResizeToContents)
        self.tbl_log.horizontalHeader().setSectionResizeMode(2, QHeaderView.Stretch)
        self.tbl_log.verticalHeader().setVisible(False)
        self.tbl_log.setSelectionBehavior(QAbstractItemView.SelectRows)
        self.tbl_log.setEditTriggers(QAbstractItemView.NoEditTriggers)
        self.tbl_log.setShowGrid(False)
        self.tbl_log.setStyleSheet("""
            QTableWidget {
                background-color: #0E0E11;
                border: 1px solid #1C1C22;
                border-radius: 4px;
                color: #FAFAFA;
            }
            QTableWidget::item {
                padding: 4px;
                border-bottom: 1px solid #18181D;
            }
            QHeaderView::section {
                background-color: #121216;
                color: #71717A;
                font-size: 10px;
                font-weight: 700;
                padding: 4px;
                border: none;
                border-bottom: 1px solid #1C1C22;
            }
        """)
        l_tab_layout.addWidget(self.tbl_log)
        self.monitor_tabs.addTab(log_tab_widget, "Log Pengiriman")

        layout.addWidget(self.monitor_tabs, 1)

    def update_radioboss_status(self, status):
        """Update live status from RadioBOSSStatusResponse object."""
        if not status or not getattr(status, "connected", False):
            self.lbl_conn_status.setText("✕ TERPUTUS")
            self.lbl_conn_status.setStyleSheet("""
                background-color: rgba(239, 68, 68, 0.15);
                color: #EF4444;
                border: 1px solid rgba(239, 68, 68, 0.3);
                border-radius: 4px;
                padding: 3px 8px;
                font-family: 'JetBrains Mono';
                font-size: 10px;
                font-weight: 700;
            """)
            self.lbl_playback_state.setText("DISCONNECTED")
            self.lbl_playback_state.setStyleSheet("font-family: 'JetBrains Mono'; font-size: 10px; font-weight: 700; color: #EF4444;")
            return

        self.lbl_conn_status.setText("● TERHUBUNG")
        self.lbl_conn_status.setStyleSheet("""
            background-color: rgba(16, 185, 129, 0.15);
            color: #10B981;
            border: 1px solid rgba(16, 185, 129, 0.3);
            border-radius: 4px;
            padding: 3px 8px;
            font-family: 'JetBrains Mono';
            font-size: 10px;
            font-weight: 700;
        """)

        np = getattr(status, "now_playing", None)
        if np:
            title = getattr(np, "title", "Tidak Ada Siaran") or "Tidak Ada Siaran"
            self.lbl_current_title.setText(title)

            state = (getattr(np, "status", "stop") or "stop").upper()
            self.lbl_playback_state.setText(state)

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

        # Dead-air warning alert
        if count == 0:
            self.dead_air_banner.setVisible(True)
            self.lbl_da_text.setText("Antrean RadioBOSS kosong! Radio akan hening jika lagu selesai.")
        elif count <= 2:
            self.dead_air_banner.setVisible(True)
            self.lbl_da_text.setText(f"Hanya tersisa {count} lagu dalam antrean. Segera isi playlist!")
        else:
            self.dead_air_banner.setVisible(False)

        for i, tr in enumerate(tracks):
            row = self.tbl_queue.rowCount()
            self.tbl_queue.insertRow(row)

            # Extract fields
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
        """Update active tab indicator and tabs list."""
        self.available_tabs = available_tabs
        self.active_tab = active_tab
        display_tab = active_tab if active_tab else "Utama"
        self.lbl_active_tab_info.setText(f"Tab Aktif: {display_tab} {'(Tersinkron)' if is_synced else ''}")

    def append_dispatch_log(self, action_label: str, title: str):
        """Add record to dispatch log tab."""
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
            item_act.setForeground(QColor("#10B981"))
        item_act.setFont(QFont("Plus Jakarta Sans", 9, QFont.Bold))
        self.tbl_log.setItem(row, 1, item_act)

        item_title = QTableWidgetItem(title)
        item_title.setForeground(QColor("#FAFAFA"))
        self.tbl_log.setItem(row, 2, item_title)

    def _send_transport(self, action: str):
        """Send play/pause/skip/stop transport command."""
        self._transport_worker = TransportWorker(action)
        self._transport_worker.finished.connect(
            lambda ok, msg: self.status_message.emit(
                f"Perintah {action.upper()}: {'Berhasil' if ok else f'Gagal ({msg})'}"
            )
        )
        self._transport_worker.start()
        self.transport_triggered.emit(action)
