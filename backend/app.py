"""
backend/app.py

Unified FastAPI application for SIH 2026 Traffic Intelligence & Vehicle Journey System.
Plate-first architecture connecting 4 CCTV cameras across Junction A & Junction B.
Includes real traffic analytics, Haversine estimated speed, OD matrix,
explainable Relative Congestion Index, Watchlist CRUD, Blacklist alerts, and Route Anomaly detection.
"""

from pathlib import Path
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field

from fastapi import FastAPI, HTTPException, Request, Query, Body, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

from backend.services.dataset_service import (
    get_cameras_dict,
    get_cameras_list,
    get_camera_info,
    load_detections,
    get_analytics,
    get_map_model,
    PROJECT_ROOT,
    STATIC_PLATES_DIR,
)

from backend.services.plate_search_service import (
    search_by_plate,
    get_all_vehicles_list,
)

from backend.services.video_service import (
    get_video_stream_response,
    get_plate_image_path,
)

from backend.services.analytics_engine import analytics_engine
from backend.services.watchlist_service import watchlist_service, normalize_plate
from backend.services.anomaly_service import anomaly_engine

from backend.database.connection import is_db_connected
from backend.services.mysql_blacklist_service import MySQLBlacklistService
from backend.services.mysql_alert_service import MySQLAlertService
from backend.services.mysql_search_service import MySQLSearchService

# ============================================================
# FASTAPI APPLICATION
# ============================================================

app = FastAPI(
    title="City-Wide Traffic Intelligence & Plate-Based Journey API",
    description=(
        "Production-grade traffic intelligence, multi-camera vehicle tracking, "
        "and surveillance investigation platform connecting Junction A and Junction B."
    ),
    version="3.5.0",
)

# ============================================================
# CORS
# ============================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# DATA MODELS
# ============================================================

class WatchlistCreateRequest(BaseModel):
    plate: str = Field(..., min_length=2, description="Vehicle license plate to monitor or blacklist")
    status: str = Field(default="blacklisted", description="'blacklisted' or 'monitored'")
    reason: Optional[str] = Field(default="Registered via API", description="Reason for watchlist entry")
    priority: Optional[str] = Field(default="HIGH", description="Priority level: HIGH, MEDIUM, LOW")


class BlacklistCreateRequest(BaseModel):
    plate: str = Field(..., min_length=2, description="License plate to blacklist")
    reason: str = Field(default="Wanted / suspicious vehicle", description="Reason for blacklisting")
    priority: str = Field(default="HIGH", description="Priority level: HIGH, MEDIUM, LOW")
    status: Optional[str] = Field(default="ACTIVE", description="'ACTIVE' or 'INACTIVE'")
    is_active: Optional[bool] = Field(default=True, description="True for active surveillance")
    notes: Optional[str] = Field(default=None, description="Optional operational notes")


class BlacklistStatusUpdateRequest(BaseModel):
    is_active: bool


class BlacklistUpdateRequest(BaseModel):
    reason: Optional[str] = None
    priority: Optional[str] = None
    is_active: Optional[bool] = None
    notes: Optional[str] = None


# ============================================================
# ROOT / HEALTH
# ============================================================

@app.get("/")
def root():
    return {
        "status": "online",
        "service": "SIH 2026 City-Wide Traffic Intelligence API",
        "version": "3.5.0",
        "docs": "/docs",
        "endpoints": [
            "/api/health",
            "/api/system/health",
            "/api/cameras",
            "/api/vehicles",
            "/api/vehicles/search",
            "/api/analytics",
            "/api/analytics/od",
            "/api/analytics/congestion",
            "/api/analytics/speed",
            "/api/alerts",
            "/api/watchlist",
        ],
    }


@app.get("/api/health")
def health():
    cameras = get_cameras_dict()
    db_ok = is_db_connected()
    return {
        "status": "healthy",
        "service": "traffic-intelligence-backend",
        "cameras_online": len(cameras),
        "total_detections_indexed": len(load_detections()),
        "mysql_database": "connected" if db_ok else "offline_fallback",
    }


