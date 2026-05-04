"use client";
import { useRef, useEffect, useState } from "react";
import { Loader2, Play } from "lucide-react";

interface ReadingContentProps {
  paragraphs: string[];
  currentParaIdx: number;
  isPlaying: boolean;
  audioStatus: string;
  onParagraphSeek: (paraIdx: number) => void;
}

// User scrolls manually -> pause auto-follow for this long, then resume.
const RESUME_DELAY_MS = 30_000;
// scrollIntoView({ behavior: "smooth" }) fires its own scroll events; ignore
// them by checking elapsed time since the last auto-scroll we triggered.
const PROGRAMMATIC_SCROLL_GRACE_MS = 1500;

export function ReadingContent({
  paragraphs,
  currentParaIdx,
  isPlaying,
  audioStatus,
  onParagraphSeek,
}: ReadingContentProps) {
  const activeRef = useRef<HTMLDivElement>(null);
  const lastAutoScrollAt = useRef(0);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [userInterrupted, setUserInterrupted] = useState(false);

  // Detect user-initiated scroll vs our programmatic scrollIntoView animation.
  useEffect(() => {
    const onScroll = () => {
      if (Date.now() - lastAutoScrollAt.current < PROGRAMMATIC_SCROLL_GRACE_MS) return;
      setUserInterrupted(true);
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
      resumeTimerRef.current = setTimeout(() => {
        setUserInterrupted(false);
      }, RESUME_DELAY_MS);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    };
  }, []);

  // Auto-scroll active paragraph into view.
  // Skipped while userInterrupted; when interrupt expires this effect re-runs
  // (deps include userInterrupted) and scrolls back to the current paragraph.
  useEffect(() => {
    if (currentParaIdx < 0 || !activeRef.current || userInterrupted) return;
    lastAutoScrollAt.current = Date.now();
    activeRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [currentParaIdx, userInterrupted]);

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
    </div>
  );
}
