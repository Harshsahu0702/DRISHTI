import React, { useState, useEffect, useRef } from "react";
import { Header } from "./components/Header";
import { CameraGrid } from "./components/CameraGrid";
import { KpiStrip } from "./components/KpiStrip";
import { VehicleSearch } from "./components/VehicleSearch";
import { JourneyTimeline } from "./components/JourneyTimeline";
import { MapView } from "./components/MapView";
import { AnalyticsSection } from "./components/AnalyticsSection";
import { GlobalRegistry } from "./components/GlobalRegistry";
import { BlacklistManagement } from "./components/BlacklistManagement";
import BlacklistModal from "./components/BlacklistModal";
import { AiPipelineVisualizer } from "./components/AiPipelineVisualizer";
import { SystemHealth } from "./components/SystemHealth";
import { VehicleDetailModal } from "./components/VehicleDetailModal";
import { CyberLoadingScreen } from "./components/CyberLoadingScreen";
import { TrafficAnalyticsPage } from "./components/TrafficAnalyticsPage";
import { api } from "./services/api";
import "./App.css";

export default function App() {
  const [activeTab, setActiveTab] = useState("surveillance");
  const [cameras, setCameras] = useState({});
  const [vehicles, setVehicles] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [alertsData, setAlertsData] = useState(null);
  const [watchlist, setWatchlist] = useState([]);
  const [systemHealth, setSystemHealth] = useState(null);
  const [isBackendOnline, setIsBackendOnline] = useState(false);
  const [isDbOnline, setIsDbOnline] = useState(false);

  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [selectedCameraId, setSelectedCameraId] = useState("junction_A_camera_01");
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isAddBlacklistModalOpen, setIsAddBlacklistModalOpen] = useState(false);
  const [blacklistRefreshTrigger, setBlacklistRefreshTrigger] = useState(0);
  const [toastMessage, setToastMessage] = useState(null);

  const showToast = (message) => {
    setToastMessage(message);
    setTimeout(() => {
      setToastMessage((cur) => (cur === message ? null : cur));
    }, 3500);
  };

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const cameraGridRef = useRef(null);

  /* =========================================================
     LOAD DASHBOARD DATA
  ========================================================= */

  const loadDashboardData = async (isInitial = false) => {
    const startTime = Date.now();
    try {
      if (isInitial) {
        setLoading(true);
      }
      setError("");

      /* CAMERAS */
      let camRes = {};
      try {
        camRes = await api.getCameras();
      } catch (e) {
        console.warn("[Dashboard] Cameras failed:", e);
        camRes = {};
      }

      /* VEHICLES */
      let vehRes = [];
      try {
        vehRes = await api.getVehicles({ limit: 1000 });
      } catch (e) {
        console.warn("[Dashboard] Vehicles failed:", e);
        vehRes = [];
      }

      /* ANALYTICS */
      let anaRes = null;
      try {
        anaRes = await api.getAnalytics();
      } catch (e) {
        console.warn("[Dashboard] Analytics failed:", e);
        anaRes = null;
      }

      /* ALERTS */
      let altRes = null;
      try {
        altRes = await api.getAlerts();
      } catch (e) {
        console.warn("[Dashboard] Alerts failed:", e);
        altRes = null;
      }

      /* WATCHLIST */
      let wlRes = [];
      try {
        wlRes = await api.getWatchlist();
      } catch (e) {
        console.warn("[Dashboard] Watchlist failed:", e);
        wlRes = [];
      }

      /* SYSTEM HEALTH */
      let healthRes = null;
      try {
        healthRes = await api.getSystemHealth();
      } catch (e) {
        console.warn("[Dashboard] System health unavailable:", e);
        healthRes = null;
      }

      /* DB STATUS */
      try {
        const dbStatus = await api.getDbStatus();
        setIsDbOnline(dbStatus?.status === "connected");
      } catch (e) {
        setIsDbOnline(false);
      }

      /* UPDATE STATE */
      setCameras(camRes || {});
      setVehicles(Array.isArray(vehRes) ? vehRes : []);
      setAnalytics(anaRes || null);
      setAlertsData(altRes || null);
      setWatchlist(Array.isArray(wlRes) ? wlRes : []);
      setSystemHealth(healthRes || null);
      setIsBackendOnline(Boolean(healthRes));

      /* DEFAULT VEHICLE SELECTION */
      if (isInitial && Array.isArray(vehRes) && vehRes.length > 0) {
        const firstMatched =
          vehRes.find(
            (vehicle) => Number(vehicle.camera_count) > 1 && vehicle.has_plate
          ) ||
          vehRes.find((vehicle) => Number(vehicle.camera_count) > 1) ||
          vehRes.find((vehicle) => vehicle.has_plate) ||
          vehRes[0];

        setSelectedVehicle(firstMatched);

        if (firstMatched?.trajectory && firstMatched.trajectory.length > 0) {
          const firstCamera = firstMatched.trajectory[0]?.camera_id;
          if (firstCamera) {
            setSelectedCameraId(firstCamera);
          }
        }
      }
    } catch (err) {
      console.error("[Dashboard] Unexpected load error:", err);
      setError("Unable to load Traffic Intelligence dashboard.");
      setIsBackendOnline(false);
    } finally {
      if (isInitial) {
        const elapsed = Date.now() - startTime;
        const minBootTime = 1800;
        const delay = Math.max(0, minBootTime - elapsed);
        setTimeout(() => {
          setLoading(false);
        }, delay);
      }
    }
  };

  /* INITIAL LOAD + LIVE REFRESH */
  useEffect(() => {
    loadDashboardData(true);

    const pollInterval = setInterval(() => {
      loadDashboardData(false);
    }, 10000);

    return () => clearInterval(pollInterval);
  }, []);

  /* VIDEO EVENT SEEK */
  const handlePlayEvent = (cameraId, timestampSeconds, label) => {
    console.info("[Video Event Seek]", { cameraId, timestampSeconds, label });

    if (
      cameraGridRef.current &&
      typeof cameraGridRef.current.seekAndPlay === "function"
    ) {
      cameraGridRef.current.seekAndPlay(cameraId, timestampSeconds, label);
    }

    if (cameraId) {
      setSelectedCameraId(cameraId);
    }
  };

  /* SELECT VEHICLE */
  const handleSelectVehicle = async (vehicleOrObj) => {
    if (!vehicleOrObj) return;

    let targetVehicle = vehicleOrObj;
    if (typeof vehicleOrObj === "string") {
      targetVehicle = { plate: vehicleOrObj };
    }

    // If only { plate: "..." } passed from an alert or blacklist
    if (!targetVehicle.trajectory && targetVehicle.plate) {
      try {
        const searchResults = await api.searchVehicles(targetVehicle.plate);
        if (searchResults && searchResults.length > 0) {
          targetVehicle = searchResults[0];
        }
      } catch (err) {
        console.warn("Failed to resolve journey for alert target:", err);
      }
    }

    setSelectedVehicle(targetVehicle);

    if (Array.isArray(targetVehicle.trajectory) && targetVehicle.trajectory.length > 0) {
      const firstObservation = targetVehicle.trajectory[0];
      if (firstObservation?.camera_id) {
        setSelectedCameraId(firstObservation.camera_id);
      }
    } else if (
      Array.isArray(targetVehicle.camera_ids) &&
      targetVehicle.camera_ids.length > 0
    ) {
      setSelectedCameraId(targetVehicle.camera_ids[0]);
    }
  };

  /* OPEN VEHICLE DOSSIER */
  const handleOpenDossier = (vehicle) => {
    if (!vehicle) return;
    setSelectedVehicle(vehicle);
    setIsDetailModalOpen(true);

    if (Array.isArray(vehicle.trajectory) && vehicle.trajectory.length > 0) {
      const cameraId = vehicle.trajectory[0]?.camera_id;
      if (cameraId) {
        setSelectedCameraId(cameraId);
      }
    }
  };

  /* CAMERA SELECTION */
  const handleCameraSelect = (cameraId) => {
    if (!cameraId) return;
    setSelectedCameraId(cameraId);
  };

  /* WATCHLIST ACTIONS */
  const handleAddToWatchlist = async (entry) => {
    await api.addToWatchlist(entry);
    const updatedWl = await api.getWatchlist();
    const updatedAlerts = await api.getAlerts();
    setWatchlist(updatedWl);
    setAlertsData(updatedAlerts);
  };

  const handleDeleteFromWatchlist = async (plate) => {
    await api.deleteFromWatchlist(plate);
    const updatedWl = await api.getWatchlist();
    const updatedAlerts = await api.getAlerts();
    setWatchlist(updatedWl);
    setAlertsData(updatedAlerts);
  };

  /* LOADING SCREEN */
  if (loading) {
    return <CyberLoadingScreen onFinished={() => setLoading(false)} />;
  }

  return (
    <div className="command-center-app">
      {/* 1. HEADER WITH NAVIGATION TABS */}
      <Header
        systemHealth={systemHealth}
        camerasCount={Object.keys(cameras || {}).length}
        isBackendOnline={isBackendOnline}
        isDbOnline={isDbOnline}
        onOpenAddBlacklist={() => setIsAddBlacklistModalOpen(true)}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
      />

      {/* 2. MAIN OPERATIONS BODY */}
      <main className="command-center-body">
        {activeTab === "analytics" ? (
          /* DEDICATED TRAFFIC MOBILITY & FLOW ANALYTICS PAGE */
          <TrafficAnalyticsPage
            analytics={analytics}
            cameras={cameras}
            vehicles={vehicles}
            onBackToSurveillance={() => setActiveTab("surveillance")}
            onSelectVehicle={handleSelectVehicle}
          />
        ) : (
          /* SURVEILLANCE & RE-ID COMMAND CENTER */
          <>
            {/* LIVE CAMERA NETWORK */}
            <CameraGrid
              ref={cameraGridRef}
              cameras={cameras}
              selectedCameraId={selectedCameraId}
              onCameraSelect={handleCameraSelect}
            />

            {/* KPI STRIP */}
            <KpiStrip kpis={analytics?.kpis} />

            {/* PROMINENT TRAFFIC ANALYTICS ACCESS BANNER */}
            <div className="analytics-page-nav-banner">
              <div className="apnb-content">
                <div className="apnb-icon-slot">📊</div>
                <div className="apnb-text">
                  <strong>Looking for Macro Traffic Flow Analytics, Origin-Destination Matrix & Congestion Loads?</strong>
                  <p>Continuous sensor telemetry, Haversine corridor velocities, and bottleneck predictions are compiled on the dedicated mobility page.</p>
                </div>
              </div>
              <button
                type="button"
                className="apnb-btn font-mono"
                onClick={() => setActiveTab("analytics")}
                title="View full Origin-Destination matrix, node loads, and speed spectrum"
              >
                Open Traffic Mobility Page ➜
              </button>
            </div>

            {/* VEHICLE SEARCH & GEOSPATIAL MAP DUO */}
            <div className="investigation-duo-grid">
              {/* Left: Vehicle Search */}
              <VehicleSearch
                selectedVehicle={selectedVehicle}
                onSelectVehicle={handleSelectVehicle}
                onPlayEvent={handlePlayEvent}
                onFocusCamera={handleCameraSelect}
              />

              {/* Right: Geospatial Journey Map with Dual Mode A / Mode B */}
              <MapView
                cameras={cameras}
                selectedVehicle={selectedVehicle}
                selectedCameraId={selectedCameraId}
                onCameraSelect={handleCameraSelect}
                analytics={analytics}
              />
            </div>

            {/* CHRONOLOGICAL JOURNEY TIMELINE */}
            <JourneyTimeline
              selectedVehicle={selectedVehicle}
              onPlayEvent={handlePlayEvent}
              onFocusCamera={handleCameraSelect}
            />

            {/* OPERATOR BLACKLIST MANAGEMENT (MYSQL PERSISTENT SURVEILLANCE & VIEW DOSSIER) */}
            <BlacklistManagement
              onSelectVehicle={handleSelectVehicle}
              onOpenAddModal={() => setIsAddBlacklistModalOpen(true)}
              refreshTrigger={blacklistRefreshTrigger}
              onDeleteSuccess={(msg) => {
                showToast(msg);
                loadDashboardData(false);
              }}
              onStatusChangeSuccess={(msg) => {
                showToast(msg);
                loadDashboardData(false);
              }}
              onFocusCamera={handleCameraSelect}
              onPlayEvent={handlePlayEvent}
            />

            {/* GLOBAL VEHICLE IDENTITY REGISTRY (PLACED DIRECTLY BELOW BLACKLISTED) */}
            <GlobalRegistry
              vehicles={vehicles}
              selectedVehicleId={selectedVehicle?.global_vehicle_id}
              onSelectVehicle={handleOpenDossier}
            />

            {/* 10-STAGE TECHNICAL AI PIPELINE */}
            <AiPipelineVisualizer />

            {/* SYSTEM HEALTH TELEMETRY */}
            <SystemHealth
              healthData={systemHealth}
              isBackendOnline={isBackendOnline}
            />
          </>
        )}
      </main>

      {/* OPERATOR ADD BLACKLIST MODAL */}
      <BlacklistModal
        isOpen={isAddBlacklistModalOpen}
        onClose={() => setIsAddBlacklistModalOpen(false)}
        onSuccess={() => {
          showToast("Vehicle added to blacklist.");
          setBlacklistRefreshTrigger((prev) => prev + 1);
          loadDashboardData(false);
        }}
      />

      {/* VEHICLE INTELLIGENCE DOSSIER MODAL */}
      {isDetailModalOpen && selectedVehicle && (
        <VehicleDetailModal
          vehicle={selectedVehicle}
          onClose={() => setIsDetailModalOpen(false)}
          onPlayEvent={handlePlayEvent}
          onFocusCamera={handleCameraSelect}
        />
      )}

      {/* TOAST NOTIFICATION */}
      {toastMessage && (
        <div
          className="floating-toast-alert font-mono"
          style={{
            position: "fixed",
            bottom: "24px",
            right: "24px",
            zIndex: 9999,
            background: "var(--text-primary, #0f172a)",
            color: "#ffffff",
            padding: "12px 20px",
            borderRadius: "8px",
            boxShadow: "0 10px 25px rgba(0, 0, 0, 0.2)",
            display: "flex",
            alignItems: "center",
            gap: "10px",
            fontSize: "13px",
            fontWeight: 600,
          }}
        >
          <span style={{ color: "var(--status-success, #22c55e)", fontSize: "16px" }}>✓</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* FOOTER */}
      <footer className="command-footer font-mono">
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>DRISHTI-X</span>
          <span>•</span>
          <span>CITY-WIDE VISUAL INTELLIGENCE FOR VEHICLE TRACKING & MOBILITY ANALYSIS</span>
          <span>•</span>
          <span style={{ color: "var(--status-success)" }}>OPERATIONAL PROTOCOL v3.5</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span>NETWORK: 4 CCTV NODES</span>
          <span>•</span>
          <span>SYNC: 10.0 FPS</span>
        </div>
      </footer>
    </div>
  );
}