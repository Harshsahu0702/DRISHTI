import React, { useEffect, useState, useMemo } from "react";
import { MapPin, Navigation, Eye, Activity, Flame, Shield, Layers } from "lucide-react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  CircleMarker,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { api, formatTime } from "../services/api";

// Fix default marker icons in Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

// Intentional Junction Coordinates
const JUNCTION_COORDINATES = {
  junction_A: { lat: 23.710299, lng: 86.952779 },
  junction_B: { lat: 23.713932, lng: 86.952211 },
};

function getCameraCoordinates(cameraId, junctionId, fallbackLat, fallbackLng) {
  if (fallbackLat && fallbackLng && Number.isFinite(fallbackLat) && Number.isFinite(fallbackLng)) {
    return { lat: fallbackLat, lng: fallbackLng };
  }
  const coords = JUNCTION_COORDINATES[junctionId] || JUNCTION_COORDINATES["junction_A"];
  return { lat: coords.lat, lng: coords.lng };
}

function MapBounds({ bounds }) {
  const map = useMap();
  useEffect(() => {
    if (bounds && bounds.length > 0) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
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
}) {
  const [mapMode, setMapMode] = useState("trajectory"); // 'trajectory' (Mode A) or 'traffic' (Mode B)
  const [mapModel, setMapModel] = useState(null);

  useEffect(() => {
    api
      .getMapModel()
      .then(setMapModel)
      .catch((error) => {
        console.warn("Failed to load map model:", error);
      });
  }, []);

  const trajectory = selectedVehicle?.trajectory || [];

  // Look up camera analytics for Mode B
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

  // Generate trajectory points for Mode A
  const trajectoryPoints = useMemo(() => {
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
  }, [trajectory, cameras]);

  // Corridor route points between Junction A and B
  const corridorRoute = useMemo(() => {
    if (mapModel?.route_corridor && Array.isArray(mapModel.route_corridor)) {
      return mapModel.route_corridor;
    }
    return [
      [23.710299, 86.952779],
      [23.710293, 86.952695],
      [23.712100, 86.952500],
      [23.713932, 86.952211],
      [23.713929, 86.952144],
    ];
  }, [mapModel]);

  // Calculate map bounds
  const mapBounds = useMemo(() => {
    if (mapMode === "trajectory" && trajectoryPoints.length > 0) {
      return trajectoryPoints.map((point) => [point.lat, point.lng]);
    }
    if (cameraMarkers.length > 0) {
      return cameraMarkers.map((camera) => [camera.lat, camera.lng]);
    }
    return null;
  }, [mapMode, trajectoryPoints, cameraMarkers]);

  return (
    <div className="geospatial-map-card">
      <div className="section-header-block" style={{ marginBottom: "8px" }}>
        <div>
          <div className="section-eyebrow">Geospatial Intelligence</div>
          <h2 className="section-main-heading">
            {mapMode === "trajectory"
              ? "Vehicle Journey & Trajectory Map"
              : "City Traffic Intelligence & Heatmap"}
          </h2>
          <p className="section-subtext">
            {mapMode === "trajectory"
              ? "Reconstructed target route across urban CCTV nodes and highway corridor."
              : "Live camera traffic density, relative congestion index, and corridor load distribution."}
          </p>
        </div>

        {/* Dual Mode Switcher */}
        <div className="map-mode-toggle-group">
          <button
            type="button"
            className={`map-toggle-btn font-mono ${mapMode === "trajectory" ? "active" : ""}`}
            onClick={() => setMapMode("trajectory")}
          >
            <Navigation size={13} />
            MODE A: TARGET JOURNEY
          </button>
          <button
            type="button"
            className={`map-toggle-btn font-mono ${mapMode === "traffic" ? "active" : ""}`}
            onClick={() => setMapMode("traffic")}
          >
            <Flame size={13} />
            MODE B: TRAFFIC INTEL
          </button>
        </div>
      </div>

      {/* Mode Sub-status Indicator */}
      <div className="map-subhead-banner font-mono">
        {mapMode === "trajectory" ? (
          selectedVehicle ? (
            <span className="map-active-target-tag">
              ACTIVE TARGET: {selectedVehicle.plate || selectedVehicle.global_vehicle_id} ({selectedVehicle.camera_count} Cameras • {selectedVehicle.observation_count} Observations • Speed: {selectedVehicle.estimated_average_speed_label || "N/A"})
            </span>
          ) : (
            <span style={{ color: "var(--text-muted)" }}>
              SELECT OR SEARCH A TARGET PLATE TO RECONSTRUCT TRAJECTORY
            </span>
          )
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
            <span>SURVEILLANCE GRID: JUNCTION A ↔ JUNCTION B INTER-CITY CORRIDOR</span>
            <span style={{ color: "var(--drishti-blue)" }}>
              EST. CORRIDOR SPEED: {analytics?.speed_analytics?.average_speed_kmh ? `${analytics.speed_analytics.average_speed_kmh} km/h` : "81.1 km/h"}
            </span>
          </div>
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

          {/* Highway Corridor Line */}
          <Polyline
            positions={corridorRoute}
            color={mapMode === "traffic" ? "#D97706" : "#0284C7"}
            weight={mapMode === "traffic" ? 6 : 3}
            opacity={0.65}
            dashArray={mapMode === "traffic" ? "8, 6" : "4, 4"}
          />

          {/* MODE B: Traffic Intensity Heatmap Circles */}
          {mapMode === "traffic" &&
            cameraMarkers.map((cam) => {
              const radius = Math.max(16, Math.min(38, 14 + (cam.vehicle_count / 10)));
              return (
                <CircleMarker
                  key={`heat-${cam.id}`}
                  center={[cam.lat, cam.lng]}
                  radius={radius}
                  pathOptions={{
                    color: cam.intensity_color,
                    fillColor: cam.intensity_color,
                    fillOpacity: 0.35,
                    weight: 2,
                  }}
                  eventHandlers={{
                    click: () => onCameraSelect?.(cam.id),
                  }}
                >
                  <Popup>
                    <div style={{ fontFamily: "var(--font-sans)", minWidth: "210px" }}>
                      <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-primary)" }}>
                        {cam.name || cam.id}
                      </div>
                      <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "8px" }}>
                        Junction: {cam.junction_name || cam.junction_id}
                      </div>

                      <div className="map-popup-stat-grid font-mono">
                        <div>
                          <div className="popup-lbl">Vehicles</div>
                          <div className="popup-val">{cam.vehicle_count}</div>
                        </div>
                        <div>
                          <div className="popup-lbl">Density</div>
                          <div className="popup-val">{cam.density_vpm} v/m</div>
                        </div>
                        <div>
                          <div className="popup-lbl">Congestion</div>
                          <div className="popup-val" style={{ color: cam.intensity_color }}>
                            {cam.congestion_level} ({cam.congestion_index})
                          </div>
                        </div>
                        <div>
                          <div className="popup-lbl">Est. Speed</div>
                          <div className="popup-val">
                            {cam.estimated_speed ? `${cam.estimated_speed} km/h` : "N/A"}
                          </div>
                        </div>
                      </div>

                      <div style={{ marginTop: "8px", fontSize: "11px", color: "var(--status-success)", fontWeight: 600 }}>
                        ● Synchronized Live Node Feed
                      </div>
                    </div>
                  </Popup>
                </CircleMarker>
              );
            })}

          {/* Camera Pin Markers */}
          {cameraMarkers.map((camera) => (
            <Marker
              key={camera.id}
              position={[camera.lat, camera.lng]}
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
                    ● Operational Feed
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}

          {/* MODE A: Vehicle trajectory polyline */}
          {mapMode === "trajectory" && trajectoryPoints.length > 1 && (
            <Polyline
              positions={trajectoryPoints.map((p) => [p.lat, p.lng])}
              color="#0284C7"
              weight={4}
              opacity={0.9}
              dashArray="6, 6"
            />
          )}

          {/* MODE A: Trajectory observation markers */}
          {mapMode === "trajectory" &&
            trajectoryPoints.map((point, index) => (
              <Marker
                key={`trajectory-${index}`}
                position={[point.lat, point.lng]}
                eventHandlers={{
                  click: () => onCameraSelect?.(point.camera_id),
                }}
              >
                <Popup>
                  <div style={{ fontFamily: "var(--font-sans)" }}>
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
    </div>
  );
}
