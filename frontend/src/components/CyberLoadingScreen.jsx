import React, { useState, useEffect } from "react";
import { DrishtiEyeLogo } from "./DrishtiEyeLogo";

const TELEMETRY_STAGES = [
  "INITIALIZING OPTICAL NEURAL PERCEPTION CORE...",
  "CALIBRATING JUNCTION_A & JUNCTION_B CAMERA STREAMS...",
  "LOADING YOLO11 MULTI-TASK DETECTOR & RE-ID WEIGHTS...",
  "SYNCHRONIZING ASANSOL CORRIDOR TOPOLOGY MATRIX...",
  "CONNECTING LICENSE PLATE ANPR EXTRACTION PIPELINE...",
  "COMPUTING SPATIO-TEMPORAL TRAJECTORY EMBEDDINGS...",
  "SYSTEM SECURE. LAUNCHING DRISHTI-X COMMAND MATRIX...",
];

export function CyberLoadingScreen({ isExiting = false, onFinished }) {
  const [progress, setProgress] = useState(12);
  const [stageIndex, setStageIndex] = useState(0);

  useEffect(() => {
    const startTime = Date.now();
    const duration = 2200; // 2.2s cinematic boot

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(100, Math.floor((elapsed / duration) * 100));
      setProgress(pct);

      const step = Math.min(
        TELEMETRY_STAGES.length - 1,
        Math.floor((pct / 100) * TELEMETRY_STAGES.length)
      );
      setStageIndex(step);

      if (pct >= 100) {
        clearInterval(interval);
        if (onFinished) {
          setTimeout(onFinished, 300);
        }
      }
    }, 45);

    return () => clearInterval(interval);
  }, [onFinished]);

  return (
    <div className={`cyber-loading-screen ${isExiting ? "loading-fade-out" : ""}`}>
      {/* Ambient Cyber Grid & Glow */}
      <div className="cyber-loading-backdrop">
        <div className="cyber-loading-glow-orb"></div>
        <div className="cyber-grid-overlay"></div>
        <div className="cyber-scanline-sweep"></div>
      </div>

      <div className="cyber-loading-content">
        {/* BIG CRAZY DRISHTI CYBER EYE LOGO */}
        <div className="cyber-eye-hero-container">
          <div className="cyber-eye-halo-ring"></div>
          <div className="cyber-eye-halo-pulse"></div>
          <DrishtiEyeLogo size={160} animated={true} className="loading-hero-eye" />
        </div>

        {/* BRAND IDENTITY */}
        <div className="cyber-brand-hero">
          <div className="cyber-pre-title">
            <span className="cyber-dot-indicator"></span>
            DEFENSE-GRADE RE-IDENTIFICATION MATRIX
          </div>

          <h1 className="cyber-hero-title">
            DRISHTI<span className="cyber-hero-x">-X</span>
          </h1>

          <div className="cyber-hero-subtitle">
            CITY-WIDE VISUAL INTELLIGENCE FOR VEHICLE TRACKING & MOBILITY ANALYSIS
          </div>
        </div>

        {/* PROGRESS INDICATOR */}
        <div className="cyber-progress-assembly">
          <div className="cyber-progress-header">
            <span className="cyber-stage-text font-mono">
              {TELEMETRY_STAGES[stageIndex]}
            </span>
            <span className="cyber-pct-readout font-mono">
              {progress.toString().padStart(3, "0")}%
            </span>
          </div>

          <div className="cyber-progress-track">
            <div
              className="cyber-progress-fill"
              style={{ width: `${progress}%` }}
            >
              <div className="cyber-progress-head-glint"></div>
            </div>
          </div>

          {/* Sub-telemetry readout */}
          <div className="cyber-telemetry-specs font-mono">
            <span>CORE: YOLO11 + ReID</span>
            <span>•</span>
            <span>NODES: 4/4 ACTIVE</span>
            <span>•</span>
            <span>LATENCY: 4.2ms</span>
            <span>•</span>
            <span>FREQ: 10 FPS</span>
          </div>
        </div>
      </div>
    </div>
  );
}
