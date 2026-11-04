"""Left Zone: Discovery, Search Catalog, Mood Recommendations, and Playlist Sets."""
import os
from typing import Dict, Any, List, Optional

from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLineEdit, QPushButton,
    QLabel, QTableWidget, QTableWidgetItem, QHeaderView, QFrame,
    QProgressBar, QAbstractItemView
)
from PySide6.QtCore import Qt, Signal
from PySide6.QtGui import QColor, QFont, QCursor

from native_gui.workers import SearchWorker, RecommendationsWorker


class DiscoveryWidget(QFrame):
    """Left Deck: YouTube Music Omnibox Search & Catalog (DESIGN.md specification)."""
    track_selected = Signal(dict)
    preview_requested = Signal(str, str) # video_id, title
    status_message = Signal(str)

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setObjectName("DeckModule")
        self.current_tracks: List[Dict[str, Any]] = []
        self._search_worker: Optional[SearchWorker] = None
        self._recs_worker: Optional[RecommendationsWorker] = None

        self._setup_ui()

    def _setup_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(14, 14, 14, 14)
        layout.setSpacing(10)

        # Header Title
        header_layout = QHBoxLayout()
        title_label = QLabel("DISCOVERY & KATALOG")
        title_label.setObjectName("SectionHeader")
        header_layout.addWidget(title_label)
        header_layout.addStretch()
        layout.addLayout(header_layout)

        # Smart Omnibox Search Bar
        search_box_layout = QHBoxLayout()
        search_box_layout.setSpacing(8)

        self.search_input = QLineEdit()
        self.search_input.setObjectName("Omnibox")
        self.search_input.setPlaceholderText("Cari lagu, artis, atau paste link YouTube / YT Music...")
        self.search_input.returnPressed.connect(self._start_search)
        search_box_layout.addWidget(self.search_input, 1)

        self.search_btn = QPushButton("Cari")
        self.search_btn.setObjectName("BtnPrimary")
        self.search_btn.setCursor(QCursor(Qt.PointingHandCursor))
        self.search_btn.clicked.connect(self._start_search)
        search_box_layout.addWidget(self.search_btn)

        layout.addLayout(search_box_layout)

        # Category Mode Selector Buttons (Clean Text without generic emoji slop)
        btn_bar = QHBoxLayout()
        btn_bar.setSpacing(6)

        self.btn_mode_search = QPushButton("Hasil Pencarian")
        self.btn_mode_search.setObjectName("TabButton")
        self.btn_mode_search.setProperty("active", "true")
        self.btn_mode_search.clicked.connect(lambda: self._set_mode("search"))
        btn_bar.addWidget(self.btn_mode_search)

        self.btn_mode_mood = QPushButton("Radio Mood")
        self.btn_mode_mood.setObjectName("TabButton")
        self.btn_mode_mood.clicked.connect(lambda: self._set_mode("mood"))
        btn_bar.addWidget(self.btn_mode_mood)

        self.btn_mode_sets = QPushButton("Playlist Sets")
        self.btn_mode_sets.setObjectName("TabButton")
        self.btn_mode_sets.clicked.connect(lambda: self._set_mode("sets"))
        btn_bar.addWidget(self.btn_mode_sets)

        btn_bar.addStretch()
        layout.addLayout(btn_bar)

        # Mood Sub-Selector Bar (Hidden by default, shown in Mood mode)
        self.mood_bar = QWidget()
        mood_layout = QHBoxLayout(self.mood_bar)
        mood_layout.setContentsMargins(0, 0, 0, 0)
        mood_layout.setSpacing(6)

        moods = ["Semangat Pagi", "Santai Sore", "Top Hits Indo", "Akustik", "Nostalgia"]
        for m in moods:
            btn = QPushButton(m)
            btn.setObjectName("TabButton")
            btn.clicked.connect(lambda checked, name=m: self._load_mood(name))
            mood_layout.addWidget(btn)
        mood_layout.addStretch()
        self.mood_bar.setVisible(False)
        layout.addWidget(self.mood_bar)

        # Loading Progress Bar
        self.progress_bar = QProgressBar()
        self.progress_bar.setRange(0, 0) # Indeterminate spinner
        self.progress_bar.setFixedHeight(3)
        self.progress_bar.setTextVisible(False)
        self.progress_bar.setVisible(False)
        layout.addWidget(self.progress_bar)

        # Track Table (Dense single-column row format with tabular nums per DESIGN.md)
        self.table = QTableWidget()
        self.table.setColumnCount(4)
        self.table.setHorizontalHeaderLabels(["#", "Judul & Artis", "Album", "Durasi"])
        self.table.horizontalHeader().setSectionResizeMode(0, QHeaderView.Fixed)
        self.table.horizontalHeader().setSectionResizeMode(1, QHeaderView.Stretch)
        self.table.horizontalHeader().setSectionResizeMode(2, QHeaderView.ResizeToContents)
        self.table.horizontalHeader().setSectionResizeMode(3, QHeaderView.Fixed)
        self.table.setColumnWidth(0, 36)
        self.table.setColumnWidth(3, 64)
        self.table.setSelectionBehavior(QAbstractItemView.SelectRows)
        self.table.setSelectionMode(QAbstractItemView.SingleSelection)
        self.table.verticalHeader().setVisible(False)
        self.table.setShowGrid(False)
        self.table.itemClicked.connect(self._on_table_click)
        self.table.itemDoubleClicked.connect(self._on_table_double_click)
        layout.addWidget(self.table, 1)

        # Bottom Status Bar
        self.status_lbl = QLabel("Ketik judul lagu atau artis untuk memulai pencarian katalog.")
        self.status_lbl.setObjectName("SubtleText")
        layout.addWidget(self.status_lbl)

    def _set_mode(self, mode: str):
        self.btn_mode_search.setProperty("active", "true" if mode == "search" else "false")
        self.btn_mode_mood.setProperty("active", "true" if mode == "mood" else "false")
        self.btn_mode_sets.setProperty("active", "true" if mode == "sets" else "false")

        # Force stylesheet update
        for b in (self.btn_mode_search, self.btn_mode_mood, self.btn_mode_sets):
            b.style().unpolish(b)
            b.style().polish(b)

        self.mood_bar.setVisible(mode == "mood")

        if mode == "mood":
            self._load_mood("Semangat Pagi")
        elif mode == "sets":
            self._load_playlist_sets()

    def _start_search(self):
        query = self.search_input.text().strip()
        if not query:
            return

        self._set_mode("search")
        self.progress_bar.setVisible(True)
        self.search_btn.setEnabled(False)
        self.status_lbl.setText(f"Mencari '{query}' di YouTube Music...")

        if self._search_worker and self._search_worker.isRunning():
            self._search_worker.terminate()

        self._search_worker = SearchWorker(query)
        self._search_worker.finished.connect(self._on_search_finished)
        self._search_worker.error.connect(self._on_search_error)
        self._search_worker.start()

    def _on_search_finished(self, results: list):
        self.progress_bar.setVisible(False)
        self.search_btn.setEnabled(True)
        self.current_tracks = results
        self._render_tracks(results)

        count = len(results)
        if count > 0:
            self.status_lbl.setText(f"Ditemukan {count} lagu resmi dari YouTube Music.")
            self.table.selectRow(0)
            self.track_selected.emit(results[0])
        else:
            self.status_lbl.setText("Tidak ada lagu yang cocok. Periksa kata kunci pencarian.")

    def _on_search_error(self, err_msg: str):
        self.progress_bar.setVisible(False)
        self.search_btn.setEnabled(True)
        self.status_lbl.setText(f"Gagal mencari: {err_msg}")

    def _load_mood(self, mood_name: str):
        self.progress_bar.setVisible(True)
        self.status_lbl.setText(f"Memuat kurasi suasana '{mood_name}'...")

        if self._recs_worker and self._recs_worker.isRunning():
            self._recs_worker.terminate()

        self._recs_worker = RecommendationsWorker(f"mood:{mood_name}")
        self._recs_worker.finished.connect(self._on_search_finished)
        self._recs_worker.error.connect(self._on_search_error)
        self._recs_worker.start()

    def _load_playlist_sets(self):
        from app.services.db_service import db_service
        sets = db_service.get_all_sets()
        self.table.setRowCount(0)
        self.current_tracks = []

        if not sets:
            self.status_lbl.setText("Belum ada Playlist Set tersimpan di database.")
            return

        self.table.setColumnCount(3)
        self.table.setHorizontalHeaderLabels(["#", "Nama Playlist Set", "Jumlah Lagu"])
        self.table.setRowCount(len(sets))

        for row, s in enumerate(sets):
            idx_item = QTableWidgetItem(f"{row+1:02d}")
            idx_item.setTextAlignment(Qt.AlignCenter)
            name_item = QTableWidgetItem(s.get("name", "Untitled Set"))
            count_item = QTableWidgetItem(f"{s.get('track_count', 0)} lagu")

            self.table.setItem(row, 0, idx_item)
            self.table.setItem(row, 1, name_item)
            self.table.setItem(row, 2, count_item)

        self.status_lbl.setText(f"Menampilkan {len(sets)} Playlist Sets lokal.")

    def _render_tracks(self, tracks: list):
        self.table.setColumnCount(4)
        self.table.setHorizontalHeaderLabels(["#", "Judul & Artis", "Album", "Durasi"])
        self.table.setRowCount(len(tracks))

        for row, t in enumerate(tracks):
            idx_item = QTableWidgetItem(f"{row+1:02d}")
            idx_item.setTextAlignment(Qt.AlignCenter)
            idx_item.setForeground(QColor("#A1A1AA"))

            # Title and Artist
            title = t.get("title", "")
            artists = t.get("artists")
            artist_str = ", ".join(artists) if isinstance(artists, list) else str(artists or "")
            display_title = f"{title}\n{artist_str}" if artist_str else title

            title_item = QTableWidgetItem(display_title)
            title_item.setFont(QFont("Plus Jakarta Sans", 10, QFont.Bold))

            album_item = QTableWidgetItem(t.get("album", "") or "-")
            album_item.setForeground(QColor("#A1A1AA"))

            dur_item = QTableWidgetItem(t.get("duration", "00:00"))
            dur_item.setTextAlignment(Qt.AlignCenter)
            dur_item.setFont(QFont("JetBrains Mono", 9))
            dur_item.setForeground(QColor("#F59E0B"))

            self.table.setItem(row, 0, idx_item)
            self.table.setItem(row, 1, title_item)
            self.table.setItem(row, 2, album_item)
            self.table.setItem(row, 3, dur_item)
            self.table.setRowHeight(row, 44)

    def _on_table_click(self, item):
        row = item.row()
        if 0 <= row < len(self.current_tracks):
            self.track_selected.emit(self.current_tracks[row])

    def _on_table_double_click(self, item):
        row = item.row()
        if 0 <= row < len(self.current_tracks):
            t = self.current_tracks[row]
            self.preview_requested.emit(t.get("video_id", ""), t.get("title", ""))
