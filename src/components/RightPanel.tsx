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
    <div className="w-full">
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
