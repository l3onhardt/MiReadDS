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

  // Check if a paragraph contains the current scene text
  const isParagraphActive = (paraText: string): boolean => {
    if (!currentSceneText || !isPlaying) return false;
    const pt = paraText.trim();
    const st = currentSceneText.trim();
    if (!pt || !st) return false;
    // Direct inclusion check
    if (pt.includes(st) || st.includes(pt)) return true;
    // Fuzzy: check first 30 chars
    if (st.length > 30 && pt.includes(st.slice(0, 30))) return true;
    return false;
  };

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
          const isCurrent = isParagraphActive(p);
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
