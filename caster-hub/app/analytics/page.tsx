import { Navbar } from "@/app/components/Navbar";
import { getAnalyticsData } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const data = await getAnalyticsData().catch(() => null);
  const peakHours = data?.peak_hours || [];
  const genres = data?.genre_distribution || [];
  const leaderboard = data?.leaderboard || [];

  return (
    <div className="min-h-screen flex flex-col justify-between">
      <Navbar currentPath="/analytics" />

      <main className="max-w-7xl mx-auto px-4 py-8 flex-1 w-full space-y-8">
        {/* Title Section */}
        <div className="pb-4 border-b border-borderLine">
          <h1 className="text-xl font-bold text-white tracking-wide">ANALITIK PENYIARAN JARINGAN</h1>
          <p className="text-xs text-zinc-400 mt-1">
            Wawasan agregat pola siaran radio, rotasi genre musik, dan aktivitas stasiun seluruh Indonesia.
          </p>
        </div>

        {/* 1. Peak Broadcast Hours Histogram */}
        <section className="bg-slateDeck border border-borderLine rounded-xl p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                Distribusi Jam Sibuk Siaran (Peak Broadcast Hours)
              </h2>
              <p className="text-xs text-zinc-400">
                Aktivitas penyiaran tertinggi terjadi pada Prime Time Pagi (08:00) dan Santai Sore (16:00).
              </p>
            </div>
            <span className="text-[11px] font-mono text-amberSignal bg-amberSignal/10 border border-amberSignal/20 px-2.5 py-1 rounded">
              Waktu Lokal Stasiun (24 Jam)
            </span>
          </div>

          <div className="pt-4 grid grid-cols-6 sm:grid-cols-12 gap-2 items-end h-44">
            {peakHours.map((item: any, i: number) => {
              const heightPct = Math.max(12, item.weight);
              const isPeak = item.weight >= 80;
              return (
                <div key={i} className="flex flex-col items-center h-full justify-end group">
                  <div className="text-[10px] font-mono text-zinc-400 mb-1 opacity-0 group-hover:opacity-100 transition">
                    {item.weight}%
                  </div>
                  <div
                    style={{ height: `${heightPct}%` }}
                    className={`w-full max-w-[28px] rounded-t transition-all ${
                      isPeak
                        ? "bg-amberSignal shadow-lg shadow-amberSignal/20"
                        : "bg-surfaceControl group-hover:bg-zinc-600 border-t border-zinc-600"
                    }`}
                  />
                  <div className="text-[10px] font-mono text-zinc-500 mt-2 truncate">
                    {item.hour.split(":")[0]}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* 2. Grid: Genre Distribution & Leaderboard */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Genre Distribution */}
          <section className="bg-slateDeck border border-borderLine rounded-xl p-6 space-y-4">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              Pangsa Format & Genre Musik
            </h2>
            <p className="text-xs text-zinc-400">
              Proporsi genre lagu yang paling sering diputar ke RadioBOSS oleh para penyiar.
            </p>

            <div className="space-y-3 pt-2">
              {genres.map((g: any, idx: number) => (
                <div key={idx} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="font-semibold text-zinc-200">{g.genre}</span>
                    <span className="font-mono text-zinc-400">
                      {g.count?.toLocaleString()} rotasi ({g.percentage}%)
                    </span>
                  </div>
                  <div className="h-2 w-full bg-carbon rounded-full overflow-hidden border border-borderLine">
                    <div
                      style={{ width: `${g.percentage}%` }}
                      className={`h-full rounded-full ${
                        idx === 0
                          ? "bg-amberSignal"
                          : idx === 1
                          ? "bg-cyan-400"
                          : idx === 2
                          ? "bg-emerald-400"
                          : "bg-zinc-500"
                      }`}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Broadcaster Leaderboard */}
          <section className="bg-slateDeck border border-borderLine rounded-xl p-6 space-y-4">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              Leaderboard Stasiun Teraktif
            </h2>
            <p className="text-xs text-zinc-400">
              Studio dengan akumulasi jam terbang siaran tertinggi dalam jaringan.
            </p>

            <div className="divide-y divide-borderLine pt-1">
              {leaderboard.map((lb: any) => (
                <div key={lb.rank} className="py-2.5 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`font-mono font-bold text-xs w-5 h-5 flex items-center justify-center rounded ${
                        lb.rank === 1
                          ? "bg-amberSignal text-carbon"
                          : lb.rank === 2
                          ? "bg-zinc-300 text-carbon"
                          : lb.rank === 3
                          ? "bg-amber-800 text-amber-200"
                          : "bg-surfaceControl text-zinc-400"
                      }`}
                    >
                      {lb.rank}
                    </span>
                    <span className="font-bold text-sm text-white truncate">
                      {lb.station_name}
                    </span>
                  </div>

                  <div className="flex items-center gap-4 text-xs font-mono shrink-0">
                    <span className="text-amberSignal font-bold">
                      {lb.total_airtime_hours} Jam
                    </span>
                    <span className="text-zinc-500">
                      {lb.total_songs_played.toLocaleString()} Lagu
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>

      <footer className="border-t border-borderLine bg-slateDeck/50 py-4 text-center text-xs text-zinc-500 font-mono">
        CasterHub Broadcast Intelligence Network &copy; {new Date().getFullYear()} • Zero-PII Anonymous Telemetry
      </footer>
    </div>
  );
}
