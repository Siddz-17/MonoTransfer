import logging
from typing import List, Optional
from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel
from ytmusicapi import YTMusic

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("ytmusic-service")

app = FastAPI(title="MonoTransfer YTMusic Search Microservice", version="1.0.0")

# Read-only public catalog search - no auth required
ytmusic = None

@app.on_event("startup")
def startup_event():
    global ytmusic
    try:
        ytmusic = YTMusic()
        logger.info("Initialized ytmusicapi client successfully (public catalog mode)")
    except Exception as e:
        logger.error(f"Failed to initialize ytmusicapi client: {e}")

class ArtistInfo(BaseModel):
    name: str
    id: Optional[str] = None

class CandidateTrack(BaseModel):
    videoId: str
    title: str
    artists: List[str]
    album: Optional[str] = None
    durationSeconds: Optional[int] = None
    isExplicit: bool = False
    source: str = "ytmusicapi"

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
    return {"status": "ok", "service": "ytmusic-service"}

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
        # Search songs filter first for cleanest official metadata
        results = ytmusic.search(query=q, filter="songs", limit=limit)
        # If very few results, also fallback to general search or video search
        if not results or len(results) == 0:
            results = ytmusic.search(query=q, limit=limit)

        candidates: List[CandidateTrack] = []
        for item in results:
            video_id = item.get("videoId")
            if not video_id:
                continue

            title = item.get("title", "")
            
            # Extract artists list
            artists = []
            if "artists" in item and isinstance(item["artists"], list):
                for a in item["artists"]:
                    if isinstance(a, dict) and "name" in a:
                        artists.append(a["name"])
                    elif isinstance(a, str):
                        artists.append(a)

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
                source="ytmusicapi"
            ))

        return SearchResponse(
            query=q,
            count=len(candidates),
            candidates=candidates
        )
    except Exception as e:
        logger.error(f"Error querying ytmusicapi for '{q}': {e}")
        raise HTTPException(status_code=502, detail=f"ytmusicapi query failed: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
