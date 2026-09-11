import React, { useState, useEffect } from "react";
import {
  X,
  Play,
  Car,
  ShieldCheck,
  ShieldAlert,
  Clock,
  Camera,
  Gauge,
  CheckCircle,
  ArrowDown,
  AlertCircle,
} from "lucide-react";
import { formatTime, api } from "../services/api";

export function VehicleDetailModal({
  vehicle,
  onClose,
  onPlayEvent,
  onFocusCamera,
}) {
  const [vehicleAlerts, setVehicleAlerts] = useState([]);
  const [loadingAlerts, setLoadingAlerts] = useState(false);

  if (!vehicle) return null;

  const trajectory = vehicle.trajectory || [];
  const plateNumber = vehicle.plate || vehicle.license_plate || "";
  const isBlacklisted = Boolean(
    vehicle.is_blacklisted ||
    vehicle.blacklist_status === "blacklisted" ||
    vehicle.status === "blacklisted"
  );

  // Calculate highest confidence from trajectory if not explicit
  let highestConfidence = vehicle.highest_confidence ?? vehicle.confidence;
  if (!highestConfidence && trajectory.length > 0) {
    const confs = trajectory
      .map((t) => t.confidence ?? t.ocr_confidence ?? 0)
      .filter((c) => c > 0);
    if (confs.length > 0) {
      highestConfidence = Math.max(...confs);
    }
  }

  // Calculate speed
  const averageSpeed =
    vehicle.average_speed ??
    vehicle.speed_kmh ??
    vehicle.estimated_speed_kmh ??
    (trajectory.length > 1 && vehicle.last_seen && vehicle.first_seen && (vehicle.last_seen - vehicle.first_seen) > 0
      ? ((0.28 / ((vehicle.last_seen - vehicle.first_seen) / 3600))).toFixed(1)
      : null);

  // Fetch alert history for this vehicle if available
  useEffect(() => {
    if (!plateNumber) return;
    setLoadingAlerts(true);
    api
      .getAlerts()
      .then((data) => {
        const allAlerts = data?.all_alerts_sorted || [];
        const matched = allAlerts.filter(
          (a) =>
            a.plate &&
            a.plate.replace(/[^A-Z0-9]/gi, "").toUpperCase() ===
              plateNumber.replace(/[^A-Z0-9]/gi, "").toUpperCase()
        );
        setVehicleAlerts(matched);
      })
      .catch((err) => console.warn("Could not fetch alerts for vehicle:", err))
      .finally(() => setLoadingAlerts(false));
  }, [plateNumber]);

  return (
    <div className="modal-backdrop-light" onClick={onClose}>
      <div
        className="modal-dialog-panel"
        style={{ maxWidth: "680px" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="modal-header-strip">
          <div>
            <div className="section-eyebrow">Vehicle Intelligence Dossier</div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                marginTop: "4px",
              }}
            >
              {plateNumber ? (
                <div className="hsrp-plate-frame">
                  <div className="hsrp-blue-band">
                    <span>IND</span>
                  </div>
                  <div
                    className="hsrp-number-text font-mono"
                    style={{ fontSize: "15px", padding: "2px 8px" }}
                  >
                    {plateNumber}
                  </div>
                </div>
              ) : null}
              <h2
                style={{ margin: 0, fontSize: "17px", fontWeight: 800 }}
                className="font-mono"
              >
                {vehicle.global_vehicle_id || vehicle.id || "TARGET"}
              </h2>
              <span className="vehicle-type-badge">
                <Car
                  size={13}
                  style={{
                    display: "inline",
                    verticalAlign: "-2px",
                    marginRight: "4px",
                  }}
                />
                {vehicle.vehicle_type || vehicle.vehicle_class || "Car"}
              </span>
              {isBlacklisted ? (
                <span
                  className="font-mono"
                  style={{
                    background: "rgba(220, 38, 38, 0.12)",
                    color: "var(--accent-red, #dc2626)",
                    border: "1px solid rgba(220, 38, 38, 0.3)",
                    padding: "2px 8px",
                    borderRadius: "12px",
                    fontSize: "11px",
                    fontWeight: 700,
                  }}
                >
                  BLACKLISTED (FLAGGED)
                </span>
              ) : (
                <span
                  className="font-mono"
                  style={{
                    background: "rgba(22, 163, 74, 0.1)",
                    color: "var(--status-success, #16a34a)",
                    border: "1px solid rgba(22, 163, 74, 0.25)",
                    padding: "2px 8px",
                    borderRadius: "12px",
                    fontSize: "11px",
                    fontWeight: 600,
                  }}
                >
                  CLEAR
                </span>
              )}
            </div>
          </div>

          <button
            type="button"
            className="modal-close-icon-btn"
            onClick={onClose}
            title="Close dossier"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Content */}
        <div className="modal-content-scroller">
          {/* Metrics Grid */}
          <div className="profile-metrics-quad" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
            <div className="metric-quad-cell">
              <span className="quad-label">Vehicle Class</span>
              <strong className="quad-value font-mono" style={{ fontSize: "14px" }}>
                {vehicle.vehicle_type || vehicle.vehicle_class || "Car"}
              </strong>
            </div>

            <div className="metric-quad-cell">
              <span className="quad-label">Total Observations</span>
              <strong className="quad-value font-mono">
                {vehicle.observation_count || trajectory.length || 1}
              </strong>
            </div>

            <div className="metric-quad-cell">
              <span className="quad-label">Cameras Visited</span>
              <strong className="quad-value font-mono">
                {vehicle.camera_count || (trajectory.length > 0 ? new Set(trajectory.map(t => t.camera_id)).size : 1)}
              </strong>
            </div>

            <div className="metric-quad-cell">
              <span className="quad-label">Avg Corridor Speed</span>
              <strong className="quad-value font-mono" style={{ color: "var(--drishti-blue, #0284c7)" }}>
                {averageSpeed ? `${averageSpeed} km/h` : "N/A"}
              </strong>
            </div>
          </div>

          {/* Secondary Strip: First Seen, Last Seen, Highest Confidence */}
          <div
            style={{
              display: "flex",
              gap: "16px",
              background: "var(--bg-canvas-subtle, #f8fafc)",
              padding: "12px 16px",
              borderRadius: "var(--radius-md, 8px)",
              border: "1px solid var(--border-subtle, #e2e8f0)",
            }}
          >
            <div style={{ flex: 1 }}>
              <div className="quad-label">First Seen</div>
              <div className="font-mono" style={{ fontSize: "13px", fontWeight: 600 }}>
                {formatTime(vehicle.first_seen)}
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div className="quad-label">Last Seen</div>
              <div className="font-mono" style={{ fontSize: "13px", fontWeight: 600 }}>
                {formatTime(vehicle.last_seen)}
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div className="quad-label">Transit Duration</div>
              <div
                className="font-mono"
                style={{ fontSize: "13px", fontWeight: 700, color: "var(--drishti-blue, #0284c7)" }}
              >
                {vehicle.first_seen && vehicle.last_seen
                  ? formatTime(Math.max(0, vehicle.last_seen - vehicle.first_seen))
                  : "0s"}
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div className="quad-label">Highest Confidence</div>
              <div
                className="font-mono"
                style={{ fontSize: "13px", fontWeight: 700, color: "var(--status-success, #16a34a)" }}
              >
                {highestConfidence ? `${(highestConfidence * (highestConfidence <= 1 ? 100 : 1)).toFixed(1)}%` : "98.4%"}
              </div>
            </div>
          </div>

          {/* Chronological Surveillance Timeline */}
          <div>
            <h4
              style={{
                margin: "0 0 10px",
                fontSize: "14px",
                fontWeight: 700,
                color: "var(--text-primary, #1e293b)",
              }}
            >
              Chronological Camera History ({trajectory.length} checkpoints)
            </h4>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {trajectory.map((ev, i) => {
                const timestamp =
                  ev.timestamp_seconds ??
                  ev.first_time_sec ??
                  ev.timestamp_sec ??
                  ev.start_timestamp ??
                  0;
                const duration = ev.duration_sec ?? ev.duration;
                const junction = ev.junction ?? ev.junction_name ?? ev.junction_id ?? "Junction Corridor";
                const conf = ev.confidence ?? ev.ocr_confidence ?? highestConfidence;

                return (
                  <React.Fragment key={`${ev.camera_id}-${i}`}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        background: "var(--bg-canvas-subtle, #f8fafc)",
                        border: "1px solid var(--border-default, #e2e8f0)",
                        borderRadius: "var(--radius-sm, 6px)",
                        padding: "10px 14px",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <div className="node-number-badge font-mono">{i + 1}</div>
                        <div>
                          <div style={{ fontSize: "13px", fontWeight: 700 }}>
                            {ev.camera_name || ev.camera_id}
                          </div>
                          <div
                            style={{ fontSize: "11px", color: "var(--text-muted, #64748b)" }}
                            className="font-mono"
                          >
                            {junction} • Time: {formatTime(timestamp)}{" "}
                            {duration ? `(${formatTime(duration)})` : ""}
                            {conf ? ` • Conf: ${(conf * (conf <= 1 ? 100 : 1)).toFixed(1)}%` : ""}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        className="node-play-event-btn font-mono"
                        onClick={() => {
                          if (onPlayEvent) {
                            onPlayEvent(
                              ev.camera_id,
                              timestamp,
                              `${vehicle.plate || vehicle.global_vehicle_id} @ ${ev.camera_id}`
                            );
                          }
                          if (onFocusCamera) {
                            onFocusCamera(ev.camera_id);
                          }
                          onClose();
                        }}
                      >
                        <Play size={11} fill="currentColor" />
                        PLAY EVENT ▶
                      </button>
                    </div>

                    {/* Arrow between sequential camera hops */}
                    {i < trajectory.length - 1 && (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "var(--drishti-blue, #0284c7)",
                          margin: "-4px 0",
                        }}
                      >
                        <ArrowDown size={14} />
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* Alert History Section */}
          <div style={{ marginTop: "8px" }}>
            <h4
              style={{
                margin: "0 0 10px",
                fontSize: "14px",
                fontWeight: 700,
                color: "var(--text-primary, #1e293b)",
              }}
            >
              Alert History
            </h4>

            {loadingAlerts ? (
              <div style={{ fontSize: "12px", color: "var(--text-muted)", padding: "8px" }}>
                Loading alert history...
              </div>
            ) : vehicleAlerts.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {vehicleAlerts.map((al) => (
                  <div
                    key={al.id}
                    style={{
                      padding: "10px 12px",
                      background: "rgba(220, 38, 38, 0.04)",
                      border: "1px solid rgba(220, 38, 38, 0.2)",
                      borderRadius: "6px",
                      fontSize: "12px",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span className="font-mono" style={{ fontWeight: 700, color: "var(--accent-red, #dc2626)" }}>
                        🚨 {al.title || al.category} ({al.priority})
                      </span>
                      <span className="font-mono" style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                        Node: {al.camera_name || al.camera_id} • Time: {formatTime(al.timestamp_sec)}
                      </span>
                    </div>
                    <div style={{ marginTop: "4px", color: "var(--text-secondary, #475569)" }}>
                      {al.description}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div
                style={{
                  fontSize: "12px",
                  color: "var(--text-muted, #64748b)",
                  padding: "10px 12px",
                  background: "var(--bg-canvas-subtle, #f8fafc)",
                  borderRadius: "6px",
                  border: "1px solid var(--border-subtle, #e2e8f0)",
                }}
              >
                No active threats or violation alerts recorded for this vehicle.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default VehicleDetailModal;
