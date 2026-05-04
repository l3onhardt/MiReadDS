# Reader 关键 Bug 修复 — 段落定位、跳转交互、布局打架

## 背景

`2026-05-04-reader-ui-redesign.md` 实现的二次重构上线后,实际使用暴露三个严重问题:

1. **段落高亮定位错位**:当前段落方块经常停在错的段落,长段尤其严重。
2. **正文滑动手势抢占点击**:整个正文区绑了 pointer 拖拽,导致选词、点击、滚动都不稳定。
3. **多个浮动元素互相打架**:正文内嵌滚动 + 外层页面滚动 + sticky 播放器 + sticky 右栏 + 飞屏拖动指示器,视觉混乱。

本文档定义这三个问题的修复方案。

---

## 设计决策

| 决策点 | 选择 |
|---|---|
| 段落跳转交互 | 段落左侧"播放轴"(20px gutter) — hover/触摸显 ▶,点击轴跳转,文本不响应手势 |
| 段落定位映射 | 前端 `useMemo` 一次性建立 `sceneIdx → paragraphIdx` 映射,running cursor `indexOf` |
| 滚动模式 | 单一页面滚动 — 正文不再开内嵌 `overflow-y-auto`,PlayerBar 保持 `sticky` |
| 正文拖动快进 | **完全移除** — 拖动只在 PlayerBar 进度条上(已实现) |
| 拖动指示器(飞屏) | 完全移除 |
| 右栏时间轴 | 完全移除 — 时间轴只在 PlayerBar 出现一次,右栏只保留章节列表 + 段落跳转列表 |

---

## 问题 ① — 段落定位错位

### 根因

`ReadingContent.tsx:113-127` 用 `content.indexOf(currentSceneText.trim())` 找当前段落:

```ts
const pos = content.indexOf(currentSceneText.trim());  // 只找第一次出现
```

而后端 `services.ts:327-361` 的 `splitTextIntoScenes`:

- 段落 ≤500 字 → 1 个 scene
- 段落 >500 字 → 按句号切成 N 个 scene

因此:

- **长段被切成多个 scene 后**:除第一个 scene 外,后续 scene 的 `text` 都不是段首,`indexOf` 找到的位置可能落在文本中间或别的地方。
- **同样台词反复出现时**(如人物对白"嗯""好"),`indexOf` 永远返回首次位置,跟当前播放段对不上。

### 修法

加载 manifest 时一次性算出 `sceneToPara: number[]`,后续渲染只查表:

```ts
function buildSceneToPara(
  content: string,
  scenes: { text: string }[],
  paragraphs: string[]
): number[] {
  // 1. 算每段在 content 中的起始下标(running cursor 防重复)
  const paraStarts: number[] = [];
  let cursor = 0;
  for (const p of paragraphs) {
    const idx = content.indexOf(p, cursor);
    paraStarts.push(idx >= 0 ? idx : cursor);
    cursor = (idx >= 0 ? idx : cursor) + p.length;
  }

  // 2. 顺序扫 scene,running cursor 找它在 content 中的起点
  const map: number[] = [];
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
```

**为什么有效:**

- 用 running cursor + 第二参数版的 `indexOf`,任意一段文本(段或 scene)的搜索起点都从前一段之后开始,不会被前面的重复文本"卡住"。
- scenes 与 paragraphs 都是按顺序生成的,`pIdx` 单调不回退,只前进。
- 找不到精确匹配时降级用 `cursor`,保证 `pIdx` 仍然向前推进,不会卡死。

放在 `useMemo([content, scenes])` 中,只在章节切换或 manifest 变化时重算。

---

## 问题 ② — 段落跳转交互(替换滑动手势)

### 根因

`ReadingContent.tsx:54-100,130-137` 在整个正文容器上绑了 `onPointerDown/Move/Up`,只要 `Math.abs(deltaX) > 5px` 就视为拖动并 throttled `onTextSeek`。后果:

- 用户想点击/双击段落选段听 → 几乎一定触发拖动
- 用户想长按选词 → 也触发
- 移动端纵向滚动有时也会被误判为快进
- 飞屏的 `dragIndicator` 用 `position: fixed` 跟手指,视觉糟糕

### 修法 — 段落左侧"播放轴"(Gutter Click)

每段的 DOM 结构改为两列:

