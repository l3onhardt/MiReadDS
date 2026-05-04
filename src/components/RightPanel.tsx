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

  // Auto-scroll active rows into view inside their respective lists.
  // Use parent.scrollTop directly (not scrollIntoView) so the page window
  // doesn't get yanked along — sticky behavior must be preserved.
  const activeChapterRef = useRef<HTMLButtonElement>(null);
  const activeRowRef = useRef<HTMLButtonElement>(null);
  const scrollIntoContainerCenter = (el: HTMLElement | null) => {
    if (!el || !el.parentElement) return;
    const container = el.parentElement;
    const target = el.offsetTop - container.clientHeight / 2 + el.clientHeight / 2;
    container.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
  };
  useEffect(() => {
    scrollIntoContainerCenter(activeChapterRef.current);
  }, [currentChapterIdx]);
  useEffect(() => {
    if (currentParaIdx < 0) return;
    scrollIntoContainerCenter(activeRowRef.current);
  }, [currentParaIdx]);

  return (
    <div className="w-full">
      <div className="glass p-3 sticky top-2 max-h-[calc(100vh-1rem)] flex flex-col gap-2 overflow-hidden">
        {/* Chapter list — sized to content, capped at 60vh */}
        <div className="flex flex-col min-h-0">
          <button
            onClick={() => setChaptersOpen(!chaptersOpen)}
            className="flex items-center gap-1 w-full text-left mb-2 flex-shrink-0"
          >
            {chaptersOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <span className="text-xs font-medium" style={{ color: "var(--muted)" }}>
              章节列表
            </span>
            <span className="text-xs ml-auto" style={{ color: "var(--muted)" }}>
              {chapters.length}章
            </span>
          </button>
          {chaptersOpen && (
            <div className="overflow-y-auto space-y-0.5" style={{ maxHeight: "60vh" }}>
              {chapters.map((ch, i) => (
                <button
                  key={ch.id}
                  ref={i === currentChapterIdx ? activeChapterRef : undefined}
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

        <hr className="flex-shrink-0" style={{ borderColor: "var(--glass-border)" }} />

        {/* Paragraph jump list — sized to content, capped at 30vh */}
        <div className="flex flex-col min-h-0">
          <button
            onClick={() => setParagraphsOpen(!paragraphsOpen)}
            className="flex items-center gap-1 w-full text-left mb-2 flex-shrink-0"
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
            <div className="overflow-y-auto space-y-0.5" style={{ maxHeight: "30vh" }}>
              {paragraphs.map((p, i) => {
                const isCurrent = i === currentParaIdx;
                const preview = p.length > 30 ? p.slice(0, 30) + "…" : p;
                return (
                  <button
                    key={i}
                    ref={isCurrent ? activeRowRef : undefined}
                    onClick={() => onParagraphSelect(i)}
                    className="flex gap-1 w-full text-left px-2 py-1.5 rounded text-xs transition-colors"
                    style={{
                      backgroundColor: isCurrent ? "var(--glass-bg)" : "transparent",
                      color: isCurrent ? "var(--accent)" : "var(--muted)",
                      fontWeight: isCurrent ? 600 : 400,
                    }}
                  >
                    <span className="w-7 shrink-0 opacity-60">{i + 1}.</span>
                    <span className="truncate flex-1">{preview}</span>
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