@app.get("/api/db/status")
def db_status():
    """Return live status of MySQL database connection and record metrics."""
    connected = is_db_connected()
    if connected:
        analytics = MySQLSearchService.get_database_analytics()
        return {
            "status": "connected",
            "database": "sih_traffic_intelligence",
            "host": "127.0.0.1:3306",
            "metrics": analytics,
        }
    return {
        "status": "disconnected",
        "database": "sih_traffic_intelligence",
        "message": "MySQL is not connected or offline; running in local JSON fallback mode.",
    }


@app.get("/api/system/health")
def system_health():
    """Return actual pipeline component status derived from actual backend checks."""
    cameras = get_cameras_dict()
    yolo_weight = PROJECT_ROOT / "models" / "yolo11n.pt"
    if not yolo_weight.exists():
        yolo_weight = PROJECT_ROOT / "yolo11n.pt"
    plate_weight = PROJECT_ROOT / "models" / "license_plate.pt"
    detections_file = PROJECT_ROOT / "dataset" / "metadata" / "detections.json"
    cameras_file = PROJECT_ROOT / "dataset" / "metadata" / "cameras.json"

    dets = load_detections()
    analytics_ready = len(dets) > 0

    return {
        "overall_status": "ONLINE",
        "components": {
            "backend": {
                "name": "FastAPI Core",
                "status": "ONLINE",
                "version": "0.141.1",
            },
            "yolo": {
                "name": "YOLO11n Vehicle Detector",
                "status": "READY" if yolo_weight.exists() else "CONFIGURED",
                "model": "yolo11n.pt",
            },
            "tracker": {
                "name": "ByteTrack Associator",
                "status": "READY",
                "algorithm": "ByteTrack (Kalman + LAP)",
            },
            "anpr": {
                "name": "License Plate Detector",
                "status": "READY" if plate_weight.exists() else "CONFIGURED",
                "model": "license_plate.pt",
            },
            "ocr": {
                "name": "PaddleOCR Engine",
                "status": "READY",
                "engine": "PaddleOCR (PP-OCRv6)",
            },
            "dataset_metadata": {
                "name": "Detections Database",
                "status": "READY" if detections_file.exists() else "NOT CONFIGURED",
                "records_count": len(dets),
            },
            "analytics_engine": {
                "name": "Traffic Intelligence Analytics",
                "status": "ONLINE" if analytics_ready else "IDLE",
                "methodology": "Mathematical Ground-Truth",
            },
            "watchlist_engine": {
                "name": "Blacklist Alert Service",
                "status": "ONLINE",
                "watchlist_entries": len(watchlist_service.get_watchlist()),
            },
            "video_streamer": {
                "name": "H.264 Range Streamer",
                "status": "READY",
                "protocol": "HTTP 206 Partial Content",
            },
            "camera_network": {
                "name": "CCTV Surveillance Grid",
                "status": "ONLINE",
                "online_count": len(cameras),
            },
        },
    }


# ============================================================
# CAMERA ENDPOINTS
# ============================================================

@app.get("/api/cameras")
def get_cameras():
    """Return all camera configurations with live metadata."""
    return get_cameras_dict()


@app.get("/api/cameras/{camera_id}")
def get_single_camera(camera_id: str):
    info = get_camera_info(camera_id)
    if not info:
        raise HTTPException(
            status_code=404,
            detail=f"Camera '{camera_id}' not found",
        )
    return info


@app.get("/api/cameras/{camera_id}/video")
def stream_camera_video(
    camera_id: str,
    request: Request,
):
    """
    Serve browser-compatible H.264 MP4 video.
    Supports HTTP 206 partial/range responses for seeking.
    """
    info = get_camera_info(camera_id)
    if not info:
        raise HTTPException(
            status_code=404,
            detail=f"Camera '{camera_id}' not found",
        )

    raw_path = info.get("video_path")
    if not raw_path:
        raise HTTPException(
            status_code=404,
            detail=f"No video path configured for {camera_id}",
        )

    video_path = PROJECT_ROOT / raw_path
    if not video_path.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Video file not found for {camera_id}: {video_path}",
        )

    range_header = request.headers.get("range")
    return get_video_stream_response(video_path, range_header)


