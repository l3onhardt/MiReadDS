# MiReader 设计文档

## 概述

MiReader 是一个网页端小说同步朗读应用，核心使用小米 MiMo TTS 模型实现多角色有声朗读。用户导入小说文件后，LLM 自动分析角色和对话归属，为每个角色匹配合适音色，实现有感情的、角色一致的朗读体验。

**定位：** 个人自用工具
**平台：** Web 优先（桌面端 + 移动端响应式），后续可移植 Android/iOS
**核心模型：** 小米 MiMo-V2.5-TTS（语音合成）+ 小米 MiMo-V2-Pro（文本分析）

## 技术栈

- **前端：** Next.js 14+ (App Router) + React 18 + TailwindCSS
- **后端：** Next.js API Routes（代理 + 业务逻辑）
- **数据库：** SQLite via better-sqlite3（仅支持自托管 Node.js 部署，不支持 Vercel 等 Serverless 平台。使用 globalThis 单例模式避免 Next.js 热重载导致的多实例问题）
- **部署目标：** 自托管 Node.js 服务器 / NAS / 本地运行
- **TTS：** 小米 MiMo-V2.5-TTS（预设音色，200+）
- **LLM 分析：** 小米 MiMo-V2-Pro（小说角色识别与对话标注）
- **文件解析：** txt 原生分割 + epub 解析库
- **样式方案：** TailwindCSS + 自定义 Liquid Glass 组件（毛玻璃材质）

## 视觉风格

- **设计语言：** Apple Kit 风格，克制、安静
- **主题：** 双模式
  - 暖白纸质感（浅色）：暖色调底色，衬线字体，模拟实体书阅读体验
  - 深灰暗室感（深色）：深灰背景，暖金对话标记，夜间阅读友好
  - 跟随系统自动切换，也可手动选择
- **配色：**
  - 浅色：背景 #f5f0e8，正文 #3d3426，对话 #8c6b4a，点缀 #5c4d3c
  - 深色：背景 #1c1c1e，正文 #c8c8cc，对话 #d4a574，点缀 #a8a8ab
- **字体：** 正文衬线（Georgia / 思源宋体），UI 无衬线（系统默认）
- **图标：** 通过 CDN 引入（Lucide Icons）


## 架构

```
Next.js 全栈应用
├── 前端 (React)
│   ├── 书架页 — 书籍卡片网格
│   ├── 阅读器页 — 同步朗读主界面
│   ├── 导入页 — 拖拽上传 TXT/EPUB
│   ├── 角色管理页 — 角色列表 + 音色预览
│   └── 设置页 — API Key / 缓存 / 主题
│
├── API Routes (代理层)
│   ├── /api/analyze  → MiMo Pro   (角色分析 + 对话标注)
│   ├── /api/tts      → MiMo TTS   (语音合成 + 缓存代理)
│   └── /api/books    → 书籍 CRUD
│
├── 服务层
│   ├── tts-service   — TTS 调用 + 缓存管理
│   ├── analyze-service — LLM 调用 + 角色/分段逻辑
│   └── book-service  — 导入解析 + 章节管理
│
└── SQLite 数据库
    ├── books / chapters / characters / character_voices
    ├── chapter_segments / audio_cache
    └── reading_progress / settings
```

## API 契约

### MiMo API 参考
- **平台地址：** https://platform.xiaomimimo.com
- **API Base：** `https://api.xiaomimimo.com/v1`
- **认证：** Header `api-key`（控制台获取）
- **详细文档：** https://platform.xiaomimimo.com/#/docs/usage-guide/speech-synthesis

### /api/analyze — 角色分析
调用 MiMo-V2-Pro Chat Completions，输入采样文本，输出结构化 JSON 角色列表和分段标注。

### /api/tts — 语音合成
调用 MiMo-V2.5-TTS Chat Completions，`audio.format = "mp3"`，`audio.voice` 指定预设音色 ID。响应中 `choices[0].message.audio.data` 为 base64 编码音频。

### MiMo Pro 上下文窗口
1M tokens，单章通常 4K-15K tokens，远在窗口内。极端长章（>50K tokens）分块处理：按段落群切分，独立标注，合并去重。


## 数据模型

> 所有表均定义 UNIQUE 约束和索引，确保数据完整性。

### books
| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PK | |
| title | TEXT | NOT NULL | 书名 |
| author | TEXT | | 作者 |
| format | TEXT | NOT NULL | txt / epub |
| file_path | TEXT | UNIQUE, NOT NULL | 文件存储路径 `./data/books/{id}/original.{ext}` |
| cover_color | TEXT | | 书架展示色（从预设暖色调色板随机选取） |
| created_at | DATETIME | DEFAULT NOW | |
| updated_at | DATETIME | DEFAULT NOW | |

**索引：** `UNIQUE(file_path)`, `INDEX(created_at)`

