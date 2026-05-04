"use client";
import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import type { SceneDot, SceneStatus } from "@/components/SceneTimeline";
import { useParams } from "next/navigation";
import { PlayerBar } from "@/components/PlayerBar";
import { ReadingContent } from "@/components/ReadingContent";
import { ArrowLeft, List } from "lucide-react";
import Link from "next/link";

interface SceneInfo {
  path: string;
  text: string;
  speaker: string | null;
  voice_style: string;
  emotion: string;
  duration_ms: number;
}

interface SceneManifest {
  scenes: SceneInfo[];
  total_duration_ms: number;
  total_scenes?: number;
  generated_scenes?: number;
}

interface ChapterInfo {
  id: number;
  index: number;
  title: string | null;
  content: string;
  analysis_status: string;
}

export default function ReaderPage() {
  const { bookId } = useParams<{ bookId: string }>();
  const [book, setBook] = useState<any>(null);
  const [currentChapterIdx, setCurrentChapterIdx] = useState(0);
  const [manifest, setManifest] = useState<SceneManifest | null>(null);
  const [audioStatus, setAudioStatus] = useState("pending");
  const [genProgress, setGenProgress] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [chapterListOpen, setChapterListOpen] = useState(false);

  const [currentSceneIdx, setCurrentSceneIdx] = useState(0);
  const [sceneTimeMs, setSceneTimeMs] = useState(0);
  const [totalTimeMs, setTotalTimeMs] = useState(0);
  const [groupSize, setGroupSize] = useState(() => {
    try {
      const v = parseInt(localStorage.getItem("timeline-group-size") || "30", 10);
      return [15, 30, 60].includes(v) ? v : 30;
    } catch {
      return 30;
    }
  });

  const audioRef = useRef<HTMLAudioElement>(null);
  const preloadAudioRef = useRef<HTMLAudioElement>(null);
  const endedGuard = useRef(false);
  const preloadTriggered = useRef(false);
  const restorePos = useRef(0);

  const currentChapter: ChapterInfo | undefined = book?.chapters?.[currentChapterIdx];
  const chapterCount = book?.chapters?.length || 0;
  const totalDurationMs = manifest?.total_duration_ms || 0;

  // Load book
  useEffect(() => {
    fetch(`/api/books/${bookId}`)
      .then((r) => r.json())
      .then((data) => {
        setBook(data);
        const prog = data.progress;
        if (prog) {
          setCurrentChapterIdx(prog.chapter_index || 0);
          restorePos.current = prog.position_ms || 0;
        }
      });
  }, [bookId]);

  // Advance to next scene or chapter
  const advance = useCallback(() => {
    if (endedGuard.current) return;
    endedGuard.current = true;

    if (!manifest) return;

    if (currentSceneIdx < manifest.scenes.length - 1) {
      setCurrentSceneIdx((s) => s + 1);
      setSceneTimeMs(0);
    } else {
      if (currentChapterIdx < chapterCount - 1) {
        setCurrentChapterIdx((c) => c + 1);
        setManifest(null);
        setAudioStatus("pending");
        setGenProgress(0);
        setCurrentSceneIdx(0);
        setSceneTimeMs(0);
        setTotalTimeMs(0);
      } else {
        setIsPlaying(false);
      }
    }
  }, [manifest, currentSceneIdx, currentChapterIdx, chapterCount]);

  // Play a specific scene — waits if scene not yet generated
  const playScene = useCallback(async (sceneIdx: number, startMs: number) => {
    if (!manifest || !audioRef.current) return;
    let scene = manifest.scenes[sceneIdx];
    if (!scene) return;

    // If scene audio not ready yet, poll manifest until it is
    if (!scene.path && currentChapter) {
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const res = await fetch(`/api/tts?chapterId=${currentChapter.id}`);
        const data = await res.json();
        if (data.sceneManifest) {
          setManifest(data.sceneManifest);
          setGenProgress(data.progress || 0);
          scene = data.sceneManifest.scenes[sceneIdx];
          if (scene?.path) break;
        }
      }
    }

    if (!scene?.path) {
      advance();
      return;
    }

    endedGuard.current = false;
    const url = `/api/tts?chapterId=${currentChapter?.id}&scene=${sceneIdx}`;

    const onLoaded = () => {
      if (!audioRef.current) return;
      if (startMs > 0) {
        audioRef.current.currentTime = startMs / 1000;
      }
      audioRef.current.play().catch(() => {});
      setIsPlaying(true);
    };

    audioRef.current.src = url;
    audioRef.current.playbackRate = speed;
    audioRef.current.addEventListener("canplay", onLoaded, { once: true });
    audioRef.current.load();
  }, [manifest, currentChapter, speed, advance]);

  // When scene changes, play it
  useEffect(() => {
    if (!manifest || audioStatus !== "ready") return;
    playScene(currentSceneIdx, 0);
  }, [currentSceneIdx, manifest, audioStatus, playScene]);

  // Periodically refresh manifest while playing (to get newly generated scenes)
  useEffect(() => {
    if (!isPlaying || !currentChapter || !manifest) return;
    const allGenerated = (manifest.generated_scenes || 0) >= (manifest.total_scenes || manifest.scenes.length);
    if (allGenerated) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/tts?chapterId=${currentChapter.id}`);
        const data = await res.json();
        if (data.sceneManifest) {
          setManifest(data.sceneManifest);
          setGenProgress(data.progress || 0);
        }
      } catch {}
    }, 10000);
    return () => clearInterval(interval);
  }, [isPlaying, currentChapter, manifest]);

  // Load chapter audio
  const loadChapter = useCallback(async (chapterId: number) => {
    preloadTriggered.current = false;
    endedGuard.current = false;
    setManifest(null);
    setAudioStatus("pending");
    setGenProgress(0);
    setCurrentSceneIdx(0);
    setSceneTimeMs(0);
    setTotalTimeMs(0);

    try {
      let res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chapterId }),
      });
      let data = await res.json();

      if (data.status === "generating" || data.status === "pending") {
        setAudioStatus("generating");
        for (let i = 0; i < 120; i++) {
          await new Promise((r) => setTimeout(r, 3000));
          res = await fetch(`/api/tts?chapterId=${chapterId}`);
          data = await res.json();
          setGenProgress(data.progress || 0);
          if (data.status === "ready" || data.status === "error") break;
          setAudioStatus("generating");
        }
      }

      if (data.status === "ready" && data.sceneManifest?.scenes?.length > 0) {
        setManifest(data.sceneManifest);
        setAudioStatus("ready");
        if (restorePos.current > 0) {
          const target = restorePos.current;
          restorePos.current = 0;
          let acc = 0;
          let si = 0;
          for (let i = 0; i < data.sceneManifest.scenes.length; i++) {
            const dur = data.sceneManifest.scenes[i].duration_ms;
            if (target < acc + dur) { si = i; break; }
            acc += dur;
            si = i;
          }
          setCurrentSceneIdx(si);
          setSceneTimeMs(target - acc);
        }
      } else {
        setAudioStatus("error");
      }
    } catch (e) {
      console.error("Load chapter error:", e);
      setAudioStatus("error");
    }
  }, []);

  useEffect(() => {
    if (!currentChapter) return;
    loadChapter(currentChapter.id);
  }, [currentChapter, loadChapter]);

  // Update total position
  useEffect(() => {
    if (!manifest) return;
    let acc = 0;
    for (let i = 0; i < Math.min(currentSceneIdx, manifest.scenes.length); i++) {
      acc += manifest.scenes[i].duration_ms;
    }
    setTotalTimeMs(acc + sceneTimeMs);
  }, [manifest, currentSceneIdx, sceneTimeMs]);

  // Preload next scene
  useEffect(() => {
    if (!manifest || !preloadAudioRef.current || !isPlaying) return;
    const nextIdx = currentSceneIdx + 1;
    if (nextIdx >= manifest.scenes.length) return;
    const dur = manifest.scenes[currentSceneIdx]?.duration_ms || 0;
    if (dur > 0 && sceneTimeMs / dur >= 0.8) {
      preloadAudioRef.current.src = `/api/tts?chapterId=${currentChapter?.id}&scene=${nextIdx}`;
      preloadAudioRef.current.load();
    }
  }, [sceneTimeMs, currentSceneIdx, manifest, isPlaying, currentChapter]);

  // Preload next chapter at 30%
  useEffect(() => {
    if (!currentChapter || preloadTriggered.current || totalDurationMs <= 0) return;
    if (totalTimeMs / totalDurationMs >= 0.3) {
      preloadTriggered.current = true;
      const next = book?.chapters?.[currentChapterIdx + 1];
      if (next) {
        fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chapterId: next.id }),
        }).catch(() => {});
      }
    }
  }, [totalTimeMs, totalDurationMs, currentChapter, book]);

  // Save progress
  useEffect(() => {
    if (!book || !isPlaying) return;
    const interval = setInterval(() => {
      fetch("/api/books/progress", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookId: book.id,
          chapterIndex: currentChapterIdx,
          positionMs: Math.round(totalTimeMs),
        }),
      }).catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, [book, currentChapterIdx, totalTimeMs, isPlaying]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = speed;
  }, [speed]);

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setSceneTimeMs(audioRef.current.currentTime * 1000);
    }
  };

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  const handleSeek = (ms: number) => {
    if (!manifest) return;
    let acc = 0;
    for (let i = 0; i < manifest.scenes.length; i++) {
      const dur = manifest.scenes[i].duration_ms;
      if (ms < acc + dur) {
        setCurrentSceneIdx(i);
        setSceneTimeMs(0);
        setTimeout(() => playScene(i, ms - acc), 0);
        return;
      }
      acc += dur;
    }
  };

  const goToChapter = (idx: number) => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
    }
    setCurrentChapterIdx(idx);
  };

  const sceneDots = useMemo((): SceneDot[] => {
    if (!manifest) return [];
    const generatedCount = manifest.generated_scenes ?? 0;
    return manifest.scenes.map((_, idx) => {
      let status: SceneStatus;
      if (idx < currentSceneIdx) status = "played";
      else if (idx === currentSceneIdx) status = "current";
      else if (idx < generatedCount) status = "ready";
      else if (idx === generatedCount) status = "generating";
      else status = "waiting";
      return { index: idx, status };
    });
  }, [manifest, currentSceneIdx]);

  const progressRatio = totalDurationMs > 0 ? totalTimeMs / totalDurationMs : 0;

  const handleSceneClick = useCallback((sceneIdx: number) => {
    if (!manifest) return;
    setCurrentSceneIdx(sceneIdx);
    setSceneTimeMs(0);
    setTimeout(() => playScene(sceneIdx, 0), 0);
  }, [manifest, playScene]);

  const totalScenes = manifest?.total_scenes ?? manifest?.scenes.length ?? 0;
  const generatedScenes = manifest?.generated_scenes ?? 0;

  if (!book || !book.chapters) return <div className="flex justify-center py-20" style={{ color: "var(--muted)" }}>加载中...</div>;

  const currentSceneText = manifest?.scenes?.[currentSceneIdx]?.text || null;

  return (
    <div className="flex gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3 mb-4">
          <Link href="/" className="flex-shrink-0" style={{ color: "var(--muted)" }}><ArrowLeft size={20} /></Link>
          <div className="min-w-0 flex-1"><h1 className="text-lg font-semibold truncate">{book.title}</h1></div>
          <button onClick={() => setChapterListOpen(!chapterListOpen)}
            className="flex-shrink-0 p-1.5 rounded-lg" style={{ color: "var(--muted)" }}>
            <List size={20} />
          </button>
        </div>

        {chapterListOpen && (
          <div className="glass p-3 mb-4 max-h-64 overflow-y-auto rounded-xl">
            {(book.chapters || []).map((ch: ChapterInfo, i: number) => (
              <button key={ch.id}
                onClick={() => { goToChapter(i); setChapterListOpen(false); }}
                className="block w-full text-left px-3 py-2 rounded-lg text-sm transition-colors"
                style={{
                  backgroundColor: i === currentChapterIdx ? "var(--glass-bg)" : "transparent",
                  color: i === currentChapterIdx ? "var(--accent)" : "var(--text)",
                }}
              >
                {ch.title || `第${i + 1}章`}
              </button>
            ))}
          </div>
        )}

        <PlayerBar
          chapterTitle={currentChapter?.title || `第${currentChapterIdx + 1}章`}
          chapterIdx={currentChapterIdx}
          totalChapters={chapterCount}
          isPlaying={isPlaying}
          audioStatus={audioStatus}
          onTogglePlay={togglePlay}
          onPrevChapter={() => currentChapterIdx > 0 && goToChapter(currentChapterIdx - 1)}
          onNextChapter={() => currentChapterIdx < chapterCount - 1 && goToChapter(currentChapterIdx + 1)}
          currentTimeMs={totalTimeMs}
          durationMs={totalDurationMs}
          speed={speed}
          onSpeedChange={setSpeed}
          scenes={sceneDots}
          currentSceneIdx={currentSceneIdx}
          totalScenes={totalScenes}
          generatedScenes={generatedScenes}
          onSceneClick={handleSceneClick}
          onTimelineSeek={handleSeek}
          groupSize={groupSize}
          onGroupSizeChange={setGroupSize}
          progressRatio={progressRatio}
        />

        <ReadingContent
          content={currentChapter?.content || ""}
          currentSceneText={currentSceneText}
          isPlaying={isPlaying}
          audioStatus={audioStatus}
        />

        <div className="flex justify-between mt-4">
          <button onClick={() => goToChapter(Math.max(0, currentChapterIdx - 1))} disabled={currentChapterIdx === 0}
            className="text-sm px-3 py-1.5 rounded-lg disabled:opacity-30" style={{ color: "var(--muted)" }}>
            上一章
          </button>
          <span className="text-sm" style={{ color: "var(--muted)" }}>{currentChapterIdx + 1} / {chapterCount}</span>
          <button onClick={() => goToChapter(Math.min(chapterCount - 1, currentChapterIdx + 1))} disabled={currentChapterIdx === chapterCount - 1}
            className="text-sm px-3 py-1.5 rounded-lg disabled:opacity-30" style={{ color: "var(--accent)" }}>
            下一章
          </button>
        </div>
      </div>

      <audio ref={audioRef}
        onEnded={advance}
        onTimeUpdate={handleTimeUpdate}
        className="hidden"
      />
      <audio ref={preloadAudioRef} className="hidden" />
    </div>
  );
}