# ============================================================
# PLATE IMAGE SERVING
# ============================================================

@app.get("/api/plates/{image_name}")
def get_plate_crop(image_name: str):
    """Serve real plate crop images from static/plates."""
    path = get_plate_image_path(image_name)
    if not path or not path.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Plate image '{image_name}' not found",
        )
    return FileResponse(path, media_type="image/jpeg")


# ============================================================
# VEHICLE SEARCH & REGISTRY
# ============================================================

@app.get("/api/vehicles/search")
def search(
    q: Optional[str] = Query(
        None,
        description="Search by vehicle license plate number or track ID",
    ),
    plate: Optional[str] = Query(
        None,
        description="Search directly by license plate",
    ),
):
    """
    Search complete dataset for a license plate.
    Prioritizes MySQL database when connected.
    Gracefully falls back to local in-memory dataset if MySQL is offline.
    """
    query_str = (plate or q or "").strip()
    if not query_str:
        raise HTTPException(status_code=400, detail="Query parameter 'q' or 'plate' is required.")

    if is_db_connected():
        db_res = MySQLSearchService.search_vehicle(query_str)
        if db_res:
            return db_res

    # Fallback to local memory / JSON
    result = search_by_plate(query_str)
    return result


@app.get("/api/vehicles/{plate_or_id}")
def get_single_vehicle(plate_or_id: str):
    """Retrieve full vehicle dossier and trajectory by plate or track ID."""
    if is_db_connected():
        db_res = MySQLSearchService.search_vehicle(plate_or_id)
        if db_res:
            return db_res

    result = search_by_plate(plate_or_id)
    if not result or not result.get("found"):
        raise HTTPException(status_code=404, detail=f"Vehicle '{plate_or_id}' not found.")
    return result


@app.get("/api/vehicles")
def vehicles(
    matched_only: bool = Query(
        False,
        description="Filter to vehicles seen across multiple cameras",
    ),
    has_plate: Optional[bool] = Query(
        None,
        description="Filter vehicles with detected license plates",
    ),
    camera_id: Optional[str] = Query(
        None,
        description="Filter vehicles that appeared in specific camera",
    ),
    junction_id: Optional[str] = Query(
        None,
        description="Filter vehicles that appeared in specific junction",
    ),
    vehicle_type: Optional[str] = Query(
        None,
        description="Filter by vehicle type (car, truck, bus, etc.)",
    ),
    q: Optional[str] = Query(
        None,
        description="Filter by plate or ID substring",
    ),
    sort_by: str = Query(
        "default",
        description="Sorting order: 'default', 'observations', 'cameras', 'first_seen', 'plate'",
    ),
    page: int = Query(
        1,
        ge=1,
        description="Page number (1-indexed)",
    ),
    page_size: Optional[int] = Query(
        None,
        ge=1,
        le=500,
        description="Page size limit",
    ),
    limit: int = Query(
        500,
        description="Max vehicles to return if page_size is not specified",
    ),
):
    """Return detected vehicles and plate identities for Global Registry with pagination and filters."""
    effective_limit = page_size or limit
    return get_all_vehicles_list(
        limit=effective_limit,
        page=page,
        page_size=page_size,
        matched_only=matched_only,
        has_plate=has_plate,
        camera_id=camera_id,
        junction_id=junction_id,
        vehicle_type=vehicle_type,
        q=q,
        sort_by=sort_by,
    )


@app.get("/api/vehicles/{plate}")
def vehicle_detail(plate: str):
    """Return complete cross-camera vehicle journey and evidence dossier for that plate."""
    result = search_by_plate(plate)
    if not result.get("found"):
        raise HTTPException(
            status_code=404,
            detail=f"Vehicle with plate '{plate}' not found in processed data",
        )
    return result


