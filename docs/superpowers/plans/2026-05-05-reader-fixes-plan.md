# Reader Bug 修复实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复阅读器三个严重 UX bug:段落高亮定位错位、正文滑动手势抢占点击、多浮动元素打架。

**Architecture:** 纯前端修复。引入 `sceneToPara` 索引映射(running-cursor `indexOf`)替代 `content.indexOf` 一次性查找;用段落左侧 20px gutter 点击替代正文整体拖动手势;移除内嵌滚动让页面单一滚动。

**Tech Stack:** Next.js 14 / React 18 / TypeScript / Tailwind。无后端/DB 改动。无测试框架(项目无现存 test infra,用一次性 node 脚本验证纯函数,UI 手动验证)。

**关联 spec:** `docs/superpowers/specs/2026-05-05-reader-fixes-design.md`

---

## 文件变更总览

| 文件 | 操作 | 说明 |
|---|---|---|
| `src/lib/sceneParaMap.ts` | **新建** | 纯函数 `buildSceneToPara` + `splitParagraphs`,无 React 依赖,可独立测 |
| `src/components/ReadingContent.tsx` | **重写大部分** | 删拖动/指示器/内嵌滚动;改用 paragraphs + currentParaIdx props;每段加左 gutter |
| `src/components/RightPanel.tsx` | **修改** | 段落分组按钮 → 段落跳转列表;props 简化 |
| `src/app/read/[bookId]/page.tsx` | **修改** | 加 `paragraphs`/`sceneToPara` useMemo;`handleParagraphSeek`;子组件 props 适配;删 `currentTimeMs/durationMs` 给 ReadingContent 那行 |
| `src/components/PlayerBar.tsx` | 不动 | — |
| `src/components/SceneTimeline.tsx` | 不动 | — |

---

## Task 1: 新建 `sceneToPara` 映射纯函数

**Files:**
- Create: `src/lib/sceneParaMap.ts`
- Create (one-off): `scripts/test-scene-para-map.mjs` — 用完即删

**Why this task first:** 这是后续所有改动的基础数据结构,先建好并验证正确性,再改 UI。

- [ ] **Step 1: 写 `src/lib/sceneParaMap.ts`**

```ts
/**
 * 把章节内容按 \n+ 拆段,过滤掉空白段。
 * 与后端 services.ts:330 splitTextIntoScenes 中的拆段规则保持一致,
 * 保证前后端段落数对齐。
 */
export function splitParagraphs(content: string): string[] {
  return content.split(/\n+/).filter((p) => p.trim().length > 0);
}

/**
 * 建立 sceneIdx → paragraphIdx 的映射表。
 *
 * 后端 splitTextIntoScenes 把每段按 ≤500 字 → 1 个 scene、
 * >500 字 → 按句号切分多个 scene。所以 scenes 与 paragraphs 顺序一致,
 * 且每段对应连续若干个 scene。
 *
 * 用 running cursor 的 indexOf,可以正确处理:
 *   - 同一文本片段在章节内重复出现
 *   - 长段被拆成多 scene 时,后续 scene 的起点也能精确定位
 *
 * 找不到精确匹配时,降级用当前 cursor — 段索引仍单调前进,不卡死。
 */
export function buildSceneToPara(
  content: string,
  scenes: { text: string }[],
  paragraphs: string[]
): number[] {
  // 1. 算每段在 content 中的起始下标
  const paraStarts: number[] = [];
  let cursor = 0;
  for (const p of paragraphs) {
    const idx = content.indexOf(p, cursor);
    const start = idx >= 0 ? idx : cursor;
    paraStarts.push(start);
    cursor = start + p.length;
  }

  // 2. 顺序扫 scenes,每个 scene 落在哪段
  const map: number[] = [];
  cursor = 0;
  let pIdx = 0;
  for (const s of scenes) {
    const t = s.text.trim();
    let start = content.indexOf(t, cursor);
    if (start < 0) start = cursor;
    while (pIdx < paragraphs.length - 1 && start >= paraStarts[pIdx + 1]) {
      pIdx++;
    }
    map.push(pIdx);
    cursor = start + t.length;
  }
  return map;
}
```

