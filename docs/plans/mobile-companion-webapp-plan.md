# Rancangan Fitur: Mobile Companion WebApp (Post-v1.0.0)

> **Status:** Rancangan / Blueprint (Belum diimplementasikan — dijadwalkan setelah `RCBStudio.exe` mencapai rilis stabil **v1.0.0**).  
> **Target Branch Nanti:** `feat/mobile-companion` (dari `main` v1.0.0).

---

## 1. Tujuan & Prinsip Desain

Memungkinkan penyiar, producer, atau co-host mengontrol dan mengisi lagu ke **Radio Caster Bridge Studio (RCB Studio)** langsung dari smartphone/tablet melalui browser (WebApp / PWA) tanpa perlu menginstall aplikasi native Android/iOS.

### Prinsip Utama
1. **Desktop Tetap Master (Single Source of Truth):**
   - `RCBStudio.exe` di PC studio tetap memegang kendali penuh atas SQLite (`radioboss_caster.db`), Studio Audio Cache, transcoding FFmpeg, koneksi Web Remote API RadioBOSS, dan state antrean.
2. **Zero-Install di Mobile:**
   - Cukup scan **QR Code** di layar Desktop atau buka URL lokal di browser HP (mendukung *Add to Home Screen* sebagai PWA).
3. **Single Pipeline (Desktop ↔ Mobile 100% Tersinkron):**
   - Aksi dari Mobile WebApp (tambah lagu, transport, simpan set) masuk ke jalur `AppCommand` yang sama dengan UI Desktop (`worker.rs`), sehingga tampilan Desktop dan semua HP yang terhubung selalu sinkron secara real-time.
4. **Aman di Jaringan Studio:**
   - Fitur bersifat opt-in (bisa diaktifkan/dimatikan dari Pengaturan Desktop) dan dilindungi Pairing Token / PIN serta pembatasan hak akses (*Full Control* vs *Add-Song Only*).

---

## 2. Arsitektur & Topologi Sinkronisasi

### Memanfaatkan Embedded Axum Server yang Sudah Ada
Saat ini `native_rust/src/services/stream_server.rs` sudah menjalankan HTTP server `axum` di `0.0.0.0:{server_port}` (default port `8000`) untuk `/api/health` dan `/api/stream/{video_id}`.

Dengan arsitektur yang sama, server Axum tersebut diperluas menjadi **Unified Bridge Server**:

```text
+---------------------------------------------------------------+
|                PC Studio: RCBStudio.exe (Master)              |
|                                                               |
|  [egui Desktop UI] <---> [worker.rs / AppCommand & AppEvent]  |
|                                  ^                            |
|                                  | (mpsc + broadcast)         |
|                                  v                            |
|  [Axum Server 0.0.0.0:8000]                                   |
|   ├── /api/stream/{id}.mp3  (Audio Relay ke RadioBOSS)        |
|   ├── /mobile/*             (Embedded Mobile WebApp Assets)   |
|   ├── /api/mobile/ws        (WebSocket Real-Time State Sync)  |
|   └── /api/mobile/*         (REST Actions: Queue, Search, Set)|
+---------------------------------------------------------------+
         ^                                        ^
         | LAN / Studio Wi-Fi                     | Optional Tunnel
         v                                        v
  [HP Penyiar / Producer]                  [Remote Co-Host via VPN]
   http://192.168.x.x:8000/mobile           (Tailscale / ZeroTier)
```

### Mekanisme Sync Real-Time
1. **Shared Snapshot (`Arc<RwLock<MobileStudioSnapshot>>` + `tokio::sync::broadcast`):**
   - Menyimpan ringkasan state terbaru: `now_playing`, `playback_state`, `radioboss_queue`, `active_tab_name`, `radioboss_connected`, `cache_progress`, dan `toast_notifications`.
   - Setiap kali `worker.rs` memproses update dari RadioBOSS atau aksi user, snapshot diperbarui dan event diff/snapshot di-broadcast ke semua WebSocket client (`/api/mobile/ws`).
2. **Command Forwarding (`mpsc::Sender<AppCommand>`):**
   - Endpoint REST/WS di `stream_server.rs` meneruskan aksi mobile langsung ke `AppCommand` (mis. `QueueTrack`, `TransportAction`, `SearchTracks`, `AddTrackToSet`) sehingga logika Anti-Repeat Guard, tab sync RadioBOSS, dan logging riwayat tetap berjalan konsisten.

---

## 3. Fitur Mobile WebApp (Mobile-First UI)

Desain antarmuka mengikuti tema **Dark Studio (Pitch Black + Amber Accent)** agar nyaman dilihat di ruang siaran redup, dengan navigasi **4 tab di bagian bawah layar (Bottom Bar)**:

| Tab Mobile | Fungsi Utama | Detail Interaksi |
| :--- | :--- | :--- |
| **1. On-Air** | Monitor & Transport | Menampilkan lagu sedang tayang (*Artis - Judul*), progress bar real-time, status koneksi RadioBOSS, serta tombol **Putar**, **Jeda**, **Lewati**, dan **Stop** (dengan dialog konfirmasi agar tidak salah pencet). |
| **2. Cari & Tambah** | Pencarian & Add Song | Search bar YouTube Music (`ytmusic_service`), preview audio singkat langsung di speaker HP, dan tombol **Putar Berikutnya** / **Antrean** / **+Set** yang otomatis masuk ke tab aktif RadioBOSS. |
| **3. Antrean & Set** | Queue & Playlist Sets | Melihat daftar antrean RadioBOSS live, mengakses **Koleksi Set Playlist** dari SQLite desktop untuk langsung mengantrekan lagu, serta melihat daftar **Rekomendasi**. |
| **4. Cue & Lirik** | Lembar Penyiar (Mic View) | Menampilkan *Naskah Intro*, *Naskah Outro/Backsell*, *Kutipan Lirik*, dan *Timing Cue* lagu yang sedang diputar atau dipilih — sangat praktis ditaruh di stand HP/tablet depan mic. |

---

## 4. Keamanan & Manajemen Akses

Karena server mendengarkan di jaringan lokal (`0.0.0.0`), diperlukan pengaman agar orang iseng di Wi-Fi yang sama tidak bisa mengganggu siaran:

1. **Opt-In Toggle:**
   - Pengaturan baru di Desktop: **Aktifkan Mobile Remote WebApp** (default: nonaktif sampai dinyalakan user).
2. **Pairing PIN / Bearer Token:**
   - Desktop menghasilkan token sesi / PIN 6 digit.
   - Scan **QR Code** dari Desktop otomatis membuka URL `http://<LAN-IP>:<port>/mobile?token=<TOKEN>` dan menyimpannya di `localStorage` browser HP.
   - Tombol **"Reset Token / Putus Semua Perangkat"** di Desktop untuk mencabut akses HP yang sudah tidak bertugas.
3. **Mode Hak Akses (Role):**
   - **Full Control:** Bisa transport (Putar/Jeda/Lewati/Stop), cari & tambah lagu, kelola set.
   - **Producer / Add-Song Only:** Hanya bisa cari & tambah lagu ke antrean, lihat antrean, dan baca Cue/Lirik (tombol Stop/Skip dinonaktifkan).

---

## 5. Strategi Packaging (Zero Extra Runtime)

Agar `RCBStudio.exe` tetap berupa **single standalone binary** tanpa ketergantungan Node.js atau file eksternal terpisah:
- Frontend Mobile WebApp dibangun sebagai bundle statis ultra-ringan (HTML + CSS + JS minimal, atau Preact + Vite build single-file) lalu di-embed langsung ke dalam binary Rust menggunakan `include_str!` / `include_bytes!` (atau crate `rust-embed`).
- Disertakan `manifest.json` + service worker minimal agar di HP Android/iOS bisa di-pin ke Home Screen (**Install App / PWA**).

---

## 6. Roadmap Implementasi (Setelah Rilis v1.0.0)

- **Fase M1 — Backend Sync & Auth (`native_rust`):**
  - Perluas `StreamServerState` di `stream_server.rs` dengan `cmd_tx: mpsc::Sender<AppCommand>`, `MobileSnapshot` broadcaster, dan middleware validasi token/PIN.
  - Tambah route `/api/mobile/ws`, `/api/mobile/search`, `/api/mobile/queue`, `/api/mobile/transport`, `/api/mobile/sets`, dan `/api/mobile/cue`.
- **Fase M2 — Mobile WebApp UI & PWA:**
  - Buat aset mobile responsive (`mobile_ui/`) dengan 4 tab utama, auto-reconnect WebSocket saat layar HP mati/nyala kembali, dan feedback toast sinkronisasi.
- **Fase M3 — Desktop Pairing Panel:**
  - Tambah panel/dialog **"Mobile Remote"** di Desktop UI yang menampilkan **QR Code**, alamat IP LAN aktif, daftar perangkat terhubung, pilihan mode (*Full* / *Add-Song Only*), dan tombol *Disconnect All*.
- **Fase M4 — Pengujian Lapangan:**
  - Uji sinkronisasi multi-perangkat (Desktop + 2 HP bersamaan), uji Anti-Repeat Guard dari Mobile, dan dokumentasikan panduan buka port Windows Firewall jika dibutuhkan di jaringan studio.