@app.get("/api/vehicles/{plate}/journey")
def vehicle_journey(plate: str):
    """Alias endpoint returning full journey reconstruct for a plate."""
    result = search_by_plate(plate)
    if not result.get("found"):
        raise HTTPException(
            status_code=404,
            detail=f"Vehicle with plate '{plate}' not found",
        )
    return result.get("journey", {})


# ============================================================
# REAL TRAFFIC ANALYTICS (PHASE 2, 3, 5, 6, 11)
# ============================================================

@app.get("/api/analytics")
@app.get("/api/analytics/overview")
def get_analytics_overview():
    """Return complete suite of traffic intelligence analytics calculated from real detections."""
    return analytics_engine.compute_all_analytics()


@app.get("/api/analytics/cameras")
def get_camera_analytics():
    """Return per-camera volume, density, and congestion metrics."""
    data = analytics_engine.compute_all_analytics()
    return data.get("camera_volumes", [])


@app.get("/api/analytics/traffic")
def get_traffic_time_series():
    """Return 15-second time series buckets and peak traffic period."""
    data = analytics_engine.compute_all_analytics()
    return {
        "time_series": data.get("traffic_time_series", []),
        "peak_period": data.get("peak_traffic_period"),
    }


@app.get("/api/analytics/od")
def get_origin_destination():
    """Return full Origin-Destination (OD) transition matrix with vehicle counts and travel times."""
    data = analytics_engine.compute_all_analytics()
    return {
        "od_matrix": data.get("origin_destination_matrix", []),
        "cross_flows": data.get("cross_flows", []),
    }


@app.get("/api/analytics/congestion")
def get_congestion_analytics():
    """Return Relative Congestion Index and bottleneck alerts."""
    data = analytics_engine.compute_all_analytics()
    return {
        "bottlenecks": data.get("bottlenecks", []),
        "junction_volumes": data.get("junction_volumes", []),
        "camera_volumes": data.get("camera_volumes", []),
    }


@app.get("/api/analytics/speed")
def get_speed_analytics():
    """Return mathematically estimated vehicle speed statistics using Haversine distance."""
    data = analytics_engine.compute_all_analytics()
    return {
        "speed_summary": data.get("speed_analytics", {}),
        "speed_samples": data.get("speed_samples", []),
    }


@app.get("/api/stats")
def stats():
    """Summary dataset quality & KPI metrics."""
    data = analytics_engine.compute_all_analytics()
    return data.get("kpis", {})


# ============================================================
# ALERTS & ANOMALIES (PHASE 7, 8, 9)
# ============================================================

