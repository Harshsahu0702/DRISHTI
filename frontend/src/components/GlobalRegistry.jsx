import React, { useState, useMemo } from "react";
import { Search, ArrowRight, Eye, Car, Filter, ArrowUpDown } from "lucide-react";
import { formatTime } from "../services/api";

function formatCamShort(camId) {
  if (!camId) return "CAM";
  return camId
    .replace("junction_A_camera_0", "A-C0")
    .replace("junction_A_camera_", "A-C")
    .replace("junction_B_camera_0", "B-C0")
    .replace("junction_B_camera_", "B-C")
    .replace("camera_0", "C0")
    .replace("camera_", "C");
}

export function GlobalRegistry({ vehicles, onSelectVehicle, onOpenDossier, selectedVehicleId }) {
  const [filter, setFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState("default");
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const totalRawCount = vehicles?.length || 0;

  const filteredVehicles = useMemo(() => {
    let list = vehicles || [];

    // 1. Primary Filter Tab
    if (filter === "matched") {
      list = list.filter((v) => (v.camera_count || 1) > 1);
    } else if (filter === "anpr") {
      list = list.filter((v) => v.has_plate);
    } else if (filter === "junction_A") {
      list = list.filter((v) =>
        (v.junctions || []).includes("Vivekananda Sarani") ||
        (v.junctions || []).includes("Junction A") ||
        (v.cameras || []).some((c) => c.startsWith("junction_A"))
      );
    } else if (filter === "junction_B") {
      list = list.filter((v) =>
        (v.junctions || []).includes("Kanyapur Link Road") ||
        (v.junctions || []).includes("Junction B") ||
        (v.cameras || []).some((c) => c.startsWith("junction_B"))
      );
    }

    // 2. Vehicle Type Filter
    if (typeFilter !== "all") {
      list = list.filter((v) =>
        (v.vehicle_type || "car").toLowerCase() === typeFilter.toLowerCase()
      );
    }

    // 3. Search Query
    if (searchTerm.trim()) {
      const q = searchTerm.trim().toUpperCase();
      list = list.filter((v) => {
        const gid = (v.global_vehicle_id || "").toUpperCase();
        const plt = (v.plate || "").toUpperCase();
        const rawPlt = (v.raw_plate || "").toUpperCase();
        return gid.includes(q) || plt.includes(q) || rawPlt.includes(q);
      });
    }

    // 4. Sorting
    const sorted = [...list];
    if (sortBy === "observations") {
      sorted.sort((a, b) => {
        if (Boolean(b.has_plate) !== Boolean(a.has_plate)) {
          return b.has_plate ? 1 : -1;
        }
        return (b.observation_count || 1) - (a.observation_count || 1);
      });
    } else if (sortBy === "cameras") {
      sorted.sort((a, b) => {
        if (Boolean(b.has_plate) !== Boolean(a.has_plate)) {
          return b.has_plate ? 1 : -1;
        }
        return (b.camera_count || 1) - (a.camera_count || 1);
      });
    } else if (sortBy === "first_seen") {
      sorted.sort((a, b) => (a.first_seen || 0) - (b.first_seen || 0));
    } else if (sortBy === "plate") {
      sorted.sort((a, b) => {
        if (Boolean(b.has_plate) !== Boolean(a.has_plate)) {
          return b.has_plate ? 1 : -1;
        }
        return (a.plate || a.global_vehicle_id || "").localeCompare(b.plate || b.global_vehicle_id || "");
      });
    } else {
      // Default: Recognized ANPR plates first, then cross-camera, then observation count
      sorted.sort((a, b) => {
        const aPlate = a.has_plate ? 1 : 0;
        const bPlate = b.has_plate ? 1 : 0;
        if (bPlate !== aPlate) return bPlate - aPlate;
        const aCross = (a.camera_count || 1) > 1 ? 1 : 0;
        const bCross = (b.camera_count || 1) > 1 ? 1 : 0;
        if (bCross !== aCross) return bCross - aCross;
        return (b.observation_count || 1) - (a.observation_count || 1);
      });
    }

    return sorted;
  }, [vehicles, filter, typeFilter, searchTerm, sortBy]);

  const totalPages = Math.ceil(filteredVehicles.length / pageSize) || 1;
  const paginatedVehicles = filteredVehicles.slice(
    (page - 1) * pageSize,
    page * pageSize
  );

  return (
    <section className="global-registry-section">
      {/* Section Header */}
      <div className="section-header-block" style={{ marginBottom: "0" }}>
        <div>
          <div className="section-eyebrow">Vehicle Database</div>
          <h2 className="section-main-heading">All Tracked Vehicles Registry</h2>
          <p className="section-subtext">
            Complete list of vehicles tracked across city CCTV cameras by AI.
          </p>
        </div>
        <div style={{ fontSize: "12px", fontWeight: "700", color: "var(--text-muted)" }}>
          ACTIVE VEHICLES: <span className="font-mono" style={{ color: "var(--drishti-blue)" }}>{filteredVehicles.length}</span>
          <span style={{ color: "var(--text-dim)", marginLeft: "4px" }}>/ {totalRawCount} Total</span>
        </div>
      </div>

      {/* Controls Bar: Filters & Search */}
      <div className="registry-controls-bar">
        <div className="registry-filters-group">
          <button
            type="button"
            className={`registry-filter-chip ${filter === "all" ? "is-active" : ""}`}
            onClick={() => {
              setFilter("all");
              setPage(1);
            }}
          >
            All ({vehicles.length})
          </button>
          <button
            type="button"
            className={`registry-filter-chip ${filter === "matched" ? "is-active" : ""}`}
            onClick={() => {
              setFilter("matched");
              setPage(1);
            }}
          >
            Cross-Camera ({vehicles.filter((v) => (v.camera_count || 1) > 1).length})
          </button>
          <button
            type="button"
            className={`registry-filter-chip ${filter === "anpr" ? "is-active" : ""}`}
            onClick={() => {
              setFilter("anpr");
              setPage(1);
            }}
          >
            Plates Recognized ({vehicles.filter((v) => v.has_plate).length})
          </button>
          <button
            type="button"
            className={`registry-filter-chip ${filter === "junction_A" ? "is-active" : ""}`}
            onClick={() => {
              setFilter("junction_A");
              setPage(1);
            }}
          >
            Vivekananda Sarani
          </button>
          <button
            type="button"
            className={`registry-filter-chip ${filter === "junction_B" ? "is-active" : ""}`}
            onClick={() => {
              setFilter("junction_B");
              setPage(1);
            }}
          >
            Kanyapur Link Road
          </button>

          {/* Vehicle Class Dropdown */}
          <select
            className="registry-type-select font-mono"
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">All Classes</option>
            <option value="car">Cars</option>
            <option value="truck">Trucks</option>
            <option value="bus">Buses</option>
            <option value="motorcycle">Motorcycles</option>
          </select>

          {/* Sort Dropdown */}
          <select
            className="registry-type-select font-mono"
            value={sortBy}
            onChange={(e) => {
              setSortBy(e.target.value);
              setPage(1);
            }}
          >
            <option value="default">Sort: Multi-Cam Priority</option>
            <option value="observations">Sort: Sightings (High-Low)</option>
            <option value="cameras">Sort: Camera Count</option>
            <option value="first_seen">Sort: First Seen (Oldest First)</option>
            <option value="plate">Sort: Plate (A-Z)</option>
          </select>
        </div>

        {/* Search Input */}
        <div className="registry-search-input-wrap">
          <Search size={14} style={{ color: "var(--text-muted)" }} />
          <input
            type="text"
            className="registry-search-field font-mono"
            placeholder="Search Plate / Track ID..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>

      {/* Registry Table */}
      <div className="registry-table-container">
        <table className="registry-clean-table">
          <thead>
            <tr>
              <th style={{ width: "160px" }}>License Plate / Target</th>
              <th style={{ width: "90px" }}>Class</th>
              <th>Camera Transit Corridor</th>
              <th style={{ width: "120px", textAlign: "center" }}>Cross-Transit</th>
              <th style={{ width: "80px", textAlign: "center" }}>Cameras</th>
              <th style={{ width: "100px", textAlign: "center" }}>Obs</th>
              <th style={{ width: "100px" }}>First Seen</th>
              <th style={{ width: "100px", textAlign: "right" }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {paginatedVehicles.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: "center", padding: "32px", color: "var(--text-muted)" }}>
                  No vehicle identities match current search query or filter criteria.
                </td>
              </tr>
            ) : (
              paginatedVehicles.map((v) => {
                const isSelected = selectedVehicleId === v.global_vehicle_id;
                const cameras = v.cameras || v.camera_ids || [];
                const isCrossCam = (v.camera_count || 1) > 1;
                const isMultiJunc = (v.junction_count || 1) > 1;

                return (
                  <tr
                    key={v.global_vehicle_id}
                    className={isSelected ? "is-selected-row" : ""}
                    style={{ cursor: "pointer" }}
                    onClick={() => {
                      if (onOpenDossier) {
                        onOpenDossier(v);
                      } else if (onSelectVehicle) {
                        onSelectVehicle(v);
                      }
                    }}
                  >
                    {/* Target / Plate */}
                    <td>
                      {v.has_plate && v.plate ? (
                        <div className="table-plate-pill font-mono">{v.plate}</div>
                      ) : (
                        <div className="table-gid-tag font-mono" style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                          <span
                            style={{
                              fontSize: "9px",
                              fontWeight: "800",
                              letterSpacing: "0.04em",
                              padding: "2px 5px",
                              borderRadius: "3px",
                              background: "rgba(107, 92, 80, 0.14)",
                              color: "var(--text-muted)",
                              border: "1px solid var(--border-default)",
                            }}
                          >
                            TRACK ONLY
                          </span>
                          <span style={{ color: "var(--text-secondary)", fontSize: "12px" }}>
                            {v.global_vehicle_id}
                          </span>
                        </div>
                      )}
                    </td>

                    {/* Type */}
                    <td>
                      <span className="table-type-tag">{v.vehicle_type || "Car"}</span>
                    </td>

                    {/* Camera Transit Path */}
                    <td>
                      <div className="table-transit-route font-mono">
                        {cameras.map((cam, idx) => (
                          <React.Fragment key={`${cam}-${idx}`}>
                            <span
                              className="transit-stop-chip"
                              title={`Camera: ${cam}`}
                            >
                              {formatCamShort(cam)}
                            </span>
                            {idx < cameras.length - 1 && (
                              <ArrowRight size={12} style={{ color: "var(--text-dim)" }} />
                            )}
                          </React.Fragment>
                        ))}
                      </div>
                    </td>

                    {/* Cross-Camera Transit Status */}
                    <td style={{ textAlign: "center" }}>
                      {isMultiJunc ? (
                        <span className="status-pill status-blacklisted font-mono" style={{ fontSize: "10px" }}>
                          INTER-JUNCTION
                        </span>
                      ) : isCrossCam ? (
                        <span className="status-pill status-monitored font-mono" style={{ fontSize: "10px" }}>
                          MULTI-CAM
                        </span>
                      ) : (
                        <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Local Node</span>
                      )}
                    </td>

                    {/* Camera Count */}
                    <td style={{ textAlign: "center" }} className="font-mono">
                      <strong>{v.camera_count || 1}</strong>
                    </td>

                    {/* Observations */}
                    <td style={{ textAlign: "center" }} className="font-mono">
                      {v.observation_count || (v.trajectory || []).length || 1}
                    </td>

                    {/* First Seen */}
                    <td className="font-mono" style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                      {formatTime(v.first_seen)}
                    </td>

                    {/* Action */}
                    <td style={{ textAlign: "right" }}>
                      <button
                        type="button"
                        style={{
                          background: "var(--bg-canvas-subtle)",
                          border: "1px solid var(--border-default)",
                          borderRadius: "var(--radius-xs)",
                          padding: "4px 8px",
                          fontSize: "11px",
                          fontWeight: "600",
                          color: "var(--text-primary)",
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onOpenDossier) {
                            onOpenDossier(v);
                          } else if (onSelectVehicle) {
                            onSelectVehicle(v);
                          }
                        }}
                      >
                        <Eye size={12} />
                        View Report
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Bar */}
      <div className="registry-pagination-bar">
        <div className="pagination-info-text font-mono">
          Showing Page {page} of {totalPages} ({filteredVehicles.length} matched vehicles)
        </div>
        <div className="pagination-nav-group">
          <button
            type="button"
            className="pagination-btn font-mono"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </button>
          <button
            type="button"
            className="pagination-btn font-mono"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
          </button>
        </div>
      </div>
    </section>
  );
}
