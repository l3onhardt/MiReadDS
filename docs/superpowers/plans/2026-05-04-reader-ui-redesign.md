# Reader UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the reader page with grouped timeline bars, combined paragraph highlight, drag-to-seek, two-column layout, and removal of character panel.

**Architecture:** Rewrite SceneTimeline and ReadingContent with new visual/interaction patterns, add a new RightPanel component, delete CharacterPanel, and update the page layout from single-column to two-column. All state management stays in page.tsx. Zero API or DB changes.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS, CSS custom properties (no new dependencies)

---

### Task 1: Remove CharacterPanel

**Files:**
- Delete: `src/components/CharacterPanel.tsx`
- Modify: `src/app/read/[bookId]/page.tsx`

- [ ] **Step 1: Delete CharacterPanel file**

```bash
rm src/components/CharacterPanel.tsx
```

- [ ] **Step 2: Remove CharacterPanel from page.tsx**

Remove the import line (line 7):
```tsx
import { CharacterPanel } from "@/components/CharacterPanel";
```

Remove the `characterSheetOpen` state (line 44):
```tsx
const [characterSheetOpen, setCharacterSheetOpen] = useState(false);
```

Remove the `<CharacterPanel .../>` JSX block (lines 427-431):
```tsx
<CharacterPanel
  characters={(book.characters || []).map((c: any) => ({ id: c.id, name: c.name, voice_name: c.voice_name, role_type: c.role_type || "supporting" }))}
  activeCharacterName={manifest?.scenes?.[currentSceneIdx]?.speaker || null}
  isOpen={characterSheetOpen} onToggle={() => setCharacterSheetOpen(!characterSheetOpen)}
/>
```

- [ ] **Step 3: Verify build**

```bash
cd /Users/piggy/MiReadDS && npx next build 2>&1 | tail -5
```
Expected: successful build, no errors about CharacterPanel.

- [ ] **Step 4: Commit**

```bash
git add src/components/CharacterPanel.tsx src/app/read/\[bookId\]/page.tsx
git commit -m "refactor: remove CharacterPanel component, unused in new layout"
```

---

### Task 2: Create RightPanel component

**Files:**
- Create: `src/components/RightPanel.tsx`

- [ ] **Step 1: Write RightPanel component**

```tsx
"use client";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import type { SceneDot } from "./SceneTimeline";

interface ChapterInfo {
  id: number;
  index: number;
  title: string | null;
}

interface RightPanelProps {
  chapters: ChapterInfo[];
  currentChapterIdx: number;
  onChapterSelect: (idx: number) => void;
  scenes: SceneDot[];
  currentSceneIdx: number;
  onSceneClick: (index: number) => void;
  groupSize: number;
}

export function RightPanel({
  chapters,
  currentChapterIdx,
  onChapterSelect,
  scenes,
  currentSceneIdx,
  onSceneClick,
  groupSize,
}: RightPanelProps) {
  const [chaptersOpen, setChaptersOpen] = useState(true);
  const [scenesOpen, setScenesOpen] = useState(true);

  const currentGroupIdx = Math.floor(currentSceneIdx / groupSize);
  const totalGroups = Math.ceil(scenes.length / groupSize);

  const sceneGroups = Array.from({ length: totalGroups }, (_, gi) => {
    const start = gi * groupSize;
    const end = Math.min(start + groupSize, scenes.length);
    const groupScenes = scenes.slice(start, end);
    return { index: gi, start, end, scenes: groupScenes };
  });

  return (
    <div className="hidden lg:block w-full">
      <div className="glass p-3 sticky top-20 space-y-3">
        {/* Chapter list section */}
        <div>
          <button
            onClick={() => setChaptersOpen(!chaptersOpen)}
            className="flex items-center gap-1 w-full text-left mb-2"
          >
            {chaptersOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <span className="text-xs font-medium" style={{ color: "var(--muted)" }}>
              章节列表
            </span>
          </button>
          {chaptersOpen && (
            <div className="max-h-48 overflow-y-auto space-y-0.5">
              {chapters.map((ch, i) => (
                <button
                  key={ch.id}
                  onClick={() => onChapterSelect(i)}
                  className="block w-full text-left px-2 py-1.5 rounded text-xs truncate transition-colors"
                  style={{
                    backgroundColor: i === currentChapterIdx ? "var(--glass-bg)" : "transparent",
                    color: i === currentChapterIdx ? "var(--accent)" : "var(--muted)",
                    fontWeight: i === currentChapterIdx ? 600 : 400,
                  }}
                >
                  {ch.title || `第${i + 1}章`}
                </button>
              ))}
            </div>
          )}
        </div>

        <hr style={{ borderColor: "var(--glass-border)" }} />

        {/* Scene group navigation */}
        <div>
          <button
            onClick={() => setScenesOpen(!scenesOpen)}
            className="flex items-center gap-1 w-full text-left mb-2"
          >
            {scenesOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <span className="text-xs font-medium" style={{ color: "var(--muted)" }}>
              段落导航
            </span>
            <span className="text-xs ml-auto" style={{ color: "var(--muted)" }}>
              {scenes.length}段
            </span>
          </button>
          {scenesOpen && (
            <div className="max-h-64 overflow-y-auto space-y-0.5">
              {sceneGroups.map(({ index: gi, start, end }) => (
                <button
                  key={gi}
                  onClick={() => onSceneClick(start)}
                  className="block w-full text-left px-2 py-1.5 rounded text-xs transition-colors"
                  style={{
                    backgroundColor: gi === currentGroupIdx ? "var(--glass-bg)" : "transparent",
                    color: gi === currentGroupIdx ? "var(--accent)" : "var(--muted)",
                    fontWeight: gi === currentGroupIdx ? 600 : 400,
                  }}
                >
                  段 {start + 1}-{end}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
cd /Users/piggy/MiReadDS && npx next build 2>&1 | tail -5
```
Expected: successful build (RightPanel unused, no error).

