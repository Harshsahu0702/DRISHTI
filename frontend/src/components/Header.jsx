import React, { useState, useEffect } from "react";
import { Radio, Clock, Shield, Cpu, Zap, Activity, BarChart3 } from "lucide-react";
import { DrishtiEyeLogo } from "./DrishtiEyeLogo";

export function Header({
  systemHealth,
  camerasCount,
  isBackendOnline,
  isDbOnline,
  onOpenAddBlacklist,
  activeTab = "surveillance",
  onSelectTab,
}) {
  const [timeStr, setTimeStr] = useState("");

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeStr(
        now.toLocaleTimeString("en-GB", {
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      );
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="command-header">
      {/* LEFT: DRISHTI-X Logo & Brand Identity */}
      <div className="header-brand-nexus">
        {/* Futuristic Eye Symbol */}
        <div className="header-drishti-logo-slot">
          <DrishtiEyeLogo size={42} animated={true} />
        </div>

        <div className="brand-text-block">
          <div className="brand-primary-row">
            <h1 className="brand-core-title">
              DRISHTI<span className="brand-core-x">-X</span>
            </h1>
            <span className="brand-tagline-badge">
              Detect • Identify • Re-Identify • Trace
            </span>
          </div>
          <div className="brand-sub-descriptor">
            City-Wide Visual Intelligence for Vehicle Tracking & Mobility Analysis
          </div>
        </div>
      </div>

      {/* CENTER: Navigation Page Switcher */}
      {onSelectTab && (
        <nav className="header-nav-switcher">
          <button
            type="button"
            className={`nav-tab-btn ${activeTab === "surveillance" ? "active" : ""}`}
            onClick={() => onSelectTab("surveillance")}
            title="CCTV Surveillance, Target Vehicle Search & Live Tracking"
          >
            <Shield size={15} />
            <span>Surveillance & Tracking</span>
          </button>

          <button
            type="button"
            className={`nav-tab-btn ${activeTab === "analytics" ? "active" : ""}`}
            onClick={() => onSelectTab("analytics")}
            title="City-Wide Traffic Analytics, OD Flow Matrix & Congestion Diagnostics"
          >
            <BarChart3 size={15} />
            <span>Traffic Mobility Analytics</span>
            <span className="nav-tab-badge">LIVE INTEL</span>
          </button>
        </nav>
      )}

      {/* RIGHT: Operational Telemetry Bar & Action Button */}
      <div className="header-status-strip">
        {/* Prominent Action Button for Blacklist */}
        {onOpenAddBlacklist && (
          <button
            className="btn-header-add-blacklist"
            onClick={onOpenAddBlacklist}
            title="Register target plate to MySQL blacklist"
          >
            <span className="btn-add-plus">+</span> Add Blacklisted Vehicle
          </button>
        )}

        {/* MySQL Database Status */}
        <div className="header-metric-pill">
          <span className={`status-dot-pulse ${isDbOnline ? "status-dot-green" : "status-dot-amber"}`}></span>
          <div>
            <div className="pill-label">Database</div>
            <div className="pill-val">
              {isDbOnline ? (
                <span className="text-status-green">MySQL 8.0 (Active)</span>
              ) : (
                <span className="text-status-amber">JSON Fallback</span>
              )}
            </div>
          </div>
        </div>

        {/* Core System Status */}
        <div className="header-metric-pill">
          <span className="status-dot-pulse"></span>
          <div>
            <div className="pill-label">Neural Engine</div>
            <div className="pill-val">
              {isBackendOnline ? (
                <span className="text-status-green">ONLINE (FastAPI)</span>
              ) : (
                <span className="text-status-red">OFFLINE</span>
              )}
            </div>
          </div>
        </div>

        {/* Camera Sensor Nodes */}
        <div className="header-metric-pill">
          <Radio size={14} className="icon-telemetry text-brand" />
          <div>
            <div className="pill-label">Surveillance Grid</div>
            <div className="pill-val font-mono">{camerasCount || 4} CAMS ACTIVE</div>
          </div>
        </div>

        {/* Realtime Clock (IST) */}
        <div className="header-metric-pill">
          <Clock size={14} className="icon-telemetry text-muted" />
          <div>
            <div className="pill-label">Operational Time</div>
            <div className="pill-val font-mono">{timeStr || "12:00:00"} <span className="time-tz">IST</span></div>
          </div>
        </div>
      </div>
    </header>
  );
}