- [ ] **Step 2: 写一次性验证脚本 `scripts/test-scene-para-map.mjs`**

```js
// 一次性验证脚本,跑完删除。覆盖三种 bug 场景。
import { splitParagraphs, buildSceneToPara } from "../src/lib/sceneParaMap.ts";

// 因为 .ts 不能直接 import,改用复制粘贴函数体的方式或用 tsx。
// 简单起见,直接复制函数到这里测:
function splitParagraphsLocal(content) {
  return content.split(/\n+/).filter((p) => p.trim().length > 0);
}
function buildSceneToParaLocal(content, scenes, paragraphs) {
  const paraStarts = [];
  let cursor = 0;
  for (const p of paragraphs) {
    const idx = content.indexOf(p, cursor);
    const start = idx >= 0 ? idx : cursor;
    paraStarts.push(start);
    cursor = start + p.length;
  }
  const map = [];
  cursor = 0;
  let pIdx = 0;
  for (const s of scenes) {
    const t = s.text.trim();
    let start = content.indexOf(t, cursor);
    if (start < 0) start = cursor;
    while (pIdx < paragraphs.length - 1 && start >= paraStarts[pIdx + 1]) pIdx++;
    map.push(pIdx);
    cursor = start + t.length;
  }
  return map;
}

function assertEq(actual, expected, name) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    console.error(`FAIL ${name}\n  expected: ${e}\n  actual:   ${a}`);
    process.exit(1);
  }
  console.log(`PASS ${name}`);
}

// Case 1: 短段每段 1 个 scene
{
  const content = "段一文字\n段二文字\n段三文字";
  const paragraphs = splitParagraphsLocal(content);
  const scenes = paragraphs.map((p) => ({ text: p }));
  assertEq(buildSceneToParaLocal(content, scenes, paragraphs), [0, 1, 2], "短段 1:1 映射");
}

// Case 2: 重复台词不再错位
{
  const content = '"嗯。"他说。\n"嗯。"她回。\n他叹了口气。';
  const paragraphs = splitParagraphsLocal(content);
  // 模拟 scenes 顺序生成,每段一个
  const scenes = paragraphs.map((p) => ({ text: p }));
  assertEq(buildSceneToParaLocal(content, scenes, paragraphs), [0, 1, 2], "重复台词无错位");
}

// Case 3: 长段拆成多 scene,后续 scene 仍指回同一段
{
  const longPara = "句一。".repeat(60) + "句二。".repeat(60); // 远大于 500 字
  const content = "前段。\n" + longPara + "\n后段。";
  const paragraphs = splitParagraphsLocal(content);
  // 模拟后端把长段切成两个 scene
  const halfPoint = Math.floor(longPara.length / 2);
  const scenes = [
    { text: "前段。" },
    { text: longPara.slice(0, halfPoint) },
    { text: longPara.slice(halfPoint) },
    { text: "后段。" },
  ];
  assertEq(buildSceneToParaLocal(content, scenes, paragraphs), [0, 1, 1, 2], "长段多 scene 映射回同段");
}

// Case 4: scene.text 找不到精确匹配,降级仍前进不卡死
{
  const content = "段一\n段二\n段三";
  const paragraphs = splitParagraphsLocal(content);
  const scenes = [{ text: "段一" }, { text: "不存在文本" }, { text: "段三" }];
  const result = buildSceneToParaLocal(content, scenes, paragraphs);
  // 第二个 scene 找不到,cursor 仍前进,pIdx 单调
  if (result[0] !== 0 || result[2] < result[1]) {
    console.error(`FAIL 降级测试: ${JSON.stringify(result)}`);
    process.exit(1);
  }
  console.log(`PASS 降级测试: ${JSON.stringify(result)}`);
}

console.log("\n所有 case 通过。");
```

- [ ] **Step 3: 运行验证脚本**

Run: `node scripts/test-scene-para-map.mjs`

Expected output:
```
PASS 短段 1:1 映射
PASS 重复台词无错位
PASS 长段多 scene 映射回同段
PASS 降级测试: [0,?,?]

所有 case 通过。
```

