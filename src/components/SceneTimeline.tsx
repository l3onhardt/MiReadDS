"use client";
import { useRef, useEffect, useState, useCallback, useMemo } from "react";

export type SceneStatus = "played" | "current" | "ready" | "generating" | "waiting";

export interface SceneDot {
  index: number;
  status: SceneStatus;
}

interface SceneTimelineProps {
  scenes: SceneDot[];
  currentIndex: number;
  totalCount: number;
  generatedCount: number;
  onSceneClick: (index: number) => void;
  durationMs?: number;
  onTimelineSeek?: (positionMs: number) => void;
  groupSize: number;
  onGroupSizeChange: (size: number) => void;
}

const GROUP_SIZE_KEY = "timeline-group-size";
const GROUP_SIZES = [15, 30, 60] as const;

function statusColor(status: SceneStatus): string {
  switch (status) {
    case "played": return "var(--muted)";
    case "current": return "var(--accent)";
    case "ready": return "var(--dialogue)";
    case "generating": return "var(--accent)";
    case "waiting": return "var(--border)";
  }
}

function statusOpacity(status: SceneStatus): number {
  switch (status) {
    case "played": return 0.5;
    case "current": return 1;
    case "ready": return 0.8;
    case "generating": return 0.4;
    case "waiting": return 0.35;
  }
}

