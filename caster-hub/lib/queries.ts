import { getDb } from "@/lib/mongodb";

export interface ChartTrack {
  rank: number;
  video_id: string;
  title: string;
  artist: string;
  album: string;
  genre: string;
  duration_formatted: string;
  total_plays: number;
  unique_stations: number;
  movement: string;
}

export interface NetworkStatsResult {
  success: boolean;
  mock_mode?: boolean;
  stats: {
    total_airtime_hours: number;
    total_songs_dispatched: number;
    total_music_hours: number;
    total_cache_saved_gb: number;
    active_stations_online: number;
  };
  live_ticker: Array<{
    title: string;
    artist: string;
    time_ago: string;
  }>;
}

export interface StationItem {
  station_hash: string;
  station_name: string;
  is_custom_name: boolean;
  public_stream_url: string;
  enable_online_requests: boolean;
  app_version: string;
  total_airtime_seconds: number;
  total_airtime_formatted: string;
  total_songs_played: number;
  cache_saved_mb: number;
  is_online: boolean;
  last_seen_at: string;
  now_playing: {
    video_id?: string;
    title?: string;
    artist?: string;
    duration?: string;
  } | null;
}

function formatAirtime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}j ${m}m`;
}

export async function getChartsData(
  category: string = "top50",
  limit: number = 50
): Promise<{
  success: boolean;
  category: string;
  total: number;
  tracks: ChartTrack[];
  source: string;
}> {
  const safeLimit = Math.min(Math.max(limit, 1), 100);
  const db = await getDb();

  if (!db) {
    const mockTracks: ChartTrack[] = [
      {
        rank: 1,
        video_id: "k1BfsO0mxWQ",
        title: "Dan...",
        artist: "Sheila On 7",
        album: "Sheila On 7",
        genre: "Pop",
        duration_formatted: "04:49",
        total_plays: 142,
        unique_stations: 28,
        movement: "NEW",
      },
      {
        rank: 2,
        video_id: "7q6B6J8lT3s",
        title: "Hati-Hati di Jalan",
        artist: "Tulus",
        album: "Manusia",
        genre: "Pop",
        duration_formatted: "04:02",
        total_plays: 128,
        unique_stations: 24,
        movement: "+2",
      },
      {
        rank: 3,
        video_id: "0a1b2c3d4e",
        title: "Sial",
        artist: "Mahalini",
        album: "FABULA",
        genre: "Pop",
        duration_formatted: "04:03",
        total_plays: 110,
        unique_stations: 19,
        movement: "-1",
      },
    ];

    return {
      success: true,
      category,
      total: mockTracks.length,
      tracks: mockTracks,
      source: "mock_fallback",
    };
  }

  const eventsCol = db.collection("airplay_events");
  const now = new Date();
  let matchStage: Record<string, unknown> = {};

  if (category === "trending") {
    const fortyEightHoursAgo = new Date(now.getTime() - 48 * 3600 * 1000);
    matchStage = { created_at: { $gte: fortyEightHoursAgo } };
  } else if (["morning", "afternoon", "night"].includes(category)) {
    matchStage = { time_belt: category };
  } else {
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
    matchStage = { created_at: { $gte: sevenDaysAgo } };
  }

  const pipeline = [
    { $match: matchStage },
    {
      $group: {
        _id: "$video_id",
        total_plays: { $sum: 1 },
        stations: { $addToSet: "$station_hash" },
        title: { $first: "$title" },
        artist: { $first: "$artist" },
        album: { $first: "$album" },
        genre: { $first: "$genre" },
        duration_seconds: { $first: "$duration_seconds" },
      },
    },
    {
      $project: {
        video_id: "$_id",
        title: 1,
        artist: 1,
        album: 1,
        genre: 1,
        duration_seconds: 1,
        total_plays: 1,
        unique_stations: { $size: "$stations" },
      },
    },
    { $sort: { total_plays: -1, unique_stations: -1 } },
    { $limit: safeLimit },
  ];

  const results = await eventsCol.aggregate(pipeline).toArray();
  const formattedTracks: ChartTrack[] = results.map((t, idx) => {
    const durSec = typeof t.duration_seconds === "number" ? t.duration_seconds : 0;
    const m = Math.floor(durSec / 60);
    const s = durSec % 60;
    return {
      rank: idx + 1,
      video_id: String(t.video_id || ""),
      title: String(t.title || "Unknown Title"),
      artist: String(t.artist || "Unknown Artist"),
      album: String(t.album || "Single"),
      genre: String(t.genre || "Pop"),
      duration_formatted: `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`,
      total_plays: Number(t.total_plays || 0),
      unique_stations: Number(t.unique_stations || 0),
      movement: idx === 0 ? "STABLE" : "+1",
    };
  });

  return {
    success: true,
    category,
    total: formattedTracks.length,
    tracks: formattedTracks,
    source: "live_database",
  };
}

export async function getNetworkStatsData(): Promise<NetworkStatsResult> {
  const db = await getDb();

  if (!db) {
    return {
      success: true,
      mock_mode: true,
      stats: {
        total_airtime_hours: 1420.5,
        total_songs_dispatched: 18450,
        total_music_hours: 1140.2,
        total_cache_saved_gb: 92.4,
        active_stations_online: 12,
      },
      live_ticker: [
        { title: "Dan...", artist: "Sheila On 7", time_ago: "2m lalu" },
        { title: "Hati-Hati di Jalan", artist: "Tulus", time_ago: "5m lalu" },
        { title: "Sial", artist: "Mahalini", time_ago: "9m lalu" },
      ],
    };
  }

  const stationsCol = db.collection("stations_pulse");
  const eventsCol = db.collection("airplay_events");

  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
  const activeStationsCount = await stationsCol.countDocuments({
    $or: [
      { last_seen_at: { $gte: tenMinutesAgo } },
      { last_seen_at: { $gte: tenMinutesAgo.toISOString() } },
    ],
  });

  const totalsAgg = await stationsCol
    .aggregate([
      {
        $group: {
          _id: null,
          total_airtime_seconds: { $sum: "$total_airtime_seconds" },
          total_songs_played: { $sum: "$total_songs_played" },
          total_music_duration_seconds: { $sum: "$total_music_duration_seconds" },
          total_cache_saved_bytes: { $sum: "$cache_saved_bytes" },
        },
      },
    ])
    .toArray();

  const totals = totalsAgg[0] || {
    total_airtime_seconds: 0,
    total_songs_played: 0,
    total_music_duration_seconds: 0,
    total_cache_saved_bytes: 0,
  };

  const recentEvents = await eventsCol.find({}).sort({ created_at: -1 }).limit(8).toArray();
  const now = Date.now();
  const liveTicker = recentEvents.map((e) => {
    const diffMin = Math.max(1, Math.floor((now - new Date(e.created_at).getTime()) / 60000));
    return {
      title: String(e.title || "Unknown Title"),
      artist: String(e.artist || "Unknown Artist"),
      time_ago: `${diffMin}m lalu`,
    };
  });

  return {
    success: true,
    stats: {
      total_airtime_hours: +(Number(totals.total_airtime_seconds || 0) / 3600).toFixed(1),
      total_songs_dispatched: Number(totals.total_songs_played || 0),
      total_music_hours: +(Number(totals.total_music_duration_seconds || 0) / 3600).toFixed(1),
      total_cache_saved_gb: +(Number(totals.total_cache_saved_bytes || 0) / (1024 * 1024 * 1024)).toFixed(1),
      active_stations_online: activeStationsCount,
    },
    live_ticker: liveTicker,
  };
}

export async function getStationsData(): Promise<{
  success: boolean;
  mock_mode?: boolean;
  total_stations: number;
  online_count: number;
  stations: StationItem[];
}> {
  const db = await getDb();
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

  if (db) {
    const stationsCol = db.collection("stations_pulse");
    const docs = await stationsCol.find({}).sort({ last_seen_at: -1 }).limit(100).toArray();

    const stations: StationItem[] = docs.map((doc, idx) => {
      const lastSeen = doc.last_seen_at ? new Date(doc.last_seen_at) : new Date(0);
      const isOnline = lastSeen >= tenMinutesAgo;
      const totalAirtimeSec = Number(doc.total_airtime_seconds || 0);
      const cacheSavedBytes = Number(doc.cache_saved_bytes || 0);
      const hashStr = String(doc.station_hash || "");
      const customName = typeof doc.station_name === "string" ? doc.station_name.trim() : "";
      const defaultAnonName = `Stasiun #${hashStr.slice(0, 6).toUpperCase() || (idx + 1).toString().padStart(4, "0")}`;

      return {
        station_hash: hashStr,
        station_name: customName || defaultAnonName,
        is_custom_name: Boolean(customName),
        public_stream_url: String(doc.public_stream_url || ""),
        enable_online_requests: doc.enable_online_requests !== false,
        app_version: String(doc.app_version || "1.0.0"),
        total_airtime_seconds: totalAirtimeSec,
        total_airtime_formatted: formatAirtime(totalAirtimeSec),
        total_songs_played: Number(doc.total_songs_played || 0),
        cache_saved_mb: Math.round(cacheSavedBytes / (1024 * 1024)),
        is_online: isOnline,
        last_seen_at: lastSeen.toISOString(),
        now_playing: (doc.now_playing as StationItem["now_playing"]) || null,
      };
    });

    return {
      success: true,
      total_stations: stations.length,
      online_count: stations.filter((s) => s.is_online).length,
      stations,
    };
  }

  const mockStations: StationItem[] = [
    {
      station_hash: "a1b2c3d4e5f60718",
      station_name: "Radio Komunitas Ardan Live",
      is_custom_name: true,
      public_stream_url: "https://stream.zeno.fm/f3wvbbqmdg8uv",
      enable_online_requests: true,
      app_version: "1.0.0",
      total_airtime_seconds: 524000,
      total_airtime_formatted: "145j 33m",
      total_songs_played: 2420,
      cache_saved_mb: 8400,
      is_online: true,
      last_seen_at: new Date().toISOString(),
      now_playing: {
        title: "Hati-Hati di Jalan",
        artist: "Tulus",
        duration: "04:02",
      },
    },
    {
      station_hash: "f8e7d6c5b4a39281",
      station_name: "Prambors Studio Jakarta",
      is_custom_name: true,
      public_stream_url: "https://stream.zeno.fm/f3wvbbqmdg8uv",
      enable_online_requests: true,
      app_version: "1.0.0",
      total_airtime_seconds: 412000,
      total_airtime_formatted: "114j 26m",
      total_songs_played: 1890,
      cache_saved_mb: 6100,
      is_online: true,
      last_seen_at: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
      now_playing: {
        title: "Sialan",
        artist: "Juicy Luicy ft. Adrian Khalif",
        duration: "03:45",
      },
    },
    {
      station_hash: "9988776655443322",
      station_name: "Stasiun #998877",
      is_custom_name: false,
      public_stream_url: "",
      enable_online_requests: true,
      app_version: "0.9.3",
      total_airtime_seconds: 289000,
      total_airtime_formatted: "80j 16m",
      total_songs_played: 1340,
      cache_saved_mb: 4500,
      is_online: true,
      last_seen_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      now_playing: {
        title: "Gala Bunga Matahari",
        artist: "Sal Priadi",
        duration: "03:51",
      },
    },
    {
      station_hash: "1122334455667788",
      station_name: "FM Suara Edukasi Kampus",
      is_custom_name: true,
      public_stream_url: "",
      enable_online_requests: true,
      app_version: "1.0.0",
      total_airtime_seconds: 198000,
      total_airtime_formatted: "55j 00m",
      total_songs_played: 980,
      cache_saved_mb: 3200,
      is_online: false,
      last_seen_at: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
      now_playing: null,
    },
    {
      station_hash: "554433221100aabb",
      station_name: "Stasiun #554433",
      is_custom_name: false,
      public_stream_url: "",
      enable_online_requests: true,
      app_version: "1.0.0",
      total_airtime_seconds: 142000,
      total_airtime_formatted: "39j 26m",
      total_songs_played: 670,
      cache_saved_mb: 2100,
      is_online: false,
      last_seen_at: new Date(Date.now() - 120 * 60 * 1000).toISOString(),
      now_playing: null,
    },
  ];

  return {
    success: true,
    mock_mode: true,
    total_stations: mockStations.length,
    online_count: mockStations.filter((s) => s.is_online).length,
    stations: mockStations,
  };
}