如果失败:对照失败 case 调整 `buildSceneToPara` 实现。

- [ ] **Step 4: 删除一次性脚本**

```bash
rm scripts/test-scene-para-map.mjs
# 如果 scripts 目录之前没有,把目录也删
rmdir scripts 2>/dev/null || true
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/sceneParaMap.ts
git commit -m "feat(reader): add scene→paragraph mapping helper

Pure function with running-cursor indexOf to correctly handle:
- duplicate text in chapter (e.g., repeated dialogue)
- long paragraphs split into multiple scenes by backend
- graceful fallback when scene text doesn't match exactly

Validated with throwaway scripts/test-scene-para-map.mjs covering
4 cases including the two regression scenarios."
```

---

## Task 2: 改 `page.tsx` 准备新数据流

**Files:**
- Modify: `src/app/read/[bookId]/page.tsx`

**目标:** 加 `paragraphs` / `sceneToPara` / `currentParaIdx` 到 page 状态,加 `handleParagraphSeek`。先不改子组件,这一步只让数据准备好。

- [ ] **Step 1: 加 import**

文件顶部 import 区:

```ts
import { splitParagraphs, buildSceneToPara } from "@/lib/sceneParaMap";
```

- [ ] **Step 2: 加 useMemo 计算 paragraphs / sceneToPara / currentParaIdx**

在 `currentChapter` 那行(约第 69 行)的下方,插入:

```ts
// Derive paragraphs and sceneIdx → paragraphIdx mapping for precise highlight & jump.
const paragraphs = useMemo(
  () => (currentChapter?.content ? splitParagraphs(currentChapter.content) : []),
  [currentChapter?.content]
);

const sceneToPara = useMemo(() => {
  if (!currentChapter?.content || !manifest?.scenes) return [];
  return buildSceneToPara(currentChapter.content, manifest.scenes, paragraphs);
}, [currentChapter?.content, manifest?.scenes, paragraphs]);

const currentParaIdx = sceneToPara[currentSceneIdx] ?? -1;
```

- [ ] **Step 3: 加 `handleParagraphSeek`**

在现有 `handleSceneClick` 下面(约第 358 行后)插入:

```ts
const handleParagraphSeek = useCallback(
  (paraIdx: number) => {
    if (!manifest || sceneToPara.length === 0) return;
    const firstSceneIdx = sceneToPara.findIndex((p) => p === paraIdx);
    if (firstSceneIdx < 0) return; // 防御:理论上 paragraphs 与 scenes 一一对齐
    setCurrentSceneIdx(firstSceneIdx);
    setSceneTimeMs(0);
    setTimeout(() => playScene(firstSceneIdx, 0), 0);
  },
  [manifest, sceneToPara, playScene]
);
```

- [ ] **Step 4: 暂不改子组件 props,只检查 TS 编译**

Run: `npx tsc --noEmit`

Expected: 编译通过(子组件接口暂未变,新加的变量未使用是 warning 不是 error,可忽略)。

如果报错:看是不是 import 路径不对,或 useMemo 依赖项写错。

- [ ] **Step 5: Commit**

```bash
git add src/app/read/[bookId]/page.tsx
git commit -m "feat(reader): compute sceneToPara mapping in page state

Add paragraphs/sceneToPara/currentParaIdx via useMemo, and
handleParagraphSeek callback. Children still consume old props;
next commits will switch them over."
```

---

## Task 3: 重写 `ReadingContent.tsx`(核心改动)

**Files:**
- Modify: `src/components/ReadingContent.tsx`

**目标:** 删掉所有拖动逻辑;改用新 props;每段渲染左 gutter;单一页面滚动。

这是改动最大的文件。把现有 200 行替换成新实现。

- [ ] **Step 1: 替换整个 `ReadingContent.tsx` 内容**

```tsx
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
```

- [ ] **Step 2: 检查 TS 编译**

Run: `npx tsc --noEmit`

Expected: ReadingContent 自身编译通过。`page.tsx` 会报错,因为它还在传旧 props — 这是预期的,Task 4 修复。

- [ ] **Step 3: 暂不 commit,等 Task 4 一起改完再 commit**

