"use client";
import { useRef, useEffect } from "react";

interface ChapterInfo {
  id: number;
  index: number;
  title: string | null;
}

interface RightPanelProps {
  chapters: ChapterInfo[];
  currentChapterIdx: number;
  onChapterSelect: (idx: number) => void;
}

export function RightPanel({
  chapters,
  currentChapterIdx,
  onChapterSelect,
}: RightPanelProps) {
  // Auto-scroll active chapter row into view inside the chapter list
  const activeRowRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!activeRowRef.current) return;
    activeRowRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [currentChapterIdx]);

  return (
    <div className="w-full">
      <div className="glass p-3 sticky top-2 h-[calc(100vh-1rem)] flex flex-col gap-2 overflow-hidden">
        <div className="flex items-center gap-1 mb-1 flex-shrink-0">
          <span className="text-xs font-medium" style={{ color: "var(--muted)" }}>
            章节列表
          </span>
          <span className="text-xs ml-auto" style={{ color: "var(--muted)" }}>
            {chapters.length}章
          </span>
        </div>
        <div className="flex-1 overflow-y-auto space-y-0.5 min-h-0">
          {chapters.map((ch, i) => (
            <button
              key={ch.id}
              ref={i === currentChapterIdx ? activeRowRef : undefined}
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
      </div>
    </div>
  );
}
