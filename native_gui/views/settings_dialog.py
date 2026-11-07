"""Settings Dialog: 4-Tab studio configuration (Connection, Audio & Engine, Storage, System Info)."""
import os
import shutil
import logging
from PySide6.QtCore import Qt, Signal, QThread
from PySide6.QtWidgets import (
    QDialog,
    QVBoxLayout,
    QHBoxLayout,
    QTabWidget,
    QWidget,
    QLabel,
    QLineEdit,
    QPushButton,
    QCheckBox,
    QComboBox,
    QProgressBar,
    QFileDialog,
    QFrame,
    QMessageBox,
)

from app.services.settings_service import settings_service, AppConfig
from app.services.radioboss_service import radioboss_service
from app.services.system_service import system_service
from app.services.cache_service import cache_service

logger = logging.getLogger(__name__)


class PingTestThread(QThread):
    """Background test for RadioBOSS connection."""
    result = Signal(bool, str)

    def __init__(self, host: str, port: int, password: str):
        super().__init__()
        self.host = host
        self.port = port
        self.password = password

    def run(self):
        import asyncio
        from app.services.radioboss_service import RadioBOSSService

        async def _test():
            service = RadioBOSSService()
            # Temporarily test with candidate parameters
            saved_host, saved_port, saved_pw = service.host, service.port, service.password
            service.host = self.host
            service.port = self.port
            service.password = self.password
            try:
                res = await service.check_status()
                return res.connected, res.message or "Terhubung"
            finally:
                service.host, service.port, service.password = saved_host, saved_port, saved_pw

        try:
            ok, msg = asyncio.run(_test())
            self.result.emit(ok, msg)
        except Exception as e:
            self.result.emit(False, str(e))