进入 Task 4。

---

## Task 4: 改 `page.tsx` 调用 ReadingContent 的新 props + 加 Tailwind group 支持

**Files:**
- Modify: `src/app/read/[bookId]/page.tsx`

- [ ] **Step 1: 替换 `<ReadingContent ... />` 调用**

找到现有(约第 425 行起):

```tsx
<ReadingContent
  content={currentChapter?.content || ""}
  currentSceneText={currentSceneText}
  isPlaying={isPlaying}
  audioStatus={audioStatus}
  currentTimeMs={totalTimeMs}
  durationMs={totalDurationMs}
  onTextSeek={handleSeek}
/>
```

替换为:

```tsx
<ReadingContent
  paragraphs={paragraphs}
  currentParaIdx={currentParaIdx}
  isPlaying={isPlaying}
  audioStatus={audioStatus}
  onParagraphSeek={handleParagraphSeek}
/>
```

- [ ] **Step 2: 删除现在不再使用的本地变量(避免 lint 噪音)**

往上翻到约第 370 行:

```ts
const currentSceneText = manifest?.scenes?.[currentSceneIdx]?.text || null;
```

整行删除 — `ReadingContent` 不再需要它。

**注意保留的变量(后面 PlayerBar 还在用,不要误删):**
- `handleSeek` — PlayerBar 的 `onTimelineSeek`
- `sceneDots` — PlayerBar 的 `scenes` prop
- `groupSize` / `handleGroupSizeChange` — PlayerBar 的时间轴分组
- `handleSceneClick` — PlayerBar 时间轴 dot 点击

- [ ] **Step 3: 编译检查**

Run: `npx tsc --noEmit`

Expected: 编译通过。

- [ ] **Step 4: 启动 dev server 视觉验证**

Run: `npm run dev`

打开 `http://localhost:3000/read/<某个 bookId>`,进入一个有音频的章节:
- [ ] 段落左侧能看到细竖线
- [ ] 鼠标悬停某段时,左侧细线变成 ▶ 三角
- [ ] 点击 ▶ 跳转到该段播放
- [ ] 当前播放段左侧是粗实心彩条 + 呼吸光晕
- [ ] 文字本身可以正常选中、复制(无拖动手势抢占)
- [ ] 页面只有一个滚动条(浏览器顶层),正文不再有内嵌滚动

如果有任何一项没通过,定位问题、调整、重测,直到全过。

- [ ] **Step 5: Commit Task 3 + 4 一起**

```bash
git add src/components/ReadingContent.tsx src/app/read/[bookId]/page.tsx
git commit -m "feat(reader): replace drag-to-seek with paragraph gutter click

Rewrite ReadingContent: remove pointer drag handlers, drag indicator,
fixed-position drag tooltip, and the inner overflow-y-auto scroll
container. Each paragraph now has a 20px left gutter that:
- shows a thin vertical line by default
- shows a ▶ triangle on hover
- shows a thick colored bar with breathe animation when active
- on click, calls onParagraphSeek to start playback from that paragraph

Page-level scroll is now the single scroll container; PlayerBar sticky
behavior is preserved. Text body has no gesture handlers — selection,
scrolling, and tapping all work natively.

Active paragraph auto-scrolls into view via scrollIntoView keyed on
currentParaIdx (was currentSceneText) for stable, O(1) tracking.

Note: rc-breathe keyframes simplified from background-color flicker
to opacity pulse, applied to both the gutter bar and the paragraph
text for a unified visual effect."
```

---

## Task 5: 改 `RightPanel.tsx`(段落分组 → 段落跳转列表)

**Files:**
- Modify: `src/components/RightPanel.tsx`

- [ ] **Step 1: 替换整个 RightPanel 内容**

