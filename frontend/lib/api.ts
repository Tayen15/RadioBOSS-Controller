/**
 * API client to communicate with FastAPI backend.
 */
import {
  TrackItem,
  SearchResponse,
  ResolveResponse,
  QueueResponse,
  RadioBOSSStatus,
  AppConfig,
  SaveSettingsResponse,
  PlaybackAction,
  PlaybackControlResponse,
  PlaylistResponse,
  LyricsResponse,
  RecommendationsResponse,
  ArtistTopTracksResponse,
  MoodTracksResponse,
  PlaylistSet,
  PlaylistSetDetails,
  ResolvePlaylistResponse,
  HistoryItem,
  CachedTrackItem,
  DJTopChartResponse,
  DJSmartRecommendationsResponse,
} from "./types";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL !== undefined
    ? process.env.NEXT_PUBLIC_API_URL
    : typeof window !== "undefined"
    ? window.location.origin
    : "http://127.0.0.1:8000";

export async function checkBackendHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/health`, {
      method: "GET",
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchRadioBossStatus(): Promise<RadioBOSSStatus> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/radioboss/status`, {
      method: "GET",
      cache: "no-store",
    });
    if (!res.ok) {
      return {
        connected: false,
        error: `Server HTTP status ${res.status}`,
      };
    }
    return await res.json();
  } catch (err) {
    return {
      connected: false,
      error: err instanceof Error ? err.message : "Tidak dapat menghubungi backend",
    };
  }
}

export async function searchYouTubeMusic(
  query: string,
  limit: number = 6
): Promise<SearchResponse> {
  const res = await fetch(`${API_BASE_URL}/api/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, limit }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Gagal mencari lagu YouTube Music.");
  }
  return await res.json();
}

export async function resolveUrl(url: string): Promise<ResolveResponse> {
  const res = await fetch(`${API_BASE_URL}/api/resolve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Gagal me-resolve link YouTube.");
  }
  return await res.json();
}

export async function queueToRadioBoss(
  videoId: string,
  title: string,
  pos: number = -1,
  useRelay: boolean = true,
  directStreamUrl?: string,
  metadata?: {
    artist?: string | null;
    album?: string | null;
    thumbnail_url?: string | null;
    year?: string | null;
    genre?: string | null;
  }
): Promise<QueueResponse> {
  const res = await fetch(`${API_BASE_URL}/api/queue`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      video_id: videoId,
      title,
      pos,
      use_relay: useRelay,
      direct_stream_url: directStreamUrl,
      artist: metadata?.artist,
      album: metadata?.album,
      thumbnail_url: metadata?.thumbnail_url,
      year: metadata?.year,
      genre: metadata?.genre,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Gagal mengirim lagu ke antrean RadioBOSS.");
  }
  return await res.json();
}

export function getStreamRelayUrl(videoId: string): string {
  const cleanId = videoId.replace(".mp3", "");
  return `${API_BASE_URL}/api/stream/${encodeURIComponent(cleanId)}.mp3`;
}

export async function getAppSettings(): Promise<AppConfig> {
  const res = await fetch(`${API_BASE_URL}/api/settings`, {
    method: "GET",
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error("Gagal mengambil pengaturan aplikasi.");
  }
  return await res.json();
}

export async function saveAppSettings(
  config: AppConfig
): Promise<SaveSettingsResponse> {
  const res = await fetch(`${API_BASE_URL}/api/settings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Gagal menyimpan pengaturan aplikasi.");
  }
  return await res.json();
}

export async function sendPlaybackControl(
  action: PlaybackAction
): Promise<PlaybackControlResponse> {
  const res = await fetch(`${API_BASE_URL}/api/radioboss/playback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Gagal menjalankan perintah ${action}.`);
  }
  return await res.json();
}

export async function fetchRadioBossPlaylist(
  limit: number = 10
): Promise<PlaylistResponse> {
  const res = await fetch(
    `${API_BASE_URL}/api/radioboss/playlist?limit=${limit}`,
    {
      method: "GET",
      cache: "no-store",
    }
  );
  if (!res.ok) {
    throw new Error("Gagal mengambil antrean playlist RadioBOSS.");
  }
  return await res.json();
}

export async function fetchCacheStats() {
  const res = await fetch(`${API_BASE_URL}/api/cache/stats`, {
    method: "GET",
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error("Gagal mengambil statistik cache.");
  }
  return await res.json();
}

export async function openCacheFolder(): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/cache/open-folder`, {
    method: "POST",
  });
  if (!res.ok) {
    throw new Error("Gagal membuka folder cache di Windows Explorer.");
  }
}

export async function clearAudioCache(
  days?: number
): Promise<{ deleted_count: number }> {
  const url = days
    ? `${API_BASE_URL}/api/cache?days=${days}`
    : `${API_BASE_URL}/api/cache`;
  const res = await fetch(url, {
    method: "DELETE",
  });
  if (!res.ok) {
    throw new Error("Gagal membersihkan cache audio.");
  }
  return await res.json();
}

export async function fetchTrackLyrics(
  videoId: string
): Promise<LyricsResponse> {
  const cleanId = videoId.replace(".mp3", "");
  const res = await fetch(
    `${API_BASE_URL}/api/lyrics/${encodeURIComponent(cleanId)}`,
    {
      method: "GET",
      cache: "no-store",
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      err.detail || "Gagal mengambil lirik dan talking points lagu."
    );
  }
  return await res.json();
}

export async function fetchQueueHistory(): Promise<HistoryItem[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/history`, {
      method: "GET",
      cache: "no-store",
    });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export async function clearQueueHistory(): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/history`, {
    method: "DELETE",
  });
  if (!res.ok) {
    throw new Error("Gagal menghapus riwayat antrean.");
  }
}

