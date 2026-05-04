"use client";
import { GlassCard } from "./GlassCard";
import Link from "next/link";

interface BookCardProps {
  id: number;
  title: string;
  author: string | null;
  cover_color: string;
  chapterCount: number;
  characterCount: number;
  progressPercent: number;
  audioReadyScenes?: number;
  audioTotalScenes?: number;
}

export function BookCard({
  id, title, author, cover_color, chapterCount, characterCount, progressPercent,
  audioReadyScenes = 0, audioTotalScenes = 0,
}: BookCardProps) {
  const audioPercent = audioTotalScenes > 0 ? Math.round((audioReadyScenes / audioTotalScenes) * 100) : 0;
  const showAudioProgress = audioTotalScenes > 0 && audioPercent < 100;

  return (
    <Link href={`/read/${id}`}>
      <GlassCard className="p-4 md:p-5 h-full flex flex-col gap-3">
        <div
          className="aspect-[3/4] rounded-lg flex items-center justify-center"
          style={{ backgroundColor: cover_color }}
        >
          <span className="text-3xl opacity-40 select-none">📖</span>
        </div>
        <div className="flex-1">
          <h3 className="font-medium text-sm md:text-base truncate" style={{ color: "var(--text)" }}>
            {title}
          </h3>
          {author && (
            <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>{author}</p>
          )}
        </div>

        {/* Reading progress */}
        {progressPercent > 0 && (
          <div className="h-1 rounded-full" style={{ backgroundColor: "var(--border)" }}>
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${progressPercent}%`, backgroundColor: "var(--accent)" }}
            />
          </div>
        )}

        {/* Audio generation progress */}
        {showAudioProgress && (
          <div>
            <div className="flex justify-between text-xs mb-0.5" style={{ color: "var(--muted)" }}>
              <span>音频准备</span>
              <span>{audioPercent}%</span>
            </div>
            <div className="h-1 rounded-full" style={{ backgroundColor: "var(--border)" }}>
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${audioPercent}%`, backgroundColor: "var(--accent)", opacity: 0.6 }}
              />
            </div>
          </div>
        )}

        <div className="flex gap-3 text-xs" style={{ color: "var(--muted)" }}>
          <span>{chapterCount} 章</span>
          {characterCount > 0 && <span>{characterCount} 角色</span>}
          {audioTotalScenes > 0 && <span>{audioReadyScenes}/{audioTotalScenes} 段</span>}
        </div>
      </GlassCard>
    </Link>
  );
}
