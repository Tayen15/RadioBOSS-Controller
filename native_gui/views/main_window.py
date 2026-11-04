"""Main Window: Master 3-Zone Studio Workbench (PySide6 / Qt6 Native)."""
import os
import sys
import logging
from typing import Dict, Any

from PySide6.QtCore import Qt, QTimer
from PySide6.QtGui import QIcon, QFont
from PySide6.QtWidgets import (
    QMainWindow,
    QWidget,
    QVBoxLayout,
    QHBoxLayout,
    QSplitter,
    QLabel,
    QPushButton,
    QStatusBar,
    QFrame,
    QApplication,
)

from native_gui.views.discovery_widget import DiscoveryWidget
from native_gui.views.cue_deck_widget import CueDeckWidget
from native_gui.views.monitor_widget import MonitorWidget
from native_gui.views.settings_dialog import SettingsDialog
from native_gui.workers import RadioBossSyncWorker
from app.services.settings_service import settings_service

logger = logging.getLogger(__name__)


class MainWindow(QMainWindow):
    """
    Radio Caster Bridge Pure Native Desktop Application:
    - Top Rack Strip: Station Branding, Active Tab Status, Settings Button
    - 3-Zone Horizontal Workbench:
      1. Discovery Deck (Left): Omnibox search, category pills, tracklist
      2. Cue Deck (Center): Selected track hero, metadata clean, preview, action buttons, lyrics
      3. Monitor Zone (Right): On-Air LCD, transport rack, queue table, dead-air alert
    - Bottom Status Bar: Status messages, memory monitor, engine state
    """

    def __init__(self):
        super().__init__()
        self.setWindowTitle("Radio Caster Bridge - Studio Console (Native)")
        self.setMinimumSize(1180, 720)
        self.resize(1340, 840)

        self._sync_worker = None
        self._sync_timer = QTimer(self)
        self._sync_timer.setInterval(2500)  # Polling RadioBOSS every 2.5 seconds
        self._sync_timer.timeout.connect(self._trigger_radioboss_sync)

        self._init_ui()
        self._connect_signals()
        self._sync_timer.start()
        # Trigger initial sync after event loop begins
        QTimer.singleShot(100, self._trigger_radioboss_sync)

    def _init_ui(self):
        central_widget = QWidget()
        central_widget.setObjectName("CentralWidget")
        self.setCentralWidget(central_widget)

        root_layout = QVBoxLayout(central_widget)
        root_layout.setContentsMargins(12, 10, 12, 10)
        root_layout.setSpacing(10)

        # === 1. TOP STUDIO RACK STRIP ===
        top_rack = QFrame()
        top_rack.setObjectName("TopRack")
        top_rack.setStyleSheet("""
            QFrame#TopRack {
                background-color: #121216;
                border: 1px solid #1C1C22;
                border-radius: 6px;
                padding: 4px 10px;
            }
        """)
        top_layout = QHBoxLayout(top_rack)
        top_layout.setContentsMargins(8, 4, 8, 4)
        top_layout.setSpacing(12)

        # Brand Title
        lbl_app_logo = QLabel("📻 RADIO CASTER BRIDGE")
        lbl_app_logo.setStyleSheet("font-size: 13px; font-weight: 800; color: #FAFAFA; letter-spacing: 0.8px;")
        top_layout.addWidget(lbl_app_logo)

        lbl_engine_badge = QLabel("NATIVE v1.0")
        lbl_engine_badge.setStyleSheet("""
            background-color: rgba(245, 158, 11, 0.15);
            color: #F59E0B;
            border: 1px solid rgba(245, 158, 11, 0.3);
            border-radius: 4px;
            padding: 2px 6px;
            font-family: 'JetBrains Mono';
            font-size: 10px;
            font-weight: 700;
        """)
        top_layout.addWidget(lbl_engine_badge)

        top_layout.addStretch()

        # Settings Trigger Button
        self.btn_settings = QPushButton("⚙ Pengaturan Studio")
        self.btn_settings.setStyleSheet("""
            QPushButton {
                background-color: #18181D;
                border: 1px solid #272730;
                border-radius: 4px;
                padding: 6px 14px;
                font-size: 11px;
                font-weight: 600;
                color: #FAFAFA;
            }
            QPushButton:hover {
                background-color: #272730;
                border-color: #F59E0B;
            }
        """)
        self.btn_settings.clicked.connect(self._open_settings)
        top_layout.addWidget(self.btn_settings)

        root_layout.addWidget(top_rack)

        # === 2. 3-ZONE SPLITTER WORKBENCH ===
        self.splitter = QSplitter(Qt.Horizontal)
        self.splitter.setHandleWidth(4)
        self.splitter.setStyleSheet("""
            QSplitter::handle {
                background-color: #1C1C22;
            }
            QSplitter::handle:hover {
                background-color: #F59E0B;
            }
        """)

        # Left Zone: Discovery Deck
        self.discovery_deck = DiscoveryWidget()
        self.discovery_deck.setMinimumWidth(320)
        self.splitter.addWidget(self.discovery_deck)

        # Center Zone: Cue Deck (Inspector & Player)
        self.cue_deck = CueDeckWidget()
        self.cue_deck.setMinimumWidth(360)
        self.splitter.addWidget(self.cue_deck)

        # Right Zone: Monitor (On-Air & Live Queue)
        self.monitor = MonitorWidget()
        self.monitor.setMinimumWidth(340)
        self.splitter.addWidget(self.monitor)

        # Initial ratio: 35% Left, 35% Center, 30% Right
        self.splitter.setSizes([450, 470, 420])
        root_layout.addWidget(self.splitter, 1)

        # === 3. BOTTOM STATUS BAR ===
        self.status_bar = QStatusBar()
        self.status_bar.setStyleSheet("""
            QStatusBar {
                background-color: #09090B;
                color: #71717A;
                font-size: 11px;
                border-top: 1px solid #18181D;
            }
        """)
        self.setStatusBar(self.status_bar)

        self.lbl_ram_usage = QLabel("Engine RAM: ~52 MB")
        self.lbl_ram_usage.setStyleSheet("font-family: 'JetBrains Mono'; font-size: 10px; color: #10B981; padding-right: 12px;")
        self.status_bar.addPermanentWidget(self.lbl_ram_usage)

        self.status_bar.showMessage("Siap menyiarkan ke RadioBOSS.")

    def _connect_signals(self):
        """Wire signals across Left, Center, and Right zones."""
        # 1. Left (Discovery) -> Center (Cue Deck): Load Track
        self.discovery_deck.track_selected.connect(self.cue_deck.set_track)
        self.discovery_deck.status_message.connect(self.status_bar.showMessage)

        # 2. Center (Cue Deck) -> Right (Monitor) & Status Bar: Track Queued
        self.cue_deck.track_queued.connect(self.monitor.append_dispatch_log)
        self.cue_deck.track_queued.connect(lambda act, title: self._trigger_radioboss_sync())
        self.cue_deck.status_message.connect(self.status_bar.showMessage)

        # 3. Right (Monitor) -> Status Bar & RadioBOSS Sync
        self.monitor.status_message.connect(self.status_bar.showMessage)
        self.monitor.transport_triggered.connect(lambda act: self._trigger_radioboss_sync())

    def _trigger_radioboss_sync(self):
        """Launch background sync for live status, tabs, and queue."""
        if self._sync_worker and self._sync_worker.isRunning():
            return

        self._sync_worker = RadioBossSyncWorker()
        self._sync_worker.status_updated.connect(self.monitor.update_radioboss_status)
        self._sync_worker.playlist_updated.connect(self.monitor.update_playlist_queue)
        self._sync_worker.tabs_updated.connect(self._on_tabs_synced)
        self._sync_worker.start()

    def _on_tabs_synced(self, available_tabs: list, active_tab: str, active_idx: int, is_synced: bool):
        self.monitor.update_tabs_info(available_tabs, active_tab, active_idx, is_synced)
        self.cue_deck.update_tabs(available_tabs, active_tab)

    def _open_settings(self):
        """Open settings dialog."""
        dlg = SettingsDialog(self)
        dlg.settings_saved.connect(self._trigger_radioboss_sync)
        dlg.exec()

    def closeEvent(self, event):
        """Cleanly stop timers and background threads before closing."""
        self._sync_timer.stop()
        if self._sync_worker and self._sync_worker.isRunning():
            self._sync_worker.wait(1000)
        event.accept()
