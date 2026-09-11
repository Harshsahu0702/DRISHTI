import React from "react";
import { Camera, ArrowRight, Play, Clock, MapPin } from "lucide-react";
import { formatTime } from "../services/api";

export function JourneyTimeline({ selectedVehicle, onPlayEvent, onFocusCamera }) {
  if (!selectedVehicle) {
    return (
      <div className="timeline-stepper-card">
        <div className="timeline-stepper-header">
          <div>
            <div className="section-eyebrow">Corridor Trajectory</div>
            <h3 className="section-main-heading" style={{ fontSize: "16px" }}>Chronological Camera Journey</h3>
          </div>
        </div>
        <div style={{ color: "var(--text-muted)", fontSize: "13px", padding: "12px 0" }}>
          Search for a vehicle above or select one from the registry to reconstruct its cross-camera journey passage.
        </div>
      </div>
    );
  }

  const trajectory = selectedVehicle.trajectory || selectedVehicle.timeline || [];

  return (
    <div className="timeline-stepper-card">
      <div className="timeline-stepper-header">
        <div>
          <div className="section-eyebrow">Corridor Trajectory Passage</div>
          <h3 className="section-main-heading" style={{ fontSize: "16px" }}>
            Chronological Camera Journey:{" "}
            <span className="font-mono" style={{ color: "var(--drishti-blue)" }}>
              {selectedVehicle.plate || selectedVehicle.global_vehicle_id}
            </span>
          </h3>
          <p className="section-subtext">
            {trajectory.length} camera observation{trajectory.length === 1 ? "" : "s"} across {selectedVehicle.junction_count || 1} junction{selectedVehicle.junction_count === 1 ? "" : "s"}.
          </p>
        </div>
      </div>

      <div className="stepper-nodes-row">
        {trajectory.map((event, idx) => {
          const isLast = idx === trajectory.length - 1;
          const cameraId = event.camera_id;
          const timestamp =
            event.first_time_sec ??
            event.timestamp_seconds ??
            event.timestamp_sec ??
            event.start_timestamp ??
            0;
          const duration = event.duration_sec ?? event.duration;
          const junction = event.junction ?? event.junction_id ?? "Junction";

          return (
            <React.Fragment key={`${cameraId}-${idx}`}>
              <div className="stepper-camera-node">
                <div className="node-number-badge font-mono">{idx + 1}</div>

                <div className="node-detail-col">
                  <div className="node-cam-name">
                    {event.camera_name || cameraId}
                  </div>
                  <div className="node-junction-tag font-mono">
                    {junction} • {event.vehicle_type || selectedVehicle.vehicle_type || "Vehicle"}
                  </div>
                  <div className="node-timestamp-pill font-mono">
                    {formatTime(timestamp)}
                    {duration ? ` (${formatTime(duration)})` : ""}
                  </div>
                </div>

                <button
                  type="button"
                  className="node-play-event-btn font-mono"
                  onClick={() => {
                    if (onPlayEvent) {
                      onPlayEvent(
                        cameraId,
                        timestamp,
                        `${selectedVehicle.plate || selectedVehicle.global_vehicle_id} @ ${cameraId}`
                      );
                    }
                    if (onFocusCamera) {
                      onFocusCamera(cameraId);
                    }
                  }}
                  title={`Seek ${cameraId} to ${formatTime(timestamp)} and play`}
                >
                  <Play size={11} fill="currentColor" />
                  PLAY
                </button>
              </div>

              {!isLast && (
                <div className="stepper-transit-divider">
                  <span>Transit</span>
                  <ArrowRight size={14} />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
