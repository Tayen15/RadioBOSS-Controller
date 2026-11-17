import { Navbar } from "@/app/components/Navbar";
import { getChartsData, getNetworkStatsData } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [chartsRes, networkData] = await Promise.all([
    getChartsData("top50", 20).catch(() => null),
    getNetworkStatsData().catch(() => null),
  ]);
  const tracks = chartsRes?.tracks || [];
  const stats = networkData?.stats || {
    total_airtime_hours: 1420.5,
    total_songs_dispatched: 18450,
    total_music_hours: 1140.2,
    total_cache_saved_gb: 92.4,
    active_stations_online: 12,
  };
  const liveTicker = networkData?.live_ticker || [];

  return (
    <div className="min-h-screen flex flex-col justify-between">
      {/* Global Navbar */}
      <Navbar activeStationsOnline={stats.active_stations_online} currentPath="/" />

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 py-8 flex-1 w-full space-y-8">
        {/* Network Metrics Cards */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-slateDeck border border-borderLine rounded-xl p-4">
            <div className="text-[11px] uppercase tracking-wider text-zinc-400 font-semibold mb-1">
              Total Jam Terbang Siaran
            </div>
            <div className="text-2xl font-mono font-bold text-white">
              {stats.total_airtime_hours.toLocaleString()} <span className="text-xs text-amberSignal">Jam</span>
            </div>
            <div className="text-[11px] text-zinc-500 mt-1">Akumulasi penggunaan aplikasi studio</div>
          </div>

          <div className="bg-slateDeck border border-borderLine rounded-xl p-4">
            <div className="text-[11px] uppercase tracking-wider text-zinc-400 font-semibold mb-1">
              Total Lagu Disiarkan
            </div>
            <div className="text-2xl font-mono font-bold text-white">
              {stats.total_songs_dispatched.toLocaleString()} <span className="text-xs text-amberSignal">Track</span>
            </div>
            <div className="text-[11px] text-zinc-500 mt-1">Lagu dikirim ke RadioBOSS</div>
          </div>

          <div className="bg-slateDeck border border-borderLine rounded-xl p-4">
            <div className="text-[11px] uppercase tracking-wider text-zinc-400 font-semibold mb-1">
              Durasi Musik Mengudara
            </div>
            <div className="text-2xl font-mono font-bold text-white">
              {stats.total_music_hours.toLocaleString()} <span className="text-xs text-amberSignal">Jam</span>
            </div>
            <div className="text-[11px] text-zinc-500 mt-1">Waktu tayang audio studio master</div>
          </div>

          <div className="bg-slateDeck border border-borderLine rounded-xl p-4">
            <div className="text-[11px] uppercase tracking-wider text-zinc-400 font-semibold mb-1">
              Hemat Kuota Cache
            </div>
            <div className="text-2xl font-mono font-bold text-white">
              {stats.total_cache_saved_gb.toLocaleString()} <span className="text-xs text-emerald-400">GB</span>
            </div>
            <div className="text-[11px] text-zinc-500 mt-1">Berkat Smart Studio Cache lokal</div>
          </div>
        </section>

        {/* Live Network Ticker */}
        {liveTicker.length > 0 && (
          <section className="bg-carbon border border-borderLine rounded-lg px-4 py-2 flex items-center gap-3 overflow-hidden text-xs">
            <span className="text-red-400 font-mono font-bold shrink-0">ON-AIR PULSE:</span>
            <div className="flex gap-6 truncate text-zinc-300">
              {liveTicker.map((t: any, i: number) => (
                <span key={i} className="inline-flex items-center gap-2">
                  <span className="font-semibold text-white">{t.title}</span>
                  <span className="text-zinc-500">- {t.artist}</span>
                  <span className="text-[10px] text-amberSignal font-mono">({t.time_ago})</span>
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Global Radio Top Charts */}
        <section className="bg-slateDeck border border-borderLine rounded-xl p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-borderLine gap-2">
            <div>
              <h2 className="text-base font-bold text-white">GLOBAL RADIO TOP CHARTS</h2>
              <p className="text-xs text-zinc-400">Peringkat lagu paling banyak disiarkan di seluruh stasiun jaringan Radio Caster.</p>
            </div>
            <div className="flex gap-2 text-xs">
              <span className="bg-amberSignal text-carbon font-bold px-3 py-1 rounded">Top 50 Mingguan</span>
            </div>
          </div>

          <div className="mt-4 divide-y divide-borderLine">
            {tracks.length === 0 ? (
              <div className="py-8 text-center text-zinc-500 text-xs">
                Sedang mengagregasi data pemutaran stasiun...
              </div>
            ) : (
              tracks.map((t: any) => (
                <div key={t.video_id} className="py-3 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <span className="font-mono text-base font-bold text-amberSignal w-6 text-center">
                      {String(t.rank).padStart(2, "0")}
                    </span>
                    <div>
                      <div className="font-bold text-sm text-white">{t.title}</div>
                      <div className="text-xs text-zinc-400">{t.artist} • <span className="text-zinc-500">{t.album}</span></div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-xs font-mono shrink-0">
                    <span className="text-zinc-400">{t.duration_formatted}</span>
                    <span className="bg-control px-2.5 py-1 rounded text-zinc-300 border border-borderLine">
                      {t.total_plays} Pemutaran
                    </span>
                    <span className="bg-emerald-400/10 text-emerald-400 px-2 py-0.5 rounded border border-emerald-400/20 text-[10px]">
                      {t.unique_stations} Stasiun
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </main>

      {/* Footer Bar */}
      <footer className="border-t border-borderLine bg-slateDeck/50 py-4 text-center text-xs text-zinc-500 font-mono">
        CasterHub Broadcast Intelligence Network &copy; {new Date().getFullYear()} • Zero-PII Anonymous Telemetry
      </footer>
    </div>
  );
}