export async function triggerRadioBossCart(
  cartId: number
): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE_URL}/api/radioboss/cart`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cart_id: cartId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Gagal memicu Cart ${cartId} di RadioBOSS.`);
  }
  return await res.json();
}

export async function stopAllRadioBossCarts(): Promise<{
  success: boolean;
  message: string;
}> {
  const res = await fetch(`${API_BASE_URL}/api/radioboss/cart/stop`, {
    method: "POST",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Gagal menghentikan cart di RadioBOSS.");
  }
  return await res.json();
}

export async function fetchRecommendations(
  videoId: string,
  limit: number = 8
): Promise<RecommendationsResponse> {
  const cleanId = videoId.replace(".mp3", "");
  const res = await fetch(
    `${API_BASE_URL}/api/music/recommendations/${encodeURIComponent(cleanId)}?limit=${limit}`,
    {
      method: "GET",
      cache: "no-store",
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Gagal mengambil rekomendasi lagu.");
  }
  return await res.json();
}

export async function fetchArtistTopTracks(
  artist: string,
  limit: number = 6
): Promise<ArtistTopTracksResponse> {
  const res = await fetch(
    `${API_BASE_URL}/api/music/artist-top?artist=${encodeURIComponent(artist)}&limit=${limit}`,
    {
      method: "GET",
      cache: "no-store",
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Gagal mengambil lagu populer artis.");
  }
  return await res.json();
}

export async function fetchMoodTracks(
  mood: string,
  limit: number = 8
): Promise<MoodTracksResponse> {
  const res = await fetch(
    `${API_BASE_URL}/api/music/mood?mood=${encodeURIComponent(mood)}&limit=${limit}`,
    {
      method: "GET",
      cache: "no-store",
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Gagal mengambil lagu kategori mood.");
  }
  return await res.json();
}

export async function fetchPlaylistSets(): Promise<PlaylistSet[]> {
  const res = await fetch(`${API_BASE_URL}/api/sets`, {
    method: "GET",
    cache: "no-store",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Gagal mengambil daftar playlist set.");
  }
  const data = await res.json();
  return data.sets || [];
}

export async function createPlaylistSet(
  name: string,
  description?: string
): Promise<PlaylistSet> {
  const res = await fetch(`${API_BASE_URL}/api/sets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, description }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Gagal membuat playlist set.");
  }
  const data = await res.json();
  return data.set;
}

export async function fetchPlaylistSetDetails(
  setId: string
): Promise<PlaylistSetDetails> {
  const res = await fetch(`${API_BASE_URL}/api/sets/${encodeURIComponent(setId)}`, {
    method: "GET",
    cache: "no-store",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Gagal mengambil detail playlist set.");
  }
  const data = await res.json();
  return data.set;
}

export async function deletePlaylistSet(setId: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/sets/${encodeURIComponent(setId)}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Gagal menghapus playlist set.");
  }
}

export async function addTrackToPlaylistSet(
  setId: string,
  track: TrackItem
): Promise<void> {
  const res = await fetch(
    `${API_BASE_URL}/api/sets/${encodeURIComponent(setId)}/tracks`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ track }),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Gagal menambahkan lagu ke set.");
  }
}

export async function removeTrackFromPlaylistSet(
  setId: string,
  itemId: string
): Promise<void> {
  const res = await fetch(
    `${API_BASE_URL}/api/sets/${encodeURIComponent(setId)}/tracks/${encodeURIComponent(itemId)}`,
    {
      method: "DELETE",
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Gagal menghapus lagu dari set.");
  }
}

export async function clearPlaylistSetTracks(setId: string): Promise<void> {
  const res = await fetch(
    `${API_BASE_URL}/api/sets/${encodeURIComponent(setId)}/tracks`,
    {
      method: "DELETE",
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Gagal mengosongkan lagu di set.");
  }
}

export async function reorderPlaylistSetTracks(
  setId: string,
  itemIds: string[]
): Promise<void> {
  const res = await fetch(
    `${API_BASE_URL}/api/sets/${encodeURIComponent(setId)}/reorder`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_ids: itemIds }),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Gagal mengubah urutan lagu di set.");
  }
}

export async function resolvePlaylistUrl(
  url: string,
  limit: number = 50
): Promise<ResolvePlaylistResponse> {
  const res = await fetch(`${API_BASE_URL}/api/sets/resolve-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, limit }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Gagal memproses link playlist.");
  }
  return await res.json();
}

export async function fetchDJTopChart(
  limit: number = 20
): Promise<DJTopChartResponse> {
  const res = await fetch(
    `${API_BASE_URL}/api/music/dj/top-chart?limit=${limit}`,
    {
      method: "GET",
      cache: "no-store",
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Gagal mengambil tangga lagu DJ.");
  }
  return await res.json();
}

export async function fetchDJSmartRecommendations(
  limit: number = 8
): Promise<DJSmartRecommendationsResponse> {
  const res = await fetch(
    `${API_BASE_URL}/api/music/dj/smart-recommendations?limit=${limit}`,
    {
      method: "GET",
      cache: "no-store",
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Gagal mengambil rekomendasi cerdas DJ.");
  }
  return await res.json();
}

export async function fetchCachedTracks(
  search: string = "",
  onlyCached: boolean = false,
  sort: string = "play_count",
  limit: number = 50
): Promise<CachedTrackItem[]> {
  const params = new URLSearchParams({
    search,
    only_cached: String(onlyCached),
    sort,
    limit: String(limit),
  });
  const res = await fetch(
    `${API_BASE_URL}/api/music/cache/tracks?${params.toString()}`,
    {
      method: "GET",
      cache: "no-store",
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Gagal mengambil daftar cache lagu.");
  }
  return await res.json();
}