- [ ] **Step 3: Commit**

```bash
git add src/components/RightPanel.tsx
git commit -m "feat: add RightPanel with chapter list and scene group navigation"
```

---

### Task 3: Rewrite SceneTimeline — grouped bars + tooltip + zoom + drag

**Files:**
- Modify: `src/components/SceneTimeline.tsx` (full rewrite)

- [ ] **Step 1: Write the new SceneTimeline**

```tsx
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
  const hoverTimer = useRef<ReturnType<typeof setTimeout>>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout>>(null);

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
    const idx = GROUP_SIZES.indexOf(groupSize);
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
```

- [ ] **Step 2: Verify build**

```bash
cd /Users/piggy/MiReadDS && npx next build 2>&1 | tail -5
```
Expected: successful build (new SceneTimeline compiles).

- [ ] **Step 3: Commit**

```bash
git add src/components/SceneTimeline.tsx
git commit -m "feat: rewrite SceneTimeline with grouped bars, hover tooltip, wheel zoom, and drag seek"
```

---

### Task 4: Rewrite ReadingContent — combined highlight + drag-to-seek

**Files:**
- Modify: `src/components/ReadingContent.tsx` (full rewrite)

- [ ] **Step 1: Write the new ReadingContent**

```tsx
"use client";
import { useRef, useEffect, useState, useCallback } from "react";
import { Loader2 } from "lucide-react";

interface ReadingContentProps {
  content: string;
  currentSceneText: string | null;
  isPlaying: boolean;
  audioStatus: string;
  currentTimeMs?: number;
  durationMs?: number;
  onTextSeek?: (positionMs: number) => void;
}

const DRAG_THRESHOLD_PX = 5; // min px to distinguish drag from click
const SEEK_STEP_PX = 50;     // trigger seek every 50px of drag

export function ReadingContent({
  content,
  currentSceneText,
  isPlaying,
  audioStatus,
  currentTimeMs = 0,
  durationMs = 0,
  onTextSeek,
}: ReadingContentProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLParagraphElement>(null);
  const [dragIndicator, setDragIndicator] = useState<{
    text: string;
    x: number;
    y: number;
  } | null>(null);

  const dragState = useRef({
    active: false,
    startX: 0,
    startY: 0,
    lastSeekX: 0,
    lastSeekTime: 0,
  });

  // Auto-scroll to active paragraph
  useEffect(() => {
    if (activeRef.current && isPlaying) {
      activeRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [currentSceneText, isPlaying]);

  const isGenerating = audioStatus === "generating" || audioStatus === "pending";

  // Drag handlers
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    dragState.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      lastSeekX: e.clientX,
      lastSeekTime: Date.now(),
    };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragState.current.active || !durationMs) return;
    const deltaX = e.clientX - dragState.current.startX;
    if (Math.abs(deltaX) < DRAG_THRESHOLD_PX) return;

    // Compute seek
    const containerWidth = containerRef.current?.offsetWidth || 400;
    const speedFactor = Math.abs(e.movementX) > 10 ? 2 : 1;
    const offsetMs = (deltaX / containerWidth) * durationMs * speedFactor;
    const newPos = Math.max(0, Math.min(durationMs, currentTimeMs + offsetMs));
    const diffMs = newPos - currentTimeMs;

    // Update indicator
    const direction = diffMs > 0 ? "快进" : "快退";
    const absSec = Math.abs(Math.round(diffMs / 1000));
    setDragIndicator({
      text: diffMs > 0 ? `▸▸ ${direction} +${absSec}s` : `◂◂ ${direction} -${absSec}s`,
      x: e.clientX,
      y: e.clientY - 40,
    });

    // Throttled seek
    const pxSinceLast = Math.abs(e.clientX - dragState.current.lastSeekX);
    const msSinceLast = Date.now() - dragState.current.lastSeekTime;
    if (pxSinceLast >= SEEK_STEP_PX && msSinceLast >= 100) {
      dragState.current.lastSeekX = e.clientX;
      dragState.current.lastSeekTime = Date.now();
      onTextSeek?.(newPos);
    }
  }, [durationMs, currentTimeMs, onTextSeek]);

  const handlePointerUp = useCallback(() => {
    dragState.current.active = false;
    setDragIndicator(null);
  }, []);

  if (!content) {
    return (
      <div className="glass p-8 text-center" style={{ color: "var(--muted)" }}>
        {isGenerating ? "正在准备章节音频..." : "暂无内容"}
      </div>
    );
  }

  const paragraphs = content.split(/\n+/).filter((p) => p.trim().length > 0);

  // Find which paragraph contains the current scene text, by character offset
  const activeParagraphIndex = ((): number => {
    if (!currentSceneText || !isPlaying) return -1;
    const pos = content.indexOf(currentSceneText.trim());
    if (pos === -1) return -1;
    let paraIdx = 0;
    let cursor = 0;
    for (const p of paragraphs) {
      const idx = content.indexOf(p, cursor);
      if (idx === -1) { cursor += p.length; paraIdx++; continue; }
      if (pos >= idx && pos < idx + p.length) return paraIdx;
      cursor = idx + p.length;
      paraIdx++;
    }
    return -1;
  })();

  return (
    <div
      className="glass p-5 md:p-8 relative select-none"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={{ touchAction: "none", cursor: dragState.current.active ? "grabbing" : "default" }}
    >
      {isGenerating && (
        <div className="absolute top-3 right-3 flex items-center gap-2 text-xs" style={{ color: "var(--accent)" }}>
          <Loader2 size={14} className="animate-spin" />
          生成音频中...
        </div>
      )}

      <div ref={containerRef} className="leading-relaxed md:leading-loose space-y-3 text-[17px] max-h-[60vh] overflow-y-auto pr-2">
        {paragraphs.map((p, i) => {
          const isCurrent = i === activeParagraphIndex;
          return (
            <p
              key={i}
              ref={isCurrent ? activeRef : undefined}
              className="transition-all duration-500 px-3 py-1.5 rounded-lg"
              style={{
                backgroundColor: isCurrent ? "var(--glass-bg)" : "transparent",
                borderLeft: isCurrent ? "4px solid var(--accent)" : "4px solid transparent",
                boxShadow: isCurrent ? "0 2px 12px var(--glass-border)" : "none",
                transform: isCurrent ? "scale(1.01)" : "scale(1)",
                opacity: isPlaying ? (isCurrent ? 1 : 0.5) : 1,
                fontWeight: isCurrent ? 500 : 400,
                animation: isCurrent && isPlaying ? "breathe 2s ease-in-out infinite" : "none",
              }}
            >
              {p}
            </p>
          );
        })}
      </div>

      {/* Drag indicator */}
      {dragIndicator && (
        <div
          className="fixed z-50 pointer-events-none px-2 py-1 rounded text-xs font-medium shadow"
          style={{
            left: dragIndicator.x,
            top: dragIndicator.y,
            transform: "translateX(-50%)",
            backgroundColor: "var(--accent)",
            color: "var(--bg)",
            whiteSpace: "nowrap",
          }}
        >
          {dragIndicator.text}
        </div>
      )}

      <div className="text-center pt-3 mt-3 border-t" style={{ borderColor: "var(--glass-border)" }}>
        <span className="text-xs" style={{ color: "var(--muted)" }}>
          {durationMs > 0 ? "← 拖动正文快进/快退 →" : ""}
        </span>
      </div>

      {/* Breathe keyframes */}
      <style jsx>{`
        @keyframes breathe {
          0%, 100% { background-color: transparent; }
          50% { background-color: var(--glass-bg); }
        }
      `}</style>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
cd /Users/piggy/MiReadDS && npx next build 2>&1 | tail -5
```
Expected: successful build.

