import os
import mimetypes
from pathlib import Path
from typing import Generator, Tuple, Optional
from fastapi import HTTPException
from fastapi.responses import StreamingResponse

PROJECT_ROOT = Path(__file__).resolve().parents[2]
STATIC_PLATES_DIR = PROJECT_ROOT / "static" / "plates"
LEGACY_PLATES_DIR = PROJECT_ROOT / "runs" / "detect" / "plate_detection" / "plates"

def ensure_mp4_transcoded(camera_id: str, avi_path: Path, mp4_path: Path) -> Path:
    """Ensure that a browser-compatible faststart MP4 file exists for the camera."""
    if mp4_path.exists() and mp4_path.stat().st_size > 1024:
        return mp4_path

    if not avi_path.exists():
        raise FileNotFoundError(f"Source video not found: {avi_path}")

    try:
        import imageio_ffmpeg
        import subprocess

        ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
        cmd = [
            ffmpeg_exe,
            "-y",
            "-i", str(avi_path),
            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-crf", "24",
            "-movflags", "+faststart",
            str(mp4_path),
        ]
        subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        return mp4_path
    except Exception as e:
        print(f"[video_service] Transcoding error for {camera_id}: {e}")
        return avi_path


def parse_byte_range(range_header: str, file_size: int) -> Tuple[int, int]:
    """Parse HTTP Range header e.g. 'bytes=0-1024' or 'bytes=1024-'."""
    try:
        range_str = range_header.replace("bytes=", "").strip()
        parts = range_str.split("-")
        start = int(parts[0]) if parts[0] else 0
        end = int(parts[1]) if parts[1] else file_size - 1

        if start >= file_size:
            start = file_size - 1
        if end >= file_size:
            end = file_size - 1
        if start > end:
            start = 0

        return start, end
    except Exception:
        return 0, file_size - 1


def file_chunk_generator(file_path: Path, start: int, end: int, chunk_size: int = 1024 * 1024) -> Generator[bytes, None, None]:
    """Yield chunks of a file for HTTP range responses."""
    with open(file_path, "rb") as f:
        f.seek(start)
        bytes_to_read = end - start + 1
        while bytes_to_read > 0:
            current_chunk_size = min(chunk_size, bytes_to_read)
            data = f.read(current_chunk_size)
            if not data:
                break
            bytes_to_read -= len(data)
            yield data


def get_video_stream_response(video_path: Path, range_header: Optional[str] = None) -> StreamingResponse:
    """Return a FastAPI StreamingResponse supporting HTTP 206 range requests."""
    if not video_path.exists():
        raise HTTPException(status_code=404, detail=f"Video file not found: {video_path.name}")

    file_size = video_path.stat().st_size
    media_type, _ = mimetypes.guess_type(str(video_path))
    if not media_type:
        media_type = "video/mp4"

    if range_header:
        start, end = parse_byte_range(range_header, file_size)
        content_length = end - start + 1
        headers = {
            "Content-Range": f"bytes {start}-{end}/{file_size}",
            "Accept-Ranges": "bytes",
            "Content-Length": str(content_length),
            "Content-Type": media_type,
        }
        return StreamingResponse(
            file_chunk_generator(video_path, start, end),
            status_code=206,
            headers=headers,
            media_type=media_type,
        )
    else:
        headers = {
            "Accept-Ranges": "bytes",
            "Content-Length": str(file_size),
            "Content-Type": media_type,
        }
        return StreamingResponse(
            file_chunk_generator(video_path, 0, file_size - 1),
            status_code=200,
            headers=headers,
            media_type=media_type,
        )


def get_plate_image_path(image_name: str) -> Optional[Path]:
    """Resolve plate crop image from static/plates or fallback."""
    clean_name = Path(image_name).name
    p1 = STATIC_PLATES_DIR / clean_name
    if p1.exists():
        return p1
    p2 = LEGACY_PLATES_DIR / clean_name
    if p2.exists():
        return p2
    return None
