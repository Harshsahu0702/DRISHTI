import React, {
  useRef,
  useImperativeHandle,
  forwardRef,
  useState,
  useEffect,
} from "react";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
  Radio,
  Clock,
  Video,
} from "lucide-react";
import { api, formatTimestampSec } from "../services/api";

export const CameraGrid = forwardRef(function CameraGrid(
  { cameras, onCameraSelect, selectedCameraId },
  ref
) {
  const videoRefs = useRef({});
  const pendingSeeks = useRef({});

  const [playingStates, setPlayingStates] = useState({});
  const [mutedStates, setMutedStates] = useState({});
  const [currentTimes, setCurrentTimes] = useState({});
  const [activeEventHighlight, setActiveEventHighlight] = useState(null);

  const cameraList = Object.values(cameras || {});

  // Group cameras by junction/scene
  const groupedJunctions = cameraList.reduce((groups, cam) => {
    const scene = cam.scene || cam.junction_name || "Junction";
    if (!groups[scene]) {
      groups[scene] = [];
    }
    groups[scene].push(cam);
    return groups;
  }, {});

  const junctions = Object.entries(groupedJunctions);

  // Apply seek if video metadata wasn't loaded when seek was requested
  const applyPendingSeek = (camId) => {
    const vid = videoRefs.current[camId];
    const pending = pendingSeeks.current[camId];

    if (!vid || !pending || !Number.isFinite(vid.duration)) {
      return;
    }

    const target = Math.max(
      0,
      Math.min(pending.timestamp, vid.duration || pending.timestamp)
    );

    vid.currentTime = target;
    delete pendingSeeks.current[camId];

    vid
      .play()
      .then(() => {
        setPlayingStates((prev) => ({
          ...prev,
          [camId]: true,
        }));
      })
      .catch((err) => {
        console.warn(`Could not play camera ${camId}:`, err);
        setPlayingStates((prev) => ({
          ...prev,
          [camId]: false,
        }));
      });
  };

  // Expose seekAndPlay to App.jsx through ref
  useImperativeHandle(ref, () => ({
    seekAndPlay: (cameraId, timestampSeconds, eventLabel = "") => {
      const vid = videoRefs.current[cameraId];

      if (!vid) {
        console.warn(`Camera video element not mounted: ${cameraId}`);
        return;
      }

      const timestamp = Math.max(0, Number(timestampSeconds) || 0);

      if (vid.readyState < 1 || !Number.isFinite(vid.duration)) {
        pendingSeeks.current[cameraId] = {
          timestamp,
          eventLabel,
        };
      } else {
        const target = Math.min(timestamp, vid.duration || timestamp);
        vid.currentTime = Math.max(0, target);

        vid
          .play()
          .then(() => {
            setPlayingStates((prev) => ({
              ...prev,
              [cameraId]: true,
            }));
          })
          .catch((err) => {
            console.warn(`Could not autoplay camera ${cameraId}:`, err);
            setPlayingStates((prev) => ({
              ...prev,
              [cameraId]: false,
            }));
          });
      }

      setActiveEventHighlight({
        cameraId,
        timestamp,
        label: eventLabel,
        expiresAt: Date.now() + 8000,
      });

      window.setTimeout(() => {
        setActiveEventHighlight((current) =>
          current?.cameraId === cameraId && current?.timestamp === timestamp
            ? null
            : current
        );
      }, 8000);

      requestAnimationFrame(() => {
        const cardElem = document.getElementById(`camera-card-${cameraId}`);
        if (cardElem) {
          cardElem.scrollIntoView({
            behavior: "smooth",
            block: "nearest",
            inline: "nearest",
          });
        }
      });
    },
  }));

  const togglePlay = async (camId) => {
    const vid = videoRefs.current[camId];
    if (!vid) return;

    try {
      if (vid.paused) {
        await vid.play();
        setPlayingStates((prev) => ({ ...prev, [camId]: true }));
      } else {
        vid.pause();
        setPlayingStates((prev) => ({ ...prev, [camId]: false }));
      }
    } catch (err) {
      console.warn(`Play/pause toggle error for ${camId}:`, err);
    }
  };

  const toggleMute = (camId) => {
    const vid = videoRefs.current[camId];
    if (!vid) return;
    const newMuted = !vid.muted;
    vid.muted = newMuted;
    setMutedStates((prev) => ({ ...prev, [camId]: newMuted }));
  };

  const handleSeek = (camId, e) => {
    const vid = videoRefs.current[camId];
    if (!vid || !Number.isFinite(vid.duration) || vid.duration <= 0) return;

    const percent = parseFloat(e.target.value);
    const target = (percent / 100) * vid.duration;
    vid.currentTime = target;
    setCurrentTimes((prev) => ({ ...prev, [camId]: target }));
  };

  const toggleFullscreen = (camId) => {
    const vid = videoRefs.current[camId];
    if (!vid) return;

    if (!document.fullscreenElement) {
      vid.requestFullscreen?.().catch((err) => console.warn(err));
    } else {
      document.exitFullscreen?.().catch((err) => console.warn(err));
    }
  };

  const handleTimeUpdate = (camId) => {
    const vid = videoRefs.current[camId];
    if (!vid) return;
    setCurrentTimes((prev) => ({ ...prev, [camId]: vid.currentTime }));
  };

  const handleVideoReady = (camId) => {
    applyPendingSeek(camId);
  };

  const handleAutoPlay = (camId) => {
    const vid = videoRefs.current[camId];
    if (!vid) return;

    applyPendingSeek(camId);

    if (vid.paused) {
      vid
        .play()
        .then(() => {
          setPlayingStates((prev) => ({ ...prev, [camId]: true }));
        })
        .catch(() => {
          // Autoplay blocked by browser policy without user interaction
        });
    }
  };

  return (
    <section className="camera-network-section">
      {/* Section Header */}
      <div className="section-header-block">
        <div>
          <div className="section-eyebrow">Synchronized CCTV Feeds</div>
          <h2 className="section-main-heading">Live Camera Surveillance Network</h2>
          <p className="section-subtext">
            Continuous optical surveillance across Junction A & Junction B demonstration corridors.
          </p>
        </div>
      </div>

      {/* Two-Junction Responsive Layout */}
      <div className="camera-grid-two-junctions">
        {junctions.map(([scene, sceneCameras]) => (
          <div className="junction-group-card" key={scene}>
            {/* Junction Header */}
            <div className="junction-group-header">
              <div className="junction-title-cluster">
                <div className="junction-icon-badge">
                  <Radio size={16} />
                </div>
                <div>
                  <div className="junction-name-text">{scene}</div>
                  <div className="junction-sub-info">
                    {sceneCameras.length} Synchronized Camera Feeds
                  </div>
                </div>
              </div>
            </div>

            {/* Cameras Duo Inside Junction */}
            <div className="junction-cameras-duo">
              {sceneCameras.map((cam) => {
                const isSelected = selectedCameraId === cam.id;
                const isHighlighted =
                  activeEventHighlight?.cameraId === cam.id &&
                  Date.now() < activeEventHighlight.expiresAt;

                const vid = videoRefs.current[cam.id];
                const currentTime = currentTimes[cam.id] || 0;
                const duration =
                  vid && Number.isFinite(vid.duration) && vid.duration > 0
                    ? vid.duration
                    : 210;

                const progress =
                  duration > 0
                    ? Math.max(0, Math.min(100, (currentTime / duration) * 100))
                    : 0;

                const videoUrl = api.getCameraVideoUrl(cam.id);

                return (
                  <div
                    key={cam.id}
                    id={`camera-card-${cam.id}`}
                    className={`camera-unit-card ${
                      isSelected ? "is-selected" : ""
                    } ${isHighlighted ? "is-highlighted" : ""}`}
                    onClick={() => onCameraSelect && onCameraSelect(cam.id)}
                  >
                    {/* Unit Header */}
                    <div className="camera-unit-header">
                      <div className="camera-name-code">
                        <span className="cam-badge-tag">{cam.name || cam.camera_name || cam.id}</span>
                        <span className="cam-road-sub">• {scene}</span>
                      </div>
                      <span className="cam-fps-badge font-mono">
                        {cam.fps || 10} FPS
                      </span>
                    </div>

                    {/* Video Viewport */}
                    <div className="camera-video-container">
                      <video
                        key={`${cam.id}-${videoUrl}`}
                        ref={(el) => {
                          videoRefs.current[cam.id] = el;
                        }}
                        src={videoUrl}
                        className="camera-html-video"
                        muted={mutedStates[cam.id] ?? true}
                        autoPlay
                        playsInline
                        loop
                        controls={false}
                        preload="auto"
                        onLoadedMetadata={() => handleVideoReady(cam.id)}
                        onCanPlay={() => {
                          handleVideoReady(cam.id);
                          handleAutoPlay(cam.id);
                        }}
                        onLoadedData={() => handleAutoPlay(cam.id)}
                        onTimeUpdate={() => handleTimeUpdate(cam.id)}
                        onPlay={() =>
                          setPlayingStates((prev) => ({
                            ...prev,
                            [cam.id]: true,
                          }))
                        }
                        onPause={() =>
                          setPlayingStates((prev) => ({
                            ...prev,
                            [cam.id]: false,
                          }))
                        }
                        onEnded={() =>
                          setPlayingStates((prev) => ({
                            ...prev,
                            [cam.id]: false,
                          }))
                        }
                      />

                      {/* Evidence Highlight Badge */}
                      {isHighlighted && (
                        <div className="video-overlay-evidence-playing font-mono">
                          ▶ EVIDENCE PLAYBACK
                        </div>
                      )}

                      {/* Timestamp Overlay */}
                      <div className="video-overlay-timestamp font-mono">
                        T+{formatTimestampSec(currentTime)}
                      </div>
                    </div>

                    {/* Controls Strip */}
                    <div className="camera-controls-strip">
                      <button
                        type="button"
                        className="cam-ctrl-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          togglePlay(cam.id);
                        }}
                        aria-label={playingStates[cam.id] ? "Pause" : "Play"}
                        title={playingStates[cam.id] ? "Pause" : "Play"}
                      >
                        {playingStates[cam.id] ? (
                          <Pause size={13} />
                        ) : (
                          <Play size={13} />
                        )}
                      </button>

                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="0.1"
                        value={progress}
                        className="cam-seek-slider"
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => handleSeek(cam.id, e)}
                        aria-label="Seek position"
                      />

                      <button
                        type="button"
                        className="cam-ctrl-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleMute(cam.id);
                        }}
                        aria-label={mutedStates[cam.id] ? "Unmute" : "Mute"}
                        title={mutedStates[cam.id] ? "Unmute" : "Mute"}
                      >
                        {mutedStates[cam.id] ? (
                          <VolumeX size={13} />
                        ) : (
                          <Volume2 size={13} />
                        )}
                      </button>

                      <button
                        type="button"
                        className="cam-ctrl-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFullscreen(cam.id);
                        }}
                        aria-label="Fullscreen"
                        title="Fullscreen"
                      >
                        <Maximize2 size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
});
