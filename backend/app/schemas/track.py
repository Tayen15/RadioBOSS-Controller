"""Data models and validation schemas for track resolution and queuing."""
from typing import List, Optional
from pydantic import BaseModel, Field


class TrackItem(BaseModel):
    """Normalized metadata for a track item."""
    video_id: str
    title: str
    artists: List[str] = Field(default_factory=list)
    album: Optional[str] = None
    duration_seconds: Optional[int] = None
    duration_formatted: Optional[str] = "00:00"
    thumbnail_url: Optional[str] = None
    url: str
    year: Optional[str] = None
    genre: Optional[str] = None


class SearchRequest(BaseModel):
    """Search request payload."""
    query: str = Field(..., min_length=1, description="Song title or artist query")
    limit: int = Field(default=5, ge=1, le=20, description="Max search results")


class SearchResponse(BaseModel):
    """Response containing list of matching YouTube Music songs."""
    success: bool = True
    query: str
    results: List[TrackItem] = Field(default_factory=list)


class ResolveRequest(BaseModel):
    """Request to resolve a direct URL or video ID."""
    url: str = Field(..., min_length=5, description="YouTube / YouTube Music URL or ID")


class ResolveResponse(BaseModel):
    """Resolved track metadata and stream URL."""
    success: bool
    data: Optional[TrackItem] = None
    direct_stream_url: Optional[str] = None
    relay_stream_url: Optional[str] = None
    error: Optional[str] = None


class QueueRequest(BaseModel):
    """Request to queue a track into RadioBOSS."""
    video_id: str = Field(..., description="YouTube Video ID")
    title: str = Field(..., description="Track title for logging and display")
    artist: Optional[str] = Field(default=None, description="Artist name")
    album: Optional[str] = Field(default=None, description="Album name")
    thumbnail_url: Optional[str] = Field(default=None, description="Cover artwork thumbnail URL")
    year: Optional[str] = Field(default=None, description="Release year")
    genre: Optional[str] = Field(default=None, description="Music genre")
    pos: int = Field(default=-1, description="-1 for bottom of playlist, 1 for next track")
    use_relay: bool = Field(default=True, description="Whether to use anti-expiry stream relay")
    direct_stream_url: Optional[str] = Field(default=None, description="Optional direct URL override")
    target_tab: Optional[str] = Field(default=None, description="Target RadioBOSS playlist tab (e.g. 'Playlist 1', 'Playlist 2')")


class QueueResponse(BaseModel):
    """Response for queuing action."""
    success: bool
    message: str
    inserted_pos: int
    track_title: str
    stream_url: str


class NowPlayingTrack(BaseModel):
    """Information about current on-air playback in RadioBOSS."""
    title: str = "Unknown"
    duration: Optional[str] = "00:00"
    position: Optional[str] = "00:00"
    status: str = "stopped"  # playing, paused, stopped
    listeners: Optional[int] = 0


class RadioBOSSStatusResponse(BaseModel):
    """RadioBOSS connection status and now playing info."""
    connected: bool
    now_playing: Optional[NowPlayingTrack] = None
    raw_status: Optional[str] = None
    error: Optional[str] = None


class PlaybackControlRequest(BaseModel):
    """Request to trigger playback transport controls on RadioBOSS."""
    action: str = Field(..., description="Action: play, pause, stop, next")


class PlaybackControlResponse(BaseModel):
    """Response of playback control command."""
    success: bool
    message: str
    action: str


class PlaylistItem(BaseModel):
    """Normalized playlist track item from RadioBOSS."""
    index: int
    artist: str = ""
    title: str = ""
    display_title: str
    duration: str = "00:00"
    start_time: str = ""
    filename: str = ""
    is_playing: bool = False


class PlaylistResponse(BaseModel):
    """Response containing upcoming tracks in RadioBOSS playlist."""
    success: bool
    count: int = 0
    tracks: List[PlaylistItem] = Field(default_factory=list)
    error: Optional[str] = None


class CartRequest(BaseModel):
    """Request to trigger a soundboard cart in RadioBOSS."""
    cart_id: int = Field(..., ge=1, le=24, description="Cart slot index (1..24)")


class CartResponse(BaseModel):
    """Response of cart trigger command."""
    success: bool
    message: str
    cart_id: Optional[int] = None


class CastTitleRequest(BaseModel):
    """Request to update RadioBOSS live broadcast / streaming title."""
    title: str = Field(..., min_length=1, description="New broadcast title to send to encoders")


class CastTitleResponse(BaseModel):
    """Response of setting broadcast title."""
    success: bool
    message: str
    title: str


class TalkingPoints(BaseModel):
    """Smart cues, timings, emotion analysis, and announcer scripts for on-air DJs."""
    intro_talk_window: str
    outro_talk_window: str
    station_id_cue: Optional[str] = None
    vibe: Optional[str] = None
    vibe_badge: Optional[str] = None
    vibe_category: Optional[str] = "universal"
    key_lyric_quote: Optional[str] = None
    intro_script: Optional[str] = None
    outro_script: Optional[str] = None
    broadcaster_tips: List[str] = Field(default_factory=list)
    song_trivia: Optional[dict] = None


class LyricsResponse(BaseModel):
    """Response containing track lyrics and smart announcer cues."""
    video_id: str
    has_lyrics: bool
    lyrics: str
    source: str
    talking_points: TalkingPoints


class SwitchTabRequest(BaseModel):
    """Request to switch active playlist tab in RadioBOSS."""
    tab_name: str = Field(..., description="Target RadioBOSS playlist tab name (e.g. 'Playlist 1', 'Playlist 2')")


class SwitchTabResponse(BaseModel):
    """Response of playlist tab switch command."""
    success: bool
    message: str
    active_tab: str


class TabsResponse(BaseModel):
    """Response containing discovered and active RadioBOSS playlist tabs."""
    success: bool = True
    active_tab: str = "Playlist 1"
    active_index: int = 0
    available_tabs: List[str] = Field(default_factory=list)
    is_synced: bool = False



