/**
 * frontend/src/services/api.js
 *
 * Backend-first API client for DRISHTI-X Traffic Intelligence System.
 * All data flows from the backend (which reads from detections.json).
 * Local JSON fallback is used only when backend is offline.
 */

export const API_BASE =
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

/* =========================================================
   BACKEND REQUEST
========================================================= */

async function request(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const response = await fetch(url, options);

  if (!response.ok) {
    let msg = `HTTP ${response.status} from ${path}`;
    try {
      const errJson = await response.json();
      if (errJson && errJson.detail) {
        msg = errJson.detail;
      }
    } catch (_) {}
    throw new Error(msg);
  }

  return response.json();
}

/* =========================================================
   HELPERS
========================================================= */

function firstDefined(...values) {
  return values.find(
    (value) => value !== undefined && value !== null && value !== ""
  );
}

function toNumber(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/* =========================================================
   NORMALIZE OBSERVATION (for backend vehicle trajectory)
========================================================= */

function normalizeObservation(observation = {}, index = 0) {
  const cameraId = firstDefined(
    observation.camera_id,
    observation.camera,
    observation.cam_id,
    observation.cameraId,
    observation.source_camera,
    `camera_${String(index + 1).padStart(2, "0")}`
  );

  const junctionId = firstDefined(
    observation.junction_id,
    observation.junction,
    observation.site_id,
    observation.site,
    observation.location_id,
    null
  );

  const timestamp = firstDefined(
    observation.timestamp_sec,
    observation.first_time_sec,
    observation.timestamp,
    observation.time,
    observation.time_seconds,
    observation.video_timestamp,
    observation.frame_time,
    observation.seconds,
    observation.start_timestamp,
    null
  );

  const timestampSeconds = toNumber(timestamp, 0);

  const endTimestamp = firstDefined(
    observation.last_timestamp_sec,
    observation.last_time_sec,
    observation.end_timestamp,
    observation.end_time_sec,
    null
  );

  const endTimestampSeconds = toNumber(endTimestamp, timestampSeconds);

  const duration = firstDefined(
    observation.duration_sec,
    observation.duration,
    null
  );

  const durationSeconds = toNumber(duration, null);

  const vehicleId = firstDefined(
    observation.vehicle_track_id,
    observation.vehicle_id,
    observation.track_id,
    observation.id,
    null
  );

  return {
    ...observation,

    camera_id: cameraId,
    junction_id: junctionId,

    camera_name: firstDefined(
      observation.camera_name,
      observation.camera,
      cameraId
    ),

    junction_name: firstDefined(
      observation.junction_name,
      observation.junction,
      junctionId
    ),

    timestamp: timestamp,
    timestamp_seconds: timestampSeconds,
    start_timestamp: timestampSeconds,
    end_timestamp: endTimestampSeconds,
    duration: durationSeconds,
    first_time_sec: timestampSeconds,
    last_time_sec: endTimestampSeconds,
    duration_sec: durationSeconds,

    frame: firstDefined(
      observation.frame,
      observation.frame_number,
      observation.frame_id,
      observation.first_frame,
      null
    ),

    track_id: vehicleId,
    vehicle_id: vehicleId,

    confidence: toNumber(
      firstDefined(
        observation.ocr_confidence,
        observation.confidence,
        observation.detection_confidence,
        observation.vehicle_confidence
      ),
      null
    ),
  };
}

/* =========================================================
   NORMALIZE VEHICLE (works with backend /api/vehicles data)
========================================================= */

function normalizeVehicle(vehicle = {}, index = 0) {
  const globalVehicleId = firstDefined(
    vehicle.global_vehicle_id,
    vehicle.global_id,
    vehicle.plate,
    vehicle.vehicle_id,
    vehicle.track_id,
    vehicle.id,
    `VEHICLE_${String(index + 1).padStart(5, "0")}`
  );

  const plate = firstDefined(
    vehicle.plate,
    vehicle.plate_number,
    vehicle.license_plate,
    vehicle.registration_number,
    vehicle.number_plate,
    vehicle.anpr_plate,
    null
  );

  const vehicleType = firstDefined(
    vehicle.vehicle_type,
    vehicle.type,
    vehicle.class_name,
    vehicle.class,
    vehicle.vehicle_class,
    "Unknown"
  );

  let rawTrajectory = firstDefined(
    vehicle.trajectory,
    vehicle.detections,
    vehicle.timeline,
    vehicle.observations,
    vehicle.path,
    vehicle.vehicle_path,
    vehicle.camera_path,
    vehicle.events,
    []
  );

  if (!Array.isArray(rawTrajectory)) {
    rawTrajectory = [];
  }

  const trajectory = rawTrajectory
    .map((obs, i) => normalizeObservation(obs, i))
    .sort((a, b) => {
      const timeA = a.timestamp_seconds ?? a.first_time_sec ?? a.start_timestamp ?? 0;
      const timeB = b.timestamp_seconds ?? b.first_time_sec ?? b.start_timestamp ?? 0;
      return timeA - timeB;
    });

  const cameraIdsFromTrajectory = [
    ...new Set(
      trajectory.map((obs) => obs.camera_id).filter(Boolean)
    ),
  ];

  const junctionIdsFromTrajectory = [
    ...new Set(
      trajectory
        .map((obs) => obs.junction_id || obs.junction)
        .filter(Boolean)
    ),
  ];

  const explicitCameras = firstDefined(
    vehicle.camera_ids,
    vehicle.cameras,
    vehicle.camera_list,
    []
  );

  const cameraList = Array.isArray(explicitCameras) ? explicitCameras : [];

  const cameraIds = [
    ...new Set([
      ...cameraIdsFromTrajectory,
      ...cameraList.map((camera) =>
        typeof camera === "string"
          ? camera
          : firstDefined(camera?.camera_id, camera?.id, camera?.camera, null)
      ),
    ].filter(Boolean)),
  ];

  const explicitJunctions = firstDefined(
    vehicle.junctions,
    vehicle.junction_ids,
    vehicle.sites,
    []
  );

  const junctionList = Array.isArray(explicitJunctions) ? explicitJunctions : [];

  const junctionIds = [
    ...new Set([
      ...junctionIdsFromTrajectory,
      ...junctionList.map((junction) =>
        typeof junction === "string"
          ? junction
          : firstDefined(junction?.junction_id, junction?.id, junction?.junction, null)
      ),
    ].filter(Boolean)),
  ];

  const cameraCount = Number(firstDefined(
    vehicle.camera_count,
    vehicle.num_cameras,
    vehicle.cameras_count,
    cameraIds.length
  )) || cameraIds.length;

  const junctionCount = Number(firstDefined(
    vehicle.junction_count,
    vehicle.num_junctions,
    junctionIds.length
  )) || junctionIds.length;

  const observationCount = Number(firstDefined(
    vehicle.observation_count,
    vehicle.num_observations,
    trajectory.length
  )) || trajectory.length;

  const hasPlate =
    vehicle.has_plate !== undefined
      ? Boolean(vehicle.has_plate)
      : Boolean(plate);

  const firstSeen = trajectory.length > 0
    ? firstDefined(
        vehicle.first_seen,
        vehicle.first_timestamp,
        trajectory[0]?.timestamp_seconds,
        trajectory[0]?.first_time_sec,
        trajectory[0]?.start_timestamp,
        null
      )
    : null;

  const lastSeen = trajectory.length > 0
    ? firstDefined(
        vehicle.last_seen,
        vehicle.last_timestamp,
        trajectory[trajectory.length - 1]?.timestamp_seconds,
        trajectory[trajectory.length - 1]?.last_time_sec,
        trajectory[trajectory.length - 1]?.end_timestamp,
        null
      )
    : null;

  return {
    ...vehicle,
    global_vehicle_id: globalVehicleId,
    plate: plate,
    plate_number: plate,
    plate_text: plate,
    has_plate: hasPlate,
    vehicle_type: vehicleType,
    trajectory,
    camera_ids: cameraIds,
    cameras: cameraIds,
    junction_ids: junctionIds,
    junctions: junctionIds,
    camera_count: cameraCount,
    junction_count: junctionCount,
    observation_count: observationCount,
    first_seen: firstSeen,
    last_seen: lastSeen,
    reid_confidence: toNumber(
      firstDefined(
        vehicle.reid_confidence,
        vehicle.reid_score,
        vehicle.similarity
      ),
      null
    ),
  };
}

/* =========================================================
   SEARCH HELPER (for local fallback)
========================================================= */

function matchesVehicle(vehicle, query) {
  if (!query) return true;
  const q = String(query).trim().toLowerCase();
  if (!q) return true;

  const searchableFields = [
    vehicle.global_vehicle_id,
    vehicle.plate,
    vehicle.plate_number,
    vehicle.plate_text,
    vehicle.vehicle_type,
    ...(vehicle.camera_ids || []),
    ...(vehicle.junction_ids || []),
    ...(vehicle.cameras || []),
    ...(vehicle.junctions || []),
  ];

  return searchableFields.some((value) =>
    String(value ?? "").toLowerCase().includes(q)
  );
}

/* =========================================================
   API OBJECT
========================================================= */

export const api = {
  /* -------------------------------------------------------
     HEALTH
  ------------------------------------------------------- */

  getHealth: () => request("/api/health"),

  getSystemHealth: () => request("/api/system/health"),

  /* -------------------------------------------------------
     CAMERAS — Backend first, local fallback
  ------------------------------------------------------- */

  getCameras: async () => {
    try {
      return await request("/api/cameras");
    } catch (error) {
      console.warn("[Cameras] Backend unavailable:", error);
      return {};
    }
  },

  /* -------------------------------------------------------
     VEHICLES — Backend first (reads from detections.json)
  ------------------------------------------------------- */

  getVehicles: async (params = {}) => {
    try {
      const queryParts = [];
      if (params.limit) queryParts.push(`limit=${params.limit}`);
      if (params.matched_only) queryParts.push("matched_only=true");
      if (params.has_plate !== undefined) queryParts.push(`has_plate=${params.has_plate}`);
      if (params.camera_id) queryParts.push(`camera_id=${encodeURIComponent(params.camera_id)}`);

      const qs = queryParts.length > 0 ? `?${queryParts.join("&")}` : "";
      const data = await request(`/api/vehicles${qs}`);

      if (Array.isArray(data)) {
        return data.map((v, i) => normalizeVehicle(v, i));
      }
      return [];
    } catch (error) {
      console.warn("[Vehicles] Backend unavailable, returning empty:", error);
      return [];
    }
  },

  /* -------------------------------------------------------
     SINGLE VEHICLE
  ------------------------------------------------------- */

  getVehicle: async (globalVehicleId) => {
    try {
      const data = await request(
        `/api/vehicles/${encodeURIComponent(globalVehicleId)}`
      );
      return normalizeVehicle(data, 0);
    } catch (error) {
      console.warn("[Vehicle Detail] Backend unavailable:", error);
      return null;
    }
  },

  /* -------------------------------------------------------
     VEHICLE SEARCH — Backend first
  ------------------------------------------------------- */

  searchVehicles: async (q) => {
    try {
      const data = await request(
        `/api/vehicles/search?q=${encodeURIComponent(q)}`
      );
      if (data && data.found) {
        return [normalizeVehicle(data, 0)];
      }
      return [];
    } catch (error) {
      console.warn("[Search] Backend unavailable:", error);
      return [];
    }
  },

  /* -------------------------------------------------------
     STATS
  ------------------------------------------------------- */

  getStats: async () => {
    try {
      return await request("/api/stats");
    } catch (error) {
      console.warn("[Stats] Backend unavailable:", error);
      return {
        total_vehicles: 0,
        total_cameras: 4,
      };
    }
  },

  /* -------------------------------------------------------
     ANALYTICS
  ------------------------------------------------------- */

  getAnalytics: async () => {
    try {
      return await request("/api/analytics");
    } catch (error) {
      console.warn("[Analytics] Backend unavailable:", error);
      return {
        kpis: {
          cameras_online: 4,
          total_tracks: 0,
          total_detections: 0,
          unique_plates: 0,
        },
        vehicle_types: [],
        camera_volumes: [],
        cross_flows: [],
      };
    }
  },

  /* -------------------------------------------------------
     MAP
  ------------------------------------------------------- */

  getMapModel: async () => {
    try {
      return await request("/api/map/model");
    } catch (error) {
      console.warn("[Map] Backend map model unavailable:", error);
      return {
        cameras: {},
        vehicles: [],
      };
    }
  },

  /* -------------------------------------------------------
     ALERTS & ANOMALIES
  ------------------------------------------------------- */

  getAlerts: async () => {
    try {
      return await request("/api/alerts");
    } catch (error) {
      console.warn("[Alerts] Backend unavailable:", error);
      return {
        total_alerts: 0,
        blacklist_alerts: [],
        anomaly_alerts: [],
        congestion_alerts: [],
        all_alerts_sorted: [],
      };
    }
  },

  /* -------------------------------------------------------
     MYSQL DATABASE STATUS
  ------------------------------------------------------- */

  getDbStatus: async () => {
    try {
      return await request("/api/db/status");
    } catch (error) {
      console.warn("[DB Status] Unavailable:", error);
      return { status: "disconnected" };
    }
  },

  /* -------------------------------------------------------
     MYSQL BLACKLIST CRUD (PHASE 5, 6, 7)
  ------------------------------------------------------- */

  getBlacklist: async (params = {}) => {
    try {
      const q = [];
      if (params.status) q.push(`status=${encodeURIComponent(params.status)}`);
      if (params.priority) q.push(`priority=${encodeURIComponent(params.priority)}`);
      const qs = q.length > 0 ? `?${q.join("&")}` : "";
      return await request(`/api/blacklist${qs}`);
    } catch (error) {
      console.warn("[Blacklist] API error, falling back to watchlist:", error);
      return [];
    }
  },

  addBlacklist: async (entry) => {
    return await request("/api/blacklist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry),
    });
  },

  updateBlacklist: async (id, data) => {
    return await request(`/api/blacklist/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  },

  deleteBlacklist: async (id) => {
    return await request(`/api/blacklist/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  },

  getBlacklistEvents: async (plate) => {
    try {
      return await request(`/api/blacklist/${encodeURIComponent(plate)}/events`);
    } catch (error) {
      console.warn("[Blacklist Events] Error:", error);
      return { plate, events: [], count: 0 };
    }
  },

  /* -------------------------------------------------------
     MYSQL ALERTS & POLLING
  ------------------------------------------------------- */

  getUnreadAlerts: async () => {
    try {
      return await request("/api/alerts/unread");
    } catch (error) {
      return { unread_count: 0, alerts: [] };
    }
  },

  markAlertRead: async (id) => {
    return await request(`/api/alerts/${encodeURIComponent(id)}/read`, {
      method: "POST",
    });
  },

  markAllAlertsRead: async () => {
    return await request("/api/alerts/read-all", {
      method: "POST",
    });
  },

  /* -------------------------------------------------------
     WATCHLIST CRUD (LEGACY)
  ------------------------------------------------------- */

  getWatchlist: async () => {
    try {
      return await request("/api/watchlist");
    } catch (error) {
      console.warn("[Watchlist] Backend unavailable:", error);
      return [];
    }
  },

  addToWatchlist: async (entry) => {
    return await request("/api/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry),
    });
  },

  deleteFromWatchlist: async (plate) => {
    return await request(`/api/watchlist/${encodeURIComponent(plate)}`, {
      method: "DELETE",
    });
  },

  /* -------------------------------------------------------
     SPECIALIZED ANALYTICS (OD, Congestion, Speed)
  ------------------------------------------------------- */

  getOriginDestination: async () => {
    try {
      return await request("/api/analytics/od");
    } catch (error) {
      console.warn("[OD Analytics] Backend unavailable:", error);
      return { od_matrix: [], cross_flows: [] };
    }
  },

  getCongestionAnalytics: async () => {
    try {
      return await request("/api/analytics/congestion");
    } catch (error) {
      console.warn("[Congestion Analytics] Backend unavailable:", error);
      return { bottlenecks: [], junction_volumes: [], camera_volumes: [] };
    }
  },

  getSpeedAnalytics: async () => {
    try {
      return await request("/api/analytics/speed");
    } catch (error) {
      console.warn("[Speed Analytics] Backend unavailable:", error);
      return { speed_summary: {}, speed_samples: [] };
    }
  },

  /* -------------------------------------------------------
     SYSTEM HEALTH
  ------------------------------------------------------- */

  getSystemHealth: async () => {
    try {
      return await request("/api/system/health");
    } catch (error) {
      console.warn("[System Health] Backend unavailable:", error);
      return null;
    }
  },

  /* -------------------------------------------------------
     PLATE IMAGE
  ------------------------------------------------------- */

  getPlateImageUrl: (imageName) =>
    imageName
      ? `${API_BASE}/api/plates/${encodeURIComponent(
          typeof imageName === "string" && imageName.includes("/")
            ? imageName.split("/").pop()
            : imageName
        )}`
      : null,

  /* -------------------------------------------------------
     CAMERA VIDEO
  ------------------------------------------------------- */

  getCameraVideoUrl: (cameraId) =>
    `${API_BASE}/api/cameras/${encodeURIComponent(cameraId)}/video`,

  /* -------------------------------------------------------
     MAP BACKGROUND
  ------------------------------------------------------- */

  getMapBackgroundUrl: () =>
    `${API_BASE}/api/map/background`,

  /* -------------------------------------------------------
     DASHBOARD (consolidated endpoint)
  ------------------------------------------------------- */

  getDashboard: async () => {
    try {
      return await request("/api/dashboard");
    } catch (error) {
      console.warn("[Dashboard] Backend unavailable:", error);
      return null;
    }
  },

  /* -------------------------------------------------------
     ALERTS & WATCHLIST (PHASE 7, 8, 9)
  ------------------------------------------------------- */

  getAlerts: async () => {
    try {
      return await request("/api/alerts");
    } catch (error) {
      console.warn("[Alerts] Failed to fetch alerts:", error);
      return { total_alerts: 0, alerts: [] };
    }
  },

  getWatchlist: async () => {
    try {
      return await request("/api/watchlist");
    } catch (error) {
      console.warn("[Watchlist] Failed to fetch watchlist:", error);
      return [];
    }
  },

  addToWatchlist: async (plate, reason, priority = "HIGH") => {
    return await request("/api/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plate, reason, priority }),
    });
  },

  removeFromWatchlist: async (plate) => {
    return await request(`/api/watchlist/${encodeURIComponent(plate)}`, {
      method: "DELETE",
    });
  },

  /* -------------------------------------------------------
     EXTENDED ANALYTICS (PHASE 2, 3, 5, 6)
  ------------------------------------------------------- */

  getOdMatrix: async () => {
    try {
      return await request("/api/analytics/od");
    } catch (error) {
      return [];
    }
  },

  getSpeedAnalytics: async () => {
    try {
      return await request("/api/analytics/speed");
    } catch (error) {
      return {};
    }
  },

  getCongestion: async () => {
    try {
      return await request("/api/analytics/congestion");
    } catch (error) {
      return {};
    }
  },

  getBottlenecks: async () => {
    try {
      return await request("/api/analytics/bottlenecks");
    } catch (error) {
      return [];
    }
  },
};

/* =========================================================
   FORMATTERS
========================================================= */

export function formatTime(seconds) {
  if (seconds === null || seconds === undefined) {
    return "-";
  }

  const value = Number(seconds);

  if (!Number.isFinite(value)) {
    return "-";
  }

  const minutes = Math.floor(value / 60);
  const secs = (value % 60).toFixed(1);

  if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }

  return `${secs}s`;
}

export function formatTimestampSec(seconds) {
  if (seconds === null || seconds === undefined) {
    return "00:00";
  }

  const value = Number(seconds);

  if (!Number.isFinite(value)) {
    return "00:00";
  }

  const minutes = Math.floor(value / 60);
  const secs = Math.floor(value % 60);

  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function formatPercent(value) {
  if (value === null || value === undefined) {
    return "-";
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "-";
  }

  return number <= 1
    ? `${(number * 100).toFixed(1)}%`
    : `${number.toFixed(1)}%`;
}

console.info("[API] Backend-first API client initialized. Base:", API_BASE);