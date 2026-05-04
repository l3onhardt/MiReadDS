# Reader UI Redesign — 阅读播放器前端重构

## 目标

解决桌面端布局浪费、段落时间线不可用、播放高亮不显眼三个核心 UX 问题，移除无用的角色面板。

## 设计决策

| 决策点 | 选择 |
|---|---|
| 时间线方案 | 分组柱状图 + 悬停展开（音频波形编辑器风格） |
| 段落高亮 | 左侧光条 + 卡片浮起阴影 + 呼吸动画（三者结合） |
| 页面布局 | 双栏：左70%正文+播放器，右30%可折叠面板 |
| 角色面板 | 移除 |
| 快进方式 | 正文区域拖拽手势（水平拖动 → 时间跳转） |

---

## 架构变更

### 文件改动清单

| 文件 | 操作 | 说明 |
|---|---|---|
| `src/components/SceneTimeline.tsx` | 重写 | 分组柱状图 + 悬停展开 + 滚轮缩放 |
| `src/components/ReadingContent.tsx` | 重写 | 综合高亮 + drag-to-seek |
| `src/components/PlayerBar.tsx` | 微调 | 适应新 timeline 接口 |
| `src/components/CharacterPanel.tsx` | 删除 | 功能合并到右侧面板 |
| `src/components/RightPanel.tsx` | 新增 | 章节列表 + 段落分组导航 |
| `src/app/read/[bookId]/page.tsx` | 修改 | 新布局 + drag-to-seek 状态管理 |

### 组件树

```
ReaderPage
├── Header（返回 + 书名 + 章节列表按钮）
├── TwoColumnLayout
│   ├── Left (70%)
│   │   ├── PlayerBar
│   │   │   └── SceneTimeline（重写：分组柱状图）
│   │   ├── ReadingContent（重写：高亮 + drag）
│   │   └── ChapterNav（上一章/下一章）
│   └── Right (30%)
│       └── RightPanel（章节列表 + 段落分组导航）
└── <audio> (hidden)
```

---

## 组件规格

### 1. SceneTimeline（重写）

**Props：**
```ts
interface SceneTimelineProps {
  scenes: SceneDot[];          // 所有段落状态
  currentIndex: number;        // 当前段落索引
  totalCount: number;          // 总段数
  generatedCount: number;      // 已生成数
  onSceneClick: (index: number) => void;
  durationMs?: number;         // 新增：总时长用于计算位置
  onTimelineSeek?: (positionMs: number) => void;  // 新增：拖动时间线跳转（绝对位置ms）
}
```

**行为：**
- 默认将 scenes 按 ~30 段/组分组合并显示为柱状条
- 柱高反映该组段数（或平均时长），提供视觉密度感
- 当前分组高亮 + `box-shadow` 发光 + 上方浮动标签 `段 247`
- **悬停分组**：弹出浮层展示该组内每个段落的独立 dot（可精确点击）
- **滚轮缩放**：`wheel` 事件调整 groupSize（15/30/60），min 15 max 60
- **拖动**：mousedown/mousemove/mouseup 在时间线上拖动，计算位置比例触发 onSeek
- **自动跟随**：`currentIndex` 变化时 scrollIntoView 当前分组
- **颜色映射**：played=灰色半透明, current=主题色+发光, ready=深色, generating=虚线+脉冲, waiting=浅色低透明
- 顶部显示 "段 N / Total" 和 "已生成 N/Total"
- 分组粒度默认 30 段/组，localStorage 记住用户偏好

**浮层 tooltip 展开行为：**
- hover 分组柱 200ms 后显示 tooltip
- tooltip 内该组的 dots 以网格排列（每行 10 个）
- 点击具体 dot 触发 onSceneClick
- 鼠标移出 tooltip 或分组柱后 300ms 关闭

### 2. ReadingContent（重写）

**Props：**
```ts
interface ReadingContentProps {
  content: string;             // 完整章节文本
  currentSceneText: string | null;  // 当前播放段落文本
  isPlaying: boolean;
  audioStatus: string;
  currentTimeMs?: number;      // 新增：当前播放位置
  durationMs?: number;         // 新增：总时长
  onTextSeek?: (positionMs: number) => void;  // 新增：拖动跳转（绝对位置ms，组件内部 offset→absolute 转换）
}
```

**高亮样式（综合方案 D）：**
- `border-left: 4px solid var(--accent)` — 左侧光条
- `box-shadow: 0 2px 12px var(--glass-border)` — 卡片浮起
- `transform: scale(1.01)` — 微放大
- `border-radius: 8px` — 圆角
- 播放时：`@keyframes breathe` 呼吸动画（background opacity 0.06 ↔ 0.12, 2s 周期）
- 暂停时：呼吸动画暂停，高亮保持静态
- 非当前段落：`opacity: 0.5`
- 自动滚动到当前段落（`scrollIntoView({ behavior: "smooth", block: "center" })`）