```tsx
"use client";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useState, useRef, useEffect } from "react";

interface ChapterInfo {
  id: number;
  index: number;
  title: string | null;
}

interface RightPanelProps {
  chapters: ChapterInfo[];
  currentChapterIdx: number;
  onChapterSelect: (idx: number) => void;
  paragraphs: string[];
  currentParaIdx: number;
  onParagraphSelect: (paraIdx: number) => void;
}

export function RightPanel({
  chapters,
  currentChapterIdx,
  onChapterSelect,
  paragraphs,
  currentParaIdx,
  onParagraphSelect,
}: RightPanelProps) {
  const [chaptersOpen, setChaptersOpen] = useState(true);
  const [paragraphsOpen, setParagraphsOpen] = useState(true);

  // Auto-scroll active paragraph row into view
  const activeRowRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (activeRowRef.current && paragraphsOpen) {
      activeRowRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [currentParaIdx, paragraphsOpen]);

  return (
    <div className="w-full">
      <div className="glass p-3 sticky top-20 space-y-3">
        {/* Chapter list */}
        <div>
          <button
            onClick={() => setChaptersOpen(!chaptersOpen)}
            className="flex items-center gap-1 w-full text-left mb-2"
          >
            {chaptersOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <span className="text-xs font-medium" style={{ color: "var(--muted)" }}>
              章节列表
            </span>
          </button>
          {chaptersOpen && (
            <div className="max-h-[30vh] overflow-y-auto space-y-0.5">
              {chapters.map((ch, i) => (
                <button
                  key={ch.id}
                  onClick={() => onChapterSelect(i)}
                  className="block w-full text-left px-2 py-1.5 rounded text-xs truncate transition-colors"
                  style={{
                    backgroundColor: i === currentChapterIdx ? "var(--glass-bg)" : "transparent",
                    color: i === currentChapterIdx ? "var(--accent)" : "var(--muted)",
                    fontWeight: i === currentChapterIdx ? 600 : 400,
                  }}
                >
                  {ch.title || `第${i + 1}章`}
                </button>
              ))}
            </div>
          )}
        </div>

        <hr style={{ borderColor: "var(--glass-border)" }} />

        {/* Paragraph jump list */}
        <div>
          <button
            onClick={() => setParagraphsOpen(!paragraphsOpen)}
            className="flex items-center gap-1 w-full text-left mb-2"
          >
            {paragraphsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <span className="text-xs font-medium" style={{ color: "var(--muted)" }}>
              段落跳转
            </span>
            <span className="text-xs ml-auto" style={{ color: "var(--muted)" }}>
              {paragraphs.length}段
            </span>
          </button>
          {paragraphsOpen && (
            <div className="max-h-[40vh] overflow-y-auto space-y-0.5">
              {paragraphs.map((p, i) => {
                const isCurrent = i === currentParaIdx;
                const preview = p.length > 30 ? p.slice(0, 30) + "…" : p;
                return (
                  <button
                    key={i}
                    ref={isCurrent ? activeRowRef : undefined}
                    onClick={() => onParagraphSelect(i)}
                    className="block w-full text-left px-2 py-1.5 rounded text-xs transition-colors"
                    style={{
                      backgroundColor: isCurrent ? "var(--glass-bg)" : "transparent",
                      color: isCurrent ? "var(--accent)" : "var(--muted)",
                      fontWeight: isCurrent ? 600 : 400,
                    }}
                  >
                    <span className="inline-block w-7 opacity-60">{i + 1}.</span>
                    <span className="truncate inline-block max-w-[calc(100%-2rem)] align-middle">
                      {preview}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 改 `page.tsx` 中的 `<RightPanel ... />` 调用**

找到现有(约第 449 行起):

```tsx
<RightPanel
  chapters={(book.chapters || []).map((ch: any) => ({ id: ch.id, index: ch.index, title: ch.title }))}
  currentChapterIdx={currentChapterIdx}
  onChapterSelect={goToChapter}
  scenes={sceneDots}
  currentSceneIdx={currentSceneIdx}
  onSceneClick={handleSceneClick}
  groupSize={groupSize}
/>
```

替换为:

```tsx
<RightPanel
  chapters={(book.chapters || []).map((ch: any) => ({ id: ch.id, index: ch.index, title: ch.title }))}
  currentChapterIdx={currentChapterIdx}
  onChapterSelect={goToChapter}
  paragraphs={paragraphs}
  currentParaIdx={currentParaIdx}
  onParagraphSelect={handleParagraphSeek}
