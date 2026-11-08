import { Navbar } from "@/app/components/Navbar";

async function getStations() {
  try {
    const res = await fetch("http://localhost:3000/api/v1/stations", {
      next: { revalidate: 30 },
    });
    if (!res.ok) return { stations: [], online_count: 0 };
    return await res.json();
  } catch {
    return { stations: [], online_count: 0 };
  }
}

export default async function StationsPage() {
  const data = await getStations();
  const stations = data.stations || [];
  const onlineCount = data.online_count || 0;

  return (
    <div className="min-h-screen flex flex-col justify-between">
      <Navbar activeStationsOnline={onlineCount} currentPath="/stations" />

      <main className="max-w-7xl mx-auto px-4 py-8 flex-1 w-full space-y-6">
        {/* Header Title */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-borderLine gap-2">
          <div>
            <h1 className="text-xl font-bold text-white tracking-wide">DIREKTORI STASIUN RADIO</h1>
            <p className="text-xs text-zinc-400">
              Daftar studio & penyiar yang mengudara dan berkontribusi dalam jaringan CasterHub.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono bg-surfaceControl border border-borderLine px-3 py-1.5 rounded text-zinc-300">
              Total Terdaftar: <strong className="text-white">{stations.length}</strong>
            </span>
            <span className="text-xs font-mono bg-emerald-400/10 border border-emerald-400/20 px-3 py-1.5 rounded text-emerald-400">
              Online: <strong className="text-emerald-300">{onlineCount}</strong>
            </span>
          </div>
        </div>

        {/* Stations Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {stations.length === 0 ? (
            <div className="col-span-full py-12 text-center text-zinc-500 text-xs">
              Belum ada stasiun yang terhubung ke jaringan.
            </div>
          ) : (
            stations.map((st: any) => (
              <div
                key={st.station_hash}
                className={`bg-slateDeck border rounded-xl p-5 flex flex-col justify-between space-y-4 transition ${
                  st.is_online ? "border-amberSignal/30 shadow-lg shadow-amberSignal/5" : "border-borderLine opacity-80"
                }`}
              >
                <div>
                  {/* Top Status Row */}
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span
                      className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded flex items-center gap-1.5 ${
                        st.is_online
                          ? "bg-emerald-400/15 text-emerald-400 border border-emerald-400/30"
                          : "bg-zinc-800 text-zinc-400 border border-zinc-700"
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          st.is_online ? "bg-emerald-400 animate-pulse" : "bg-zinc-500"
                        }`}
                      />
                      {st.is_online ? "ON-AIR SEKARANG" : "OFFLINE / STANDBY"}
                    </span>
                    <span className="text-[10px] font-mono text-zinc-500">v{st.app_version}</span>
                  </div>

                  {/* Station Name */}
                  <h3 className="font-bold text-base text-white tracking-tight truncate">
                    {st.station_name}
                  </h3>
                  <div className="text-[11px] font-mono text-zinc-500 truncate mt-0.5">
                    ID: {st.station_hash}
                  </div>
                </div>

                {/* Now Playing if Online */}
                {st.is_online && st.now_playing ? (
                  <div className="bg-carbon border border-borderLine rounded-lg p-2.5 text-xs">
                    <div className="text-[10px] text-amberSignal font-mono font-semibold flex items-center gap-1">
                      <span>▶ SEDANG MENGUDARA:</span>
                    </div>
                    <div className="font-semibold text-white truncate mt-0.5">
                      {st.now_playing.title}
                    </div>
                    <div className="text-zinc-400 text-[11px] truncate">
                      {st.now_playing.artist || "Studio Music"}
                    </div>
                  </div>
                ) : (
                  <div className="bg-carbon/50 border border-borderLine/50 rounded-lg p-2.5 text-xs text-zinc-500 italic">
                    Studio standby atau tidak ada lagu aktif
                  </div>
                )}

                {/* Stats Footer Grid */}
                <div className="grid grid-cols-3 gap-2 pt-3 border-t border-borderLine text-center font-mono">
                  <div>
                    <div className="text-[10px] text-zinc-400 uppercase">Jam Terbang</div>
                    <div className="text-xs font-bold text-amberSignal mt-0.5">
                      {st.total_airtime_formatted}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-zinc-400 uppercase">Total Lagu</div>
                    <div className="text-xs font-bold text-white mt-0.5">
                      {st.total_songs_played.toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-zinc-400 uppercase">Hemat Cache</div>
                    <div className="text-xs font-bold text-emerald-400 mt-0.5">
                      {st.cache_saved_mb > 1024
                        ? `${(st.cache_saved_mb / 1024).toFixed(1)} GB`
                        : `${st.cache_saved_mb} MB`}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </main>

      <footer className="border-t border-borderLine bg-slateDeck/50 py-4 text-center text-xs text-zinc-500 font-mono">
        CasterHub Broadcast Intelligence Network &copy; {new Date().getFullYear()} • Zero-PII Anonymous Telemetry
      </footer>
    </div>
  );
}