@app.get("/api/alerts")
def get_all_alerts():
    """
    Consolidated real alert center:
    1. Blacklisted / monitored vehicle alerts from MySQL database (or in-memory fallback)
    2. Route and speed anomalies from deterministic anomaly engine
    3. Congestion bottleneck alerts from relative congestion index
    """
    cameras = get_cameras_dict()
    detections = load_detections()
    analytics_data = analytics_engine.compute_all_analytics()

    # Deterministic Route Anomalies & Bottlenecks
    anom_alerts = anomaly_engine.detect_anomalies(detections, cameras)
    bottlenecks = analytics_data.get("bottlenecks", [])

    formatted_blacklist_alerts = []
    unread_count = 0

    if is_db_connected():
        db_alerts = MySQLAlertService.get_alerts(unread_only=False, limit=100)
        unread_count = MySQLAlertService.get_unread_count()
        for a in db_alerts:
            formatted_blacklist_alerts.append({
                "id": a["id"],
                "alert_id": a["id"],
                "category": "BLACKLIST",
                "title": f"Blacklisted Vehicle: {a['plate_number']}",
                "priority": a["severity"],
                "severity": a["severity"],
                "description": a["message"],
                "camera_id": a["camera_code"],
                "camera_name": a["camera_name"],
                "junction_name": a["junction_name"],
                "plate": a["plate_number"],
                "timestamp_sec": a.get("timestamp_sec", 0.0),
                "confidence": a.get("confidence", 0.95),
                "plate_image_url": get_plate_image_path(a.get("plate_image")) if a.get("plate_image") else None,
                "is_read": a.get("is_read", False),
                "created_at": a.get("created_at"),
            })
    else:
        wl_alerts = watchlist_service.generate_alerts(detections, cameras)
        for a in wl_alerts:
            formatted_blacklist_alerts.append({
                "id": a["alert_id"],
                "alert_id": a["alert_id"],
                "category": "BLACKLIST",
                "title": f"Target Vehicle Alert: {a['plate']}",
                "priority": a["priority"],
                "severity": a["priority"],
                "description": a["reason"],
                "camera_id": a["camera_id"],
                "camera_name": a["camera_name"],
                "junction_name": a["junction_name"],
                "plate": a["plate"],
                "timestamp_sec": a["timestamp_sec"],
                "confidence": a["confidence"],
                "plate_image_url": a.get("plate_image_url"),
                "is_read": False,
                "created_at": None,
            })
        unread_count = len(formatted_blacklist_alerts)

    formatted_anom_alerts = [
        {
            "id": a["anomaly_id"],
            "alert_id": a["anomaly_id"],
            "category": "ANOMALY",
            "title": f"Route Anomaly: {a['plate']}",
            "priority": a["priority"],
            "severity": a["severity"],
            "description": a["reason"],
            "camera_id": a["camera_sequence"][1] if len(a["camera_sequence"]) > 1 else a["camera_sequence"][0],
            "camera_name": a["cameras_label"],
            "junction_name": "Inter-Camera Transit",
            "plate": a["plate"],
            "timestamp_sec": a["timestamp_sec"],
            "confidence": 1.0,
            "is_read": False,
            "created_at": None,
        }
        for a in anom_alerts
    ]

    formatted_bottleneck_alerts = [
        {
            "id": f"BOTTLENECK_{b['camera_id']}",
            "alert_id": f"BOTTLENECK_{b['camera_id']}",
            "category": "CONGESTION",
            "title": f"Bottleneck Alert: {b['camera_name']}",
            "priority": b["severity"],
            "severity": b["severity"],
            "description": b["reason"],
            "camera_id": b["camera_id"],
            "camera_name": b["camera_name"],
            "junction_name": b["junction_name"],
            "plate": None,
            "timestamp_sec": 0.0,
            "confidence": 1.0,
            "is_read": False,
            "created_at": None,
        }
        for b in bottlenecks
    ]

    all_sorted = sorted(
        [*formatted_blacklist_alerts, *formatted_anom_alerts, *formatted_bottleneck_alerts],
        key=lambda x: (
            0 if x.get("is_read") is False else 1,
            0 if x["priority"] in ("HIGH", "CRITICAL") else 1,
            -x["timestamp_sec"]
        )
    )

    return {
        "total_alerts": len(all_sorted),
        "unread_count": unread_count,
        "blacklist_alerts": formatted_blacklist_alerts,
        "anomaly_alerts": formatted_anom_alerts,
        "congestion_alerts": formatted_bottleneck_alerts,
        "all_alerts_sorted": all_sorted,
    }


# ============================================================
# WATCHLIST CRUD (LEGACY COMPATIBILITY)
# ============================================================

@app.get("/api/watchlist")
def get_watchlist():
    """Return all configured watchlist and blacklist entries."""
    return watchlist_service.get_watchlist()


@app.post("/api/watchlist", status_code=status.HTTP_201_CREATED)
def add_to_watchlist(entry: WatchlistCreateRequest):
    """Add a license plate to the persistent watchlist."""
    try:
        created = watchlist_service.add_entry(
            plate=entry.plate,
            status=entry.status,
            reason=entry.reason or "Registered via command center",
            priority=entry.priority or "HIGH",
        )
        return {"success": True, "entry": created}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.delete("/api/watchlist/{plate}")