/>
```

- [ ] **Step 3: 编译 + dev server 验证**

```bash
npx tsc --noEmit
npm run dev
```

进入阅读页面,大屏(>=1024px)验证:
- [ ] 右侧栏顶部是「章节列表」可折叠
- [ ] 中间分隔线下是「段落跳转」可折叠
- [ ] 段落列表每行显示「序号 + 前 30 字预览」
- [ ] 当前播放段那行有高亮(主题色 + 加粗)
- [ ] 点击段落列表中某段,正文跳转、PlayerBar 时间轴位置同步
- [ ] 播放过程中右栏当前段自动滚到列表中间
- [ ] 右侧栏不再有时间轴/分组柱状图

- [ ] **Step 4: Commit**

```bash
git add src/components/RightPanel.tsx src/app/read/[bookId]/page.tsx
git commit -m "feat(reader): replace right-panel scene groups with paragraph jump list

Drop the duplicate scene-group nav (the same 'group by N' UI already
lives in PlayerBar's SceneTimeline). Right panel now shows a flat
paragraph list — number + 30-char preview — with the active row
highlighted and auto-scrolled into view. Click any row to seek to
that paragraph via the same handleParagraphSeek as the gutter."
```

---

## Task 6: 完整回归测试(对照 spec 测试清单)

**Files:** 无(纯手动验证)

- [ ] **Step 1: 跑 dev server,挑一个有长段、有重复台词的章节**

```bash
npm run dev
```

最好选一个有对话密集场景的章节(常出现"嗯""好""他说""她说"等重复)。

- [ ] **Step 2: 逐项对照 spec 测试清单**

参考 `docs/superpowers/specs/2026-05-05-reader-fixes-design.md` 末尾的「测试要点」:

- [ ] 长段(>500字)被切成多 scene 时,播放过程中高亮正确跟随当前 scene 所属段
- [ ] 重复台词("嗯""好"等)所在段落不会被错误高亮
- [ ] 桌面端 hover 段落 gutter 显示 ▶,点击跳转
- [ ] 移动端触摸段落 gutter 显示 ▶,松开跳转;触摸文字区域可正常选词、可正常滚动
- [ ] 文字区域不再触发任何快进/快退手势
- [ ] PlayerBar 进度条拖动仍然工作
- [ ] 单一页面滚动:页面滚到底正文也滚到底,PlayerBar 始终浮在顶部
- [ ] 当前播放段进入视口外时页面平滑滚动让其居中
- [ ] 右侧栏不再显示重复的时间轴/分组柱状图;显示段落跳转列表
- [ ] 右侧栏点击某段跳转后,正文 gutter 高亮、PlayerBar 时间轴位置同步更新
- [ ] 右侧栏段落列表的当前段自动滚动到可视区中间
- [ ] 切换章节后 `sceneToPara` 映射重新计算,新章节首段正确识别

移动端验证可以用 Chrome DevTools 设备模拟器(F12 → Toggle device toolbar)。

- [ ] **Step 3: 任何一项不通过 → 回到对应 Task 修,重测**

不要带着已知问题进入下一步。

- [ ] **Step 4: 全过后建一个总结 commit(如有 polish 改动)**

如果回归测试有微调,合并提交:

```bash
git add -A
git commit -m "chore(reader): polish from regression test

[列出实际改动]"
```

无改动则跳过。

---

## 完成标准

全部满足:

1. `node scripts/test-scene-para-map.mjs` 在 Task 1 验证时全过(脚本本身已删,只在 Task 1 中临时跑)
2. `npx tsc --noEmit` 整个项目编译无错误
3. spec 测试清单 12 项全过
4. git log 看到 Task 1 / Task 2 / Task 3+4 / Task 5 / (可选 Task 6) 的清晰提交历史

---

## 不在本计划范围内(对照 spec)

- 后端 `splitTextIntoScenes` 改动
- PlayerBar / SceneTimeline 改动
- 添加测试框架(jest/vitest)
- 数据库或 API 改动
- 移动端右栏抽屉(现有 `lg:hidden` 章节浮层够用)