**Drag-to-seek 手势：**
- `mousedown` / `touchstart` 在正文容器上记录起始位置
- `mousemove` / `touchmove` 计算水平位移
- 位移映射为绝对位置：`newPos = clamp(currentTimeMs + (deltaX / containerWidth) * durationMs * sensitivityFactor, 0, durationMs)`，然后调用 `onTextSeek(newPos)`
- 敏感度：快速拖动时系数 ×2（根据速度自适应）
- 拖动时显示浮动指示器：
  ```
  ▸▸ 快进 +15s
  ◂◂ 快退 -30s
  ```
- 指示器位置跟随鼠标/手指
- 每 50px 水平位移触发一次 onSeek 回调（防抖）
- `mouseup` / `touchend` 结束拖动，可选触发最终 seek
- 移动端同样支持（touch 事件）
- 点击（无拖动）行为不变

### 3. RightPanel（新增）

**Props：**
```ts
interface RightPanelProps {
  chapters: ChapterInfo[];       // 章节列表
  currentChapterIdx: number;
  onChapterSelect: (idx: number) => void;
  scenes: SceneDot[];           // 段落状态
  currentSceneIdx: number;
  onSceneClick: (index: number) => void;
  groupSize: number;            // 当前分组粒度
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}
```

**章节列表区域：**
- 显示所有章节标题，当前章节高亮
- 点击跳转章节
- 可折叠/展开

**段落导航区域：**
- 按 groupSize 分组显示段落范围（如 "段 1-30"）
- 当前分组高亮
- 点击分组标签跳转到该组第一段
- 滚动列表跟随当前播放位置

**通用：**
- sticky 定位，跟随滚动
- 响应式：桌面端显示为右侧面板，移动端隐藏（或底部抽屉）
- 每个区域可独立折叠

### 4. PlayerBar（微调）

- 移除旧的 SceneTimeline 调用方式
- 传递新的 props（durationMs、onSeek）
- 其余播放控制逻辑不变

### 5. CharacterPanel

- 删除整个文件和目录引用
- page.tsx 中移除 import 和渲染
- 移动端底部角色按钮也一并移除

---

## 页面布局

### 桌面端（lg+）
```
┌──────────────────────────────────────────────┐
│  ← MiReader              书名 · 第37章  设置  │
├───────────────────────┬──────────────────────┤
│  70%                  │  30%                 │
│  ┌──────────────────┐ │  ┌────────────────┐  │
│  │  PlayerBar       │ │  │ 📖 章节列表    │  │
│  │  ▶ 第37章 12:34  │ │  │  34章 炼丹大会  │  │
│  │  ▊▊▊▋▋██▌▌▃▃▃▃  │ │  │  35章 神秘来客  │  │
│  │  段 247 / 837    │ │  │  36章 突破前夕  │  │
│  └──────────────────┘ │  │▶ 37章 修炼之路  │  │
│                       │  │  38章 药老苏醒  │  │
│  ┌──────────────────┐ │  └────────────────┘  │
│  │  正文内容        │ │                      │
│  │  已播段落(dim)   │ │  ┌────────────────┐  │
│  │▌ 当前播放段落    │ │  │ 📍 段落导航    │  │
│  │  (浮起+呼吸)     │ │  │  段 1-30       │  │
│  │  未播段落(dim)   │ │  │  段 31-60      │  │
│  │                  │ │  │▶ 段 241-270    │  │
│  │  ← 拖动快进 →   │ │  │  段 271-300    │  │
│  └──────────────────┘ │  └────────────────┘  │
│                       │                      │
│  ← 上一章  37/1648  →│                      │
├───────────────────────┴──────────────────────┤
└──────────────────────────────────────────────┘
```

### 移动端（<lg）
- 右面板隐藏，通过底部按钮或汉堡菜单调出
- 正文占满宽度
- 时间线组件压缩为更紧凑的样式
- 拖拽手势仍然可用

### 容器宽度
- `max-w-6xl`（约 72rem / 1152px）替换当前 `max-w-4xl`
- 正文区域在左栏内保持 `max-w-[680px]` 阅读舒适宽度

---

## 数据流

所有状态管理仍在 `page.tsx` 中：
- `currentSceneIdx`、`sceneTimeMs`、`totalTimeMs` — 播放位置
- `manifest` — 段落信息
- 新增：`groupSize` state（时间线分组粒度，默认 30，localStorage 持久化）
- 新增：`handleDragSeek(offsetMs: number)` — 拖动跳转回调，计算 `clamp(totalTimeMs + offsetMs, 0, durationMs)` 后调用 `handleSeek`
- ReadingContent 内部将拖拽位移转为 offsetMs，调用 `onTextSeek(absoluteMs)`

SceneTimeline 通过 `onTimelineSeek(absoluteMs)` 跳转，ReadingContent 通过 `onTextSeek(absoluteMs)` 跳转，两者均调用 `handleSeek`。

---

## 向后兼容

- 不涉及 API 变更
- 不涉及数据库 schema 变更
- localStorage 新增 `timeline-group-size` key
- 旧 CSS 变量保持不变