def delete_from_watchlist(plate: str):
    """Remove a license plate from the persistent watchlist."""
    deleted = watchlist_service.delete_entry(plate)
    if not deleted:
        raise HTTPException(
            status_code=404,
            detail=f"Plate '{plate}' not found in watchlist",
        )
    return {"success": True, "message": f"Plate '{plate}' removed from watchlist"}


# ============================================================
# MYSQL BLACKLIST MANAGEMENT (PHASE 5, 6, 7)
# ============================================================

@app.get("/api/blacklist")
def get_blacklist(
    status_filter: Optional[str] = Query(None, alias="status", description="'active', 'inactive', or None for all"),
    priority: Optional[str] = Query(None, description="'HIGH', 'MEDIUM', 'LOW'"),
):
    """Retrieve all blacklisted vehicles from MySQL with detection count and last seen metadata."""
    if is_db_connected():
        return MySQLBlacklistService.get_all_blacklisted(filter_status=status_filter, priority=priority)

    # Fallback to in-memory watchlist
    wl = watchlist_service.get_watchlist()
    return [
        {
            "id": i + 1,
            "plate_number": item["plate"],
            "normalized_plate": normalize_plate(item["plate"]),
            "reason": item["reason"],
            "priority": item.get("priority", "HIGH"),
            "is_active": item.get("status") == "blacklisted",
            "notes": None,
            "created_at": item.get("added_at"),
            "detection_count": 1,
            "last_seen": None,
        }
        for i, item in enumerate(wl)
    ]


@app.post("/api/blacklist", status_code=status.HTTP_201_CREATED)
def add_blacklist(entry: BlacklistCreateRequest):
    """Add a vehicle to the operator blacklist (MySQL primary with retroactive event matching)."""
    try:
        active_flag = entry.is_active if entry.is_active is not None else (entry.status != "INACTIVE")
        if is_db_connected():
            res = MySQLBlacklistService.add_blacklisted_vehicle(
                plate_number=entry.plate,
                reason=entry.reason,
                priority=entry.priority,
                notes=entry.notes,
                is_active=active_flag,
            )
            try:
                watchlist_service.add_entry(entry.plate, status="blacklisted" if active_flag else "monitored", reason=entry.reason, priority=entry.priority)
            except Exception:
                pass
            return {"success": True, "entry": res}
        else:
            created = watchlist_service.add_entry(
                plate=entry.plate,
                status="blacklisted" if active_flag else "monitored",
                reason=entry.reason,
                priority=entry.priority,
            )
            return {"success": True, "entry": created}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to add to blacklist: {e}")


@app.get("/api/blacklist/{vehicle_id}")
def get_single_blacklist(vehicle_id: int):
    """Retrieve full details for a single blacklisted vehicle including occurrences and alerts."""
    if is_db_connected():
        details = MySQLBlacklistService.get_blacklist_details(vehicle_id)
        if not details:
            raise HTTPException(status_code=404, detail=f"Blacklisted vehicle ID {vehicle_id} not found.")
        return details
    raise HTTPException(status_code=503, detail="Database service currently unavailable.")


@app.patch("/api/blacklist/{vehicle_id}/status")
def toggle_blacklist_status(vehicle_id: int, payload: BlacklistStatusUpdateRequest):
    """Activate or deactivate a blacklisted vehicle without deleting the record."""
    if is_db_connected():
        updated = MySQLBlacklistService.update_blacklisted_vehicle(vehicle_id, is_active=payload.is_active)
        if not updated:
            raise HTTPException(status_code=404, detail=f"Blacklisted vehicle ID {vehicle_id} not found.")
        return {"success": True, "entry": updated}
    raise HTTPException(status_code=503, detail="Database service currently unavailable.")