- [ ] **Step 3: Commit**

```bash
git add src/components/ReadingContent.tsx
git commit -m "feat: rewrite ReadingContent with combined highlight, breathe animation, and drag-to-seek"
```

---

### Task 5: Update PlayerBar — new SceneTimeline interface

**Files:**
- Modify: `src/components/PlayerBar.tsx`

- [ ] **Step 1: Update PlayerBar props and SceneTimeline usage**

Replace the file content:

```tsx
"use client";
import { Play, Pause, SkipBack, SkipForward, Loader2 } from "lucide-react";
import { formatDuration } from "@/lib/utils";
import { SceneTimeline, SceneDot } from "./SceneTimeline";

interface PlayerBarProps {
  chapterTitle: string;
  chapterIdx: number;
  totalChapters: number;
  isPlaying: boolean;
  audioStatus: string;
  onTogglePlay: () => void;
  onPrevChapter: () => void;
  onNextChapter: () => void;
  currentTimeMs: number;
  durationMs: number;
  speed: number;
  onSpeedChange: (speed: number) => void;
  scenes?: SceneDot[];
  currentSceneIdx?: number;
  totalScenes?: number;
  generatedScenes?: number;
  onSceneClick?: (index: number) => void;
  onTimelineSeek?: (positionMs: number) => void;
  groupSize?: number;
  onGroupSizeChange?: (size: number) => void;
}

export function PlayerBar({
  chapterTitle, chapterIdx, totalChapters, isPlaying, audioStatus,
  onTogglePlay, onPrevChapter, onNextChapter,
  currentTimeMs, durationMs,
  speed, onSpeedChange,
  scenes = [],
  currentSceneIdx = 0,
  totalScenes = 0,
  generatedScenes = 0,
  onSceneClick,
  onTimelineSeek,
  groupSize = 30,
  onGroupSizeChange,
}: PlayerBarProps) {
  const isReady = audioStatus === "ready";
  const isGenerating = audioStatus === "generating" || audioStatus === "pending";

  return (
    <div className="glass p-3 md:p-4 mb-4 sticky top-2 z-10">
      <div className="flex items-center gap-3">
        <button
          onClick={onTogglePlay}
          disabled={isGenerating}
          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 disabled:opacity-40"
          style={{ borderColor: isReady ? "var(--accent)" : "var(--muted)", borderWidth: 2, borderStyle: "solid", backgroundColor: "transparent" }}
        >
          {isGenerating ? (
            <Loader2 size={18} className="animate-spin" style={{ color: "var(--muted)" }} />
          ) : isPlaying ? (
            <Pause size={18} style={{ color: "var(--accent)" }} />
          ) : (
            <Play size={18} style={{ color: "var(--accent)" }} />
          )}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium truncate">
              {chapterTitle}
            </span>
            <span className="text-xs ml-2 flex-shrink-0" style={{ color: "var(--muted)" }}>
              {isGenerating && !isReady ? "准备中..." : `${formatDuration(currentTimeMs)} / ${formatDuration(durationMs)}`}
            </span>
          </div>

          {scenes.length > 0 && (
            <div className="mt-1.5">
              <SceneTimeline
                scenes={scenes}
                currentIndex={currentSceneIdx}
                totalCount={totalScenes || scenes.length}
                generatedCount={generatedScenes || 0}
                onSceneClick={onSceneClick || (() => {})}
                durationMs={durationMs}
                onTimelineSeek={onTimelineSeek}
                groupSize={groupSize}
                onGroupSizeChange={onGroupSizeChange || (() => {})}
              />
            </div>
          )}

          <div className="flex items-center justify-between mt-1">
            <span className="text-xs" style={{ color: "var(--muted)" }}>
              第{chapterIdx + 1}/{totalChapters}章
            </span>
            {isGenerating && (
              <span className="text-xs" style={{ color: "var(--accent)" }}>
                生成中...
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={onPrevChapter} className="p-1.5" style={{ color: "var(--muted)" }}>
            <SkipBack size={16} />
          </button>
          <button onClick={onNextChapter} className="p-1.5" style={{ color: "var(--muted)" }}>
            <SkipForward size={16} />
          </button>
        </div>

        <select value={speed} onChange={(e) => onSpeedChange(Number(e.target.value))}
          className="text-xs px-1.5 py-0.5 rounded flex-shrink-0 ml-1"
          style={{ backgroundColor: "var(--glass-bg)", color: "var(--muted)", borderColor: "var(--border)" }}
        >
          <option value={0.75}>0.75x</option>
          <option value={1}>1x</option>
          <option value={1.25}>1.25x</option>
          <option value={1.5}>1.5x</option>
          <option value={2}>2x</option>
        </select>
      </div>
    </div>
  );
}
```

