"use client";
import { Play, Pause, SkipBack, SkipForward, Loader2 } from "lucide-react";
import { formatDuration } from "@/lib/utils";

interface PlayerBarProps {
  chapterTitle: string;
  chapterIdx: number;
  totalChapters: number;
  isPlaying: boolean;
  audioStatus: string;
  genProgress: number;
  onTogglePlay: () => void;
  onPrevChapter: () => void;
  onNextChapter: () => void;
  currentTimeMs: number;
  durationMs: number;
  positionPercent: number;
  onSeek: (ms: number) => void;
  speed: number;
  onSpeedChange: (speed: number) => void;
}

export function PlayerBar({
  chapterTitle, chapterIdx, totalChapters, isPlaying, audioStatus, genProgress,
  onTogglePlay, onPrevChapter, onNextChapter,
  currentTimeMs, durationMs, positionPercent, onSeek,
  speed, onSpeedChange,
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
              {isGenerating ? "生成中..." : `${formatDuration(currentTimeMs)} / ${formatDuration(durationMs)}`}
            </span>
          </div>

          {/* Seekable progress bar */}
          <div className="relative h-1.5 mt-1.5 rounded-full cursor-pointer group"
            style={{ backgroundColor: "var(--border)" }}
            onClick={(e) => {
              if (!isReady || durationMs <= 0) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
              onSeek(pct * durationMs);
            }}
          >
            <div className="absolute inset-0 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-200"
                style={{ width: `${isReady ? positionPercent * 100 : 0}%`, backgroundColor: "var(--accent)" }}
              />
            </div>
          </div>

          <div className="flex items-center justify-between mt-1">
            <span className="text-xs" style={{ color: "var(--muted)" }}>
              第{chapterIdx + 1}/{totalChapters}章
            </span>
            {isGenerating && (
              <span className="text-xs" style={{ color: "var(--accent)" }}>
                生成中 {genProgress}%...
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
