"use client";
import { useRef, useEffect } from "react";
import { Loader2, Play } from "lucide-react";

interface ReadingContentProps {
  paragraphs: string[];
  currentParaIdx: number;
  isPlaying: boolean;
  audioStatus: string;
  onParagraphSeek: (paraIdx: number) => void;
}

export function ReadingContent({
  paragraphs,
  currentParaIdx,
  isPlaying,
  audioStatus,
  onParagraphSeek,
}: ReadingContentProps) {
  const activeRef = useRef<HTMLDivElement>(null);

  // Auto-scroll page so the active paragraph stays in view.
  // Triggers on currentParaIdx change (was currentSceneText) — O(1) and stable.
  useEffect(() => {
    if (activeRef.current && isPlaying) {
      activeRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [currentParaIdx, isPlaying]);

  const isGenerating = audioStatus === "generating" || audioStatus === "pending";

  if (paragraphs.length === 0) {
    return (
      <div className="glass p-8 text-center" style={{ color: "var(--muted)" }}>
        {isGenerating ? "正在准备章节音频..." : "暂无内容"}
      </div>
    );
  }

  return (
    <div className="glass p-5 md:p-8 relative">
      {isGenerating && (
        <div className="absolute top-3 right-3 flex items-center gap-2 text-xs" style={{ color: "var(--accent)" }}>
          <Loader2 size={14} className="animate-spin" />
          生成音频中...
        </div>
      )}

      <div className="leading-relaxed md:leading-loose space-y-3 text-[17px]">
        {paragraphs.map((p, i) => {
          const isCurrent = i === currentParaIdx;
          return (
            <div
              key={i}
              ref={isCurrent ? activeRef : undefined}
              className="flex gap-2 group"
            >
              {/* Left gutter — clickable, shows ▶ on hover/focus */}
              <button
                type="button"
                onClick={() => onParagraphSeek(i)}
                aria-label={`从段 ${i + 1} 开始播放`}
                className="flex-shrink-0 w-5 flex items-start justify-center pt-1.5 cursor-pointer transition-colors"
                style={{
                  touchAction: "manipulation",
                }}
              >
                {isCurrent ? (
                  <span
                    className="block w-1 rounded-full"
                    style={{
                      backgroundColor: "var(--accent)",
                      height: "1.4em",
                      animation: isPlaying ? "rc-breathe 2s ease-in-out infinite" : "none",
                    }}
                  />
                ) : (
                  <>
                    <span
                      className="block w-px group-hover:hidden"
                      style={{
                        backgroundColor: "var(--border)",
                        height: "1.2em",
                      }}
                    />
                    <Play
                      size={12}
                      className="hidden group-hover:block"
                      style={{ color: "var(--accent)", marginTop: 2 }}
                    />
                  </>
                )}
              </button>

              {/* Paragraph text — no gestures, fully native interaction */}
              <p
                className="flex-1 transition-all duration-300 px-1.5 py-1 rounded-lg"
                style={{
                  backgroundColor: isCurrent ? "var(--glass-bg)" : "transparent",
                  boxShadow: isCurrent ? "0 2px 12px var(--glass-border)" : "none",
                  opacity: isPlaying ? (isCurrent ? 1 : 0.5) : 1,
                  fontWeight: isCurrent ? 500 : 400,
                  animation: isCurrent && isPlaying ? "rc-breathe 2s ease-in-out infinite" : "none",
                }}
              >
                {p}
              </p>
            </div>
          );
        })}
      </div>

      {/* Breathe keyframes (kept) */}
      <style>{`
        @keyframes rc-breathe {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.75; }
        }
      `}</style>
    </div>
  );
}