The changes from the old version:
1. Add `onTimelineSeek?: (positionMs: number) => void` to props interface
2. Add `onTimelineSeek` to destructured props
3. Pass `durationMs` and `onTimelineSeek` to `<SceneTimeline>`
4. Change time display from `formatDuration(currentTimeMs)` to `${formatDuration(currentTimeMs)} / ${formatDuration(durationMs)}`

- [ ] **Step 2: Verify build**

```bash
cd /Users/piggy/MiReadDS && npx next build 2>&1 | tail -5
```
Expected: successful build.

- [ ] **Step 3: Commit**

```bash
git add src/components/PlayerBar.tsx
git commit -m "feat: update PlayerBar for new SceneTimeline interface, dual time display"
```

---

### Task 6: Update page.tsx — layout, state, and callbacks

**Files:**
- Modify: `src/app/read/[bookId]/page.tsx`

- [ ] **Step 1: Add import for RightPanel, add groupSize state, add handleTimelineSeek callback**

Add import:
```tsx
import { RightPanel } from "@/components/RightPanel";
```

Add groupSize state (after existing states, around line 47):
```tsx
const [groupSize, setGroupSize] = useState(() => {
  try {
    const v = parseInt(localStorage.getItem("timeline-group-size") || "30", 10);
    return [15, 30, 60].includes(v) ? v : 30;
  } catch {
    return 30;
  }
});
```