```
┌──┬─────────────────────────────────────┐
│ ▎│ 段落正文文字...........             │
└──┴─────────────────────────────────────┘
  ↑                ↑
  20px gutter      文字区,正常选区/滚动,不响应手势
  鼠标 hover/触摸 -> 显 ▶
  click -> 跳转该段第一个 scene
```

#### Gutter 视觉规则

| 状态 | gutter |
|---|---|
| 普通段(非当前) | `width: 20px`,内含 1px 浅灰竖线居中 |
| 当前播放段 | 4px 实心彩色竖条,带呼吸光晕(沿用现有 `rc-breathe`) |
| Hover/触摸激活 | 显示 14px ▶ 三角图标(主题色),光标 pointer |
| Hover 当前段 | 已是当前段不显 ▶,显 ⏵⏵(跳到下一段)? — 暂不实现,保持简洁 |

#### 触发逻辑

- gutter 单击 → `onParagraphSeek(paraIdx)` → 上层把 paraIdx 转 sceneIdx (该段第一个 scene),调用 `playScene(sceneIdx, 0)`
- 文字区无任何手势绑定 — 选区、滚动、点字皆原生

#### Props 变更

```ts
// 旧
interface ReadingContentProps {
  ...
  currentTimeMs?: number;
  durationMs?: number;
  onTextSeek?: (positionMs: number) => void;  // 删除
}

// 新
interface ReadingContentProps {
  paragraphs: string[];                          // 由 page.tsx 拆好传入
  currentParaIdx: number;                        // 由 page.tsx 通过 sceneToPara[currentSceneIdx] 算出
  isPlaying: boolean;
  audioStatus: string;
  onParagraphSeek: (paraIdx: number) => void;    // 替换 onTextSeek
}
```

`ReadingContent` 不再持有 `content` 或 `scenes` — 段落拆分和 scene→para 映射都在 `page.tsx` 完成,`ReadingContent` 只负责渲染段落列表和 gutter 交互,保持单一职责。

`page.tsx` 配套实现:

```ts
const handleParagraphSeek = useCallback((paraIdx: number) => {
  if (!manifest) return;
  // 找该段第一个 scene
  const firstSceneIdx = sceneToPara.findIndex((p) => p === paraIdx);
  if (firstSceneIdx < 0) return;  // 该段没生成任何 scene(理论上不会,防御性返回)
  setCurrentSceneIdx(firstSceneIdx);
  setSceneTimeMs(0);
  setTimeout(() => playScene(firstSceneIdx, 0), 0);
}, [manifest, sceneToPara, playScene]);
```

**关于"无 scene 段落"的处理:** 后端 `splitTextIntoScenes` 在过滤 `p.trim().length > 0` 后才生成 scene,前端 `paragraphs` 用同样的过滤,因此在数据正确情况下每段至少对应 1 个 scene。`findIndex < 0` 是防御性保护,正常路径不会触发。`RightPanel` 段落列表显示所有 paragraphs,点击后走同一 seek 路径,`< 0` 时安静 no-op,不显示错误。

#### 移动端

- 触摸段落时,`:active` 状态下 gutter 立即显 ▶(无延迟,无需 hover)
- 触摸抬起若仍在 gutter 范围内则触发跳转;若移动超过 10px 则取消(认为是滚动)
- `touch-action: manipulation` 在 gutter 上,禁掉移动浏览器的双击缩放
- 文字区域 `touch-action: pan-y` 保证正常滚动

---

## 问题 ③ — 页面打架

### 三个具体改动

#### A. 删掉正文内嵌滚动

`ReadingContent.tsx:145` 现在是:

```html
<div className="leading-relaxed md:leading-loose space-y-3 text-[17px] max-h-[60vh] overflow-y-auto pr-2">
```

改为:

```html
<div className="leading-relaxed md:leading-loose space-y-3 text-[17px]">
```

页面变为单一滚动容器,PlayerBar `sticky top-2 z-10` 自然浮在顶部。当前段进入视口外时,`scrollIntoView` 滚动 `<html>` 而非内嵌容器:

```ts
// 现有代码 deps: [currentSceneText, isPlaying]  — 段文本字符串变化时触发
// 改后 deps: [currentParaIdx, isPlaying]      — 段索引变化时触发,稳定且 O(1)
useEffect(() => {
  if (activeRef.current && isPlaying) {
    activeRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}, [currentParaIdx, isPlaying]);
```

