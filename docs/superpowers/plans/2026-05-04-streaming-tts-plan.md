# 流式 TTS：导入即听 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用户导入小说后 30 秒内可以开始听书，音频生成在后台追着播放进度跑。

**Architecture:** 去掉 LLM 导演环节，改用规则切分场景（按段落/句子）。导入时生成前 5 个场景即标记可听。播放时后台保持领先用户至少 10 个场景。进度条替换为场景点时间线组件。

**Tech Stack:** Next.js 14, TypeScript, better-sqlite3, MiMo TTS API

---

## 文件变更概览

| 文件 | 操作 | 职责 |
|------|------|------|
| `src/lib/services.ts` | 修改 | 规则切分、批量策略、导入预处理、生成队列、进度查询 |
| `src/app/api/books/route.ts` | 修改 | POST 返回预处理结果，新增进度端点 |
| `src/components/SceneTimeline.tsx` | 新建 | 场景点时间线组件 |
| `src/components/PlayerBar.tsx` | 修改 | 集成 SceneTimeline，移除假进度条 |
| `src/components/BookCard.tsx` | 修改 | 显示音频生成进度 |
| `src/app/import/page.tsx` | 重写 | 导入进度面板 |
| `src/app/read/[bookId]/page.tsx` | 修改 | 适配新流程，移除章节轮询等待 |

---

### Task 1: 规则切分 + 批量策略调整 (services.ts)

**Files:**
- Modify: `src/lib/services.ts`

**变更点：**
- 新增 `splitTextIntoScenes()` 函数（纯规则，替换 LLM 导演）
- `generateChapterAudio()` 中用 `splitTextIntoScenes()` 替换 LLM 调用
- `FIRST_BATCH_SIZE` 从 10 改为 5
- 删除导演 prompt、角色上下文等 LLM 相关代码

- [ ] **Step 1: 在 services.ts 顶部添加 splitTextIntoScenes 函数**

在 `CHAPTER_AUDIO_DIR` 常量后面（约第 306 行），`generateChapterAudio` 函数之前，插入：

```typescript
// ============================================================
// Rule-based scene splitting (replaces LLM director for single-narrator mode)
// ============================================================

function splitTextIntoScenes(text: string): DirectorScene[] {
  const scenes: DirectorScene[] = [];
  // Split by paragraphs (blank lines)
  const paragraphs = text.split(/\n+/).filter((p) => p.trim().length > 0);

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (trimmed.length <= 500) {
      scenes.push({ text: trimmed, speaker: null, voice_style: "", emotion: "沉稳" });
    } else {
      // Split long paragraphs at sentence boundaries (Chinese + English punctuation)
      const sentences = trimmed.split(/(?<=[。！？.!?])/);
      let current = "";
      for (const sent of sentences) {
        if (!sent) continue;
        if (current.length + sent.length > 500 && current) {
          scenes.push({ text: current, speaker: null, voice_style: "", emotion: "沉稳" });
          current = sent;
        } else {
          current += sent;
        }
      }
      if (current.trim()) {
        scenes.push({ text: current.trim(), speaker: null, voice_style: "", emotion: "沉稳" });
      }
    }
  }

  // Fallback: if no scenes, use entire text as one scene
  if (scenes.length === 0 && text.trim()) {
    scenes.push({ text: text.trim(), speaker: null, voice_style: "", emotion: "沉稳" });
  }

  return scenes;
}
```

- [ ] **Step 2: 替换 generateChapterAudio 中的 LLM 导演阶段**

找到 `generateChapterAudio` 函数（约第 426 行），将 Phase 1 LLM 导演部分（约第 461-503 行）替换为规则切分：

删除从 `// === Phase 1: LLM Director ===` 到 `// Save the full scene plan` 之间的所有代码，替换为：

```typescript
    // === Phase 1: Rule-based scene splitting ===
    const allScenes: DirectorScene[] = splitTextIntoScenes(chapter.content);

    // Update progress: splitting done (0-50%)
    db.prepare("UPDATE chapter_audio SET size_bytes = 25 WHERE chapter_id = ?")
      .run(chapterId);
```

同时删除不再需要的变量：
- 删除 `const charContext = ...`（约第 457-459 行）
- 删除 `const baseVoice = ...` 上面的空行和角色查询可以被简化，但保留 `baseVoice` 和 `apiKey`。

- [ ] **Step 3: 调整 FIRST_BATCH_SIZE**

找到 `const FIRST_BATCH_SIZE = Math.min(10, totalScenes);`（约第 530 行），改为：

