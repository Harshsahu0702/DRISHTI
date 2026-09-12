import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Play,
  Maximize2,
  Camera,
  Clock,
  Navigation,
  MapPin,
  Car,
  ChevronRight,
} from "lucide-react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { formatTime } from "../services/api";

const JUNCTION_COORDINATES = {
  junction_A: { lat: 23.710299, lng: 86.952779 },
  junction_B: { lat: 23.713932, lng: 86.952211 },
};

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

function MapController({ bounds, centerTarget }) {
  const map = useMap();

  useEffect(() => {
    if (centerTarget) {
      map.flyTo([centerTarget.lat, centerTarget.lng], 17, { animate: true, duration: 1 });
    } else if (bounds && bounds.length > 0) {
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 16 });
    }
  }, [bounds, centerTarget, map]);

  return null;
}

export function FullMapModal({
  isOpen,
  onClose,
  cameras,
  selectedVehicle,
  selectedCameraId,
  onCameraSelect,
  onPlayEvent,
}) {
  const [focusedCoord, setFocusedCoord] = useState(null);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const trajectory = useMemo(() => {
    if (!selectedVehicle) return [];
    return (
      selectedVehicle.trajectory ||
      selectedVehicle.events ||
      selectedVehicle.timeline ||
      []
    );
  }, [selectedVehicle]);

  const cameraMarkers = useMemo(() => {
    return Object.values(cameras || {}).map((cam) => {
      const junctionId = cam.junction_id || cam.scene || "junction_A";
      const coords = getCameraCoordinates(cam.id, junctionId, cam.lat, cam.lng);
      return {
        ...cam,
        ...coords,
      };
    });
  }, [cameras]);

  const trajectoryPoints = useMemo(() => {
    if (trajectory.length > 0) {
      return trajectory.map((pt, idx) => {
        const junctionId = pt.junction_id || pt.junction || "junction_A";
        const cam = cameras ? cameras[pt.camera_id] : null;
        const coords = getCameraCoordinates(
          pt.camera_id,
          junctionId,
          pt.lat || cam?.lat,
          pt.lng || cam?.lng
        );
        return {
          ...pt,
          ...coords,
          displayIndex: idx + 1,
        };
      });
    }

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
            displayIndex: 1,
          },
        ];
      }
    }

    return [];
  }, [trajectory, selectedVehicle, cameras]);

  const mapBounds = useMemo(() => {
    if (trajectoryPoints.length > 0) {
      return trajectoryPoints.map((p) => [p.lat, p.lng]);
    }
    if (cameraMarkers.length > 0) {
      return cameraMarkers.map((c) => [c.lat, c.lng]);
    }
    return null;
  }, [trajectoryPoints, cameraMarkers]);

  if (!isOpen) return null;

  return createPortal(
    <div className="modal-backdrop-light full-map-fixed-backdrop" onClick={onClose}>
      <div
        className="full-map-modal-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        {/* HEADER */}
        <div className="modal-header-strip full-map-header">
          <div>
            <div className="section-eyebrow">Interactive Geospatial Command Matrix</div>
            <div className="full-map-title-row">
              <h2 className="full-map-heading">
                City Surveillance Corridor & Target Trajectory
              </h2>
              {selectedVehicle && (
                <div className="full-map-target-chip font-mono">
                  <span className="target-chip-dot"></span>
                  <span>TARGET: {selectedVehicle.plate || selectedVehicle.plate_number || selectedVehicle.normalized_plate || selectedVehicle.global_vehicle_id}</span>
                  <span className="target-chip-sep">•</span>
                  <span>{trajectoryPoints.length} SIGHTINGS</span>
                  {selectedVehicle.estimated_average_speed_label && (
                    <>
                      <span className="target-chip-sep">•</span>
                      <span>SPD: {selectedVehicle.estimated_average_speed_label}</span>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          <button
            type="button"
            className="modal-close-icon-btn"
            onClick={onClose}
            title="Close Fullscreen Map (Esc)"
          >
            <X size={18} />
          </button>
        </div>

        {/* BODY SPLIT: LARGE MAP (LEFT) + TIMELINE DETAILS (RIGHT) */}
        <div className="full-map-body-grid">
          {/* LEFT: EXPANSIVE LEAFLET MAP */}
          <div className="full-map-canvas-pane">
            <MapContainer
              center={[23.7121, 86.9525]}
              zoom={16}
              style={{ height: "100%", width: "100%" }}
            >
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              />

              {/* RED TRAJECTORY LINE */}
              {trajectoryPoints.length > 1 && (
                <Polyline
                  positions={trajectoryPoints.map((p) => [p.lat, p.lng])}
                  color="#DC2626"
                  weight={5}
                  opacity={0.95}
                />
              )}

              {/* CCTV CAMERA ICONS */}
              {cameraMarkers.map((cam) => (
                <Marker
                  key={`fullmap-cam-${cam.id}`}
                  position={[cam.lat, cam.lng]}
                  icon={createCameraIcon(cam, cam.id === selectedCameraId)}
                  eventHandlers={{
                    click: () => onCameraSelect?.(cam.id),
                  }}
                >
                  <Popup>
                    <div style={{ fontFamily: "var(--font-sans)", minWidth: "180px" }}>
                      <strong style={{ color: "var(--text-primary)" }}>
                        {cam.camera_name || cam.name || cam.id}
                      </strong>
                      <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>
                        Junction: {cam.junction_name || cam.junction_id}
                      </div>
                      <div style={{ color: "var(--status-success)", fontWeight: 600, fontSize: "11px", marginTop: "4px" }}>
                        ● Active Optical Node
                      </div>
                    </div>
                  </Popup>
                </Marker>
              ))}

              {/* VEHICLE PIN MARKERS */}
              {trajectoryPoints.map((pt, idx) => (
                <Marker
                  key={`fullmap-pt-${idx}`}
                  position={[pt.lat, pt.lng]}
                  icon={createVehiclePinIcon(
                    pt,
                    idx,
                    trajectoryPoints.length,
                    selectedVehicle?.plate || selectedVehicle?.global_vehicle_id
                  )}
                  eventHandlers={{
                    click: () => onCameraSelect?.(pt.camera_id),
                  }}
                >
                  <Popup>
                    <div style={{ fontFamily: "var(--font-sans)" }}>
                      <div style={{ fontWeight: 800, color: "#DC2626", marginBottom: "4px" }}>
                        {selectedVehicle?.plate || "TARGET VEHICLE"}
                      </div>
                      <strong>Sighting #{idx + 1}</strong>
                      <br />
                      Camera: {pt.camera_name || pt.camera_id}
                      <br />
                      Time: {formatTime(pt.timestamp_sec || pt.timestamp)}
                      <br />
                      Speed: {pt.speed ? `${pt.speed} km/h` : "N/A"}
                    </div>
                  </Popup>
                </Marker>
              ))}

              <MapController bounds={mapBounds} centerTarget={focusedCoord} />
            </MapContainer>

            {/* Quick Camera Navigation Bar */}
            <div className="full-map-camera-bar">
              <span className="full-map-bar-title font-mono">CCTV CAMERAS:</span>
              {cameraMarkers.map((cam) => (
                <button
                  key={cam.id}
                  type="button"
                  className={`full-map-cam-btn ${cam.id === selectedCameraId ? "active" : ""}`}
                  onClick={() => {
                    onCameraSelect?.(cam.id);
                    setFocusedCoord({ lat: cam.lat, lng: cam.lng });
                  }}
                >
                  {cam.camera_name || cam.name}
                </button>
              ))}
            </div>
          </div>

          {/* RIGHT: CHRONOLOGICAL DETAILS & PLAY EVENT ACTION LIST */}
          <div className="full-map-timeline-sidebar">
            <div className="full-map-sidebar-header">
              <span className="sidebar-header-title">Chronological Sighting Records</span>
              <span className="sidebar-header-count font-mono">
                {trajectoryPoints.length} SIGHTING{trajectoryPoints.length === 1 ? "" : "S"}
              </span>
            </div>

            <div className="full-map-event-list">
              {trajectoryPoints.length === 0 ? (
                <div className="full-map-empty-state">
                  <Car size={32} style={{ color: "var(--text-dim)", marginBottom: "8px" }} />
                  <div>No vehicle selected.</div>
                  <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "4px" }}>
                    Search or select a vehicle from the dashboard to track its full route.
                  </div>
                </div>
              ) : (
                trajectoryPoints.map((event, index) => {
                  const timestamp =
                    event.first_time_sec ??
                    event.timestamp_seconds ??
                    event.timestamp_sec ??
                    event.timestamp ??
                    0;
                  const duration = event.duration_sec ?? event.duration;
                  const cameraId = event.camera_id;
                  const isLatest = index === trajectoryPoints.length - 1;

                  return (
                    <div
                      key={`timeline-card-${index}`}
                      className={`full-map-event-card ${isLatest ? "is-latest-card" : ""}`}
                    >
                      <div className="event-card-top-row">
                        <div className="event-card-seq-badge font-mono">
                          {index + 1}
                        </div>
                        <div className="event-card-lead">
                          <div className="event-card-cam-title">
                            {event.camera_name || cameraId}
                          </div>
                          <div className="event-card-junction-sub font-mono">
                            {event.junction_name || event.junction || (event.junction_id === "junction_B" ? "Kanyapur Link Road" : "Vivekananda Sarani")}
                          </div>
                        </div>

                        {/* PLAY EVENT BUTTON */}
                        <button
                          type="button"
                          className="event-card-play-btn font-mono"
                          onClick={() => {
                            const targetPlate =
                              event.plate ||
                              event.raw_plate ||
                              selectedVehicle?.plate ||
                              selectedVehicle?.plate_number ||
                              selectedVehicle?.normalized_plate ||
                              selectedVehicle?.global_vehicle_id ||
                              "";

                            if (onPlayEvent) {
                              onPlayEvent(
                                cameraId,
                                timestamp,
                                `${targetPlate || "Target"} @ ${event.camera_name || cameraId}`,
                                {
                                  plate: targetPlate,
                                  plate_number: targetPlate,
                                  plate_image: event.plate_image || event.plate_image_url,
                                  vehicle_type: event.vehicle_type || selectedVehicle?.vehicle_type || "car",
                                  confidence: event.ocr_confidence || 0.96,
                                  isBlacklisted: Boolean(
                                    selectedVehicle?.is_blacklisted ||
                                    selectedVehicle?.isBlacklisted ||
                                    selectedVehicle?.is_active ||
                                    true
                                  ),
                                }
                              );
                            }
                            if (onCameraSelect) {
                              onCameraSelect(cameraId);
                            }
                          }}
                          title={`Play CCTV video from ${formatTime(timestamp)}`}
                        >
                          <Play size={11} fill="currentColor" />
                          <span>PLAY EVENT</span>
                        </button>
                      </div>

                      {/* Details row: time, duration, speed */}
                      <div className="event-card-details-grid font-mono">
                        <div className="detail-item">
                          <span className="detail-item-lbl">TIME:</span>
                          <span className="detail-item-val">{formatTime(timestamp)}</span>
                        </div>

                        {duration ? (
                          <div className="detail-item">
                            <span className="detail-item-lbl">DURATION:</span>
                            <span className="detail-item-val">{formatTime(duration)}</span>
                          </div>
                        ) : null}

                        {event.speed ? (
                          <div className="detail-item">
                            <span className="detail-item-lbl">SPEED:</span>
                            <span className="detail-item-val" style={{ color: "var(--drishti-amber)" }}>
                              {event.speed} km/h
                            </span>
                          </div>
                        ) : null}
                      </div>

                      {/* Map Focus Button */}
                      <div className="event-card-action-footer">
                        <button
                          type="button"
                          className="event-card-locate-btn"
                          onClick={() => {
                            setFocusedCoord({ lat: event.lat, lng: event.lng });
                            onCameraSelect?.(cameraId);
                          }}
                        >
                          <MapPin size={11} />
                          <span>Locate on Map</span>
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
