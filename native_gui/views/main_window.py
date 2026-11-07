"""Main Window: Master 3-Zone Studio Workbench (PySide6 / Qt6 Native)."""
import os
import sys
import logging

from PySide6.QtCore import Qt, QTimer
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
)

from native_gui.views.discovery_widget import DiscoveryWidget
from native_gui.views.cue_deck_widget import CueDeckWidget
from native_gui.views.monitor_widget import MonitorWidget
from native_gui.views.settings_dialog import SettingsDialog
from native_gui.workers import RadioBossSyncWorker

logger = logging.getLogger(__name__)


class MainWindow(QMainWindow):
    """
    Radio Caster Bridge Pure Native Desktop Application:
    - Top Master On-Air Rack Strip (DESIGN.md Zone 1): Console identity, connection status, settings
    - 3-Zone Workbench Splitter:
      1. Discovery Deck (Left, 7 columns)
      2. Cue Deck (Center, channel strip)
      3. Monitor Zone (Right, On-Air LCD & Live Queue)
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
        QTimer.singleShot(100, self._trigger_radioboss_sync)

    def _init_ui(self):
        central_widget = QWidget()
        central_widget.setObjectName("CentralWidget")
        self.setCentralWidget(central_widget)

        root_layout = QVBoxLayout(central_widget)
        root_layout.setContentsMargins(12, 10, 12, 10)
        root_layout.setSpacing(10)

        # === 1. TOP MASTER ON-AIR RACK STRIP (Zone 1) ===
        top_rack = QFrame()
        top_rack.setObjectName("DeckModule")
        top_layout = QHBoxLayout(top_rack)
        top_layout.setContentsMargins(12, 8, 12, 8)
        top_layout.setSpacing(12)

        # Console Identity
        lbl_app_logo = QLabel("RADIO CASTER BRIDGE")
        lbl_app_logo.setObjectName("HeaderTitle")
        top_layout.addWidget(lbl_app_logo)

        lbl_engine_badge = QLabel("STUDIO CONSOLE v1.0")
        lbl_engine_badge.setObjectName("BadgeAmber")
        top_layout.addWidget(lbl_engine_badge)

        top_layout.addStretch()

        # Settings Trigger Button
        self.btn_settings = QPushButton("Pengaturan Studio")
        self.btn_settings.setObjectName("BtnSecondary")
        self.btn_settings.clicked.connect(self._open_settings)
        top_layout.addWidget(self.btn_settings)

        root_layout.addWidget(top_rack)

        # === 2. 3-ZONE SPLITTER WORKBENCH ===
        self.splitter = QSplitter(Qt.Horizontal)
        self.splitter.setHandleWidth(4)

        # Left Zone: Discovery Deck
        self.discovery_deck = DiscoveryWidget()
        self.discovery_deck.setMinimumWidth(340)
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
        self.setStatusBar(self.status_bar)

        self.lbl_airtime_stats = QLabel("Jam Terbang: 0.0j • Sesi: 00j 00m")
        self.lbl_airtime_stats.setObjectName("MonoText")
        self.lbl_airtime_stats.setStyleSheet("color: #F59E0B; padding-right: 14px; font-weight: 700;")
        self.status_bar.addPermanentWidget(self.lbl_airtime_stats)

        self.lbl_ram_usage = QLabel("Memory Footprint: Standby (~50-130 MB)")
        self.lbl_ram_usage.setObjectName("MonoText")
        self.lbl_ram_usage.setStyleSheet("color: #34D399; padding-right: 12px;")
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
        # Update Air-Time display
        try:
            from app.services.telemetry_service import telemetry_service
            stats = telemetry_service.get_session_stats()
            self.lbl_airtime_stats.setText(
                f"Jam Terbang: {stats['lifetime_airtime_hours']}j • Sesi: {stats['session_time_formatted']} ({stats['songs_today']} lagu hari ini)"
            )
        except Exception:
            pass

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