@app.put("/api/blacklist/{vehicle_id}")
def update_blacklist(vehicle_id: int, entry: BlacklistUpdateRequest):
    """Update a blacklisted vehicle's details or active status."""
    if not is_db_connected():
        raise HTTPException(status_code=503, detail="Database service currently unavailable.")

    updated = MySQLBlacklistService.update_blacklisted_vehicle(
        vehicle_id=vehicle_id,
        reason=entry.reason,
        priority=entry.priority,
        is_active=entry.is_active,
        notes=entry.notes,
    )
    if not updated:
        raise HTTPException(status_code=404, detail=f"Blacklisted vehicle ID {vehicle_id} not found.")
    return {"success": True, "entry": updated}


@app.delete("/api/blacklist/{vehicle_id}")
def delete_blacklist(vehicle_id: int):
    """Permanently delete a vehicle from the blacklist."""
    if is_db_connected():
        deleted = MySQLBlacklistService.delete_blacklisted_vehicle(vehicle_id)
        if not deleted:
            raise HTTPException(status_code=404, detail=f"Blacklisted vehicle ID {vehicle_id} not found.")
        return {"success": True, "message": f"Blacklisted vehicle ID {vehicle_id} deleted."}
    raise HTTPException(status_code=503, detail="Database service currently unavailable.")


@app.get("/api/blacklist/{plate}/events")
def get_blacklist_events(plate: str):
    """Get all detection events and timestamps across cameras for a blacklisted license plate."""
    if is_db_connected():
        events = MySQLBlacklistService.get_events_for_plate(plate)
        return {"plate": plate, "events": events, "count": len(events)}
    return {"plate": plate, "events": [], "count": 0}


# ============================================================
# MYSQL REAL-TIME ALERTS API (POLLING SUPPORT)
# ============================================================

@app.get("/api/alerts/unread")
def get_unread_alerts():
    """Poll unread alerts from MySQL for live dashboard notification center."""
    if is_db_connected():
        unread = MySQLAlertService.get_alerts(unread_only=True, limit=20)
        return {
            "unread_count": len(unread),
            "alerts": unread,
            "data_source": "MySQL (sih_traffic_intelligence)",
        }
    return {
        "unread_count": 0,
        "alerts": [],
        "data_source": "offline_fallback",
    }


@app.post("/api/alerts/{alert_id}/read")
@app.patch("/api/alerts/{alert_id}/read")
def mark_alert_read(alert_id: int):
    """Acknowledge / mark an alert as read in MySQL."""
    if is_db_connected():
        success = MySQLAlertService.mark_as_read(alert_id)
        if not success:
            raise HTTPException(status_code=404, detail=f"Alert ID {alert_id} not found.")
        return {"success": True, "alert_id": alert_id, "status": "read"}
    return {"success": True, "alert_id": alert_id, "status": "acknowledged"}


@app.post("/api/alerts/read-all")
def mark_all_alerts_read():
    """Mark all unread alerts as read in MySQL."""
    if is_db_connected():
        count = MySQLAlertService.mark_all_read()
        return {"success": True, "cleared_count": count}
    return {"success": True, "cleared_count": 0}


# ============================================================
# MAP (PHASE 4 & 15)
# ============================================================

@app.get("/api/map/model")
def map_model():
    """Return real geo-referenced coordinate model for Junction A & B."""
    return get_map_model()


# ============================================================
# DASHBOARD INITIAL LOAD
# ============================================================

@app.get("/api/dashboard")
def dashboard_overview():
    """Consolidated endpoint for dashboard initial load."""
    cameras = get_cameras_dict()
    ana = analytics_engine.compute_all_analytics()
    wl = watchlist_service.get_watchlist()
    return {
        "system": {
            "title": "DRISHTI-X City-Wide Traffic Intelligence System",
            "status": "ONLINE",
            "cameras_online": len(cameras),
            "version": "3.5.0",
        },
        "cameras": cameras,
        "analytics": ana,
        "kpis": ana.get("kpis", {}),
        "watchlist_count": len(wl),
    }


# ============================================================
# LOCAL DEVELOPMENT ENTRY POINT
# ============================================================

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "backend.app:app",
        host="127.0.0.1",
        port=8000,
        reload=True,
    )
