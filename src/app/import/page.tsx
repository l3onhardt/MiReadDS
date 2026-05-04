"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { FileDropZone } from "@/components/FileDropZone";
import { ArrowLeft, Check, Loader2, BookOpen } from "lucide-react";
import Link from "next/link";

interface ImportState {
  phase: "idle" | "uploading" | "preparing";
  bookId?: number;
  bookTitle?: string;
  chapterCount?: number;
  error?: string;
  audioReady?: boolean;
}

export default function ImportPage() {
  const [state, setState] = useState<ImportState>({ phase: "idle" });
  const [progress, setProgress] = useState({ generatedScenes: 0, totalScenes: 0, percent: 0 });
  const router = useRouter();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup poll on unmount
  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  async function handleFile(file: File) {
    setState({ phase: "uploading" });
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/books", { method: "POST", body: formData });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "导入失败");
      }
      const book = await res.json();
      setState({
        phase: "preparing",
        bookId: book.id,
        bookTitle: book.title,
        chapterCount: book.chapter_count,
      });

      // Poll for audio generation progress
      pollRef.current = setInterval(async () => {
        try {
          const progRes = await fetch(`/api/books/progress?bookId=${book.id}`);
          const progData = await progRes.json();
          setProgress({
            generatedScenes: progData.generatedScenes || 0,
            totalScenes: progData.totalScenes || 0,
            percent: progData.percent || 0,
          });
          // Audio ready when at least 5 scenes generated
          if (progData.generatedScenes >= 5) {
            setState((prev) => ({ ...prev, audioReady: true }));
            if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
          }
        } catch {}
      }, 2000);
    } catch (e: any) {
      setState({ phase: "idle", error: e.message });
    }
  }

  const { phase, bookId, bookTitle, chapterCount, error, audioReady } = state;
  const { generatedScenes, totalScenes, percent } = progress;

  return (
    <div className="max-w-lg mx-auto">
      <Link href="/" className="inline-flex items-center gap-1.5 text-sm mb-6" style={{ color: "var(--muted)" }}>
        <ArrowLeft size={16} /> 返回书架
      </Link>
      <h1 className="text-2xl font-semibold mb-6">导入小说</h1>

      {phase === "idle" && (
        <>
          <FileDropZone onFile={handleFile} loading={false} />
          {error && (
            <div className="mt-4 p-3 rounded-lg text-sm" style={{ backgroundColor: "rgba(220,38,38,0.1)", color: "#dc2626" }}>
              {error}
            </div>
          )}
        </>
      )}

      {(phase === "uploading" || phase === "preparing") && (
        <div className="glass p-6 rounded-xl space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📖</span>
            <div>
              <h2 className="font-semibold">{bookTitle}</h2>
              {chapterCount && <p className="text-xs" style={{ color: "var(--muted)" }}>{chapterCount} 章</p>}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <Check size={14} style={{ color: "var(--accent)" }} />
              <span>解析完成</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Check size={14} style={{ color: "var(--accent)" }} />
              <span>场景切分完成</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              {audioReady ? (
                <Check size={14} style={{ color: "var(--accent)" }} />
              ) : (
                <Loader2 size={14} className="animate-spin" style={{ color: "var(--accent)" }} />
              )}
              <span>{audioReady ? "音频就绪" : `音频准备中... ${generatedScenes} 段已生成`}</span>
            </div>
          </div>

          {/* Progress bar */}
          <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--border)" }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${audioReady ? 100 : Math.min(percent || 0, 95)}%`,
                backgroundColor: "var(--accent)",
              }}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Link
              href="/"
              className="flex-1 py-2.5 rounded-lg text-sm font-medium text-center transition-colors"
              style={{ backgroundColor: "var(--glass-bg)", color: "var(--text)" }}
            >
              返回书架
            </Link>
            {audioReady && bookId && (
              <button
                onClick={() => router.push(`/read/${bookId}`)}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-1.5 transition-colors"
                style={{ backgroundColor: "var(--accent)", color: "var(--bg)" }}
              >
                <BookOpen size={16} />
                开始阅读
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
