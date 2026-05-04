"use client";
import { useRef, useEffect } from "react";
import { Loader2 } from "lucide-react";

interface ReadingContentProps {
  content: string;
  currentSceneText: string | null;
  isPlaying: boolean;
  audioStatus: string;
}

export function ReadingContent({ content, currentSceneText, isPlaying, audioStatus }: ReadingContentProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLParagraphElement>(null);

  // Auto-scroll to active paragraph
  useEffect(() => {
    if (activeRef.current && isPlaying) {
      activeRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [currentSceneText, isPlaying]);

  const isGenerating = audioStatus === "generating" || audioStatus === "pending";

  if (!content) {
    return (
      <div className="glass p-8 text-center" style={{ color: "var(--muted)" }}>
        {isGenerating ? "正在准备章节音频..." : "暂无内容"}
      </div>
    );
  }

  const paragraphs = content.split(/\n+/).filter((p) => p.trim().length > 0);

  // Find which paragraph contains the current scene text, by character offset.
  // Uses exact position matching to avoid confusing duplicate/similar text.
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
    <div className="glass p-5 md:p-8 relative">
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
              className={`transition-all duration-500 px-2 py-0.5 rounded ${isCurrent ? "ring-1" : ""}`}
              style={{
                backgroundColor: isCurrent ? "var(--glass-bg)" : "transparent",
                borderColor: isCurrent ? "var(--accent)" : "transparent",
                opacity: isPlaying ? (isCurrent ? 1 : 0.45) : 1,
                fontWeight: isCurrent ? 500 : 400,
              }}
            >
              {p}
            </p>
          );
        })}
      </div>
    </div>
  );
}
