"""Left Zone: Discovery, Search Catalog, CasterHub Global Charts, and Playlist Sets."""
import os
from typing import Dict, Any, List, Optional

from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLineEdit, QPushButton,
    QLabel, QTableWidget, QTableWidgetItem, QHeaderView, QFrame,
    QProgressBar, QAbstractItemView, QMessageBox, QInputDialog
)
from PySide6.QtCore import Qt, Signal
from PySide6.QtGui import QColor, QFont, QCursor

from native_gui.workers import SearchWorker, RecommendationsWorker
from app.services.telemetry_service import telemetry_service
from app.services.db_service import db_service


class DiscoveryWidget(QFrame):
    """Left Deck: YouTube Music Omnibox Search, CasterHub Global Charts & Catalog."""
    track_selected = Signal(dict)
    preview_requested = Signal(str, str) # video_id, title
    status_message = Signal(str)

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setObjectName("DeckModule")
        self.current_tracks: List[Dict[str, Any]] = []
        self._search_worker: Optional[SearchWorker] = None
        self._recs_worker: Optional[RecommendationsWorker] = None
        self.current_mode = "search"
        self.current_chart_sub = "top50"

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

        self.btn_import_set = QPushButton("Simpan ke Playlist Set")
        self.btn_import_set.setObjectName("BtnSecondary")
        self.btn_import_set.setToolTip("Simpan seluruh track yang sedang tampil menjadi Playlist Set lokal")
        self.btn_import_set.clicked.connect(self._import_current_to_set)
        header_layout.addWidget(self.btn_import_set)
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

        # Category Mode Selector Buttons
        btn_bar = QHBoxLayout()
        btn_bar.setSpacing(6)

        self.btn_mode_search = QPushButton("Hasil Pencarian")
        self.btn_mode_search.setObjectName("TabButton")
        self.btn_mode_search.setProperty("active", "true")
        self.btn_mode_search.clicked.connect(lambda: self._set_mode("search"))
        btn_bar.addWidget(self.btn_mode_search)

        self.btn_mode_charts = QPushButton("CasterHub Charts")
        self.btn_mode_charts.setObjectName("TabButton")
        self.btn_mode_charts.clicked.connect(lambda: self._set_mode("charts"))
        btn_bar.addWidget(self.btn_mode_charts)

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

        # Sub-Bar for CasterHub Charts (Top 50, Trending, Siaran Pagi, Sore, Malam)
        self.charts_bar = QWidget()
        charts_layout = QHBoxLayout(self.charts_bar)
        charts_layout.setContentsMargins(0, 0, 0, 0)
        charts_layout.setSpacing(6)

        chart_filters = [
            ("Top 50 Global", "top50"),
            ("Trending 48h", "trending"),
            ("Siaran Pagi", "morning"),
            ("Santai Sore", "afternoon"),
            ("Siaran Malam", "night"),
        ]
        self.chart_filter_btns = {}
        for label, cat in chart_filters:
            btn = QPushButton(label)
            btn.setObjectName("TabButton")
            btn.clicked.connect(lambda checked, c=cat: self._load_casterhub_chart(c))
            charts_layout.addWidget(btn)
            self.chart_filter_btns[cat] = btn

        charts_layout.addStretch()
        self.charts_bar.setVisible(False)
        layout.addWidget(self.charts_bar)

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

        # Bottom Status Bar & Broadcaster Shift Meter
        self.status_lbl = QLabel("Ketik judul lagu atau buka tab CasterHub Charts untuk melihat lagu populer.")
        self.status_lbl.setObjectName("SubtleText")
        layout.addWidget(self.status_lbl)

    def _set_mode(self, mode: str):
        self.current_mode = mode
        self.btn_mode_search.setProperty("active", "true" if mode == "search" else "false")
        self.btn_mode_charts.setProperty("active", "true" if mode == "charts" else "false")
        self.btn_mode_mood.setProperty("active", "true" if mode == "mood" else "false")
        self.btn_mode_sets.setProperty("active", "true" if mode == "sets" else "false")

        # Force stylesheet update
        for b in (self.btn_mode_search, self.btn_mode_charts, self.btn_mode_mood, self.btn_mode_sets):
            b.style().unpolish(b)
            b.style().polish(b)

        self.charts_bar.setVisible(mode == "charts")
        self.mood_bar.setVisible(mode == "mood")

        if mode == "charts":
            self._load_casterhub_chart(self.current_chart_sub)
        elif mode == "mood":
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

    def _load_casterhub_chart(self, category: str):
        self.current_chart_sub = category
        for cat, btn in self.chart_filter_btns.items():
            btn.setProperty("active", "true" if cat == category else "false")
            btn.style().unpolish(btn)
            btn.style().polish(btn)

        self.progress_bar.setVisible(True)
        self.status_lbl.setText(f"Memuat CasterHub Chart ({category.upper()})...")

        if self._recs_worker and self._recs_worker.isRunning():
            self._recs_worker.terminate()

        self._recs_worker = RecommendationsWorker(f"casterhub:{category}")
        self._recs_worker.finished.connect(self._on_chart_finished)
        self._recs_worker.error.connect(self._on_search_error)
        self._recs_worker.start()

    def _on_chart_finished(self, results: list):
        self.progress_bar.setVisible(False)
        self.current_tracks = results
        self._render_tracks(results)

        count = len(results)
        if count > 0:
            self.status_lbl.setText(f"Menampilkan {count} lagu CasterHub Global Radio Chart.")
            self.table.selectRow(0)
            self.track_selected.emit(results[0])
        else:
            self.status_lbl.setText("Belum ada data chart. Data akan teragregasi otomatis saat siaran.")

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

    def _import_current_to_set(self):
        """Save current displayed tracks as a local Playlist Set in 1-click."""
        if not self.current_tracks:
            QMessageBox.warning(self, "Playlist Kosong", "Tidak ada daftar lagu yang sedang ditampilkan.")
            return

        default_name = f"CasterHub Chart {self.current_chart_sub.title()}" if self.current_mode == "charts" else "Koleksi Siaran Studio"
        set_name, ok = QInputDialog.getText(
            self,
            "Simpan Playlist Set",
            f"Beri nama Playlist Set untuk {len(self.current_tracks)} lagu ini:",
            QLineEdit.Normal,
            default_name,
        )
        if ok and set_name.strip():
            new_set = db_service.create_set(set_name.strip(), description="Imported via CasterHub")
            for t in self.current_tracks:
                db_service.add_track_to_set(new_set["id"], t)
            self.status_message.emit(f"Berhasil menyimpan {len(self.current_tracks)} lagu ke '{set_name.strip()}'.")
            QMessageBox.information(self, "Sukses", f"Playlist Set '{set_name.strip()}' berhasil dibuat!")

    def _render_tracks(self, tracks: list):
        self.table.setColumnCount(4)
        self.table.setHorizontalHeaderLabels(["#", "Judul & Artis", "Album", "Durasi"])
        self.table.setRowCount(len(tracks))

        for row, t in enumerate(tracks):
            rank_val = t.get("rank") or (row + 1)
            idx_item = QTableWidgetItem(f"{rank_val:02d}")
            idx_item.setTextAlignment(Qt.AlignCenter)
            idx_item.setForeground(QColor("#F59E0B" if self.current_mode == "charts" else "#A1A1AA"))

            # Title and Artist
            title = t.get("title", "")
            artists = t.get("artists")
            artist_str = ", ".join(artists) if isinstance(artists, list) else str(t.get("artist") or artists or "")
            display_title = f"{title}\n{artist_str}" if artist_str else title

            title_item = QTableWidgetItem(display_title)
            title_item.setFont(QFont("Plus Jakarta Sans", 10, QFont.Bold))

            album_item = QTableWidgetItem(t.get("album", "") or "-")
            album_item.setForeground(QColor("#A1A1AA"))

            dur_item = QTableWidgetItem(t.get("duration_formatted") or t.get("duration", "00:00"))
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
