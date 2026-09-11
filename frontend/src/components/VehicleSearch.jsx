import React, { useState } from "react";
import { Search, Car, ArrowRight, Camera, Clock, AlertCircle, Play } from "lucide-react";
import { api, formatTime } from "../services/api";

function normalizePlateSearch(query) {
  if (!query) return "";
  return String(query)
    .trim()
    .toUpperCase()
    .replace(/[\s\-_]/g, "");
}

const QUICK_SEARCH_EXAMPLES = [
  { label: "Z48H9831N", type: "Target Plate", desc: "Cross-Camera & Cross-Junction (Junction A & B)" },
  { label: "WB37E1275", type: "Target Plate", desc: "Junction B Camera 01 (Confirmed Plate)" },
  { label: "JH10DL8792", type: "Target Plate", desc: "Junction A Camera 02 (Confirmed Plate)" },
  { label: "WB01BJ1415", type: "Target Plate", desc: "Junction A Camera 01 (Confirmed Plate)" },
];

export function VehicleSearch({
  onSelectVehicle,
  onPlayEvent,
  onFocusCamera,
  selectedVehicle,
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searchResult, setSearchResult] = useState(null);

  const executeSearch = async (term) => {
    const q = normalizePlateSearch(term || searchTerm);
    if (!q) return;

    try {
      setIsSearching(true);
      setSearchError("");
      setSearchResult(null);

      const res = await api.searchVehicles(q);

      let results = [];
      if (Array.isArray(res)) {
        results = res;
      } else if (res && res.results && Array.isArray(res.results)) {
        results = res.results;
      } else if (res && Array.isArray(res.vehicles)) {
        results = res.vehicles;
      }

      if (results.length > 0) {
        const vehicle = results[0];
        setSearchResult(vehicle);
        if (onSelectVehicle) {
          onSelectVehicle(vehicle);
        }
      } else {
        setSearchError(`No vehicle record found matching "${q}".`);
      }
    } catch (err) {
      console.error(err);
      setSearchError(err.message || "Search request failed");
      setSearchResult(null);
    } finally {
      setIsSearching(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      executeSearch();
    }
  };

  const activeVehicle = selectedVehicle || searchResult;

  return (
    <div className="vehicle-search-card">
      {/* Search Header */}
      <div>
        <div className="section-eyebrow">Vehicle Target Intelligence</div>
        <h2 className="section-main-heading">Find a Vehicle</h2>
        <p className="section-subtext">
          Locate city-wide vehicle records by license plate number, target ID, or camera track.
        </p>
      </div>

      {/* Hero Input Group */}
      <div className="search-input-group">
        <div className="search-input-box">
          <Search size={18} style={{ color: "var(--text-muted)" }} />
          <input
            type="text"
            className="search-text-field font-mono"
            placeholder="Search by license plate number (e.g. Z48H9831N, WB37E1275)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>
        <button
          type="button"
          className="search-action-btn"
          disabled={isSearching}
          onClick={() => executeSearch()}
        >
          {isSearching ? "Searching..." : "Search Target"}
        </button>
      </div>

      {/* Try a target suggestions */}
      <div className="sample-targets-row">
        <span className="sample-targets-label">Try a target:</span>
        {QUICK_SEARCH_EXAMPLES.map((ex) => (
          <button
            key={ex.label}
            type="button"
            className="target-sample-chip font-mono"
            onClick={() => {
              setSearchTerm(ex.label);
              executeSearch(ex.label);
            }}
            title={ex.desc}
          >
            <strong>{ex.label}</strong>
          </button>
        ))}
      </div>

      {searchError && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            background: "var(--status-error-bg)",
            border: "1px solid var(--status-error-border)",
            color: "var(--status-error)",
            padding: "8px 12px",
            borderRadius: "var(--radius-sm)",
            fontSize: "12px",
          }}
        >
          <AlertCircle size={15} />
          <span>{searchError}</span>
        </div>
      )}

      {/* Target Result Profile */}
      {activeVehicle && (
        <div className="vehicle-identity-profile">
          <div className="profile-header-strip">
            <div className="profile-identity-lead">
              {activeVehicle.plate ? (
                <div className="hsrp-plate-frame">
                  <div className="hsrp-blue-band">
                    <span>IND</span>
                  </div>
                  <div className="hsrp-number-text">
                    {activeVehicle.plate}
                  </div>
                </div>
              ) : (
                <div className="table-gid-tag font-mono" style={{ fontSize: "14px", padding: "6px 12px" }}>
                  {activeVehicle.global_vehicle_id}
                </div>
              )}
              <span className="vehicle-type-badge">
                <Car size={13} style={{ display: "inline", verticalAlign: "-2px", marginRight: "4px" }} />
                {activeVehicle.vehicle_type || "Car"}
              </span>
            </div>
            <div style={{ fontSize: "11px", fontWeight: "600", color: "var(--status-success)" }}>
              ● TARGET IDENTIFIED
            </div>
          </div>

          {/* Compact Metrics Quad */}
          <div className="profile-metrics-quad">
            <div className="metric-quad-cell">
              <span className="quad-label">Cameras</span>
              <strong className="quad-value font-mono">
                {activeVehicle.camera_count || 1}
              </strong>
            </div>

            <div className="metric-quad-cell">
              <span className="quad-label">Observations</span>
              <strong className="quad-value font-mono">
                {activeVehicle.observation_count || (activeVehicle.trajectory || []).length || 1}
              </strong>
            </div>

            <div className="metric-quad-cell">
              <span className="quad-label">Junctions</span>
              <strong className="quad-value font-mono">
                {activeVehicle.junction_count || 1}
              </strong>
            </div>

            <div className="metric-quad-cell">
              <span className="quad-label">First Seen</span>
              <span className="quad-value font-mono" style={{ fontSize: "13px" }}>
                {formatTime(activeVehicle.first_seen)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
