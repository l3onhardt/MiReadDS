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
  // Scene timeline props
  scenes?: SceneDot[];
  currentSceneIdx?: number;
  totalScenes?: number;
  generatedScenes?: number;
  onSceneClick?: (index: number) => void;
  onTimelineSeek?: (positionMs: number) => void;
  groupSize: number;
  onGroupSizeChange: (size: number) => void;
  progressRatio?: number;
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
  groupSize,
  onGroupSizeChange,
  progressRatio,
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
              {isGenerating && !isReady ? "准备中..." : formatDuration(currentTimeMs)}
            </span>
          </div>

          {/* Scene timeline replaces old progress bar */}
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
                onGroupSizeChange={onGroupSizeChange}
                progressRatio={progressRatio}
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