export function SceneTimeline({
  scenes,
  currentIndex,
  totalCount,
  generatedCount,
  onSceneClick,
  durationMs = 0,
  onTimelineSeek,
  groupSize,
  onGroupSizeChange,
}: SceneTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [hoveredGroup, setHoveredGroup] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const totalGroups = Math.ceil(scenes.length / groupSize);
  const currentGroupIdx = Math.floor(currentIndex / groupSize);

  // Build groups
  const groups = useMemo(() => {
    return Array.from({ length: totalGroups }, (_, gi) => {
      const start = gi * groupSize;
      const end = Math.min(start + groupSize, scenes.length);
      return scenes.slice(start, end);
    });
  }, [scenes, groupSize, totalGroups]);

  // Group status: the "dominant" status — if group contains current, it's current
  const groupStatus = useCallback((groupScenes: SceneDot[]): SceneStatus => {
    for (const s of groupScenes) {
      if (s.status === "current") return "current";
    }
    for (const s of groupScenes) {
      if (s.status === "generating") return "generating";
    }
    const allPlayed = groupScenes.every((s) => s.status === "played");
    if (allPlayed) return "played";
    const allReady = groupScenes.every((s) => s.status === "ready" || s.status === "played");
    if (allReady) return "ready";
    return "waiting";
  }, []);

  // Wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const idx = GROUP_SIZES.indexOf(groupSize as (typeof GROUP_SIZES)[number]);
    if (e.deltaY < 0 && idx > 0) {
      const next = GROUP_SIZES[idx - 1];
      onGroupSizeChange(next);
      try { localStorage.setItem(GROUP_SIZE_KEY, String(next)); } catch {}
    } else if (e.deltaY > 0 && idx < GROUP_SIZES.length - 1) {
      const next = GROUP_SIZES[idx + 1];
      onGroupSizeChange(next);
      try { localStorage.setItem(GROUP_SIZE_KEY, String(next)); } catch {}
    }
  }, [groupSize, onGroupSizeChange]);

  // Drag to seek
  const barRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const computeSeekFromEvent = useCallback((clientX: number) => {
    if (!barRef.current || !durationMs) return;
    const rect = barRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    onTimelineSeek?.(ratio * durationMs);
  }, [durationMs, onTimelineSeek]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    dragging.current = true;
    computeSeekFromEvent(e.clientX);
    e.preventDefault();
  }, [computeSeekFromEvent]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (dragging.current) computeSeekFromEvent(e.clientX);
    };
    const onUp = () => { dragging.current = false; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [computeSeekFromEvent]);

  // Auto-scroll to current group
  useEffect(() => {
    if (!scrollRef.current) return;
    const children = scrollRef.current.children;
    if (currentGroupIdx < children.length) {
      (children[currentGroupIdx] as HTMLElement)?.scrollIntoView({
        behavior: "smooth", block: "nearest", inline: "center",
      });
    }
  }, [currentGroupIdx]);

  // Tooltip handlers
  const handleGroupEnter = (gi: number, e: React.MouseEvent) => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
    hoverTimer.current = setTimeout(() => {
      setHoveredGroup(gi);
      setTooltipPos({ x: e.clientX, y: e.clientY });
    }, 200);
  };

  const handleGroupLeave = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    leaveTimer.current = setTimeout(() => {
      setHoveredGroup(null);
      setTooltipPos(null);
    }, 300);
  };

  if (scenes.length === 0) return null;

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs" style={{ color: "var(--muted)" }}>
          段 {currentIndex + 1} / {totalCount}
        </span>
        <span className="text-xs" style={{ color: "var(--muted)" }}>
          已生成 {generatedCount}/{totalCount}
        </span>
      </div>

      <div
        ref={scrollRef}
        onWheel={handleWheel}
        className="flex items-end gap-[2px] overflow-x-auto py-2 select-none"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none", height: 32 }}
      >
        {groups.map((groupScenes, gi) => {
          const st = groupStatus(groupScenes);
          const isCurrent = gi === currentGroupIdx;
          const barHeight = 6 + (groupScenes.length / groupSize) * 18;

          return (
            <button
              key={gi}
              ref={isCurrent ? (el) => {
                if (el) (el as HTMLElement).dataset.currentGroup = "true";
              } : undefined}
              onMouseEnter={(e) => handleGroupEnter(gi, e)}
              onMouseLeave={handleGroupLeave}
              onClick={() => onSceneClick(groupScenes[0].index)}
              className="flex-shrink-0 rounded-[2px] relative transition-all duration-200 hover:brightness-110"
              style={{
                width: Math.max(10, Math.min(22, 18 * (30 / groupSize))),
                height: `${barHeight}px`,
                backgroundColor: statusColor(st),
                opacity: statusOpacity(st),
                boxShadow: isCurrent ? `0 0 8px ${statusColor(st)}` : "none",
                border: st === "generating" ? "1px dashed var(--accent)" : "none",
              }}
              title={`段 ${groupScenes[0].index + 1}-${groupScenes[groupScenes.length - 1].index + 1}`}
            >
              {/* Current group label */}
              {isCurrent && (
                <span
                  className="absolute left-1/2 -translate-x-1/2 text-[9px] whitespace-nowrap rounded px-1.5 py-0.5 pointer-events-none"
                  style={{
                    top: -18,
                    backgroundColor: "var(--accent)",
                    color: "var(--bg)",
                  }}
                >
                  段{currentIndex + 1}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Drag bar */}
      {durationMs > 0 && (
        <div
          ref={barRef}
          onMouseDown={handleMouseDown}
          className="h-2 rounded cursor-pointer mt-1 relative"
          style={{ backgroundColor: "var(--glass-bg)" }}
        >
          <div
            className="absolute top-0 left-0 h-full rounded"
            style={{
              width: `${Math.min(100, (currentIndex / Math.max(1, scenes.length - 1)) * 100)}%`,
              backgroundColor: "var(--accent)",
              opacity: 0.2,
            }}
          />
        </div>
      )}

      {/* Tooltip popup */}
      {hoveredGroup !== null && tooltipPos && (
        <div
          className="fixed z-50 glass p-2 shadow-lg"
          style={{
            left: Math.min(tooltipPos.x, window.innerWidth - 220),
            top: tooltipPos.y + 12,
            maxWidth: 240,
          }}
          onMouseEnter={() => {
            if (leaveTimer.current) clearTimeout(leaveTimer.current);
          }}
          onMouseLeave={handleGroupLeave}
        >
          <div className="text-[10px] mb-1.5" style={{ color: "var(--muted)" }}>
            段 {groups[hoveredGroup][0].index + 1} — {groups[hoveredGroup][groups[hoveredGroup].length - 1].index + 1}
          </div>
          <div className="flex flex-wrap gap-[3px]">
            {groups[hoveredGroup].map((dot) => (
              <button
                key={dot.index}
                onClick={() => {
                  onSceneClick(dot.index);
                  setHoveredGroup(null);
                  setTooltipPos(null);
                }}
                className="w-2.5 h-2.5 rounded-full flex-shrink-0 cursor-pointer hover:scale-150 transition-transform"
                style={{
                  backgroundColor: statusColor(dot.status),
                  opacity: statusOpacity(dot.status),
                  boxShadow: dot.status === "current" ? `0 0 4px var(--accent)` : "none",
                }}
                title={`段 ${dot.index + 1}`}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