### chapters
| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PK | |
| book_id | INTEGER | FK → books(id), NOT NULL | |
| index | INTEGER | NOT NULL | 章节序号 |
| title | TEXT | | 章节标题 |
| content | TEXT | NOT NULL | 原始文本 |
| word_count | INTEGER | | 字数 |
| analysis_status | TEXT | DEFAULT 'pending' | pending / analyzing / done |
| created_at | DATETIME | DEFAULT NOW | |

**索引：** `UNIQUE(book_id, index)`, `INDEX(book_id)`, `INDEX(analysis_status)`

### characters
| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PK | |
| book_id | INTEGER | FK → books(id), NOT NULL | |
| name | TEXT | NOT NULL | 角色名 |
| aliases | TEXT | | 别名列表，JSON 数组，如 `["黛玉","林妹妹"]` |
| gender | TEXT | | 男 / 女 / 未知 |
| age_range | TEXT | | 儿童 / 青年 / 中年 / 老年 |
| personality | TEXT | | 性格描述（如"清冷倔强"） |
| role_type | TEXT | | main / supporting / background |
| created_at | DATETIME | DEFAULT NOW | |

**索引：** `UNIQUE(book_id, name)`, `INDEX(book_id)`

### character_voices（一对一：每个角色只有一个音色）
| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PK | |
| character_id | INTEGER | FK → characters(id), UNIQUE, NOT NULL | 一个角色一个音色 |
| mimo_voice_id | TEXT | NOT NULL | MiMo 预设音色 ID |
| voice_name | TEXT | | 音色名称 |
| selected_at | DATETIME | DEFAULT NOW | 音色分配时间 |
| created_at | DATETIME | DEFAULT NOW | |

**索引：** `UNIQUE(character_id)`, `INDEX(mimo_voice_id)`

### chapter_segments
| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PK | |
| chapter_id | INTEGER | FK → chapters(id), NOT NULL | |
| segment_index | INTEGER | NOT NULL | 段落序号 |
| type | TEXT | NOT NULL | narration / dialogue |
| character_id | INTEGER | FK → characters(id) | 说话角色（narration 为 NULL） |
| text | TEXT | NOT NULL | 段落文本 |
| emotion | TEXT | | MiMo 风格标签（如"轻声 略带疲惫"） |
| created_at | DATETIME | DEFAULT NOW | |

**索引：** `UNIQUE(chapter_id, segment_index)`, `INDEX(chapter_id)`, `INDEX(character_id)`

### audio_cache
| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PK | |
| chapter_id | INTEGER | FK → chapters(id), NOT NULL | |
| segment_index | INTEGER | NOT NULL | 对应段落序号 |
| audio_path | TEXT | NOT NULL | 本地 mp3 文件路径 `./data/audio/{book_id}/{chapter_id}_{segment}.mp3` |
| format | TEXT | DEFAULT 'mp3' | mp3（128kbps） |
| duration_ms | INTEGER | | 音频时长 |
| size_bytes | INTEGER | | 文件大小 |
| created_at | DATETIME | DEFAULT NOW | |

**索引：** `UNIQUE(chapter_id, segment_index)`, `INDEX(chapter_id)`

### reading_progress
| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PK | |
| book_id | INTEGER | FK → books(id), UNIQUE, NOT NULL | 每本书一条进度 |
| chapter_index | INTEGER | | 当前章节 |
| segment_index | INTEGER | | 当前段落位置 |
| updated_at | DATETIME | DEFAULT NOW | |

**索引：** `UNIQUE(book_id)`

### settings
| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PK | |
| key | TEXT | UNIQUE, NOT NULL | 配置键 |
| value | TEXT | NOT NULL | 配置值（敏感值如 API Key 用 AES 加密存储） |
| updated_at | DATETIME | DEFAULT NOW | |

**索引：** `UNIQUE(key)`


## 核心流程

### 1. 导入小说
1. 用户拖拽或选择 TXT/EPUB 文件
2. 前端上传到 `/api/books/import`
3. 后端解析：
   - **编码检测：** 使用 `jschardet` 自动检测文件编码（GBK/UTF-8/Big5），统一转为 UTF-8
   - **TXT 章节分割：** 按优先级匹配章节标题正则，`splitIntoChapters()`：
     - `/^第[零一二三四五六七八九十百千万\d]+[章节回卷]/` — "第一章"、"第3章"
     - `/^(楔子|序章|序言|前言|引子|尾声|终章|后记|番外)/`
     - 无匹配时：按 5000 字/段自动分块，块标题 "第N段"
   - **EPUB：** 使用 `epub` 库，按 spine 目录结构解析章节
4. 写入 books 表 + chapters 表，文件存 `./data/books/{book_id}/`
5. 自动触发角色扫描

### 2. 角色分析（混合模式）
**第一阶段 — 快速扫描（导入时）：**
- 从全书均匀采样文本片段（每 5000 字取 500 字，最多 20 个样本）发给 MiMo Pro
- LLM 输出角色列表：姓名、性别、年龄、性格、角色类型
- 自动合并别名（如"林黛玉"与"黛玉"、"林妹妹" 合并为同一角色），存入 characters.aliases
- 存入 characters 表
- 自动从预设音色库匹配 voice_id → character_voices