Add groupSize change handler (next to groupSize state):
```tsx
const handleGroupSizeChange = useCallback((size: number) => {
  setGroupSize(size);
  try { localStorage.setItem("timeline-group-size", String(size)); } catch {}
}, []);
```

Add handleTimelineSeek callback (after handleSeek, around line 320):
```tsx
const handleTimelineSeek = useCallback((ms: number) => {
  handleSeek(ms);
}, [handleSeek]);
```

- [ ] **Step 2: Replace the JSX return block**

Replace the entire return statement (lines 358-441) with the new two-column layout:

```tsx
return (
  <div className="flex gap-4">
    {/* LEFT: Main content 70% */}
    <div className="flex-[7] min-w-0">
      <div className="flex items-center gap-3 mb-4">
        <Link href="/" className="flex-shrink-0" style={{ color: "var(--muted)" }}><ArrowLeft size={20} /></Link>
        <div className="min-w-0 flex-1"><h1 className="text-lg font-semibold truncate">{book.title}</h1></div>
        <button onClick={() => setChapterListOpen(!chapterListOpen)}
          className="flex-shrink-0 p-1.5 rounded-lg lg:hidden" style={{ color: "var(--muted)" }}>
          <List size={20} />
        </button>
      </div>

      {chapterListOpen && (
        <div className="glass p-3 mb-4 max-h-64 overflow-y-auto rounded-xl lg:hidden">
          {(book.chapters || []).map((ch: ChapterInfo, i: number) => (
            <button key={ch.id}
              onClick={() => { goToChapter(i); setChapterListOpen(false); }}
              className="block w-full text-left px-3 py-2 rounded-lg text-sm transition-colors"
              style={{
                backgroundColor: i === currentChapterIdx ? "var(--glass-bg)" : "transparent",
                color: i === currentChapterIdx ? "var(--accent)" : "var(--text)",
              }}
            >
              {ch.title || `第${i + 1}章`}
            </button>
          ))}
        </div>
      )}

      <PlayerBar
        chapterTitle={currentChapter?.title || `第${currentChapterIdx + 1}章`}
        chapterIdx={currentChapterIdx}
        totalChapters={chapterCount}
        isPlaying={isPlaying}
        audioStatus={audioStatus}
        onTogglePlay={togglePlay}
        onPrevChapter={() => currentChapterIdx > 0 && goToChapter(currentChapterIdx - 1)}
        onNextChapter={() => currentChapterIdx < chapterCount - 1 && goToChapter(currentChapterIdx + 1)}
        currentTimeMs={totalTimeMs}
        durationMs={totalDurationMs}
        speed={speed}
        onSpeedChange={setSpeed}
        scenes={sceneDots}
        currentSceneIdx={currentSceneIdx}
        totalScenes={totalScenes}
        generatedScenes={generatedScenes}
        onSceneClick={handleSceneClick}
        onTimelineSeek={handleTimelineSeek}
        groupSize={groupSize}
        onGroupSizeChange={handleGroupSizeChange}
      />

      <ReadingContent
        content={currentChapter?.content || ""}
        currentSceneText={currentSceneText}
        isPlaying={isPlaying}
        audioStatus={audioStatus}
        currentTimeMs={totalTimeMs}
        durationMs={totalDurationMs}
        onTextSeek={handleTimelineSeek}
      />

      <div className="flex justify-between mt-4">
        <button onClick={() => goToChapter(Math.max(0, currentChapterIdx - 1))} disabled={currentChapterIdx === 0}
          className="text-sm px-3 py-1.5 rounded-lg disabled:opacity-30" style={{ color: "var(--muted)" }}>
          上一章
        </button>
        <span className="text-sm" style={{ color: "var(--muted)" }}>{currentChapterIdx + 1} / {chapterCount}</span>
        <button onClick={() => goToChapter(Math.min(chapterCount - 1, currentChapterIdx + 1))} disabled={currentChapterIdx === chapterCount - 1}
          className="text-sm px-3 py-1.5 rounded-lg disabled:opacity-30" style={{ color: "var(--accent)" }}>
          下一章
        </button>
      </div>
    </div>

    {/* RIGHT: Collapsible panel 30% */}
    <RightPanel
      chapters={(book.chapters || []).map((ch: ChapterInfo) => ({ id: ch.id, index: ch.index, title: ch.title }))}
      currentChapterIdx={currentChapterIdx}
      onChapterSelect={goToChapter}
      scenes={sceneDots}
      currentSceneIdx={currentSceneIdx}
      onSceneClick={handleSceneClick}
      groupSize={groupSize}
    />

    <audio ref={audioRef}
      onEnded={advance}
      onTimeUpdate={handleTimeUpdate}
      className="hidden"
    />
    <audio ref={preloadAudioRef} className="hidden" />
  </div>
);
```

