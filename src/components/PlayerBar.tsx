"use client";
import { Play, Pause, SkipBack, SkipForward } from "lucide-react";
import { formatDuration } from "@/lib/utils";

interface PlayerBarProps {
  chapterTitle: string;
  currentSegment: number;
  totalSegments: number;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onPrevSegment: () => void;
  onNextSegment: () => void;
  currentTime: number;
  duration: number;
  speakingCharacter: string | null;
  speed: number;
  onSpeedChange: (speed: number) => void;
}

export function PlayerBar({
  chapterTitle, currentSegment, totalSegments, isPlaying,
  onTogglePlay, onPrevSegment, onNextSegment,
  currentTime, duration, speakingCharacter, speed, onSpeedChange,
}: PlayerBarProps) {
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="glass p-3 md:p-4 mb-4 sticky top-2 z-10">
      <div className="flex items-center gap-3">
        <button
          onClick={onTogglePlay}
          className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ borderColor: "var(--accent)", borderWidth: 2, borderStyle: "solid", backgroundColor: "transparent" }}
        >
          {isPlaying ? <Pause size={16} style={{ color: "var(--accent)" }} /> : <Play size={16} style={{ color: "var(--accent)" }} />}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium truncate">{chapterTitle}</span>
            <span className="text-xs ml-2 flex-shrink-0" style={{ color: "var(--muted)" }}>
              {formatDuration(currentTime)} / {formatDuration(duration)}
            </span>
          </div>

          <div className="h-1 mt-1.5 rounded-full" style={{ backgroundColor: "var(--border)" }}>
            <div className="h-full rounded-full transition-all duration-300" style={{ width: `${progress}%`, backgroundColor: "var(--accent)" }} />
          </div>

          <div className="flex gap-0.5 mt-1.5">
            {Array.from({ length: Math.min(totalSegments, 60) }).map((_, i) => (
              <div key={i} className="flex-1 h-0.5 rounded-full"
                style={{ backgroundColor: i <= currentSegment ? "var(--accent)" : "var(--border)", opacity: i === currentSegment ? 1 : 0.4 }}
              />
            ))}
          </div>

          <div className="flex items-center gap-1.5 mt-1.5">
            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "var(--accent)" }} />
            <span className="text-xs" style={{ color: "var(--muted)" }}>
              {speakingCharacter ? `${speakingCharacter} 正在朗读` : "准备播放"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={onPrevSegment} className="p-1.5" style={{ color: "var(--muted)" }}>
            <SkipBack size={16} />
          </button>
          <button onClick={onNextSegment} className="p-1.5" style={{ color: "var(--muted)" }}>
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
