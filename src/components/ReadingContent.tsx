"use client";
import { useRef, useEffect, useState, useCallback } from "react";
import { Loader2 } from "lucide-react";

interface ReadingContentProps {
  content: string;
  currentSceneText: string | null;
  isPlaying: boolean;
  audioStatus: string;
  currentTimeMs?: number;
  durationMs?: number;
  onTextSeek?: (positionMs: number) => void;
}

const DRAG_THRESHOLD_PX = 5;
const SEEK_STEP_PX = 50;

export function ReadingContent({
  content,
  currentSceneText,
  isPlaying,
  audioStatus,
  currentTimeMs = 0,
  durationMs = 0,
  onTextSeek,
}: ReadingContentProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLParagraphElement>(null);
  const [dragIndicator, setDragIndicator] = useState<{
    text: string;
    x: number;
    y: number;
  } | null>(null);

  const dragState = useRef({
    active: false,
    startX: 0,
    lastSeekX: 0,
    lastSeekTime: 0,
  });

  // Auto-scroll to active paragraph
  useEffect(() => {
    if (activeRef.current && isPlaying) {
      activeRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [currentSceneText, isPlaying]);

  const isGenerating = audioStatus === "generating" || audioStatus === "pending";

  // Drag handlers
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    dragState.current = {
      active: true,
      startX: e.clientX,
      lastSeekX: e.clientX,
      lastSeekTime: Date.now(),
    };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragState.current.active || !durationMs) return;
    const deltaX = e.clientX - dragState.current.startX;
    if (Math.abs(deltaX) < DRAG_THRESHOLD_PX) return;

    const containerWidth = containerRef.current?.offsetWidth || 400;
    const speedFactor = Math.abs(e.movementX) > 10 ? 2 : 1;
    const offsetMs = (deltaX / containerWidth) * durationMs * speedFactor;
    const newPos = Math.max(0, Math.min(durationMs, currentTimeMs + offsetMs));
    const diffMs = newPos - currentTimeMs;

    const direction = diffMs > 0 ? "快进" : "快退";
    const absSec = Math.abs(Math.round(diffMs / 1000));
    setDragIndicator({
      text: diffMs > 0 ? `▸▸ ${direction} +${absSec}s` : `◂◂ ${direction} -${absSec}s`,
      x: e.clientX,
      y: e.clientY - 40,
    });

    const pxSinceLast = Math.abs(e.clientX - dragState.current.lastSeekX);
    const msSinceLast = Date.now() - dragState.current.lastSeekTime;
    if (pxSinceLast >= SEEK_STEP_PX && msSinceLast >= 100) {
      dragState.current.lastSeekX = e.clientX;
      dragState.current.lastSeekTime = Date.now();
      onTextSeek?.(newPos);
    }
  }, [durationMs, currentTimeMs, onTextSeek]);

  const handlePointerUp = useCallback(() => {
    dragState.current.active = false;
    setDragIndicator(null);
  }, []);

  if (!content) {
    return (
      <div className="glass p-8 text-center" style={{ color: "var(--muted)" }}>
        {isGenerating ? "正在准备章节音频..." : "暂无内容"}
      </div>
    );
  }

  const paragraphs = content.split(/\n+/).filter((p) => p.trim().length > 0);

  // Find which paragraph contains the current scene text, by character offset
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
    <div
      className="glass p-5 md:p-8 relative select-none"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={{ touchAction: "none" }}
    >
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
              className="transition-all duration-500 px-3 py-1.5 rounded-lg"
              style={{
                backgroundColor: isCurrent ? "var(--glass-bg)" : "transparent",
                borderLeft: isCurrent ? "4px solid var(--accent)" : "4px solid transparent",
                boxShadow: isCurrent ? "0 2px 12px var(--glass-border)" : "none",
                transform: isCurrent ? "scale(1.01)" : "scale(1)",
                opacity: isPlaying ? (isCurrent ? 1 : 0.5) : 1,
                fontWeight: isCurrent ? 500 : 400,
                animation: isCurrent && isPlaying ? "breathe 2s ease-in-out infinite" : "none",
              }}
            >
              {p}
            </p>
          );
        })}
      </div>

      {/* Drag indicator */}
      {dragIndicator && (
        <div
          className="fixed z-50 pointer-events-none px-2 py-1 rounded text-xs font-medium shadow"
          style={{
            left: dragIndicator.x,
            top: dragIndicator.y,
            transform: "translateX(-50%)",
            backgroundColor: "var(--accent)",
            color: "var(--bg)",
            whiteSpace: "nowrap",
          }}
        >
          {dragIndicator.text}
        </div>
      )}

      <div className="text-center pt-3 mt-3 border-t" style={{ borderColor: "var(--glass-border)" }}>
        <span className="text-xs" style={{ color: "var(--muted)" }}>
          {durationMs > 0 ? "← 拖动正文快进/快退 →" : ""}
        </span>
      </div>

      {/* Breathe keyframes */}
      <style jsx>{`
        @keyframes breathe {
          0%, 100% { background-color: transparent; }
          50% { background-color: var(--glass-bg); }
        }
      `}</style>
    </div>
  );
}