```typescript
const FIRST_BATCH_SIZE = Math.min(5, totalScenes);
```

- [ ] **Step 4: 确认 generateChapterAudio 完整逻辑正确**

验证函数中以下部分仍然存在且顺序正确：
1. 章节查询 + 状态检查
2. 设置 status = 'generating'
3. Phase 1: splitTextIntoScenes (新)
4. 保存 initialManifest 到 scene_script
5. Phase 2: 创建 sceneDir，generateBatch(0, FIRST_BATCH_SIZE)
6. saveManifest + 标记 status = 'ready'
7. 后台继续生成剩余场景
8. 返回 firstManifest

- [ ] **Step 5: 验证编译**

```bash
cd /Users/piggy/MiReadDS && npx tsc --noEmit 2>&1 | head -30
```

预期：无新增错误。

- [ ] **Step 6: Commit**

```bash
cd /Users/piggy/MiReadDS && git add src/lib/services.ts && git commit -m "$(cat <<'EOF'
refactor: replace LLM director with rule-based scene splitting, reduce first batch to 5

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: 导入预处理 + 书架进度 API (services.ts + books route)

**Files:**
- Modify: `src/lib/services.ts`
- Modify: `src/app/api/books/route.ts`

**变更点：**
- `importBook()` 返回前触发第 1 章场景切分和前 5 段 TTS
- 新增 `getBookAudioProgress()` 查询全书音频生成进度
- POST /api/books 返回结果附带生成状态
- 新增 GET /api/books?progress=true 返回带进度的书籍列表

- [ ] **Step 1: 在 services.ts 中添加 getBookAudioProgress 函数**

在 `saveProgress` 函数之后（文件末尾），添加：

```typescript
export interface BookAudioProgress {
  bookId: number;
  totalScenes: number;
  generatedScenes: number;
  percent: number;
}

export function getBookAudioProgress(bookId: number): BookAudioProgress {
  const db = getDb();
  const chapters = db.prepare(
    "SELECT id FROM chapters WHERE book_id = ? ORDER BY \"index\""
  ).all(bookId) as { id: number }[];

  let totalScenes = 0;
  let generatedScenes = 0;

  for (const ch of chapters) {
    const row = db.prepare(
      "SELECT scene_script, status FROM chapter_audio WHERE chapter_id = ?"
    ).get(ch.id) as any;

    if (row?.scene_script) {
      try {
        const manifest = JSON.parse(row.scene_script);
        const scenes = manifest.scenes || [];
        totalScenes += scenes.length;
        generatedScenes += scenes.filter((s: any) => s.path && s.path.length > 0).length;
      } catch {}
    }
  }

  return {
    bookId,
    totalScenes,
    generatedScenes,
    percent: totalScenes > 0 ? Math.round((generatedScenes / totalScenes) * 100) : 0,
  };
}
```

- [ ] **Step 2: 修改 listBooks 查询，附加音频进度**

在 `listBooks()` 函数中，查询后在 JS 层追加音频进度字段。找到 `listBooks` 函数（约第 128 行），改为：

```typescript
export function listBooks(): (Book & {
  chapter_count: number;
  character_count: number;
  progress_chapter: number | null;
  progress_position_ms: number | null;
  audio_ready_scenes: number;
  audio_total_scenes: number;
})[] {
  const db = getDb();
  const books = db.prepare(`
    SELECT b.*,
      (SELECT COUNT(*) FROM chapters WHERE book_id = b.id) as chapter_count,
      (SELECT COUNT(*) FROM characters WHERE book_id = b.id) as character_count,
      p.chapter_index as progress_chapter,
      p.position_ms as progress_position_ms
    FROM books b
    LEFT JOIN reading_progress p ON p.book_id = b.id
    ORDER BY b.updated_at DESC
  `).all() as any[];

  // Attach audio progress for each book (books are few, loop is cheap)
  for (const book of books) {
    const prog = getBookAudioProgress(book.id);
    book.audio_ready_scenes = prog.generatedScenes;
    book.audio_total_scenes = prog.totalScenes;
  }

  return books;
}
```

- [ ] **Step 3: 修改 POST /api/books，导入后触发预处理**

在 `src/app/api/books/route.ts` 中，修改 POST handler，导入后触发第 1 章预处理。文件改为：

```typescript
import { NextRequest, NextResponse } from "next/server";
import { listBooks, importBook, generateChapterAudio } from "@/lib/services";
import { getDb } from "@/lib/db";