class SettingsDialog(QDialog):
    """
    Settings Dialog:
    - Tab 1: Koneksi RadioBOSS (Host, Port, Password, Tes Koneksi)
    - Tab 2: Audio & Optimasi Spek (Mode Ringan / Mode Studio High, Loudnorm, Bitrate)
    - Tab 3: Penyimpanan Cache (Lokasi cache, penggunaan disk, bersihkan cache)
    - Tab 4: Sistem & Pembaruan (Spesifikasi PC, Versi v1.0.0 Native)
    """
    settings_saved = Signal()

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("Pengaturan Studio Radio - Radio Caster Native")
        self.setMinimumSize(540, 480)
        self.setModal(True)
        self._ping_worker = None
        self._init_ui()
        self._load_current_settings()

    def _init_ui(self):
        main_layout = QVBoxLayout(self)
        main_layout.setContentsMargins(16, 16, 16, 16)
        main_layout.setSpacing(14)

        # Tab Widget
        self.tabs = QTabWidget()
        self.tabs.setStyleSheet("""
            QTabWidget::pane {
                background-color: #121216;
                border: 1px solid #1C1C22;
                border-radius: 6px;
            }
            QTabBar::tab {
                background-color: #18181D;
                color: #71717A;
                padding: 8px 16px;
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

        # Tab 1: Koneksi
        self.tab_conn = QWidget()
        self._setup_connection_tab()
        self.tabs.addTab(self.tab_conn, "Koneksi RadioBOSS")

        # Tab 2: Audio & Rekomendasi Spek
        self.tab_audio = QWidget()
        self._setup_audio_tab()
        self.tabs.addTab(self.tab_audio, "Audio & Rekomendasi Spek")

        # Tab 3: Penyimpanan
        self.tab_storage = QWidget()
        self._setup_storage_tab()
        self.tabs.addTab(self.tab_storage, "Penyimpanan Cache")

        # Tab 4: Info Sistem
        self.tab_system = QWidget()
        self._setup_system_tab()
        self.tabs.addTab(self.tab_system, "Tentang & Sistem")

        # Tab 5: CasterHub Cloud
        self.tab_cloud = QWidget()
        self._setup_cloud_tab()
        self.tabs.addTab(self.tab_cloud, "CasterHub Cloud")

        main_layout.addWidget(self.tabs, 1)

        # Action Buttons (Simpan / Batal)
        btn_box = QHBoxLayout()
        btn_box.setSpacing(10)
        btn_box.addStretch()

        self.btn_cancel = QPushButton("Batal")
        self.btn_cancel.setStyleSheet("""
            QPushButton {
                background-color: #18181D;
                border: 1px solid #272730;
                border-radius: 4px;
                padding: 6px 16px;
                font-size: 11px;
                font-weight: 600;
                color: #A1A1AA;
            }
            QPushButton:hover {
                background-color: #272730;
                color: #FAFAFA;
            }
        """)
        self.btn_cancel.clicked.connect(self.reject)
        btn_box.addWidget(self.btn_cancel)

        self.btn_save = QPushButton("Simpan Pengaturan")
        self.btn_save.setStyleSheet("""
            QPushButton {
                background-color: #F59E0B;
                border: 1px solid #D97706;
                border-radius: 4px;
                padding: 6px 18px;
                font-size: 11px;
                font-weight: 700;
                color: #09090B;
            }
            QPushButton:hover {
                background-color: #FBBF24;
            }
        """)
        self.btn_save.clicked.connect(self._save_settings)
        btn_box.addWidget(self.btn_save)

        main_layout.addLayout(btn_box)

    def _setup_connection_tab(self):
        layout = QVBoxLayout(self.tab_conn)
        layout.setContentsMargins(14, 14, 14, 14)
        layout.setSpacing(12)

        lbl_desc = QLabel("Pengaturan koneksi API RadioBOSS (Options -> General -> Enable API).")
        lbl_desc.setStyleSheet("font-size: 11px; color: #71717A;")
        layout.addWidget(lbl_desc)

        # Host
        lbl_host = QLabel("Host / IP Address:")
        lbl_host.setStyleSheet("font-size: 11px; font-weight: 600; color: #FAFAFA;")
        layout.addWidget(lbl_host)

        self.txt_host = QLineEdit()
        self.txt_host.setPlaceholderText("http://127.0.0.1")
        layout.addWidget(self.txt_host)

        # Port
        lbl_port = QLabel("API Port:")
        lbl_port.setStyleSheet("font-size: 11px; font-weight: 600; color: #FAFAFA;")
        layout.addWidget(lbl_port)

        self.txt_port = QLineEdit()
        self.txt_port.setPlaceholderText("9000")
        layout.addWidget(self.txt_port)

        # Password
        lbl_pw = QLabel("API Password (Wajib jika diset di RadioBOSS):")
        lbl_pw.setStyleSheet("font-size: 11px; font-weight: 600; color: #FAFAFA;")
        layout.addWidget(lbl_pw)

        self.txt_password = QLineEdit()
        self.txt_password.setEchoMode(QLineEdit.Password)
        self.txt_password.setPlaceholderText("Biarkan kosong jika tanpa password")
        layout.addWidget(self.txt_password)

        # Ping Test Button & Result
        ping_row = QHBoxLayout()
        self.btn_ping = QPushButton("⚡ Uji Koneksi RadioBOSS")
        self.btn_ping.setStyleSheet("""
            QPushButton {
                background-color: #1C1C22;
                border: 1px solid #272730;
                border-radius: 4px;
                padding: 6px 12px;
                font-size: 11px;
                font-weight: 600;
                color: #FAFAFA;
            }
            QPushButton:hover {
                background-color: #272730;
            }
        """)
        self.btn_ping.clicked.connect(self._test_connection)
        ping_row.addWidget(self.btn_ping)

        self.lbl_ping_result = QLabel("")
        self.lbl_ping_result.setStyleSheet("font-size: 11px; font-weight: 600;")
        ping_row.addWidget(self.lbl_ping_result, 1)
        layout.addLayout(ping_row)

        layout.addStretch()

    def _setup_audio_tab(self):
        layout = QVBoxLayout(self.tab_audio)
        layout.setContentsMargins(14, 14, 14, 14)
        layout.setSpacing(12)

        # Hardware Spec Recommendation Banner
        spec = system_service.get_system_spec()
        self.spec_card = QFrame()
        self.spec_card.setStyleSheet("""
            QFrame {
                background-color: #18181D;
                border: 1px solid #272730;
                border-radius: 6px;
                padding: 10px;
            }
        """)
        s_layout = QVBoxLayout(self.spec_card)
        s_layout.setContentsMargins(10, 8, 10, 8)
        s_layout.setSpacing(4)

        tier_label = "Mode Standar (Low-Spec)" if spec.get("is_low_spec") else "Mode Studio High"
        cpu_info = f"{spec.get('cpu_cores', 2)} Cores"
        lbl_spec_title = QLabel(f"Deteksi Perangkat: {tier_label} ({cpu_info})")
        lbl_spec_title.setStyleSheet("font-family: 'JetBrains Mono'; font-size: 11px; font-weight: 700; color: #F59E0B;")
        s_layout.addWidget(lbl_spec_title)

        lbl_spec_rec = QLabel(f"Rekomendasi: {spec.get('reason', '')}")
        lbl_spec_rec.setStyleSheet("font-size: 11px; color: #A1A1AA;")
        lbl_spec_rec.setWordWrap(True)
        s_layout.addWidget(lbl_spec_rec)

        layout.addWidget(self.spec_card)

        # Bitrate Selector
        lbl_bitrate = QLabel("Kualitas Bitrate Audio Cache:")
        lbl_bitrate.setStyleSheet("font-size: 11px; font-weight: 600; color: #FAFAFA;")
        layout.addWidget(lbl_bitrate)

        self.cmb_bitrate = QComboBox()
        self.cmb_bitrate.addItems(["128k (Hemat CPU & RAM)", "192k (Standard)", "256k (Tinggi)", "320k (Studio Master)"])
        layout.addWidget(self.cmb_bitrate)

        # Loudnorm Toggle (EBU R128)
        self.chk_loudnorm = QCheckBox("Aktifkan EBU R128 Loudness Normalization (-14 LUFS)")
        self.chk_loudnorm.setStyleSheet("font-size: 11px; color: #FAFAFA;")
        self.chk_loudnorm.setToolTip(
            "Menyelaraskan volume suara antar lagu secara otomatis. Nonaktifkan pada PC spek rendah untuk mempercepat proses."
        )
        layout.addWidget(self.chk_loudnorm)

        # Quick Profile Buttons
        preset_row = QHBoxLayout()
        self.btn_preset_low = QPushButton("⚡ Mode Ringan (Low-Spec)")
        self.btn_preset_low.setStyleSheet("""
            QPushButton {
                background-color: #18181D;
                border: 1px solid #272730;
                border-radius: 4px;
                padding: 6px 12px;
                font-size: 11px;
                color: #A1A1AA;
            }
            QPushButton:hover {
                border-color: #10B981;
                color: #10B981;
            }
        """)
        self.btn_preset_low.clicked.connect(self._apply_low_spec_preset)
        preset_row.addWidget(self.btn_preset_low)

        self.btn_preset_high = QPushButton("🚀 Mode Studio High")
        self.btn_preset_high.setStyleSheet("""
            QPushButton {
                background-color: #18181D;
                border: 1px solid #272730;
                border-radius: 4px;
                padding: 6px 12px;
                font-size: 11px;
                color: #A1A1AA;
            }
            QPushButton:hover {
                border-color: #F59E0B;
                color: #F59E0B;
            }
        """)
        self.btn_preset_high.clicked.connect(self._apply_high_spec_preset)
        preset_row.addWidget(self.btn_preset_high)

        layout.addLayout(preset_row)
        layout.addStretch()

    def _setup_storage_tab(self):
        layout = QVBoxLayout(self.tab_storage)
        layout.setContentsMargins(14, 14, 14, 14)
        layout.setSpacing(12)

        lbl_dir = QLabel("Direktori Cache Studio MP3:")
        lbl_dir.setStyleSheet("font-size: 11px; font-weight: 600; color: #FAFAFA;")
        layout.addWidget(lbl_dir)

        dir_row = QHBoxLayout()
        self.txt_cache_dir = QLineEdit()
        self.txt_cache_dir.setReadOnly(True)
        dir_row.addWidget(self.txt_cache_dir, 1)

        self.btn_browse = QPushButton("Pilih Folder...")
        self.btn_browse.setStyleSheet("""
            QPushButton {
                background-color: #1C1C22;
                border: 1px solid #272730;
                border-radius: 4px;
                padding: 5px 12px;
                font-size: 11px;
                color: #FAFAFA;
            }
        """)
        self.btn_browse.clicked.connect(self._browse_cache_dir)
        dir_row.addWidget(self.btn_browse)
        layout.addLayout(dir_row)

        # Storage usage info
        self.lbl_storage_info = QLabel("Menghitung ukuran cache...")
        self.lbl_storage_info.setStyleSheet("font-size: 11px; color: #71717A;")
        layout.addWidget(self.lbl_storage_info)

        # Clear Cache Button
        self.btn_clear_cache = QPushButton("🗑 Bersihkan Semua File Cache")
        self.btn_clear_cache.setStyleSheet("""
            QPushButton {
                background-color: rgba(239, 68, 68, 0.15);
                border: 1px solid rgba(239, 68, 68, 0.3);
                border-radius: 4px;
                padding: 6px 14px;
                font-size: 11px;
                font-weight: 600;
                color: #EF4444;
            }
            QPushButton:hover {
                background-color: rgba(239, 68, 68, 0.25);
            }
        """)
        self.btn_clear_cache.clicked.connect(self._clear_cache)
        layout.addWidget(self.btn_clear_cache)

        layout.addStretch()

    def _setup_system_tab(self):
        layout = QVBoxLayout(self.tab_system)
        layout.setContentsMargins(14, 14, 14, 14)
        layout.setSpacing(10)

        spec = system_service.get_system_spec()

        items = [
            ("Aplikasi", "Radio Caster Bridge (Pure Native Desktop)"),
            ("Versi", "v1.0.0-native (PySide6 / Qt6 Engine)"),
            ("RAM Penggunaan", "~45-65 MB (80% lebih hemat dari WebView2)"),
            ("Sistem Operasi", spec.get("os_name", "Windows")),
            ("Prosesor (CPU)", f"{spec.get('cpu_cores', 2)} Core CPU"),
            ("RAM Terdeteksi", f"{spec.get('ram_gb', 8.0)} GB"),
            ("Status Arsitektur", "Native C++/Python Playout Engine (No WebView)"),
        ]

        for k, v in items:
            row = QHBoxLayout()
            lbl_k = QLabel(f"{k}:")
            lbl_k.setFixedWidth(130)
            lbl_k.setStyleSheet("font-size: 11px; font-weight: 700; color: #71717A;")
            row.addWidget(lbl_k)

            lbl_v = QLabel(v)
            lbl_v.setStyleSheet("font-family: 'JetBrains Mono'; font-size: 11px; color: #FAFAFA;")
            row.addWidget(lbl_v, 1)
            layout.addLayout(row)

        layout.addStretch()

    def _setup_cloud_tab(self):
        layout = QVBoxLayout(self.tab_cloud)
        layout.setContentsMargins(14, 14, 14, 14)
        layout.setSpacing(12)

        lbl_desc = QLabel("Pengaturan koneksi server pusat CasterHub untuk Global Charts dan Telemetri Anonim.")
        lbl_desc.setStyleSheet("font-size: 11px; color: #71717A;")
        layout.addWidget(lbl_desc)

        # CasterHub URL
        lbl_hub = QLabel("CasterHub Server Endpoint:")
        lbl_hub.setStyleSheet("font-size: 11px; font-weight: 600; color: #FAFAFA;")
        layout.addWidget(lbl_hub)

        self.txt_hub_url = QLineEdit()
        self.txt_hub_url.setPlaceholderText("http://localhost:3000 atau https://casterhub.vercel.app")
        layout.addWidget(self.txt_hub_url)

        # Telemetry Opt-in checkbox
        self.chk_telemetry = QCheckBox("Aktifkan Pengiriman Statistik Anonim (Zero-PII)")
        self.chk_telemetry.setStyleSheet("font-size: 11px; color: #FAFAFA;")
        self.chk_telemetry.setToolTip("Mengirimkan jumlah pemutaran lagu anonim (SHA-256) untuk diagregasi ke Global Radio Charts.")
        layout.addWidget(self.chk_telemetry)

        # Station info banner
        from app.services.telemetry_service import telemetry_service
        stats = telemetry_service.get_session_stats()
        info_frame = QFrame()
        info_frame.setStyleSheet("background-color: #18181D; border: 1px solid #272730; border-radius: 6px; padding: 10px;")
        inf_l = QVBoxLayout(info_frame)
        lbl_stn_id = QLabel(f"Station ID Hash: {telemetry_service.station_hash[:16]}...")
        lbl_stn_id.setStyleSheet("font-family: 'JetBrains Mono'; font-size: 10px; color: #F59E0B;")
        inf_l.addWidget(lbl_stn_id)

        lbl_stn_air = QLabel(f"Akumulasi Jam Terbang Siaran: {stats['lifetime_airtime_hours']} Jam")
        lbl_stn_air.setStyleSheet("font-size: 11px; color: #A1A1AA;")
        inf_l.addWidget(lbl_stn_air)
        layout.addWidget(info_frame)

        layout.addStretch()

    def _load_current_settings(self):
        cfg = settings_service.get_config()
        self.txt_host.setText(cfg.radioboss_host or "http://127.0.0.1")
        self.txt_port.setText(str(cfg.radioboss_port or 9000))
        self.txt_password.setText(cfg.radioboss_password or "")

        self.chk_loudnorm.setChecked(cfg.enable_loudnorm)

        bitrate = cfg.audio_quality or "320k"
        for i in range(self.cmb_bitrate.count()):
            if bitrate in self.cmb_bitrate.itemText(i):
                self.cmb_bitrate.setCurrentIndex(i)
                break

        # Cache dir
        cache_dir = cache_service.get_cache_dir()
        self.txt_cache_dir.setText(str(cache_dir))
        self._update_storage_usage()

        # Cloud settings
        self.txt_hub_url.setText(cfg.casterhub_url or "http://localhost:3000")
        self.chk_telemetry.setChecked(cfg.enable_telemetry)

    def _update_storage_usage(self):
        try:
            cache_dir = cache_service.get_cache_dir()
            if os.path.exists(cache_dir):
                total_bytes = sum(
                    os.path.getsize(os.path.join(cache_dir, f))
                    for f in os.listdir(cache_dir)
                    if os.path.isfile(os.path.join(cache_dir, f))
                )
                file_count = len([f for f in os.listdir(cache_dir) if os.path.isfile(os.path.join(cache_dir, f))])
                mb = total_bytes / (1024 * 1024)
                self.lbl_storage_info.setText(f"Total File: {file_count} lagu ({mb:.1f} MB terpakai)")
            else:
                self.lbl_storage_info.setText("Folder cache belum memiliki file tersimpan.")
        except Exception:
            self.lbl_storage_info.setText("Tidak dapat membaca ukuran folder cache.")

    def _browse_cache_dir(self):
        chosen = QFileDialog.getExistingDirectory(self, "Pilih Folder Cache", self.txt_cache_dir.text())
        if chosen:
            self.txt_cache_dir.setText(chosen)

    def _clear_cache(self):
        reply = QMessageBox.question(
            self,
            "Konfirmasi Hapus Cache",
            "Apakah Anda yakin ingin menghapus seluruh lagu hasil unduhan cache lokal?",
            QMessageBox.Yes | QMessageBox.No,
        )
        if reply == QMessageBox.Yes:
            try:
                cache_dir = cache_service.get_cache_dir()
                if os.path.exists(cache_dir):
                    for f in os.listdir(cache_dir):
                        p = os.path.join(cache_dir, f)
                        if os.path.isfile(p):
                            os.remove(p)
                self._update_storage_usage()
                QMessageBox.information(self, "Sukses", "Semua file cache audio berhasil dibersihkan.")
            except Exception as e:
                QMessageBox.warning(self, "Error", f"Gagal membersihkan cache: {e}")

    def _apply_low_spec_preset(self):
        self.cmb_bitrate.setCurrentIndex(0)  # 128k
        self.chk_loudnorm.setChecked(False)  # Turn off loudnorm
        QMessageBox.information(
            self,
            "Mode Ringan Diterapkan",
            "Bitrate disetel ke 128k dan Normalisasi Suara dimatikan untuk performa maksimal pada PC siaran spek rendah.",
        )

    def _apply_high_spec_preset(self):
        self.cmb_bitrate.setCurrentIndex(3)  # 320k
        self.chk_loudnorm.setChecked(True)   # Turn on loudnorm
        QMessageBox.information(
            self,
            "Mode Studio High Diterapkan",
            "Bitrate disetel ke 320k Studio Master dan EBU R128 loudness normalization diaktifkan.",
        )

    def _test_connection(self):
        host = self.txt_host.text().strip()
        port = int(self.txt_port.text().strip() or "9000")
        password = self.txt_password.text().strip()

        self.lbl_ping_result.setText("Menghubungi...")
        self.lbl_ping_result.setStyleSheet("color: #F59E0B;")

        self._ping_worker = PingTestThread(host, port, password)
        self._ping_worker.result.connect(self._on_ping_result)
        self._ping_worker.start()

    def _on_ping_result(self, ok: bool, msg: str):
        if ok:
            self.lbl_ping_result.setText("✓ Terhubung ke RadioBOSS")
            self.lbl_ping_result.setStyleSheet("color: #10B981; font-weight: 700;")
        else:
            self.lbl_ping_result.setText(f"✕ Gagal: {msg}")
            self.lbl_ping_result.setStyleSheet("color: #EF4444; font-weight: 700;")

    def _save_settings(self):
        try:
            cfg = settings_service.get_config()
            cfg.radioboss_host = self.txt_host.text().strip()
            cfg.radioboss_port = int(self.txt_port.text().strip() or "9000")
            cfg.radioboss_password = self.txt_password.text().strip()
            cfg.enable_loudnorm = self.chk_loudnorm.isChecked()

            sel_bitrate = self.cmb_bitrate.currentText().split()[0]
            cfg.audio_quality = sel_bitrate

            new_cache = self.txt_cache_dir.text().strip()
            if new_cache and new_cache != str(cache_service.get_cache_dir()):
                cfg.custom_cache_dir = new_cache

            cfg.casterhub_url = self.txt_hub_url.text().strip()
            cfg.enable_telemetry = self.chk_telemetry.isChecked()

            settings_service.update_config(cfg)

            # Update live radioboss service instance
            radioboss_service.host = cfg.radioboss_host
            radioboss_service.port = cfg.radioboss_port
            radioboss_service.password = cfg.radioboss_password

            self.settings_saved.emit()
            self.accept()
        except Exception as e:
            QMessageBox.warning(self, "Gagal Menyimpan", f"Error menyimpan pengaturan: {e}")