export async function getAnalyticsData() {
  const db = await getDb();

  if (db) {
    const eventsCol = db.collection("airplay_events");
    const stationsCol = db.collection("stations_pulse");
    const tracksCol = db.collection("tracks_catalog");

    const genreAgg = await tracksCol
      .aggregate([
        { $group: { _id: "$genre", count: { $sum: "$total_plays" } } },
        { $sort: { count: -1 } },
        { $limit: 6 },
      ])
      .toArray();

    const totalGenrePlays = genreAgg.reduce((sum, g) => sum + Number(g.count || 0), 0) || 1;
    const genreDistribution = genreAgg.map((g) => ({
      genre: String(g._id || "Pop"),
      count: Number(g.count || 0),
      percentage: Math.round((Number(g.count || 0) / totalGenrePlays) * 100),
    }));

    const topStations = await stationsCol
      .find({})
      .sort({ total_airtime_seconds: -1 })
      .limit(5)
      .toArray();

    const leaderBoard = topStations.map((st, idx) => ({
      rank: idx + 1,
      station_name:
        st.station_name || `Stasiun #${String(st.station_hash || "").slice(0, 6).toUpperCase()}`,
      total_airtime_hours: Math.round(Number(st.total_airtime_seconds || 0) / 3600),
      total_songs_played: Number(st.total_songs_played || 0),
    }));

    // Hourly distribution bucketed in 2-hour windows
    const hourlyAgg = await eventsCol
      .aggregate([
        {
          $group: {
            _id: {
              $multiply: [{ $floor: { $divide: [{ $hour: "$created_at" }, 2] } }, 2],
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ])
      .toArray();

    const maxHourly = Math.max(1, ...hourlyAgg.map((h) => Number(h.count || 0)));
    const hourlyMap = new Map<number, number>(
      hourlyAgg.map((h) => [Number(h._id), Math.round((Number(h.count || 0) / maxHourly) * 100)])
    );
    const peakHours = Array.from({ length: 12 }, (_, i) => {
      const hr = i * 2;
      return {
        hour: `${String(hr).padStart(2, "0")}:00`,
        weight: hourlyMap.get(hr) ?? 0,
      };
    });

    return {
      success: true,
      peak_hours: peakHours,
      genre_distribution: genreDistribution,
      leaderboard: leaderBoard,
    };
  }

  return {
    success: true,
    mock_mode: true,
    peak_hours: [
      { hour: "00:00", weight: 15 },
      { hour: "02:00", weight: 8 },
      { hour: "04:00", weight: 12 },
      { hour: "06:00", weight: 58 },
      { hour: "08:00", weight: 92 },
      { hour: "10:00", weight: 74 },
      { hour: "12:00", weight: 65 },
      { hour: "14:00", weight: 62 },
      { hour: "16:00", weight: 88 },
      { hour: "18:00", weight: 70 },
      { hour: "20:00", weight: 82 },
      { hour: "22:00", weight: 40 },
    ],
    genre_distribution: [
      { genre: "Pop Indonesia", percentage: 42, count: 4280 },
      { genre: "Indie / Folk", percentage: 24, count: 2450 },
      { genre: "International Pop", percentage: 16, count: 1630 },
      { genre: "Dangdut Koplo / Modern", percentage: 10, count: 1020 },
      { genre: "R&B / Soul", percentage: 5, count: 510 },
      { genre: "Rock / Alternatif", percentage: 3, count: 310 },
    ],
    leaderboard: [
      { rank: 1, station_name: "Radio Komunitas Ardan Live", total_airtime_hours: 145, total_songs_played: 2420 },
      { rank: 2, station_name: "Prambors Studio Jakarta", total_airtime_hours: 114, total_songs_played: 1890 },
      { rank: 3, station_name: "Stasiun #998877", total_airtime_hours: 80, total_songs_played: 1340 },
      { rank: 4, station_name: "FM Suara Edukasi Kampus", total_airtime_hours: 55, total_songs_played: 980 },
      { rank: 5, station_name: "Stasiun #554433", total_airtime_hours: 39, total_songs_played: 670 },
    ],
  };
}
