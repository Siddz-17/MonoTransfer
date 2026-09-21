import logging
from typing import List, Optional
from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel
from ytmusicapi import YTMusic

import threading


logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("ytmusic-service")

app = FastAPI(title="MonoTransfer YTMusic Search Microservice", version="1.1.0")

# Public catalog search does not require a YouTube Music login.
ytmusic: Optional[YTMusic] = None

# ytmusicapi uses a shared HTTP session internally. Serialize searches so
# concurrent tracks from the Node worker do not hammer the same client/session.
search_lock = threading.Lock()  

def _search_ytmusic(query: str, limit: int):
    """Run catalog search with a safe songs->general fallback."""
    global ytmusic

    if ytmusic is None:
        ytmusic = YTMusic()

    # Prefer the clean song catalog. If that request itself fails, try the
    # general search instead of abandoning the track.
    try:
        results = ytmusic.search(query=query, filter="songs", limit=limit)
        if results:
            return results, True
    except Exception:
        logger.exception(
            "YTMusic songs search failed for %r; trying general search",
            query
        )

    try:
        results = ytmusic.search(query=query, limit=limit)
        return results or [], False
    except Exception:
        logger.exception("YTMusic general search failed for %r", query)
        raise

@app.on_event("startup")
def startup_event():
    global ytmusic
    try:
        ytmusic = YTMusic()
        logger.info("Initialized ytmusicapi client successfully (public catalog mode)")
    except Exception:
        logger.exception("Failed to initialize ytmusicapi client")
        ytmusic = None

class CandidateTrack(BaseModel):
    videoId: str
    title: str
    artists: List[str]
    album: Optional[str] = None
    durationSeconds: Optional[int] = None
    isExplicit: bool = False
    source: str = "ytmusicapi"
    channelTitle: Optional[str] = None
    channelId: Optional[str] = None
    isOfficialChannel: bool = False
    isSong: bool = False

class SearchResponse(BaseModel):
    query: str
    count: int
    candidates: List[CandidateTrack]

def parse_duration_to_seconds(dur_str: Optional[str]) -> Optional[int]:
    if not dur_str:
        return None
    parts = dur_str.strip().split(":")
    try:
        if len(parts) == 2:
            return int(parts[0]) * 60 + int(parts[1])
        elif len(parts) == 3:
            return int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
    except (ValueError, TypeError):
        return None
    return None

@app.get("/health")
def health():
    return {
        "status": "ok" if ytmusic is not None else "degraded",
        "service": "ytmusic-service",
        "ytmusic_ready": ytmusic is not None,
    }

@app.get("/search", response_model=SearchResponse)
def search_catalog(
    q: str = Query(..., description="Query string e.g. 'Artist Title'"),
    limit: int = Query(10, ge=1, le=25)
):
    global ytmusic
    if not ytmusic:
        try:
            ytmusic = YTMusic()
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"ytmusicapi initialization failed: {str(e)}")

    logger.info(f"Searching YTMusic catalog: '{q}' (limit={limit})")
    try:
        # 1. Search songs filter first for cleanest official metadata
        is_song_filter = True
        with search_lock:
            results, is_song_filter = _search_ytmusic(q, limit)
        
        # 2. If no results, fallback to general search
        if not results or len(results) == 0:
            is_song_filter = False
            results = ytmusic.search(query=q, limit=limit)

        candidates: List[CandidateTrack] = []
        for item in results:
            video_id = item.get("videoId")
            if not video_id:
                continue

            title = item.get("title", "")
            result_type = item.get("resultType", "")
            is_song = is_song_filter or result_type == "song"
            
            # Extract artists list and channel info
            artists = []
            channel_title = None
            channel_id = None

            if "artists" in item and isinstance(item["artists"], list):
                for a in item["artists"]:
                    if isinstance(a, dict):
                        a_name = a.get("name")
                        if a_name:
                            artists.append(a_name)
                        if not channel_id and a.get("id"):
                            channel_id = a.get("id")
                        if not channel_title and a_name:
                            channel_title = a_name
                    elif isinstance(a, str):
                        artists.append(a)
                        if not channel_title:
                            channel_title = a

            # Also check uploader/author/channel fields
            if not channel_title:
                channel_title = item.get("author") or item.get("channel")

            # Check if this candidate is an official artist or Topic channel upload
            is_official = is_song
            if channel_title:
                ch_lower = channel_title.lower()
                if " - topic" in ch_lower or "official" in ch_lower or "vevo" in ch_lower:
                    is_official = True

            # Extract album
            album_name = None
            if "album" in item:
                if isinstance(item["album"], dict):
                    album_name = item["album"].get("name")
                elif isinstance(item["album"], str):
                    album_name = item["album"]

            # Duration
            duration_sec = item.get("duration_seconds")
            if duration_sec is None and "duration" in item:
                duration_sec = parse_duration_to_seconds(item.get("duration"))

            # Explicit flag
            is_explicit = item.get("isExplicit", False)

            candidates.append(CandidateTrack(
                videoId=video_id,
                title=title,
                artists=artists,
                album=album_name,
                durationSeconds=duration_sec,
                isExplicit=bool(is_explicit),
                source="ytmusicapi",
                channelTitle=channel_title,
                channelId=channel_id,
                isOfficialChannel=is_official,
                isSong=is_song
            ))

        return SearchResponse(
            query=q,
            count=len(candidates),
            candidates=candidates
        )
    except Exception as e:
        logger.error(f"Error querying ytmusicapi for '{q}': {e}")
        raise HTTPException(status_code=502, detail=f"ytmusicapi query failed: {str(e)}")
