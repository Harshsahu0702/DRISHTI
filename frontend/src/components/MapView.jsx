import React, { useEffect, useState, useMemo } from "react";
import { Maximize2, Flame } from "lucide-react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  Circle,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { formatTime } from "../services/api";
import { FullMapModal } from "./FullMapModal";
import { JourneyRouteSummary } from "./JourneyRouteSummary";

// Intentional Junction Coordinates
const JUNCTION_COORDINATES = {
  junction_A: { lat: 23.710299, lng: 86.952779 },
  junction_B: { lat: 23.713932, lng: 86.952211 },
};

// Distinct coordinates for CCTV cameras so they are clearly spaced and visible
const CAMERA_KNOWN_LOCATIONS = {
  junction_A_camera_01: { lat: 23.710160, lng: 86.952620 },
  junction_A_camera_02: { lat: 23.710440, lng: 86.952940 },
  junction_B_camera_01: { lat: 23.713780, lng: 86.952060 },
  junction_B_camera_02: { lat: 23.714080, lng: 86.952360 },
};

function getCameraCoordinates(cameraId, junctionId, fallbackLat, fallbackLng) {
  if (cameraId && CAMERA_KNOWN_LOCATIONS[cameraId]) {
    return CAMERA_KNOWN_LOCATIONS[cameraId];
  }
  if (fallbackLat && fallbackLng && Number.isFinite(fallbackLat) && Number.isFinite(fallbackLng)) {
    return { lat: fallbackLat, lng: fallbackLng };
  }
  const coords = JUNCTION_COORDINATES[junctionId] || JUNCTION_COORDINATES["junction_A"];
  return { lat: coords.lat, lng: coords.lng };
}

// Leaflet custom CCTV Camera Icon
function createCameraIcon(camera, isSelected) {
  const camTitle = camera.camera_name || camera.name || "CCTV";
  return L.divIcon({
    className: "custom-leaflet-camera-div",
    html: `
      <div class="leaflet-cam-icon-wrapper ${isSelected ? "selected-cam" : ""}" title="${camTitle}">
        <div class="leaflet-cam-pulse-ring"></div>
        <div class="leaflet-cam-icon-badge">
          <svg class="leaflet-cam-svg" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/>
            <circle cx="12" cy="13" r="3"/>
          </svg>
        </div>
        <div class="leaflet-cam-label">${camTitle}</div>
      </div>
    `,
    iconSize: [44, 48],
    iconAnchor: [22, 19],
    popupAnchor: [0, -22],
  });
}

// Leaflet custom Vehicle Location Pin Icon
function createVehiclePinIcon(point, index, totalPoints, plate) {
  const isLatest = index === totalPoints - 1;
  const label = totalPoints === 1 ? (plate || "CAR") : (isLatest ? "TARGET" : `#${index + 1}`);

  return L.divIcon({
    className: "custom-leaflet-vehicle-pin-div",
    html: `
      <div class="leaflet-pin-wrapper ${isLatest ? "latest-pin" : ""}">
        <div class="leaflet-pin-pulse"></div>
        <div class="leaflet-pin-badge">${label}</div>
        <svg class="leaflet-pin-svg" xmlns="http://www.w3.org/2000/svg" width="30" height="38" viewBox="0 0 24 24" fill="#DC2626" stroke="#FFFFFF" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/>
          <circle cx="12" cy="10" r="3.2" fill="#FFFFFF"/>
        </svg>
      </div>
    `,
    iconSize: [32, 44],
    iconAnchor: [16, 38],
    popupAnchor: [0, -40],
  });
}

function MapBounds({ bounds }) {
  const map = useMap();
  useEffect(() => {
    if (bounds && bounds.length > 0) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
    }
  }, [bounds, map]);
  return null;
}