**第二阶段 — 逐章标注（阅读时）：**
- 首次打开某章，发章节文本 + 角色名列表给 MiMo Pro
- 长章处理：超过 30K 字符的章节按段落群切分（每 200 段一组），独立标注，合并结果
- LLM 输出每段标注：type(narration/dialogue) + character + emotion
- 存入 chapter_segments 表
- 后续阅读直接读取，不再调 LLM

**LLM 输出格式约束：**

角色扫描输出（JSON）：
```json
{
  "characters": [
    {
      "name": "林婉儿",
      "aliases": ["婉儿"],
      "gender": "女",
      "age_range": "青年",
      "personality": "清冷倔强，外冷内热",
      "role_type": "main"
    }
  ]
}
```

逐章标注输出（JSON）：
```json
{
  "segments": [
    { "type": "narration", "text": "夜色渐深..." },
    { "type": "dialogue", "character": "林婉儿", "text": "师傅，我回来了。", "emotion": "轻声 略带疲惫" },
    { "type": "dialogue", "character": "陈师傅", "text": "进来吧，茶还热着。", "emotion": "沉稳 温和" }
  ]
}
```

> emotion 值使用 MiMo 支持的风格标签词汇，如：开心、悲伤、生气、轻声、急促、疲惫、温和、严肃、耳语、惊讶等。

### 3. 同步朗读
1. 用户打开某章 → 读取 chapter_segments
2. 按段落顺序：
   - narration → 默认叙述音色 + 文本情绪标签
   - dialogue → 对应角色音色 + emotion 标签
3. TTS 调用策略：
   - 当前段落：流式生成即时播放
   - 缓存命中：直接用本地音频
   - 后续段落：后台预生成并缓存
4. 播放时文字同步高亮当前段落
5. 角色指示器实时显示"当前谁在说话"

### 4. TTS 缓存策略
- 缓存键：chapter_id + segment_index（`audio_cache` UNIQUE 约束保证不重复）
- 音频格式统一 mp3（128kbps），约 1MB/分钟
- 一本 50 万字小说（约 40 小时朗读）缓存约 2.4GB
- 单本书缓存上限 3GB（可配置），覆盖绝大多数长篇。超过自动清理最旧缓存
- 缓存持久化到本地文件系统 `./data/audio/`

### 5. 阅读进度恢复
- 每次跳转段落/章节时自动保存进度
- 下次打开书籍直接恢复到上次位置
- 重新播放时从缓存段开始，未缓存段落重新生成

### 6. 书籍删除
- `DELETE /api/books/[id]`：级联删除 chapters、characters、character_voices、chapter_segments、audio_cache、reading_progress
- 清理文件系统：`./data/books/{id}/` 和 `./data/audio/{id}/`


## 页面结构

### 书架页 (/)
- 书籍卡片网格（居中、响应式列数）
- 每张卡片：书名 + 作者 + 阅读进度条 + 角色数量标签
- "导入新书"按钮（卡片首位或浮动按钮）
- 空状态：友好的引导提示

### 阅读器页 (/read/[bookId])
- **顶部播放栏：** 章节名 + 进度条 + 播放/暂停 + 上一段/下一段 + 倍速
- **角色指示器：** 小圆点 + "XX 正在朗读"
- **正文区：** 当前段落高亮，对话文本按角色着色
- **角色面板（桌面端侧边栏 / 移动端底部 Sheet）：** 所有角色列表 + 当前说话角色突出
- **章节导航：** 底部 上一章/下一章

### 导入页 (/import)
- 拖拽上传区域（支持 TXT / EPUB）
- 上传进度提示
- 解析完成后跳转到阅读器

### 角色管理页 (/books/[bookId]/characters)
- 角色列表 + 当前音色名称
- 音色预览播放
- 手动更换音色（可选）

### 设置页 (/settings)
- MiMo API Key 配置
- 缓存总览（占用空间 + 清理按钮）
- 主题切换（浅色/深色/跟随系统）
- 关于


## 移动端适配要点

- 阅读器播放栏收窄高度
- 角色面板从侧边栏 → 底部 Sheet
- 正文字号和行距针对小屏优化
- 触摸手势：左右滑动切换章节
- 书架卡片网格：桌面 4 列 → 平板 3 列 → 手机 2 列
- **已知限制：** Web 端锁屏后音频可能停止（浏览器限制）。v1 接受此限制，后续原生 App 解决。


## 错误处理

- TTS 调用失败：静默重试 2 次，失败则跳过当前段落继续播下一段
- LLM 分析失败：提示用户重试，已分析的数据不丢失
- 文件解析失败：提示格式不支持或文件损坏
- 缓存磁盘满：自动清理旧缓存
- 网络断开：已缓存段落正常播放，未缓存段落跳过


## 未纳入范围

以下功能此版本不做：
- 用户系统 / 登录注册
- 多设备云同步
- 音色设计（VoiceDesign）— 预留扩展点
- 音色克隆（VoiceClone）— 预留扩展点
- PDF 格式支持
- 离线 PWA
- 国际化