- [ ] **Step 3: Verify build**

```bash
cd /Users/piggy/MiReadDS && npx next build 2>&1 | tail -5
```
Expected: successful build, no type errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/read/\[bookId\]/page.tsx
git commit -m "feat: two-column reader layout with RightPanel, drag-to-seek, and timeline seek callbacks"
```

---

### Task 7: Update layout container width

**Files:**
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Change max-w-4xl to max-w-6xl**

In `src/app/layout.tsx` line 35, change:
```tsx
<main className="mx-auto max-w-4xl px-4 py-6 md:px-6 md:py-8">
```
to:
```tsx
<main className="mx-auto max-w-6xl px-4 py-6 md:px-6 md:py-8">
```

- [ ] **Step 2: Verify build**

```bash
cd /Users/piggy/MiReadDS && npx next build 2>&1 | tail -5
```
Expected: successful build.

- [ ] **Step 3: Commit**

```bash
git add src/app/layout.tsx
git commit -m "feat: widen layout container from max-w-4xl to max-w-6xl for two-column reader"
```

---

### Task 8: Final integration verification

- [ ] **Step 1: Clean build**

```bash
cd /Users/piggy/MiReadDS && rm -rf .next && npx next build 2>&1 | tail -5
```
Expected: successful production build with no warnings.

- [ ] **Step 2: Verify no remaining CharacterPanel references**

```bash
cd /Users/piggy/MiReadDS && grep -r "CharacterPanel" src/ 2>/dev/null || echo "No references found — OK"
```
Expected: `No references found — OK`.

- [ ] **Step 3: Verify all new imports resolve**

```bash
cd /Users/piggy/MiReadDS && npx tsc --noEmit 2>&1 | head -20
```
Expected: no type errors.

- [ ] **Step 4: Commit final verification**

```bash
git add -A
git commit -m "chore: final verification — clean build, no stale references"
```
(Only if there are staged changes from fixes during verification.)
