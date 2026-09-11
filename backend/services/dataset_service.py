"""
backend/services/dataset_service.py

Single source of truth for the 4-camera dataset and detections metadata.
Coordinates strictly preserve intentional Junction A & Junction B positions.
Delegates heavy traffic calculations to analytics_engine.
"""

from pathlib import Path
import json
from typing import Dict, List, Any, Optional

PROJECT_ROOT = Path(__file__).resolve().parents[2]
CAMERAS_FILE = PROJECT_ROOT / "dataset" / "metadata" / "cameras.json"
DETECTIONS_FILE = PROJECT_ROOT / "dataset" / "metadata" / "detections.json"
PLATES_DIR = PROJECT_ROOT / "static" / "plates"
STATIC_PLATES_DIR = PLATES_DIR

# Intentional Coordinates Fallback (Dhanbad/Asansol/Kulti corridor)
DEFAULT_CAMERAS = [
    {
        "camera_id": "junction_A_camera_01",
        "junction_id": "junction_A",
        "junction_name": "Junction A",
        "camera_name": "Camera 01",
        "video_path": "dataset/junction_A/camera_01.mp4",
        "lat": 23.710299,
        "lng": 86.952779,
    },
    {
        "camera_id": "junction_A_camera_02",
        "junction_id": "junction_A",
        "junction_name": "Junction A",
        "camera_name": "Camera 02",
        "video_path": "dataset/junction_A/camera_02.mp4",
        "lat": 23.710293,
        "lng": 86.952695,
    },
    {
        "camera_id": "junction_B_camera_01",
        "junction_id": "junction_B",
        "junction_name": "Junction B",
        "camera_name": "Camera 01",
        "video_path": "dataset/junction_B/camera_01.mp4",
        "lat": 23.713932,
        "lng": 86.952211,
    },
    {
        "camera_id": "junction_B_camera_02",
        "junction_id": "junction_B",
        "junction_name": "Junction B",
        "camera_name": "Camera 02",
        "video_path": "dataset/junction_B/camera_02.mp4",
        "lat": 23.713929,
        "lng": 86.952144,
    },
]


_CAMERAS_RAW_CACHE = None
_CAMERAS_DICT_CACHE = None
_DETECTIONS_CACHE = None


def load_cameras_raw() -> List[Dict[str, Any]]:
    """Read dataset/metadata/cameras.json."""
    global _CAMERAS_RAW_CACHE
    if _CAMERAS_RAW_CACHE is not None:
        return _CAMERAS_RAW_CACHE

    if not CAMERAS_FILE.exists():
        _CAMERAS_RAW_CACHE = DEFAULT_CAMERAS
        return _CAMERAS_RAW_CACHE
    try:
        with open(CAMERAS_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            if isinstance(data, list) and len(data) > 0:
                _CAMERAS_RAW_CACHE = data
                return _CAMERAS_RAW_CACHE
    except Exception as e:
        print(f"[dataset_service] Error loading cameras.json: {e}")
    _CAMERAS_RAW_CACHE = DEFAULT_CAMERAS
    return _CAMERAS_RAW_CACHE


def get_cameras_dict() -> Dict[str, Dict[str, Any]]:
    """Return dictionary of cameras keyed by camera_id with enriched metadata."""
    global _CAMERAS_DICT_CACHE
    if _CAMERAS_DICT_CACHE is not None:
        return _CAMERAS_DICT_CACHE

    raw_list = load_cameras_raw()
    result = {}
    for cam in raw_list:
        cam_id = cam["camera_id"]
        vpath = PROJECT_ROOT / cam.get("video_path", "")
        item = {
            "id": cam_id,
            "camera_id": cam_id,
            "name": cam.get("camera_name", cam_id),
            "camera_name": cam.get("camera_name", cam_id),
            "junction_id": cam.get("junction_id", "junction_A"),
            "junction_name": cam.get("junction_name", "Junction A"),
            "scene": cam.get("junction_name", "Junction A"),
            "video_path": cam.get("video_path", ""),
            "video_url": f"/api/cameras/{cam_id}/video",
            "video_exists": vpath.exists() and vpath.stat().st_size > 0,
            "lat": cam.get("lat", 23.710299),
            "lng": cam.get("lng", 86.952779),
        }
        result[cam_id] = item
    _CAMERAS_DICT_CACHE = result
    return _CAMERAS_DICT_CACHE


def get_cameras_list() -> List[Dict[str, Any]]:
    """Return list of camera configurations."""
    return list(get_cameras_dict().values())


def get_camera_info(camera_id: str) -> Optional[Dict[str, Any]]:
    """Get single camera info by camera_id."""
    return get_cameras_dict().get(camera_id)


def load_detections() -> List[Dict[str, Any]]:
    """Load all consolidated vehicle/plate detections from detections.json."""
    global _DETECTIONS_CACHE
    if _DETECTIONS_CACHE is not None:
        return _DETECTIONS_CACHE

    if not DETECTIONS_FILE.exists():
        _DETECTIONS_CACHE = []
        return _DETECTIONS_CACHE
    try:
        with open(DETECTIONS_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            _DETECTIONS_CACHE = data if isinstance(data, list) else []
            return _DETECTIONS_CACHE
    except Exception as e:
        print(f"[dataset_service] Error loading detections.json: {e}")
        _DETECTIONS_CACHE = []
        return _DETECTIONS_CACHE


def get_analytics() -> Dict[str, Any]:
    """Return mathematically derived traffic analytics from analytics_engine."""
    from backend.services.analytics_engine import analytics_engine
    return analytics_engine.compute_all_analytics()


def get_map_model() -> Dict[str, Any]:
    """Return map model containing actual geo-referenced camera and junction locations."""
    cameras = get_cameras_dict()
    camera_locations = []

    for cam_id, info in cameras.items():
        camera_locations.append({
            "camera_id": cam_id,
            "camera_name": info.get("camera_name"),
            "junction_id": info.get("junction_id"),
            "junction_name": info.get("junction_name"),
            "lat": info.get("lat"),
            "lng": info.get("lng"),
            "video_url": info.get("video_url"),
        })

    # Exact intentional coordinates for Junctions
    return {
        "coordinate_model": "geospatial_wgs84",
        "geo_supported": True,
        "center": [23.7121, 86.9525],
        "zoom": 16,
        "junctions": {
            "junction_A": {
                "id": "junction_A",
                "name": "Junction A",
                "lat": 23.710299,
                "lng": 86.952779,
            },
            "junction_B": {
                "id": "junction_B",
                "name": "Junction B",
                "lat": 23.713932,
                "lng": 86.952211,
            }
        },
        "camera_locations": camera_locations,
        "route_corridor": [
            [23.710299, 86.952779],  # Junction A Cam 01
            [23.710293, 86.952695],  # Junction A Cam 02
            [23.712100, 86.952500],  # Highway Corridor mid-point
            [23.713932, 86.952211],  # Junction B Cam 01
            [23.713929, 86.952144],  # Junction B Cam 02
        ]
    }
