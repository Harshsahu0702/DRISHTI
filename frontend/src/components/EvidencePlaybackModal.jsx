import React, { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  Play,
  Pause,
  X,
  Clock,
  ShieldAlert,
  ShieldCheck,
  Scan,
  Volume2,
  VolumeX,
  Maximize2,
} from "lucide-react";
import { api } from "../services/api";

const EVIDENCE_PRE_ROLL = 5; // 5 seconds before detection
const DEFAULT_EVIDENCE_DURATION = 15; // configured short evidence duration (5s pre-roll + 10s post-roll)

// Format seconds → M:SS
const fmt = (s) => {
  if (!Number.isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
};

export function EvidencePlaybackModal({ isOpen, onClose, eventData }) {
  const videoRef = useRef(null);
  const seekBarRef = useRef(null);
  const currentTimeSpanRef = useRef(null);
  const ribbonTimeRef = useRef(null);
  const ribbonEventTagRef = useRef(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [videoReady, setVideoReady] = useState(false);
  const [autoPaused, setAutoPaused] = useState(false);
  const [showPauseBanner, setShowPauseBanner] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);

  const hasStartedRef = useRef(false);
  const hasAutoPausedRef = useRef(false);
  const playbackRateRef = useRef(1);

  const timestampSec = Number(eventData?.timestamp) || 0;
  const clipStartSec = Math.max(0, timestampSec - EVIDENCE_PRE_ROLL);
  const evidenceDuration = Number(eventData?.evidenceDuration) || DEFAULT_EVIDENCE_DURATION;
  const clipEndSec = clipStartSec + evidenceDuration;
  const effectiveDuration = Math.max(1, clipEndSec - clipStartSec);
  const markerPct = (EVIDENCE_PRE_ROLL / effectiveDuration) * 100;

  // Direct DOM updates for zero-lag, non-React re-rendering playback
  const updateTimelineDOM = useCallback((relCt) => {
    const absCt = clipStartSec + relCt;
    if (currentTimeSpanRef.current) {
      currentTimeSpanRef.current.textContent = fmt(absCt);
    }
    if (ribbonTimeRef.current) {
      ribbonTimeRef.current.textContent = `T+${fmt(absCt)}`;
    }
    if (ribbonEventTagRef.current) {
      const showTag = relCt >= EVIDENCE_PRE_ROLL - 0.2 && relCt <= EVIDENCE_PRE_ROLL + 3;
      ribbonEventTagRef.current.style.display = showTag ? "inline-flex" : "none";
    }
    if (seekBarRef.current) {
      seekBarRef.current.value = Math.max(0, Math.min(effectiveDuration, relCt));
    }
  }, [clipStartSec, effectiveDuration]);

  // Escape key listener
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  // Reset state when modal opens/closes or camera changes
  useEffect(() => {
    if (!isOpen) {
      if (videoRef.current) {
        videoRef.current.pause();
      }
      hasStartedRef.current = false;
      hasAutoPausedRef.current = false;
      setIsPlaying(false);
      setShowPauseBanner(false);
      return;
    }

    hasStartedRef.current = false;
    hasAutoPausedRef.current = false;
    setAutoPaused(false);
    setShowPauseBanner(false);
    setPlaybackRate(1);
    playbackRateRef.current = 1;

    // Check if video element is already ready from browser cache
    const vid = videoRef.current;
    if (vid) {
      vid.playbackRate = 1;
      if (vid.readyState >= 1) {
        setVideoReady(true);
      }
      if (vid.readyState >= 2 && !hasStartedRef.current) {
        hasStartedRef.current = true;
        vid.currentTime = 0;
        updateTimelineDOM(0);
        vid.play().then(() => setIsPlaying(true)).catch(() => {});
      }
    }
  }, [isOpen, eventData?.cameraId, timestampSec, updateTimelineDOM]);

  if (!isOpen || !eventData) return null;

  const {
    cameraId,
    cameraName = cameraId,
    junctionName = "Traffic Junction",
    plate = "UNKNOWN",
    plateImage,
    vehicleType = "car",
    confidence = 0.92,
    isBlacklisted = false,
    reason = "",
  } = eventData;

  const defaultBbox = { x: 38, y: 44, width: 24, height: 26 };
  const targetBbox =
    eventData.bbox && typeof eventData.bbox.x === "number"
      ? eventData.bbox
      : defaultBbox;

  const confPercent = Math.round(confidence <= 1 ? confidence * 100 : confidence);
  // Server-side trimmed & faststart cached evidence clip (only 15 seconds long)
  const videoUrl = api.getEvidenceClipUrl(cameraId, timestampSec, EVIDENCE_PRE_ROLL, evidenceDuration);

  let imageUrl = null;
  if (plateImage) {
    imageUrl = plateImage.startsWith("http") || plateImage.startsWith("/")
      ? plateImage
      : api.getPlateImageUrl(plateImage);
  }

  // ── Video event handlers ──
  const handleLoadedMetadata = () => {
    const vid = videoRef.current;
    if (!vid) return;
    setVideoReady(true);
  };

  const handleLoadedData = () => {
    setVideoReady(true);
  };

  const handleCanPlay = () => {
    const vid = videoRef.current;
    if (!vid) return;
    setVideoReady(true);

    if (hasStartedRef.current) return;
    hasStartedRef.current = true;

    vid.playbackRate = playbackRateRef.current;
    updateTimelineDOM(0);

    vid.play().then(() => setIsPlaying(true)).catch((e) => {
      console.warn("[EvidencePlayback] Autoplay notice:", e);
    });
  };

  const handleSeeked = () => {
    setVideoReady(true);
  };

  const handlePlaying = () => {
    setVideoReady(true);
    setIsPlaying(true);
  };

  const handleError = (e) => {
    console.error("[EvidencePlayback] Video error:", e);
    setVideoReady(true);
  };

  const handleTimeUpdate = () => {
    const vid = videoRef.current;
    if (!vid) return;
    const relCt = vid.currentTime;

    // Auto-pause when vehicle reaches detection moment (5 seconds into the trimmed clip)
    if (!hasAutoPausedRef.current && !vid.paused && relCt >= EVIDENCE_PRE_ROLL) {
      hasAutoPausedRef.current = true;
      vid.pause();
      setIsPlaying(false);
      setAutoPaused(true);
      setShowPauseBanner(true);
      updateTimelineDOM(EVIDENCE_PRE_ROLL);
      return;
    }

    // Boundary: end of evidence clip
    if (relCt >= effectiveDuration) {
      vid.currentTime = effectiveDuration;
      vid.pause();
      setIsPlaying(false);
      updateTimelineDOM(effectiveDuration);
      return;
    }

    updateTimelineDOM(relCt);
  };

  const handlePlayPause = () => {
    const vid = videoRef.current;
    if (!vid) return;
    if (vid.paused) {
      // If at or near clip end, replay from start of evidence clip
      if (vid.currentTime >= effectiveDuration - 0.1) {
        vid.currentTime = 0;
        hasAutoPausedRef.current = false;
      }
      setAutoPaused(false);
      setShowPauseBanner(false);
      vid.playbackRate = playbackRateRef.current;
      vid.play().then(() => setIsPlaying(true)).catch(() => {});
    } else {
      vid.pause();
      setIsPlaying(false);
    }
  };

  const handleResume = (e) => {
    e?.stopPropagation();
    handlePlayPause();
  };

  const handleSeekBar = (e) => {
    const vid = videoRef.current;
    if (!vid) return;
    const offset = parseFloat(e.target.value);
    const target = Math.max(0, Math.min(effectiveDuration, offset));
    vid.currentTime = target;
    // If seeked before detection, re-arm auto-pause
    if (target < EVIDENCE_PRE_ROLL) {
      hasAutoPausedRef.current = false;
    }
    updateTimelineDOM(target);
  };

  const handleSpeedChange = (e) => {
    const rate = parseFloat(e.target.value);
    playbackRateRef.current = rate;
    setPlaybackRate(rate);
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
    }
  };

  const handleMuteToggle = () => {
    const vid = videoRef.current;
    if (!vid) return;
    vid.muted = !vid.muted;
    setIsMuted(vid.muted);
  };

  const handleFullscreen = () => {
    const vid = videoRef.current;
    if (!vid) return;
    vid.requestFullscreen?.().catch(() => {});
  };

  return createPortal(
    <div className="evidence-modal-backdrop" onClick={onClose}>
      <div
        className="evidence-playback-modal-box ev-v2"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* ── HEADER ── */}
        <div className="evidence-modal-header">
          <div className="evidence-header-title-wrap">
            <div className="evidence-lead-badge font-mono">
              <Scan size={13} className="spin-slow" />
              <span>FORENSIC CCTV AUDIT • EVIDENCE PLAYBACK</span>
            </div>
            <h2 className="evidence-modal-main-title">
              Vehicle Sighting — Live Evidence
            </h2>
          </div>
          <button type="button" className="btn-modal-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {/* ── BODY (2-col) ── */}
        <div className="ev2-body">

          {/* ── LEFT: CCTV VIDEO PLAYER ── */}
          <div className="ev2-video-col">
            <div className="ev2-video-wrapper">

              {/* Black-scan scanlines overlay */}
              <div className="ev2-scanlines" />

              {/* Status ribbon */}
              <div className="ev2-status-ribbon font-mono">
                <span className="ev2-rec-dot" />
                <span>REC • {cameraName}</span>
                <span className="ev2-ribbon-sep">•</span>
                <span ref={ribbonTimeRef}>T+{fmt(clipStartSec)}</span>
                <span ref={ribbonEventTagRef} className="ev2-event-tag" style={{ display: "none" }}>
                  ⚡ EVENT DETECTED
                </span>
              </div>

              {/* THE VIDEO ELEMENT (Lightweight server-side trimmed clip) */}
              <video
                ref={videoRef}
                src={videoUrl}
                className="ev2-video"
                muted={isMuted}
                playsInline
                preload="auto"
                onLoadedMetadata={handleLoadedMetadata}
                onLoadedData={handleLoadedData}
                onCanPlay={handleCanPlay}
                onSeeked={handleSeeked}
                onPlaying={handlePlaying}
                onError={handleError}
                onTimeUpdate={handleTimeUpdate}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
              />

              {/* Loading overlay */}
              {!videoReady && (
                <div className="ev2-loading-overlay font-mono">
                  <div className="ev2-loading-spinner" />
                  <span>Loading CCTV evidence clip…</span>
                </div>
              )}

              {/* AUTO-PAUSE POPUP / BADGE:
                  Can be dismissed with ✕ or by clicking outside to inspect the clean paused frame.
                  Dismissing does NOT resume video.
                  Only pressing Play on controls (or RESUME here) resumes playback. */}
              {autoPaused && showPauseBanner && (
                <div
                  className="ev2-auto-pause-overlay"
                  onClick={() => setShowPauseBanner(false)}
                  title="Click anywhere to dismiss banner and inspect paused video"
                >
                  <div
                    className="ev2-pause-badge font-mono"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="ev2-pause-icon-ring">
                      <Pause size={18} />
                    </div>
                    <div className="ev2-pause-text">
                      <span className="ev2-pause-headline">⌖ VEHICLE DETECTED</span>
                      <span className="ev2-pause-sub">
                        Auto-paused at T+{fmt(timestampSec)} • Sighting Moment
                      </span>
                    </div>
                    <button
                      type="button"
                      className="ev2-resume-btn font-mono"
                      onClick={handleResume}
                      title="Resume Playback"
                    >
                      <Play size={13} fill="currentColor" />
                      <span>RESUME</span>
                    </button>
                    <button
                      type="button"
                      className="ev2-dismiss-btn"
                      onClick={() => setShowPauseBanner(false)}
                      title="Dismiss popup to inspect paused video (press Play on controls to resume)"
                      aria-label="Dismiss popup"
                    >
                      <X size={15} />
                    </button>
                  </div>
                </div>
              )}

              {/* Controls bar */}
              <div className="ev2-controls">
                <button
                  type="button"
                  className="ev2-ctrl-btn"
                  onClick={handlePlayPause}
                  title={isPlaying ? "Pause" : "Play / Resume (Click to continue playback)"}
                >
                  {isPlaying ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}
                </button>

                <span ref={currentTimeSpanRef} className="ev2-time font-mono">
                  {fmt(clipStartSec)}
                </span>

                <div className="ev2-seek-wrap">
                  <input
                    ref={seekBarRef}
                    type="range"
                    min={0}
                    max={effectiveDuration}
                    step={0.05}
                    defaultValue={0}
                    onChange={handleSeekBar}
                    className="ev2-seek-bar"
                    aria-label="Evidence Seek Bar"
                  />
                  <div
                    className="ev2-event-marker"
                    style={{ left: `${markerPct}%` }}
                    title={`Detection at T+${fmt(timestampSec)}`}
                  />
                </div>

                <span className="ev2-time font-mono">
                  {fmt(clipEndSec)}
                </span>

                {/* Playback speed selector */}
                <select
                  className="ev2-speed-select font-mono"
                  value={playbackRate}
                  onChange={handleSpeedChange}
                  title="Playback Speed"
                  aria-label="Playback Speed"
                >
                  <option value="0.5">0.5x</option>
                  <option value="1">1x</option>
                  <option value="1.5">1.5x</option>
                  <option value="2">2x</option>
                </select>

                <button
                  type="button"
                  className="ev2-ctrl-btn"
                  onClick={handleMuteToggle}
                  title="Mute / Unmute"
                >
                  {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                </button>

                <button
                  type="button"
                  className="ev2-ctrl-btn"
                  onClick={handleFullscreen}
                  title="Fullscreen"
                >
                  <Maximize2 size={14} />
                </button>
              </div>
            </div>

            {/* Caption */}
            <div className="ev2-video-caption font-mono">
              ▶ Playing from T+{fmt(clipStartSec)} &nbsp;│&nbsp; Detection at T+{fmt(timestampSec)}&nbsp;
              <span style={{ color: "#22c55e" }}>(−5 s pre-roll)</span>
              &nbsp;│&nbsp; Evidence Clip ({effectiveDuration}s)
            </div>
          </div>

          {/* ── RIGHT: META PANEL ── */}
          <div className="ev2-meta-col">

            {/* Blacklist alert */}
            {isBlacklisted ? (
              <div className="evidence-blacklist-alert-box">
                <ShieldAlert size={18} className="alert-red-icon" />
                <div>
                  <div className="alert-box-headline">ACTIVE BLACKLISTED TARGET</div>
                  <div className="alert-box-sub">{reason || "Flagged vehicle under active surveillance"}</div>
                </div>
              </div>
            ) : (
              <div className="evidence-normal-audit-box">
                <ShieldCheck size={18} className="check-green-icon" />
                <div>
                  <div className="audit-box-headline">VERIFIED OBSERVATION RECORD</div>
                  <div className="audit-box-sub">Registered in MySQL <code>plate_detections</code></div>
                </div>
              </div>
            )}

            {/* Plate card */}
            <div className="evidence-plate-hero-card font-mono">
              <div className="plate-ind-side"><span>I</span><span>N</span><span>D</span></div>
              <div className="plate-hero-text">{plate}</div>
              <div className="plate-conf-badge">{confPercent}% CONF</div>
            </div>

            {/* Plate crop thumbnail */}
            {imageUrl && (
              <div className="ev2-plate-thumb-wrap">
                <img
                  src={imageUrl}
                  alt={`Plate crop ${plate}`}
                  className="ev2-plate-thumb"
                  onError={(e) => { e.target.style.display = "none"; }}
                />
                <span className="ev2-thumb-label font-mono">OCR Crop</span>
              </div>
            )}

            {/* Spec grid */}
            <div className="evidence-specs-grid font-mono">
              <div className="spec-item">
                <span className="spec-lbl">JUNCTION / CORRIDOR</span>
                <span className="spec-val highlight-title">{junctionName}</span>
              </div>
              <div className="spec-item">
                <span className="spec-lbl">CAMERA NODE</span>
                <span className="spec-val">{cameraName}</span>
              </div>
              <div className="spec-item">
                <span className="spec-lbl">DETECTION TIME</span>
                <span className="spec-val highlight-amber">T+{fmt(timestampSec)}</span>
              </div>
              <div className="spec-item">
                <span className="spec-lbl">PRE-ROLL START</span>
                <span className="spec-val highlight-green">T+{fmt(clipStartSec)}</span>
              </div>
              <div className="spec-item">
                <span className="spec-lbl">VEHICLE TYPE</span>
                <span className="spec-val spec-capitalize">{vehicleType}</span>
              </div>
              <div className="spec-item">
                <span className="spec-lbl">BBOX (% FRAME)</span>
                <span className="spec-val" style={{ fontSize: "10px" }}>
                  X:{targetBbox.x}% Y:{targetBbox.y}% W:{targetBbox.width}% H:{targetBbox.height}%
                </span>
              </div>
            </div>

            {/* Note */}
            <div className="evidence-preroll-note font-mono">
              <Clock size={13} className="preroll-clock-icon" />
              <span>
                Video starts <strong>5 s before</strong> detection. Auto-pauses when target vehicle appears at T+{fmt(timestampSec)}.
              </span>
            </div>
          </div>

        </div>{/* end body */}
      </div>
    </div>,
    document.body
  );
}
