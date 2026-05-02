"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import { PlayerBar } from "@/components/PlayerBar";
import { ReadingContent } from "@/components/ReadingContent";
import { CharacterPanel } from "@/components/CharacterPanel";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

interface Segment {
  id: number;
  segment_index: number;
  type: "narration" | "dialogue";
  character_id: number | null;
  text: string;
  emotion: string | null;
}

export default function ReaderPage() {
  const { bookId } = useParams<{ bookId: string }>();
  const [book, setBook] = useState<any>(null);
  const [currentChapterIdx, setCurrentChapterIdx] = useState(0);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [activeSegment, setActiveSegment] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [characterSheetOpen, setCharacterSheetOpen] = useState(false);
  const [speed, setSpeed] = useState(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Load book data
  useEffect(() => {
    fetch(`/api/books/${bookId}`)
      .then((r) => r.json())
      .then((data) => {
        setBook(data);
        const prog = data.progress;
        if (prog) {
          setCurrentChapterIdx(prog.chapter_index);
          setActiveSegment(prog.segment_index || 0);
        }
      });
  }, [bookId]);

  // Load chapter segments
  useEffect(() => {
    if (!book) return;
    const chapter = book.chapters[currentChapterIdx];
    if (!chapter) return;
    const chapterId = chapter.id;

    async function loadSegments() {
      // Trigger annotation if pending
      if (chapter.analysis_status === "pending") {
        await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "annotate", chapterId }),
        });
        // Poll for completion
        for (let i = 0; i < 15; i++) {
          await new Promise((r) => setTimeout(r, 2000));
          const cres = await fetch(`/api/books/${bookId}`);
          const cdata = await cres.json();
          if (cdata.chapters[currentChapterIdx]?.analysis_status === "done") break;
        }
      }
      // Fetch segments
      const sres = await fetch(`/api/books/${bookId}/segments?chapterId=${chapterId}`);
      const segs = await sres.json();
      setSegments(segs || []);
      setActiveSegment(0);
    }

    loadSegments().catch(console.error);
  }, [book, currentChapterIdx, bookId]);

  // Play current segment
  const playSegment = useCallback(async (segIdx: number) => {
    if (!book || !segments[segIdx]) return;
    const seg = segments[segIdx];
    const chapterId = book.chapters[currentChapterIdx]?.id;

    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chapterId,
          segmentIndex: seg.segment_index,
          text: seg.text,
          characterId: seg.character_id,
          emotion: seg.emotion,
        }),
      });
      const data = await res.json();
      if (data.base64 && audioRef.current) {
        audioRef.current.src = `data:audio/mp3;base64,${data.base64}`;
        audioRef.current.playbackRate = speed;
        audioRef.current.play();
        setIsPlaying(true);
      }
    } catch (e) {
      console.error("TTS error, skipping segment:", e);
      if (segIdx < segments.length - 1) {
        setActiveSegment((s) => s + 1);
      }
    }
  }, [book, segments, currentChapterIdx, speed]);

  // Advance on play
  useEffect(() => {
    if (isPlaying) playSegment(activeSegment);
  }, [activeSegment, isPlaying]);

  // Save progress
  useEffect(() => {
    if (!book) return;
    fetch("/api/books/progress", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookId: book.id, chapterIndex: currentChapterIdx, segmentIndex: activeSegment }),
    }).catch(() => {});
  }, [book, currentChapterIdx, activeSegment]);

  const handleAudioEnd = () => {
    if (activeSegment < segments.length - 1) {
      setActiveSegment((s) => s + 1);
    } else {
      setIsPlaying(false);
    }
  };

  // Swipe gestures
  const touchStartX = useRef(0);
  const handleTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX; };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 80 && book) {
      if (diff > 0 && currentChapterIdx < book.chapters.length - 1) {
        setCurrentChapterIdx((c: number) => c + 1);
      } else if (diff < 0 && currentChapterIdx > 0) {
        setCurrentChapterIdx((c: number) => c - 1);
      }
    }
  };

  const togglePlay = () => {
    if (!isPlaying) { setIsPlaying(true); }
    else { audioRef.current?.pause(); setIsPlaying(false); }
  };

  const currentChapter = book?.chapters[currentChapterIdx];
  const activeCharId = segments[activeSegment]?.character_id;
  const activeChar = book?.characters?.find((c: any) => c.id === activeCharId);

  if (!book) return <div className="flex justify-center py-20" style={{ color: "var(--muted)" }}>加载中...</div>;

  return (
    <div className="flex gap-4">
      <div className="flex-1 min-w-0" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        <div className="flex items-center gap-3 mb-4">
          <Link href="/" className="flex-shrink-0" style={{ color: "var(--muted)" }}><ArrowLeft size={20} /></Link>
          <div className="min-w-0"><h1 className="text-lg font-semibold truncate">{book.title}</h1></div>
        </div>

        <PlayerBar
          chapterTitle={currentChapter?.title || `第${currentChapterIdx + 1}章`}
          currentSegment={activeSegment} totalSegments={segments.length} isPlaying={isPlaying}
          onTogglePlay={togglePlay}
          onPrevSegment={() => activeSegment > 0 && setActiveSegment((s: number) => s - 1)}
          onNextSegment={() => activeSegment < segments.length - 1 && setActiveSegment((s: number) => s + 1)}
          currentTime={currentTime} duration={duration}
          speakingCharacter={activeChar?.name || null}
          speed={speed} onSpeedChange={setSpeed}
        />

        {segments.length > 0 ? (
          <ReadingContent
            segments={segments.map((s: Segment) => ({
              ...s,
              character_name: book.characters?.find((c: any) => c.id === s.character_id)?.name || null,
            }))}
            activeSegmentIndex={activeSegment}
          />
        ) : (
          <div className="glass p-8 text-center" style={{ color: "var(--muted)" }}>正在分析章节...</div>
        )}

        <div className="flex justify-between mt-4">
          <button onClick={() => setCurrentChapterIdx((c: number) => Math.max(0, c - 1))} disabled={currentChapterIdx === 0}
            className="text-sm px-3 py-1.5 rounded-lg disabled:opacity-30" style={{ color: "var(--muted)" }}>
            ← 上一章
          </button>
          <span className="text-sm" style={{ color: "var(--muted)" }}>{currentChapterIdx + 1} / {book.chapters.length}</span>
          <button onClick={() => setCurrentChapterIdx((c: number) => Math.min(book.chapters.length - 1, c + 1))} disabled={currentChapterIdx === book.chapters.length - 1}
            className="text-sm px-3 py-1.5 rounded-lg disabled:opacity-30" style={{ color: "var(--accent)" }}>
            下一章 →
          </button>
        </div>
      </div>

      <CharacterPanel
        characters={(book.characters || []).map((c: any) => ({ id: c.id, name: c.name, voice_name: c.voice_name, role_type: c.role_type || "supporting" }))}
        activeCharacterName={activeChar?.name || null}
        isOpen={characterSheetOpen} onToggle={() => setCharacterSheetOpen(!characterSheetOpen)}
      />

      <audio ref={audioRef} onEnded={handleAudioEnd}
        onTimeUpdate={(e) => setCurrentTime((e.target as HTMLAudioElement).currentTime * 1000)}
        onLoadedMetadata={(e) => setDuration((e.target as HTMLAudioElement).duration * 1000)}
        className="hidden"
      />
    </div>
  );
}
