"use client";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useState, useRef, useEffect } from "react";

interface ChapterInfo {
  id: number;
  index: number;
  title: string | null;
}

interface RightPanelProps {
  chapters: ChapterInfo[];
  currentChapterIdx: number;
  onChapterSelect: (idx: number) => void;
  paragraphs: string[];
  currentParaIdx: number;
  onParagraphSelect: (paraIdx: number) => void;
}

export function RightPanel({
  chapters,
  currentChapterIdx,
  onChapterSelect,
  paragraphs,
  currentParaIdx,
  onParagraphSelect,
}: RightPanelProps) {
  const [chaptersOpen, setChaptersOpen] = useState(true);
  const [paragraphsOpen, setParagraphsOpen] = useState(true);

  // Auto-scroll active paragraph row into view
  const activeRowRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (activeRowRef.current && paragraphsOpen) {
      activeRowRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [currentParaIdx, paragraphsOpen]);

  return (
    <div className="w-full">
      <div className="glass p-3 sticky top-20 space-y-3">
        {/* Chapter list */}
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
            <div className="max-h-[30vh] overflow-y-auto space-y-0.5">
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

        {/* Paragraph jump list */}
        <div>
          <button
            onClick={() => setParagraphsOpen(!paragraphsOpen)}
            className="flex items-center gap-1 w-full text-left mb-2"
          >
            {paragraphsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <span className="text-xs font-medium" style={{ color: "var(--muted)" }}>
              段落跳转
            </span>
            <span className="text-xs ml-auto" style={{ color: "var(--muted)" }}>
              {paragraphs.length}段
            </span>
          </button>
          {paragraphsOpen && (
            <div className="max-h-[40vh] overflow-y-auto space-y-0.5">
              {paragraphs.map((p, i) => {
                const isCurrent = i === currentParaIdx;
                const preview = p.length > 30 ? p.slice(0, 30) + "…" : p;
                return (
                  <button
                    key={i}
                    ref={isCurrent ? activeRowRef : undefined}
                    onClick={() => onParagraphSelect(i)}
                    className="block w-full text-left px-2 py-1.5 rounded text-xs transition-colors"
                    style={{
                      backgroundColor: isCurrent ? "var(--glass-bg)" : "transparent",
                      color: isCurrent ? "var(--accent)" : "var(--muted)",
                      fontWeight: isCurrent ? 600 : 400,
                    }}
                  >
                    <span className="inline-block w-7 opacity-60">{i + 1}.</span>
                    <span className="truncate inline-block max-w-[calc(100%-2rem)] align-middle">
                      {preview}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