export function MapView({
  cameras,
  selectedVehicle,
  selectedCameraId,
  onCameraSelect,
  analytics,
  onPlayEvent,
  onOpenFullMap,
}) {
  const [isFullMapOpen, setIsFullMapOpen] = useState(false);
  const [showHeatmap, setShowHeatmap] = useState(false);

  const trajectory = useMemo(() => {
    if (!selectedVehicle) return [];
    return (
      selectedVehicle.trajectory ||
      selectedVehicle.events ||
      selectedVehicle.timeline ||
      []
    );
  }, [selectedVehicle]);

  // Look up camera analytics
  const cameraAnalyticsMap = useMemo(() => {
    const list = analytics?.camera_volumes || [];
    const map = {};
    for (const item of list) {
      map[item.camera_id] = item;
    }
    return map;
  }, [analytics]);

  // Generate camera markers
  const cameraMarkers = useMemo(() => {
    return Object.values(cameras || {}).map((camera) => {
      const junctionId = camera.junction_id || camera.scene || "junction_A";
      const coords = getCameraCoordinates(camera.id, junctionId, camera.lat, camera.lng);
      const camStats = cameraAnalyticsMap[camera.id] || {};

      return {
        ...camera,
        ...coords,
        vehicle_count: camStats.vehicle_count || 0,
        density_vpm: camStats.traffic_density_vpm || 0,
        congestion_index: camStats.relative_congestion_index ?? 35.0,
        congestion_level: camStats.congestion_level || "LOW",
        intensity_color: camStats.intensity_color || "#10B981",
        estimated_speed: camStats.estimated_speed_kmh,
        last_update: camStats.last_update_sec || 240,
      };
    });
  }, [cameras, cameraAnalyticsMap]);

  // Generate vehicle trajectory points (when vehicle is selected)
  const trajectoryPoints = useMemo(() => {
    if (trajectory.length > 0) {
      return trajectory.map((point) => {
        const junctionId = point.junction_id || point.junction || "junction_A";
        const cam = cameras ? cameras[point.camera_id] : null;
        const coords = getCameraCoordinates(
          point.camera_id,
          junctionId,
          point.lat || cam?.lat,
          point.lng || cam?.lng
        );
        return {
          ...point,
          ...coords,
        };
      });
    }

    // Single point fallback for selected vehicle
    if (selectedVehicle) {
      const camId =
        selectedVehicle.last_camera_id ||
        selectedVehicle.first_camera_id ||
        selectedVehicle.camera_id;
      if (camId) {
        const cam = cameras ? cameras[camId] : null;
        const coords = getCameraCoordinates(
          camId,
          selectedVehicle.junction_id || cam?.junction_id || "junction_A",
          selectedVehicle.lat || cam?.lat,
          selectedVehicle.lng || cam?.lng
        );
        return [
          {
            camera_id: camId,
            camera_name: cam?.camera_name || camId,
            ...coords,
          },
        ];
      }
    }

    return [];
  }, [trajectory, selectedVehicle, cameras]);

  // Calculate map bounds
  const mapBounds = useMemo(() => {
    if (trajectoryPoints.length > 0) {
      return trajectoryPoints.map((point) => [point.lat, point.lng]);
    }
    if (cameraMarkers.length > 0) {
      return cameraMarkers.map((camera) => [camera.lat, camera.lng]);
    }
    return null;
  }, [trajectoryPoints, cameraMarkers]);

  return (
    <div className="geospatial-map-card">
      <div className="section-header-block map-card-header-flex" style={{ marginBottom: "8px" }}>
        <div>
          <div className="section-eyebrow">City Map & GPS Route</div>
          <h2 className="section-main-heading">
            Vehicle Journey & Route Map
          </h2>
          <p className="section-subtext">
            Tracked vehicle route across city CCTV cameras and roads.
          </p>
        </div>

        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <button
            type="button"
            className="btn-map-expand font-mono"
            onClick={() => setShowHeatmap(!showHeatmap)}
            style={{
              border: showHeatmap ? "1.5px solid #DC2626" : undefined,
              color: showHeatmap ? "#DC2626" : undefined,
              background: showHeatmap ? "rgba(220, 38, 38, 0.12)" : undefined,
            }}
            title="Toggle City-Wide Traffic Density Heatmap"
          >
            <Flame size={13} style={{ color: showHeatmap ? "#DC2626" : "var(--text-muted)" }} />
            <span>{showHeatmap ? "Heatmap: ON" : "Heatmap"}</span>
          </button>

          <button
            type="button"
            className="btn-map-expand font-mono"
            onClick={() => (onOpenFullMap ? onOpenFullMap() : setIsFullMapOpen(true))}
            title="Open Fullscreen Route Map & Video Playback"
          >
            <Maximize2 size={13} />
            <span>View Large Map</span>
          </button>
        </div>
      </div>

      {/* Target Sub-status Indicator */}
      <div className="map-subhead-banner font-mono">
        {selectedVehicle ? (
          <span className="map-active-target-tag">
            SELECTED VEHICLE: {selectedVehicle.plate || selectedVehicle.global_vehicle_id} ({selectedVehicle.camera_count || trajectoryPoints.length} Cameras • {selectedVehicle.observation_count || trajectoryPoints.length} Sightings • Speed: {selectedVehicle.estimated_average_speed_label || "N/A"})
          </span>
        ) : (
          <span style={{ color: "var(--text-muted)" }}>
            SELECT OR SEARCH A TARGET PLATE TO RECONSTRUCT TRAJECTORY
          </span>
        )}
      </div>

      {/* Leaflet Map Frame */}
      <div className="map-container-frame">
        <MapContainer
          center={[23.7121, 86.9525]}
          zoom={16}
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          />

          {/* Traffic Density Heatmap Layer */}
          {showHeatmap && cameraMarkers.map((camera) => (
            <React.Fragment key={`mini-heatmap-${camera.id}`}>
              <Circle
                center={[camera.lat, camera.lng]}
                radius={100}
                pathOptions={{
                  color: "#DC2626",
                  fillColor: "#DC2626",
                  fillOpacity: 0.14,
                  weight: 0,
                }}
              />
              <Circle
                center={[camera.lat, camera.lng]}
                radius={60}
                pathOptions={{
                  color: "#D97706",
                  fillColor: "#D97706",
                  fillOpacity: 0.25,
                  weight: 0,
                }}
              />
              <Circle
                center={[camera.lat, camera.lng]}
                radius={28}
                pathOptions={{
                  color: "#EF4444",
                  fillColor: "#EF4444",
                  fillOpacity: 0.42,
                  weight: 1,
                }}
              />
            </React.Fragment>
          ))}

          {/* Vehicle trajectory polyline - RED COLOR when path exists */}
          {trajectoryPoints.length > 1 && (
            <Polyline
              positions={trajectoryPoints.map((p) => [p.lat, p.lng])}
              color="#DC2626"
              weight={4}
              opacity={0.9}
            />
          )}

          {/* Camera Node Markers with CAMERA ICONS */}
          {cameraMarkers.map((camera) => (
            <Marker
              key={camera.id}
              position={[camera.lat, camera.lng]}
              icon={createCameraIcon(camera, camera.id === selectedCameraId)}
              eventHandlers={{
                click: () => onCameraSelect?.(camera.id),
              }}
            >
              <Popup>
                <div style={{ fontFamily: "var(--font-sans)", minWidth: "190px" }}>
                  <strong style={{ color: "var(--text-primary)" }}>{camera.name || camera.id}</strong>
                  <br />
                  <span style={{ color: "var(--text-muted)", fontSize: "12px" }}>
                    Junction: {camera.junction_name || camera.junction_id}
                  </span>
                  <div style={{ marginTop: "6px", fontSize: "11px", fontFamily: "var(--font-mono)" }}>
                    Vehicles: <strong>{camera.vehicle_count}</strong> • Congestion:{" "}
                    <strong style={{ color: camera.intensity_color }}>{camera.congestion_level}</strong>
                  </div>
                  <div style={{ color: "var(--status-success)", fontWeight: 600, fontSize: "11px", marginTop: "4px" }}>
                    ● Operational CCTV Feed
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}

          {/* Vehicle Location PIN Markers (When a car is selected) */}
          {trajectoryPoints.map((point, index) => (
            <Marker
              key={`trajectory-${index}`}
              position={[point.lat, point.lng]}
              icon={createVehiclePinIcon(
                point,
                index,
                trajectoryPoints.length,
                selectedVehicle?.plate || selectedVehicle?.global_vehicle_id
              )}
              eventHandlers={{
                click: () => onCameraSelect?.(point.camera_id),
              }}
            >
              <Popup>
                <div style={{ fontFamily: "var(--font-sans)" }}>
                  <div style={{ fontWeight: 800, color: "#DC2626", marginBottom: "4px" }}>
                    {selectedVehicle?.plate || "TARGET VEHICLE"}
                  </div>
                  <strong>Observation #{index + 1}</strong>
                  <br />
                  Camera: {point.camera_name || point.camera_id}
                  <br />
                  Time: {formatTime(point.timestamp_sec || point.timestamp)}
                  <br />
                  Est. Speed: {point.speed ? `${point.speed} km/h` : "N/A"}
                </div>
              </Popup>
            </Marker>
          ))}

          {mapBounds && <MapBounds bounds={mapBounds} />}
        </MapContainer>
      </div>

      {/* Camera filter / quick selection chips */}
      <div className="map-camera-filter-strip">
        <span style={{ fontSize: "11px", fontWeight: "700", color: "var(--text-muted)", textTransform: "uppercase" }}>
          Surveillance Nodes:
        </span>
        {cameraMarkers.map((camera) => {
          const prefix = camera.junction_id === "junction_A" ? "J-A: " : "J-B: ";
          return (
            <button
              key={camera.id}
              type="button"
              className={`map-cam-btn ${camera.id === selectedCameraId ? "active" : ""}`}
              onClick={() => onCameraSelect?.(camera.id)}
            >
              <span
                style={{
                  display: "inline-block",
                  width: "7px",
                  height: "7px",
                  borderRadius: "50%",
                  backgroundColor: camera.intensity_color,
                  marginRight: "5px",
                }}
              />
              {prefix}{camera.camera_name || camera.name}
            </button>
          );
        })}
      </div>

      {/* CLEAN & SPACIOUS CROSS-JUNCTION JOURNEY SUMMARY */}
      <JourneyRouteSummary
        selectedVehicle={selectedVehicle}
        cameras={cameras}
      />

      {/* FULL EXPANDED MAP & PLAYBACK MODAL (when self-contained) */}
      {!onOpenFullMap && (
        <FullMapModal
          isOpen={isFullMapOpen}
          onClose={() => setIsFullMapOpen(false)}
          cameras={cameras}
          selectedVehicle={selectedVehicle}
          selectedCameraId={selectedCameraId}
          onCameraSelect={onCameraSelect}
          onPlayEvent={onPlayEvent}
        />
      )}
    </div>
  );
}