export async function GET() {
  try {
    const books = listBooks();
    return NextResponse.json(books);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    if (!file) return NextResponse.json({ error: "请选择文件" }, { status: 400 });
    const book = await importBook(file);

    // Trigger chapter 1 audio generation (fire and forget — client polls progress)
    const db = getDb();
    const ch1 = db.prepare(
      "SELECT id FROM chapters WHERE book_id = ? AND \"index\" = 0"
    ).get(book.id) as { id: number } | undefined;

    if (ch1) {
      generateChapterAudio(ch1.id).catch((e: any) =>
        console.error(`Chapter 1 pre-generation failed:`, e)
      );
    }

    return NextResponse.json(book, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "导入失败" }, { status: 500 });
  }
}
```

- [ ] **Step 4: 新增 GET /api/books/progress?bookId=N 端点**

在 `src/app/api/books/progress/route.ts` 中增加 GET handler：

读取现有文件，确认当前只有 PUT handler。添加 GET handler：

```typescript
import { getBookAudioProgress } from "@/lib/services";

export async function GET(req: NextRequest) {
  const bookId = req.nextUrl.searchParams.get("bookId");
  if (!bookId) {
    return NextResponse.json({ error: "bookId required" }, { status: 400 });
  }
  try {
    const progress = getBookAudioProgress(parseInt(bookId));
    return NextResponse.json(progress);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
```

- [ ] **Step 5: 验证编译**

```bash
cd /Users/piggy/MiReadDS && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 6: Commit**

```bash
cd /Users/piggy/MiReadDS && git add src/lib/services.ts src/app/api/books/route.ts src/app/api/books/progress/route.ts && git commit -m "$(cat <<'EOF'
feat: import-time chapter 1 pre-generation and book audio progress API

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: SceneTimeline 组件 (新建)

**Files:**
- Create: `src/components/SceneTimeline.tsx`

**职责：** 场景点时间线，替换 PlayerBar 中的假进度条。横向滚动显示当前章节所有场景点，每个点表示一个状态。

- [ ] **Step 1: 创建 SceneTimeline 组件**

```typescript
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
          style={{ backgroundColor: "var(--accent)", ringColor: "var(--accent)", opacity: 0.4, width: "0.5rem", height: "0.5rem" }}
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
```

- [ ] **Step 2: 验证编译**

```bash
cd /Users/piggy/MiReadDS && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
cd /Users/piggy/MiReadDS && git add src/components/SceneTimeline.tsx && git commit -m "$(cat <<'EOF'
feat: add SceneTimeline component with dot-based scene navigation

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: PlayerBar 集成 SceneTimeline

**Files:**
- Modify: `src/components/PlayerBar.tsx`

**变更点：**
- 移除旧的假进度条（`positionPercent`、`onSeek` 的点击进度条）
- 集成 SceneTimeline
- 保留播放/暂停、章节导航、倍速控制

- [ ] **Step 1: 更新 PlayerBar props 和渲染**

```typescript
"use client";
import { Play, Pause, SkipBack, SkipForward, Loader2 } from "lucide-react";
import { formatDuration } from "@/lib/utils";
import { SceneTimeline, SceneDot } from "./SceneTimeline";

interface PlayerBarProps {
  chapterTitle: string;
  chapterIdx: number;
  totalChapters: number;
  isPlaying: boolean;
  audioStatus: string;
  onTogglePlay: () => void;
  onPrevChapter: () => void;
  onNextChapter: () => void;
  currentTimeMs: number;
  durationMs: number;
  speed: number;
  onSpeedChange: (speed: number) => void;
  // Scene timeline props
  scenes?: SceneDot[];
  currentSceneIdx?: number;
  totalScenes?: number;
  generatedScenes?: number;
  onSceneClick?: (index: number) => void;
}

export function PlayerBar({
  chapterTitle, chapterIdx, totalChapters, isPlaying, audioStatus,
  onTogglePlay, onPrevChapter, onNextChapter,
  currentTimeMs, durationMs,
  speed, onSpeedChange,
  scenes = [],
  currentSceneIdx = 0,
  totalScenes = 0,
  generatedScenes = 0,
  onSceneClick,
}: PlayerBarProps) {
  const isReady = audioStatus === "ready";
  const isGenerating = audioStatus === "generating" || audioStatus === "pending";

  return (
    <div className="glass p-3 md:p-4 mb-4 sticky top-2 z-10">
      <div className="flex items-center gap-3">
        <button
          onClick={onTogglePlay}
          disabled={isGenerating}
          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 disabled:opacity-40"
          style={{ borderColor: isReady ? "var(--accent)" : "var(--muted)", borderWidth: 2, borderStyle: "solid", backgroundColor: "transparent" }}
        >
          {isGenerating ? (
            <Loader2 size={18} className="animate-spin" style={{ color: "var(--muted)" }} />
          ) : isPlaying ? (
            <Pause size={18} style={{ color: "var(--accent)" }} />
          ) : (
            <Play size={18} style={{ color: "var(--accent)" }} />
          )}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium truncate">
              {chapterTitle}
            </span>
            <span className="text-xs ml-2 flex-shrink-0" style={{ color: "var(--muted)" }}>
              {isGenerating && !isReady ? "准备中..." : formatDuration(currentTimeMs)}
            </span>
          </div>

          {/* Scene timeline replaces old progress bar */}
          {scenes.length > 0 && (
            <div className="mt-1.5">
              <SceneTimeline
                scenes={scenes}
                currentIndex={currentSceneIdx}
                totalCount={totalScenes || scenes.length}
                generatedCount={generatedScenes || 0}
                onSceneClick={onSceneClick || (() => {})}
              />
            </div>
          )}

          <div className="flex items-center justify-between mt-1">
            <span className="text-xs" style={{ color: "var(--muted)" }}>
              第{chapterIdx + 1}/{totalChapters}章
            </span>
            {isGenerating && (
              <span className="text-xs" style={{ color: "var(--accent)" }}>
                生成中...
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={onPrevChapter} className="p-1.5" style={{ color: "var(--muted)" }}>
            <SkipBack size={16} />
          </button>
          <button onClick={onNextChapter} className="p-1.5" style={{ color: "var(--muted)" }}>
            <SkipForward size={16} />
          </button>
        </div>

        <select value={speed} onChange={(e) => onSpeedChange(Number(e.target.value))}
          className="text-xs px-1.5 py-0.5 rounded flex-shrink-0 ml-1"
          style={{ backgroundColor: "var(--glass-bg)", color: "var(--muted)", borderColor: "var(--border)" }}
        >
          <option value={0.75}>0.75x</option>
          <option value={1}>1x</option>
          <option value={1.25}>1.25x</option>
          <option value={1.5}>1.5x</option>
          <option value={2}>2x</option>
        </select>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 验证编译**

```bash
cd /Users/piggy/MiReadDS && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
cd /Users/piggy/MiReadDS && git add src/components/PlayerBar.tsx && git commit -m "$(cat <<'EOF'
feat: integrate SceneTimeline into PlayerBar, remove fake progress bar

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: ImportPage 进度面板

**Files:**
- Modify: `src/app/import/page.tsx`

**变更点：**
- 导入后不跳转，原地展示预处理进度
- 轮询 `/api/books/progress?bookId=N` 获取音频生成进度
- 前 5 段就绪后显示"开始阅读"按钮
- 支持"返回书架"

- [ ] **Step 1: 重写 ImportPage**

```typescript
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
```

- [ ] **Step 2: 验证编译**

```bash
cd /Users/piggy/MiReadDS && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
cd /Users/piggy/MiReadDS && git add src/app/import/page.tsx && git commit -m "$(cat <<'EOF'
feat: import page with pre-processing progress and ready state

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: BookCard 音频进度

**Files:**
- Modify: `src/components/BookCard.tsx`

**变更点：** 增加音频生成进度条（当音频尚未全部生成时显示）。

- [ ] **Step 1: 更新 BookCard props 和 UI**

```typescript
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
```

- [ ] **Step 2: 更新 BookshelfPage 传参**

修改 `src/app/page.tsx`，Book 接口和 BookCard 调用处增加 `audioReadyScenes` 和 `audioTotalScenes`。

找 `src/app/page.tsx` 约第 7 行的 interface Book，增加字段：

```typescript
interface Book {
  id: number;
  title: string;
  author: string | null;
  cover_color: string;
  chapter_count: number;
  character_count: number;
  progress_chapter: number | null;
  audio_ready_scenes?: number;
  audio_total_scenes?: number;
}
```

然后在 BookCard 调用处（约第 71 行）增加 props：

```typescript
<BookCard
  key={book.id}
  id={book.id}
  title={book.title}
  author={book.author}
  cover_color={book.cover_color}
  chapterCount={book.chapter_count || 0}
  characterCount={book.character_count || 0}
  progressPercent={
    book.progress_chapter != null && book.chapter_count > 0
      ? Math.round((book.progress_chapter / (book.chapter_count - 1)) * 100)
      : 0
  }
  audioReadyScenes={book.audio_ready_scenes || 0}
  audioTotalScenes={book.audio_total_scenes || 0}
/>
```

- [ ] **Step 3: 验证编译**

```bash
cd /Users/piggy/MiReadDS && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 4: Commit**

```bash
cd /Users/piggy/MiReadDS && git add src/components/BookCard.tsx src/app/page.tsx && git commit -m "$(cat <<'EOF'
feat: show audio generation progress on BookCard and bookshelf

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: ReaderPage 适配新流程

**Files:**
- Modify: `src/app/read/[bookId]/page.tsx`

**变更点：**
- `handleSeek` 改为场景级跳转
- 向 PlayerBar 传递场景时间线数据
- 去掉第 1 章的长时间轮询（前 5 段已预生成）
- 保留后台 manifest 刷新（获取新生成的场景）

- [ ] **Step 1: 更新 ReaderPage**

需要改动以下几处：

**a) handleSeek 改为接收场景 index：**

找到 `handleSeek` 函数（约第 307 行），改为直接接受场景 index：

```typescript
const handleSceneClick = (sceneIdx: number) => {
  if (!manifest || sceneIdx >= manifest.scenes.length) return;
  setCurrentSceneIdx(sceneIdx);
  setSceneTimeMs(0);
  setTimeout(() => playScene(sceneIdx, 0), 0);
};
```

**b) 构建 SceneDot 数组传给 PlayerBar：**

在 `manifest` 存在时，构建场景点数据：

```typescript
// Derive scene dots from manifest
const sceneDots = manifest ? manifest.scenes.map((s: SceneInfo, i: number) => {
  let status: "played" | "current" | "ready" | "generating" | "waiting" = "waiting";
  if (i < currentSceneIdx) status = "played";
  else if (i === currentSceneIdx) status = "current";
  else if (s.path) status = "ready";
  // If manifest is still being built and scenes beyond generated count are waiting
  else if (i < (manifest.generated_scenes || 0)) status = "generating";
  else status = "waiting";
  return { index: i, status };
}) : [];
```

**c) 更新 PlayerBar 调用（约第 363 行）：**

移除 `genProgress`、`positionPercent`、`onSeek`、`currentTimeMs`、`durationMs`，增加场景时间线 props：

```typescript
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
  totalScenes={manifest?.scenes?.length || 0}
  generatedScenes={manifest?.generated_scenes || 0}
  onSceneClick={handleSceneClick}
/>
```

**d) handleSeek 改为场景 index 调用：**

`handleSeek` 函数现在接受场景 index，要更新函数签名和内部逻辑。但要注意 `playScene` 还需要 `startMs` 参数（用于断点续播）。保留 handleSeek 但当从 SceneTimeline 点击时，从第 0ms 开始播放。

**e) 移除 genProgress state 和相关显示：**

`genProgress` state 可以保留（仍用于 polling 日志），但不再传给 PlayerBar。

- [ ] **Step 2: 验证编译**

```bash
cd /Users/piggy/MiReadDS && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 3: Commit**

```bash
cd /Users/piggy/MiReadDS && git add src/app/read/[bookId]/page.tsx && git commit -m "$(cat <<'EOF'
feat: adapt ReaderPage to use SceneTimeline with scene-level seek

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: 后台生成优先级队列 (services.ts)

**Files:**
- Modify: `src/lib/services.ts`

**变更点：**
- 新增简单的内存优先级队列
- 导入时触发第 1 章生成 + 后续章节后台队列
- 播放时确保领先用户 10 段

- [ ] **Step 1: 在 services.ts 中添加生成队列**

在文件末尾添加：

```typescript
// ============================================================
// Background generation queue
// ============================================================

interface GenTask {
  chapterId: number;
  priority: number; // 0 = highest (P0 urgent), 3 = lowest (P3 idle)
}

const genQueue: GenTask[] = [];
let genRunning = false;
const GEN_CONCURRENCY = 5;

function enqueueGen(chapterId: number, priority: number) {
  // Don't enqueue if already in queue or already generating/done
  const existing = genQueue.find((t) => t.chapterId === chapterId);
  if (existing) {
    if (priority < existing.priority) existing.priority = priority;
    return;
  }
  
  const status = getChapterAudioStatus(chapterId);
  if (status.status === "generating") return;
  
  // For 'ready' status, check if all scenes are done
  if (status.status === "ready" && status.sceneManifest) {
    const allDone = (status.sceneManifest.generated_scenes || 0) >= (status.sceneManifest.total_scenes || 0);
    if (allDone) return; // fully generated, skip
  }

  genQueue.push({ chapterId, priority });
  genQueue.sort((a, b) => a.priority - b.priority);
  processQueue();
}

async function processQueue() {
  if (genRunning) return;
  genRunning = true;
  
  while (genQueue.length > 0) {
    const task = genQueue.shift()!;
    try {
      await generateChapterAudio(task.chapterId);
    } catch (e) {
      console.error(`Queue generation failed for chapter ${task.chapterId}:`, e);
    }
  }
  
  genRunning = false;
}

/** Called from import — prepare chapter 1 and enqueue chapter 2,3 */
export function bootstrapBookAudio(bookId: number) {
  const db = getDb();
  const chapters = db.prepare(
    "SELECT id FROM chapters WHERE book_id = ? ORDER BY \"index\" LIMIT 4"
  ).all(bookId) as { id: number }[];

  if (chapters.length === 0) return;

  // Chapter 1: generate synchronously with P0 priority (urgent)
  enqueueGen(chapters[0].id, 0);

  // Chapters 2-4: background P3 (low priority, idle)
  for (let i = 1; i < chapters.length; i++) {
    enqueueGen(chapters[i].id, 3);
  }
}

/** Called when user playback reaches > 50% of current chapter — pre-generate next */
export function ensureNextChapterReady(bookId: number, currentChapterIdx: number) {
  const db = getDb();
  const nextChapter = db.prepare(
    "SELECT id FROM chapters WHERE book_id = ? AND \"index\" = ?"
  ).get(bookId, currentChapterIdx + 1) as { id: number } | undefined;

  if (nextChapter) {
    const status = getChapterAudioStatus(nextChapter.id);
    if (status.status === "pending") {
      enqueueGen(nextChapter.id, 2); // P2
    }
  }
}

/** P0: urgent single scene generation (when user skips to ungenerated scene) */
export async function ensureSceneReady(chapterId: number, sceneIndex: number): Promise<string | null> {
  const status = getChapterAudioStatus(chapterId);
  if (status.sceneManifest?.scenes?.[sceneIndex]?.path) {
    return status.sceneManifest.scenes[sceneIndex].path;
  }
  
  // Trigger generation at highest priority
  enqueueGen(chapterId, 0);
  
  // Wait up to 30s for the scene
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const s = getChapterAudioStatus(chapterId);
    if (s.sceneManifest?.scenes?.[sceneIndex]?.path) {
      return s.sceneManifest.scenes[sceneIndex].path;
    }
  }
  
  return null;
}
```

- [ ] **Step 2: 修改 importBook，调用 bootstrapBookAudio**

在 `importBook()` 函数末尾（`scanCharacters` 那行之后），添加：

```typescript
  // Bootstrap audio generation for first chapters
  bootstrapBookAudio(bookId);
```

- [ ] **Step 3: 验证编译**

```bash
cd /Users/piggy/MiReadDS && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 4: Commit**

```bash
cd /Users/piggy/MiReadDS && git add src/lib/services.ts && git commit -m "$(cat <<'EOF'
feat: add background generation queue with priority levels

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: 端到端验证

**Files:** 无新建，验证所有改动协同工作。

- [ ] **Step 1: 启动开发服务器**

```bash
cd /Users/piggy/MiReadDS && npm run dev &
sleep 5
```

- [ ] **Step 2: 验证书架页加载**

```bash
curl -s http://localhost:3000/api/books | head -c 200
```

预期：返回 JSON 数组（可能为空），包含 `audio_ready_scenes`、`audio_total_scenes` 字段。

- [ ] **Step 3: 构建检查**

```bash
cd /Users/piggy/MiReadDS && npx tsc --noEmit 2>&1
```

预期：无类型错误。

- [ ] **Step 4: 手动检查清单**

- [ ] 书架页 `/` 正常加载，BookCard 显示音频进度（如有书籍）
- [ ] 导入页 `/import` 正常加载
- [ ] 阅读页 `/read/[bookId]` 正常加载，SceneTimeline 渲染
- [ ] 旧进度条已移除，PlayerBar 使用场景点导航

- [ ] **Step 5: Commit（如有修复）**

```bash
cd /Users/piggy/MiReadDS && git add -A && git commit -m "$(cat <<'EOF'
fix: end-to-end verification fixes for streaming TTS

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```
