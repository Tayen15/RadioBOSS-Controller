"""Left Zone: Discovery, Search Catalog, CasterHub Global Charts, and Playlist Sets."""
import os
from typing import Dict, Any, List, Optional

from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLineEdit, QPushButton,
    QLabel, QTableWidget, QTableWidgetItem, QHeaderView, QFrame,
    QProgressBar, QAbstractItemView, QMessageBox, QInputDialog
)
from PySide6.QtCore import Qt, Signal, QTimer
from PySide6.QtGui import QColor, QFont, QCursor

from native_gui.workers import SearchWorker, RecommendationsWorker, ListenerRequestsWorker, ActionRequestWorker, QueueWorker
from app.services.telemetry_service import telemetry_service
from app.services.db_service import db_service


class DiscoveryWidget(QFrame):
    """Left Deck: YouTube Music Omnibox Search, CasterHub Global Charts, Listener Requests & Catalog."""
    track_selected = Signal(dict)
    preview_requested = Signal(str, str) # video_id, title
    status_message = Signal(str)

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setObjectName("DeckModule")
        self.current_tracks: List[Dict[str, Any]] = []
        self.listener_requests: List[Dict[str, Any]] = []
        self._search_worker: Optional[SearchWorker] = None
        self._recs_worker: Optional[RecommendationsWorker] = None
        self._req_worker: Optional[ListenerRequestsWorker] = None
        self._action_worker: Optional[ActionRequestWorker] = None
        self.current_mode = "search"
        self.current_chart_sub = "top50"

        self._setup_ui()
        self._setup_request_timer()

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

        self.btn_mode_requests = QPushButton("Request Masuk")
        self.btn_mode_requests.setObjectName("TabButton")
        self.btn_mode_requests.clicked.connect(lambda: self._set_mode("requests"))
        btn_bar.addWidget(self.btn_mode_requests)

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

    def _setup_request_timer(self):
        """Setup periodic polling for incoming listener requests."""
        self._req_poll_timer = QTimer(self)
        self._req_poll_timer.setInterval(20000) # Every 20 seconds
        self._req_poll_timer.timeout.connect(self._poll_requests)
        self._req_poll_timer.start()
        # Trigger first poll after 3s
        QTimer.singleShot(3000, self._poll_requests)

    def _poll_requests(self):
        """Poll incoming listener requests in background."""
        if self._req_worker and self._req_worker.isRunning():
            return
        self._req_worker = ListenerRequestsWorker()
        self._req_worker.requests_ready.connect(self._on_requests_ready)
        self._req_worker.start()

    def _on_requests_ready(self, requests: list):
        self.listener_requests = requests
        count = len(requests)
        if count > 0:
            self.btn_mode_requests.setText(f"Request Masuk [🔴 {count}]")
            self.btn_mode_requests.setStyleSheet("color: #F87171; font-weight: 700;")
        else:
            self.btn_mode_requests.setText("Request Masuk")
            self.btn_mode_requests.setStyleSheet("")

        if self.current_mode == "requests":
            self.progress_bar.setVisible(False)
            self._render_requests(requests)
            if count > 0:
                self.status_lbl.setText(f"Ada {count} request lagu dari pendengar yang siap diputar.")
            else:
                self.status_lbl.setText("Belum ada request lagu baru dari pendengar.")

    def _set_mode(self, mode: str):
        self.current_mode = mode
        self.btn_mode_search.setProperty("active", "true" if mode == "search" else "false")
        self.btn_mode_charts.setProperty("active", "true" if mode == "charts" else "false")
        self.btn_mode_requests.setProperty("active", "true" if mode == "requests" else "false")
        self.btn_mode_mood.setProperty("active", "true" if mode == "mood" else "false")
        self.btn_mode_sets.setProperty("active", "true" if mode == "sets" else "false")

        # Force stylesheet update
        for b in (self.btn_mode_search, self.btn_mode_charts, self.btn_mode_requests, self.btn_mode_mood, self.btn_mode_sets):
            b.style().unpolish(b)
            b.style().polish(b)

        self.charts_bar.setVisible(mode == "charts")
        self.mood_bar.setVisible(mode == "mood")

        if mode == "charts":
            self._load_casterhub_chart(self.current_chart_sub)
        elif mode == "requests":
            self._load_listener_requests()
        elif mode == "mood":
            self._load_mood("Semangat Pagi")
        elif mode == "sets":
            self._load_playlist_sets()

    def _load_listener_requests(self):
        """Load and display incoming requests from listeners."""
        self.progress_bar.setVisible(True)
        self.status_lbl.setText("Mengambil request lagu pendengar dari CasterHub...")
        self._poll_requests()

    def _render_requests(self, requests: list):
        """Render listener requests with interactive Accept, Reject, and Cue buttons."""
        self.table.setColumnCount(3)
        self.table.setHorizontalHeaderLabels(["Pengirim & Pesan", "Lagu Di-Request", "Aksi"])
        self.table.horizontalHeader().setSectionResizeMode(0, QHeaderView.Stretch)
        self.table.horizontalHeader().setSectionResizeMode(1, QHeaderView.Stretch)
        self.table.horizontalHeader().setSectionResizeMode(2, QHeaderView.Fixed)
        self.table.setColumnWidth(2, 190)
        self.table.setRowCount(len(requests))

        for row, r in enumerate(requests):
            # Column 0: Sender & Message
            sender = r.get("sender_name", "Pendengar")
            msg = r.get("message", "")
            time_txt = r.get("created_at", "")[:16].replace("T", " ")
            disp_sender = f"👤 {sender} ({time_txt})\n💬 \"{msg}\"" if msg else f"👤 {sender} ({time_txt})"
            item_sender = QTableWidgetItem(disp_sender)
            item_sender.setFont(QFont("Plus Jakarta Sans", 9))
            self.table.setItem(row, 0, item_sender)

            # Column 1: Song title & artist
            title = r.get("title", "")
            artist = r.get("artist", "")
            dur = r.get("duration_formatted", "00:00")
            item_song = QTableWidgetItem(f"🎵 {title}\n{artist} ({dur})")
            item_song.setFont(QFont("Plus Jakarta Sans", 9, QFont.Bold))
            item_song.setForeground(QColor("#FAFAFA"))
            self.table.setItem(row, 1, item_song)

            # Column 2: Action Buttons
            btn_cell = QWidget()
            b_layout = QHBoxLayout(btn_cell)
            b_layout.setContentsMargins(4, 4, 4, 4)
            b_layout.setSpacing(4)

            btn_accept = QPushButton("▶ Terima")
            btn_accept.setStyleSheet("""
                QPushButton {
                    background-color: #F59E0B;
                    color: #09090B;
                    font-size: 10px;
                    font-weight: 700;
                    border-radius: 4px;
                    padding: 4px 8px;
                }
                QPushButton:hover { background-color: #FBBF24; }
            """)
            btn_accept.clicked.connect(lambda _, req=r: self._accept_request(req))
            b_layout.addWidget(btn_accept)

            btn_cue = QPushButton("Cue")
            btn_cue.setStyleSheet("""
                QPushButton {
                    background-color: #1C1C22;
                    color: #FAFAFA;
                    font-size: 10px;
                    font-weight: 600;
                    border: 1px solid #272730;
                    border-radius: 4px;
                    padding: 4px 6px;
                }
                QPushButton:hover { background-color: #272730; }
            """)
            btn_cue.clicked.connect(lambda _, req=r: self._cue_request(req))
            b_layout.addWidget(btn_cue)

            btn_reject = QPushButton("✕")
            btn_reject.setStyleSheet("""
                QPushButton {
                    background-color: #1C1C22;
                    color: #EF4444;
                    font-size: 10px;
                    font-weight: 700;
                    border: 1px solid #272730;
                    border-radius: 4px;
                    padding: 4px 6px;
                }
                QPushButton:hover { background-color: rgba(239, 68, 68, 0.2); }
            """)
            btn_reject.clicked.connect(lambda _, req=r: self._reject_request(req))
            b_layout.addWidget(btn_reject)

            self.table.setCellWidget(row, 2, btn_cell)
            self.table.setRowHeight(row, 54)

    def _cue_request(self, req: dict):
        """Load requested song into Cue Deck."""
        track = {
            "video_id": req.get("video_id", ""),
            "title": req.get("title", ""),
            "artist": req.get("artist", ""),
            "artists": [req.get("artist", "")],
            "thumbnail_url": req.get("thumbnail_url", ""),
            "duration_formatted": req.get("duration_formatted", "00:00"),
            "album": f"Request dari {req.get('sender_name', 'Pendengar')}",
        }
        self.track_selected.emit(track)
        self.status_message.emit(f"Lagu request dari {req.get('sender_name')} dimuat ke Cue Deck.")

    def _accept_request(self, req: dict):
        """Accept song request, queue into RadioBOSS, and mark as accepted."""
        title = req.get("title", "")
        artist = req.get("artist", "")
        clean_id = req.get("video_id", "")
        req_id = req.get("id", "")

        # 1. Enqueue to RadioBOSS
        self._action_queue_worker = QueueWorker(
            song_title=title,
            artist=artist,
            video_id=clean_id,
            pos=-2, # Putar Berikutnya
            thumbnail_url=req.get("thumbnail_url", ""),
            target_tab="",
        )
        self._action_queue_worker.start()

        # 2. Update status in CasterHub
        if req_id:
            self._action_worker = ActionRequestWorker(req_id, "accept")
            self._action_worker.start()

        # 3. Remove from local list
        self.listener_requests = [r for r in self.listener_requests if r.get("id") != req_id]
        self._on_requests_ready(self.listener_requests)
        self.status_message.emit(f"✓ Request '{title}' dari {req.get('sender_name')} diterima & dimasukkan antrean!")

    def _reject_request(self, req: dict):
        """Reject and archive song request."""
        req_id = req.get("id", "")
        if req_id:
            self._action_worker = ActionRequestWorker(req_id, "reject")
            self._action_worker.start()

        self.listener_requests = [r for r in self.listener_requests if r.get("id") != req_id]
        self._on_requests_ready(self.listener_requests)
        self.status_message.emit(f"Request dari {req.get('sender_name')} telah diarsipkan/ditolak.")

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
        self.table.horizontalHeader().setSectionResizeMode(0, QHeaderView.Fixed)
        self.table.horizontalHeader().setSectionResizeMode(1, QHeaderView.Stretch)
        self.table.horizontalHeader().setSectionResizeMode(2, QHeaderView.ResizeToContents)
        self.table.horizontalHeader().setSectionResizeMode(3, QHeaderView.Fixed)
        self.table.setColumnWidth(0, 36)
        self.table.setColumnWidth(3, 64)
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
        if self.current_mode == "requests":
            return
        if 0 <= row < len(self.current_tracks):
            self.track_selected.emit(self.current_tracks[row])

    def _on_table_double_click(self, item):
        row = item.row()
        if self.current_mode == "requests":
            return
        if 0 <= row < len(self.current_tracks):
            t = self.current_tracks[row]
            self.preview_requested.emit(t.get("video_id", ""), t.get("title", ""))