#### B. 删除拖动快进 + 飞屏指示器

`ReadingContent.tsx` 中删除:

- `dragState` ref
- `dragIndicator` state
- `handlePointerDown/Move/Up`
- 容器上的 `onPointer*` 事件绑定
- `<div>` 拖动指示器渲染
- 底部 "← 拖动正文快进/快退 →" 提示
- `currentTimeMs/durationMs/onTextSeek` props

PlayerBar 上的进度条拖动 (`SceneTimeline.tsx:108-135`) 保持不变 — 那是合理的。

#### C. 右栏精简

`RightPanel.tsx:80-112` 现在的"段落导航"用 `groupSize` 分组,展示 "段 1-30 / 段 31-60",这与 `PlayerBar` 内 `SceneTimeline` 的分组柱状图功能完全重复,且占双倍空间。

改为:**段落跳转列表**(每段一行,显示段号 + 前 30 字预览):

```
📍 段落跳转 (837 段)
  1.  这是第一段的前三十个字符......
  2.  对话内容也是显示前三十个字...
▶ 3.  当前段高亮 + 自动滚到中间
  4.  ...
```

新 `RightPanel` 接口:

```ts
interface RightPanelProps {
  chapters: ChapterInfo[];
  currentChapterIdx: number;
  onChapterSelect: (idx: number) => void;

  // 新:段落数组(替代 scenes + groupSize)
  paragraphs: string[];
  currentParaIdx: number;
  onParagraphSelect: (paraIdx: number) => void;
}
```

注意:跳转用 paragraphIdx,不再用 sceneIdx,与正文交互一致。

#### D. groupSize 状态去向

`groupSize` 仍在 `page.tsx` 维护,只传给 `PlayerBar`/`SceneTimeline`(它们仍需要分组显示)。`RightPanel` 不再需要。

---

## 文件改动清单

| 文件 | 操作 | 说明 |
|---|---|---|
| `src/components/ReadingContent.tsx` | 重写 | 删拖动/指示器/内嵌滚动;改用 `currentParaIdx + onParagraphSeek`;每段加 gutter |
| `src/components/RightPanel.tsx` | 修改 | 段落分组 → 段落跳转列表;props 简化 |
| `src/app/read/[bookId]/page.tsx` | 修改 | 加 `sceneToPara` useMemo;新 `handleParagraphSeek`;`paragraphs` 拆分上提;ReadingContent/RightPanel props 适配 |
| `src/components/PlayerBar.tsx` | 不动 | — |
| `src/components/SceneTimeline.tsx` | 不动 | — |
| 后端 / DB / API | 不动 | 完全前端修复,不涉及 schema 或 API |

---

## 数据流变更

```
page.tsx
  ├── manifest (from API)
  ├── currentSceneIdx (state)
  │
  ├── paragraphs = useMemo(() => content.split(/\n+/).filter(...), [content])
  ├── sceneToPara = useMemo(() => buildSceneToPara(content, manifest.scenes, paragraphs), [content, manifest])
  ├── currentParaIdx = sceneToPara[currentSceneIdx] ?? -1
  │
  ├──> ReadingContent: { paragraphs, currentParaIdx, isPlaying, audioStatus, onParagraphSeek }
  ├──> RightPanel:     { chapters, currentChapterIdx, paragraphs, currentParaIdx, onParagraphSelect }
  └──> PlayerBar:      { ...timeline props 不变 }

handleParagraphSeek(paraIdx):
  firstSceneIdx = sceneToPara.findIndex(p => p === paraIdx)
  setCurrentSceneIdx(firstSceneIdx)
  playScene(firstSceneIdx, 0)
```

---

## 测试要点

手动验证清单:

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
- [ ] 切换章节后 `sceneToPara` 映射重新计算,新章节首段正确识别(回归原 bug 主要发生场景)

---

## 不在本次范围内

- 后端 scene 切分逻辑改动 — 现有规则正确,不动
- 时间轴样式调整 — `2026-05-04-reader-ui-redesign.md` 已定,本轮只修 bug
- 移动端右侧栏抽屉 — 现有 `lg:hidden` 的章节列表浮层够用
- 多人物语音 — 与本次问题无关
