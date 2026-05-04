"use client";
import { useRef, useEffect } from "react";

export type SceneStatus = "played" | "current" | "ready" | "generating" | "waiting";

export interface SceneDot {
  index: number;
  status: SceneStatus;
}

interface SceneTimelineProps {
  scenes: SceneDot[];
  currentIndex: number;
  totalCount: number;
  generatedCount: number;
  onSceneClick: (index: number) => void;
}

function DotIcon({ status }: { status: SceneStatus }) {
  const baseClasses = "w-1.5 h-1.5 rounded-full flex-shrink-0 transition-all duration-300";
  switch (status) {
    case "played":
      return <div className={`${baseClasses}`} style={{ backgroundColor: "var(--muted)", opacity: 0.5 }} />;
    case "current":
      return (
        <div className={`${baseClasses} ring-2 ring-offset-1`}
          style={{ backgroundColor: "var(--accent)", opacity: 0.4, width: "0.5rem", height: "0.5rem" }}
        />
      );
    case "ready":
      return <div className={`${baseClasses} cursor-pointer hover:scale-150`} style={{ backgroundColor: "var(--muted)", opacity: 0.8 }} />;
    case "generating":
      return <div className={`${baseClasses} animate-pulse`} style={{ backgroundColor: "var(--accent)", opacity: 0.4, borderStyle: "dashed", borderWidth: 1, borderColor: "var(--accent)" }} />;
    case "waiting":
      return <div className={`${baseClasses}`} style={{ backgroundColor: "var(--border)", opacity: 0.4 }} />;
  }
}

export function SceneTimeline({
  scenes,
  currentIndex,
  totalCount,
  generatedCount,
  onSceneClick,
}: SceneTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to keep current dot visible
  useEffect(() => {
    if (!scrollRef.current) return;
    const container = scrollRef.current;
    const currentDot = container.children[currentIndex] as HTMLElement | undefined;
    if (currentDot) {
      currentDot.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  }, [currentIndex]);

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs" style={{ color: "var(--muted)" }}>
          段 {currentIndex + 1} / {totalCount}
        </span>
        <span className="text-xs" style={{ color: "var(--muted)" }}>
          已生成 {generatedCount}/{totalCount}
        </span>
      </div>
      <div
        ref={scrollRef}
        className="flex items-center gap-[2px] overflow-x-auto py-1.5 scrollbar-hide"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {scenes.map((dot) => (
          <button
            key={dot.index}
            onClick={() => {
              if (dot.status === "ready" || dot.status === "played") {
                onSceneClick(dot.index);
              }
            }}
            disabled={dot.status === "waiting" || dot.status === "generating"}
            className="flex-shrink-0 p-0.5"
            title={`段 ${dot.index + 1}`}
          >
            <DotIcon status={dot.status} />
          </button>
        ))}
      </div>
    </div>
  );
}
