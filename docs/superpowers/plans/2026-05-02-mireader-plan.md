# MiReader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build MiReader — a web-based synchronized novel reading app with multi-character AI voice narration using Xiaomi MiMo TTS.

**Architecture:** Next.js 14+ App Router full-stack app. SQLite via better-sqlite3 for persistence (self-hosted Node.js only). MiMo API calls proxied through API Routes. Frontend uses TailwindCSS with Apple Kit-inspired warm paper / dark reading room dual themes. Liquid Glass (backdrop-blur) UI components.

**Tech Stack:** Next.js 14, React 18, TypeScript, TailwindCSS, better-sqlite3, jschardet, epub (parse), lucide-react icons

**Spec:** `docs/superpowers/specs/2026-05-02-mireader-design.md`

---

## File Map

```
mi-reader/
├── package.json
├── tsconfig.json
├── next.config.js
├── tailwind.config.ts
├── postcss.config.js
├── .gitignore
├── data/                          # gitignored runtime data
│   ├── mi-reader.db               # SQLite database
│   ├── books/                     # imported book files
│   └── audio/                     # TTS cache mp3 files
├── src/
│   ├── lib/
│   │   ├── db.ts                  # SQLite singleton + schema init + CRUD helpers
│   │   ├── services.ts            # book import, analyze, tts services
│   │   └── utils.ts               # chapter split, encoding detect, misc helpers
│   ├── app/
│   │   ├── layout.tsx             # root layout + ThemeProvider + font loading
│   │   ├── globals.css            # Tailwind directives + theme CSS variables
│   │   ├── page.tsx               # bookshelf page (home)
│   │   ├── import/
│   │   │   └── page.tsx           # file import upload page
│   │   ├── read/
│   │   │   └── [bookId]/
│   │   │       └── page.tsx       # reader page (sync text + audio)
│   │   ├── books/
│   │   │   └── [bookId]/
│   │   │       └── characters/
│   │   │           └── page.tsx   # character + voice management
│   │   ├── settings/
│   │   │   └── page.tsx           # API key, cache, theme settings
│   │   └── api/
│   │       ├── books/
│   │       │   ├── route.ts       # GET (list all), POST (import)
│   │       │   └── [id]/
│   │       │       ├── route.ts   # GET (single book), DELETE
│   │       │       └── segments/
│   │       │           └── route.ts # GET segments by chapterId
│   │       ├── progress/
│   │       │   └── route.ts       # PUT reading progress
│   │       ├── analyze/
│   │       │   └── route.ts       # POST scan (characters) / annotate (segments)
│   │       ├── tts/
│   │       │   └── route.ts       # POST synthesize + cache
│   │       └── settings/
│   │           └── route.ts       # GET/PUT config
│   └── components/
│       ├── GlassCard.tsx          # reusable frosted card wrapper
│       ├── BookCard.tsx           # bookshelf book card
│       ├── PlayerBar.tsx          # audio playback controls
│       ├── CharacterPanel.tsx     # character sidebar/sheet (responsive)
│       ├── FileDropZone.tsx       # drag-drop upload area
│       └── ReadingContent.tsx     # text display with segment highlighting
```

---

## Phase 1: Project Foundation

### Task 1: Scaffold Next.js project

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.js`, `tailwind.config.ts`, `postcss.config.js`, `.gitignore`

- [ ] **Step 1: Initialize project**

Run: `cd C:\Users\lacr1\Desktop\MiReader && npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --no-import-alias --use-npm`
Expected: Scaffolded Next.js project in MiReader directory

- [ ] **Step 2: Install additional dependencies**

Run: `npm install better-sqlite3 jschardet epub lucide-react iconv-lite`
Run: `npm install -D @types/better-sqlite3 @types/iconv-lite`

- [ ] **Step 3: Configure tailwind.config.ts**

Replace content with:

```ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        paper: {
          bg: "#f5f0e8",
          text: "#3d3426",
          dialogue: "#8c6b4a",
          accent: "#5c4d3c",
          muted: "#b8a99a",
          border: "#e8e0d4",
        },
        ink: {
          bg: "#1c1c1e",
          text: "#c8c8cc",
          dialogue: "#d4a574",
          accent: "#a8a8ab",
          muted: "#6b6b6e",
          border: "#2c2c2e",
        },
      },
      fontFamily: {
        serif: ["Georgia", "Noto Serif SC", "serif"],
      },
    },
  },
  plugins: [],
};
export default config;
```

- [ ] **Step 4: Update .gitignore**

Add:
```
data/
!.gitkeep
```

- [ ] **Step 5: Create data directory structure**

Run: `mkdir -p data/books data/audio && touch data/books/.gitkeep data/audio/.gitkeep`

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold next.js project with deps and tailwind config"
```

---

### Task 2: Base layout and CSS theme variables

**Files:**
- Create: `src/app/globals.css`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Write globals.css**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --bg: #f5f0e8;
  --text: #3d3426;
  --dialogue: #8c6b4a;
  --accent: #5c4d3c;
  --muted: #b8a99a;
  --border: #e8e0d4;
  --glass-bg: rgba(245, 240, 232, 0.6);
  --glass-border: rgba(92, 77, 60, 0.1);
}

.dark {
  --bg: #1c1c1e;
  --text: #c8c8cc;
  --dialogue: #d4a574;
  --accent: #a8a8ab;
  --muted: #6b6b6e;
  --border: #2c2c2e;
  --glass-bg: rgba(28, 28, 30, 0.6);
  --glass-border: rgba(168, 168, 171, 0.08);
}

body {
  background-color: var(--bg);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

.text-serif {
  font-family: Georgia, "Noto Serif SC", serif;
}

.glass {
  background: var(--glass-bg);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid var(--glass-border);
  border-radius: 14px;
}
```

- [ ] **Step 2: Write layout.tsx**

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MiReader",
  description: "沉浸式有声小说朗读",
};

function ThemeScript() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `
          (function() {
            var theme = localStorage.getItem('mireader-theme');
            if (theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
              document.documentElement.classList.add('dark');
            }
          })();
        `,
      }}
    />
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </head>
      <body className="min-h-screen antialiased">
        <ThemeScript />
        <main className="mx-auto max-w-4xl px-4 py-6 md:px-6 md:py-8">
          {children}
        </main>
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Verify dev server starts**

Run: `npm run dev`
Expected: dev server starts, blank page at localhost:3000 with proper bg color

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add base layout with dual theme CSS variables and glass utility"
```

---

### Task 3: Database layer

**Files:**
- Create: `src/lib/db.ts`

- [ ] **Step 1: Write db.ts with singleton and schema**

```ts
import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "data", "mi-reader.db");

declare global {
  // eslint-disable-next-line no-var
  var __db: Database.Database | undefined;
}

function getDb(): Database.Database {
  if (globalThis.__db) return globalThis.__db;

  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  initSchema(db);
  globalThis.__db = db;
  return db;
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS books (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      author TEXT,
      format TEXT NOT NULL CHECK(format IN ('txt', 'epub')),
      file_path TEXT UNIQUE NOT NULL,
      cover_color TEXT,
      created_at DATETIME DEFAULT (datetime('now')),
      updated_at DATETIME DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_books_created ON books(created_at);

    CREATE TABLE IF NOT EXISTS chapters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
      "index" INTEGER NOT NULL,
      title TEXT,
      content TEXT NOT NULL,
      word_count INTEGER,
      analysis_status TEXT DEFAULT 'pending' CHECK(analysis_status IN ('pending','analyzing','done')),
      created_at DATETIME DEFAULT (datetime('now')),
      UNIQUE(book_id, "index")
    );
    CREATE INDEX IF NOT EXISTS idx_chapters_book ON chapters(book_id);

    CREATE TABLE IF NOT EXISTS characters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      aliases TEXT,
      gender TEXT,
      age_range TEXT,
      personality TEXT,
      role_type TEXT CHECK(role_type IN ('main','supporting','background')),
      created_at DATETIME DEFAULT (datetime('now')),
      UNIQUE(book_id, name)
    );
    CREATE INDEX IF NOT EXISTS idx_characters_book ON characters(book_id);

    CREATE TABLE IF NOT EXISTS character_voices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      character_id INTEGER UNIQUE NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      mimo_voice_id TEXT NOT NULL,
      voice_name TEXT,
      selected_at DATETIME DEFAULT (datetime('now')),
      created_at DATETIME DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS chapter_segments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chapter_id INTEGER NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
      segment_index INTEGER NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('narration','dialogue')),
      character_id INTEGER REFERENCES characters(id) ON DELETE SET NULL,
      text TEXT NOT NULL,
      emotion TEXT,
      created_at DATETIME DEFAULT (datetime('now')),
      UNIQUE(chapter_id, segment_index)
    );
    CREATE INDEX IF NOT EXISTS idx_segments_chapter ON chapter_segments(chapter_id);

    CREATE TABLE IF NOT EXISTS audio_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chapter_id INTEGER NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
      segment_index INTEGER NOT NULL,
      audio_path TEXT NOT NULL,
      format TEXT DEFAULT 'mp3',
      duration_ms INTEGER,
      size_bytes INTEGER,
      created_at DATETIME DEFAULT (datetime('now')),
      UNIQUE(chapter_id, segment_index)
    );
    CREATE INDEX IF NOT EXISTS idx_audio_chapter ON audio_cache(chapter_id);

    CREATE TABLE IF NOT EXISTS reading_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id INTEGER UNIQUE NOT NULL REFERENCES books(id) ON DELETE CASCADE,
      chapter_index INTEGER,
      segment_index INTEGER,
      updated_at DATETIME DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT (datetime('now'))
    );
  `);
}

export { getDb };
```

- [ ] **Step 2: Verify DB initializes**

Run: `node -e "const {getDb} = require('./src/lib/db'); const db = getDb(); console.log(db.prepare('SELECT name FROM sqlite_master WHERE type=\\'table\\'').all());"`
Expected: prints array of all 8 table names (books, chapters, characters, character_voices, chapter_segments, audio_cache, reading_progress, settings)

- [ ] **Step 3: Commit**

```bash
git add src/lib/db.ts
git commit -m "feat: add sqlite database layer with full schema and singleton pattern"
```

---

### Task 4: GlassCard shared component

**Files:**
- Create: `src/components/GlassCard.tsx`

- [ ] **Step 1: Write GlassCard component**

```tsx
import { cn } from "@/lib/utils";

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  as?: "div" | "section" | "article";
  onClick?: () => void;
}

export function GlassCard({ children, className, as: Tag = "div", onClick }: GlassCardProps) {
  return (
    <Tag
      className={cn(
        "glass transition-all duration-200",
        onClick && "cursor-pointer hover:scale-[1.01] active:scale-[0.99]",
        className
      )}
      onClick={onClick}
    >
      {children}
    </Tag>
  );
}
```

- [ ] **Step 2: Create cn utility stub**

Create `src/lib/utils.ts`:
```ts
export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(" ");
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/GlassCard.tsx src/lib/utils.ts
git commit -m "feat: add GlassCard component and cn utility"
```

---

## Phase 2: Book Management

### Task 5: Chapter splitting and encoding utilities

**Files:**
- Modify: `src/lib/utils.ts`

- [ ] **Step 1: Add utility functions**

Append to `src/lib/utils.ts`:

```ts
export function detectEncoding(buffer: Buffer): string {
  // Use jschardet to detect encoding
  const jschardet = require("jschardet");
  const result = jschardet.detect(buffer);
  return result.encoding || "utf-8";
}

export function splitTxtIntoChapters(text: string): { title: string; content: string }[] {
  const CHAPTER_PATTERNS = [
    /^\s*第\s*[零一二三四五六七八九十百千万\d]+\s*[章节回卷][\s\S]*?(?=^\s*第\s*[零一二三四五六七八九十百千万\d]+\s*[章节回卷]|$)/gm,
    /^\s*(楔子|序章|序言|前言|引子|尾声|终章|后记|番外)[\s\S]*?(?=^\s*第\s*[零一二三四五六七八九十百千万\d]+\s*[章节回卷]|楔子|序章|尾声|终章|后记|番外|$)/gm,
  ];

  for (const pattern of CHAPTER_PATTERNS) {
    const matches = text.match(pattern);
    if (matches && matches.length > 1) {
      return matches.map((chunk) => {
        const lines = chunk.trim().split("\n");
        const title = lines[0].trim();
        const content = lines.slice(1).join("\n").trim();
        return { title, content };
      });
    }
  }

  // Fallback: split by 5000-character blocks
  const blocks: { title: string; content: string }[] = [];
  for (let i = 0; i < text.length; i += 5000) {
    blocks.push({
      title: `第${blocks.length + 1}段`,
      content: text.slice(i, i + 5000).trim(),
    });
  }
  return blocks;
}

export function getRandomCoverColor(): string {
  const palette = [
    "#e8d5c4", "#d4c5b9", "#c9b8a8", "#e0d0c0",
    "#d9c7b8", "#ede0d4", "#c4b5a5", "#e5d5c5",
  ];
  return palette[Math.floor(Math.random() * palette.length)];
}

export function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/utils.ts
git commit -m "feat: add chapter splitting, encoding detection, and utilities"
```

---

### Task 6: Book service (import, list, delete)

**Files:**
- Create: `src/lib/services.ts`
- Create: `src/app/api/books/route.ts`
- Create: `src/app/api/books/[id]/route.ts`

- [ ] **Step 1: Write book service functions**

Write `src/lib/services.ts`:

```ts
import { getDb } from "./db";
import { splitTxtIntoChapters, detectEncoding, getRandomCoverColor } from "./utils";
import fs from "fs";
import path from "path";

export interface Book {
  id: number;
  title: string;
  author: string | null;
  format: "txt" | "epub";
  cover_color: string | null;
  created_at: string;
}

export interface Chapter {
  id: number;
  book_id: number;
  index: number;
  title: string | null;
  content: string;
  word_count: number | null;
  analysis_status: "pending" | "analyzing" | "done";
}

export async function importBook(file: File): Promise<Book> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext !== "txt" && ext !== "epub") {
    throw new Error("不支持的文件格式，请上传 TXT 或 EPUB 文件");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let text: string;
  let chapters: { title: string; content: string }[] = [];

  if (ext === "txt") {
    const encoding = detectEncoding(buffer);
    const iconv = require("iconv-lite");
    text = iconv.decode(buffer, encoding);
    chapters = splitTxtIntoChapters(text);
  } else {
    // EPUB parsing
    const epub = require("epub");
    const epubParser = new epub(buffer.toString("base64"), "/tmp");
    text = await new Promise((resolve, reject) => {
      epubParser.on("end", () => resolve(epubParser.flow.map((f: any) => f.text).join("\n\n")));
      epubParser.on("error", reject);
      epubParser.parse();
    });
    // For EPUB, keep as single chapter for simplicity; later enhance
    chapters = [{ title: file.name.replace(".epub", ""), content: text }];
    // Simple split attempt
    if (text.length > 10000) {
      chapters = splitTxtIntoChapters(text);
    }
  }

  const db = getDb();

  const book = db.prepare(
    `INSERT INTO books (title, author, format, file_path, cover_color)
     VALUES (?, ?, ?, ?, ?)`
  ).run(
    path.basename(file.name, path.extname(file.name)),
    null,
    ext,
    "", // placeholder, actual file stored in data/books
    getRandomCoverColor()
  );

  const bookId = book.lastInsertRowid as number;

  // Save original file
  const bookDir = path.join(process.cwd(), "data", "books", String(bookId));
  fs.mkdirSync(bookDir, { recursive: true });
  fs.writeFileSync(path.join(bookDir, `original.${ext}`), buffer);

  // Update file_path
  db.prepare("UPDATE books SET file_path = ? WHERE id = ?").run(
    path.join(bookDir, `original.${ext}`),
    bookId
  );

  // Insert chapters
  const insertStmt = db.prepare(
    `INSERT INTO chapters (book_id, "index", title, content, word_count)
     VALUES (?, ?, ?, ?, ?)`
  );

  const insertMany = db.transaction(
    (chapters: { title: string; content: string }[]) => {
      for (let i = 0; i < chapters.length; i++) {
        insertStmt.run(bookId, i, chapters[i].title, chapters[i].content, chapters[i].content.length);
      }
    }
  );

  insertMany(chapters);

  return db.prepare("SELECT * FROM books WHERE id = ?").get(bookId) as Book;
}

export function listBooks(): Book[] {
  const db = getDb();
  return db.prepare("SELECT * FROM books ORDER BY updated_at DESC").all() as Book[];
}

export function getBook(id: number) {
  const db = getDb();
  const book = db.prepare("SELECT * FROM books WHERE id = ?").get(id) as Book | undefined;
  if (!book) return null;
  const chapters = db.prepare(
    "SELECT * FROM chapters WHERE book_id = ? ORDER BY \"index\""
  ).all(id) as Chapter[];
  const characters = db.prepare(
    "SELECT c.*, cv.mimo_voice_id, cv.voice_name FROM characters c LEFT JOIN character_voices cv ON cv.character_id = c.id WHERE c.book_id = ?"
  ).all(id);
  const progress = db.prepare("SELECT * FROM reading_progress WHERE book_id = ?").get(id);
  return { ...book, chapters, characters, progress };
}

export function deleteBook(id: number) {
  const db = getDb();
  // SQLite CASCADE handles database cleanup
  db.prepare("DELETE FROM books WHERE id = ?").run(id);
  // Clean up files
  const bookDir = path.join(process.cwd(), "data", "books", String(id));
  const audioDir = path.join(process.cwd(), "data", "audio", String(id));
  if (fs.existsSync(bookDir)) fs.rmSync(bookDir, { recursive: true });
  if (fs.existsSync(audioDir)) fs.rmSync(audioDir, { recursive: true });
}
```

- [ ] **Step 2: Write API routes**

`src/app/api/books/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import { listBooks, importBook } from "@/lib/services";

export async function GET() {
  const books = listBooks();
  return NextResponse.json(books);
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    if (!file) return NextResponse.json({ error: "请选择文件" }, { status: 400 });
    const book = await importBook(file);
    return NextResponse.json(book, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "导入失败" }, { status: 500 });
  }
}
```

`src/app/api/books/[id]/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import { getBook, deleteBook } from "@/lib/services";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const book = getBook(Number(params.id));
  if (!book) return NextResponse.json({ error: "书籍不存在" }, { status: 404 });
  return NextResponse.json(book);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  deleteBook(Number(params.id));
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Verify API**

Run `npm run dev`, then:
- `curl http://localhost:3000/api/books` → `[]`
- Create a test txt file and `curl -F "file=@test.txt" http://localhost:3000/api/books` → returns book JSON

- [ ] **Step 4: Commit**

```bash
git add src/lib/services.ts src/app/api/books/
git commit -m "feat: add book import, list, and delete API with txt parsing"
```

---

### Task 7: Bookshelf page

**Files:**
- Create: `src/app/page.tsx`
- Create: `src/components/BookCard.tsx`

- [ ] **Step 1: Write BookCard component**

```tsx
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
}

export function BookCard({ id, title, author, cover_color, chapterCount, characterCount, progressPercent }: BookCardProps) {
  return (
    <Link href={`/read/${id}`}>
      <GlassCard className="p-4 md:p-5 h-full flex flex-col gap-3">
        {/* Cover */}
        <div
          className="aspect-[3/4] rounded-lg flex items-center justify-center"
          style={{ backgroundColor: cover_color }}
        >
          <span className="text-3xl opacity-40 select-none">📖</span>
        </div>
        {/* Info */}
        <div className="flex-1">
          <h3 className="font-medium text-sm md:text-base truncate" style={{ color: "var(--text)" }}>
            {title}
          </h3>
          {author && (
            <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
              {author}
            </p>
          )}
        </div>
        {/* Progress bar */}
        {progressPercent > 0 && (
          <div className="h-1 rounded-full" style={{ backgroundColor: "var(--border)" }}>
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${progressPercent}%`, backgroundColor: "var(--accent)" }}
            />
          </div>
        )}
        {/* Meta */}
        <div className="flex gap-3 text-xs" style={{ color: "var(--muted)" }}>
          <span>{chapterCount} 章</span>
          {characterCount > 0 && <span>{characterCount} 角色</span>}
        </div>
      </GlassCard>
    </Link>
  );
}
```

- [ ] **Step 2: Write bookshelf page**

```tsx
"use client";
import { useEffect, useState } from "react";
import { BookCard } from "@/components/BookCard";
import { Plus, BookOpen } from "lucide-react";
import Link from "next/link";

interface Book {
  id: number;
  title: string;
  author: string | null;
  cover_color: string;
  chapters: { id: number; analysis_status: string }[];
  characters: any[];
  progress: { chapter_index: number } | null;
}

export default function BookshelfPage() {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/books")
      .then((r) => r.json())
      .then((data) => { setBooks(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p style={{ color: "var(--muted)" }}>加载中...</p>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6 md:mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">书架</h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            {books.length === 0 ? "导入你的第一本小说" : `${books.length} 本书`}
          </p>
        </div>
        <Link
          href="/import"
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
          style={{ backgroundColor: "var(--accent)", color: "var(--bg)" }}
        >
          <Plus size={16} />
          <span className="hidden sm:inline">导入</span>
        </Link>
      </div>

      {/* Empty state */}
      {books.length === 0 && (
        <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4">
          <BookOpen size={48} style={{ color: "var(--muted)", opacity: 0.4 }} />
          <p style={{ color: "var(--muted)" }}>还没有书籍，点击右上角导入第一本</p>
          <Link
            href="/import"
            className="px-4 py-2 rounded-lg text-sm font-medium"
            style={{ backgroundColor: "var(--accent)", color: "var(--bg)" }}
          >
            导入小说
          </Link>
        </div>
      )}

      {/* Book grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 md:gap-5">
        {books.map((book) => (
          <BookCard
            key={book.id}
            id={book.id}
            title={book.title}
            author={book.author}
            cover_color={book.cover_color}
            chapterCount={book.chapters?.length || 0}
            characterCount={book.characters?.length || 0}
            progressPercent={
              book.progress && book.chapters
                ? Math.round((book.progress.chapter_index / (book.chapters.length - 1)) * 100)
                : 0
            }
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify page renders**

Run `npm run dev`, open `http://localhost:3000` → empty bookshelf

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx src/components/BookCard.tsx
git commit -m "feat: add bookshelf page with book cards and empty state"
```

---

### Task 8: Import page

**Files:**
- Create: `src/app/import/page.tsx`
- Create: `src/components/FileDropZone.tsx`

- [ ] **Step 1: Write FileDropZone component**

```tsx
"use client";
import { useState, useCallback } from "react";
import { Upload, FileText } from "lucide-react";

interface FileDropZoneProps {
  onFile: (file: File) => void;
  loading: boolean;
}

export function FileDropZone({ onFile, loading }: FileDropZoneProps) {
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) onFile(file);
    },
    [onFile]
  );

  return (
    <label
      className="flex flex-col items-center justify-center gap-4 p-10 md:p-14 rounded-2xl border-2 border-dashed cursor-pointer transition-all"
      style={{
        borderColor: dragOver ? "var(--accent)" : "var(--border)",
        backgroundColor: dragOver ? "rgba(92,77,60,0.05)" : "transparent",
      }}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <input
        type="file"
        accept=".txt,.epub"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
        }}
        disabled={loading}
      />
      {loading ? (
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: "var(--muted)", borderTopColor: "var(--accent)" }} />
          <p style={{ color: "var(--muted)" }}>正在解析...</p>
        </div>
      ) : (
        <>
          <Upload size={36} style={{ color: "var(--muted)" }} />
          <div className="text-center">
            <p className="font-medium">拖拽文件到此处，或点击选择</p>
            <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
              支持 TXT、EPUB 格式
            </p>
          </div>
        </>
      )}
    </label>
  );
}
```

- [ ] **Step 2: Write import page**

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileDropZone } from "@/components/FileDropZone";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function ImportPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleFile(file: File) {
    setLoading(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/books", { method: "POST", body: formData });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "导入失败");
      }
      const book = await res.json();
      router.push(`/read/${book.id}`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto">
      <Link href="/" className="inline-flex items-center gap-1.5 text-sm mb-6" style={{ color: "var(--muted)" }}>
        <ArrowLeft size={16} /> 返回书架
      </Link>
      <h1 className="text-2xl font-semibold mb-6">导入小说</h1>
      <FileDropZone onFile={handleFile} loading={loading} />
      {error && (
        <div className="mt-4 p-3 rounded-lg text-sm" style={{ backgroundColor: "rgba(220,38,38,0.1)", color: "#dc2626" }}>
          {error}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify import flow**

Start dev, go to `/import`, upload a test txt file → should redirect to reader page

- [ ] **Step 4: Commit**

```bash
git add src/app/import/ src/components/FileDropZone.tsx
git commit -m "feat: add import page with drag-drop file upload"
```

---

## Phase 3: AI Analysis

### Task 9: Analyze service (character scan + segment annotation)

**Files:**
- Modify: `src/lib/services.ts` (append)

- [ ] **Step 1: Add analyze functions**

Append to `src/lib/services.ts`:

```ts
```ts
import crypto from "crypto";

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "mireader-dev-key-32chars!!!";

function decryptApiKey(encrypted: string): string {
  const [ivHex, data] = encrypted.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-cbc", Buffer.from(ENCRYPTION_KEY), iv);
  let decrypted = decipher.update(data, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return JSON.parse(decrypted).key;
}

const MIMO_API_BASE = "https://api.xiaomimimo.com/v1";

function getApiKey(): string {
  const db = getDb();
  const row = db.prepare("SELECT value FROM settings WHERE key = 'api_key'").get() as { value: string } | undefined;
  if (!row) throw new Error("请先在设置中配置 MiMo API Key");
  return decryptApiKey(row.value);
}

async function callMiMoPro(messages: { role: string; content: string }[]): Promise<any> {
  const apiKey = getApiKey();
  const res = await fetch(`${MIMO_API_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify({
      model: "mimo-v2-pro",
      messages,
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) throw new Error(`MiMo Pro API error: ${res.status}`);
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  return JSON.parse(content);
}

export async function scanCharacters(bookId: number) {
  const db = getDb();
  const chapters = db.prepare("SELECT * FROM chapters WHERE book_id = ? ORDER BY \"index\"").all(bookId) as Chapter[];

  // Sample text: 500 chars per 5000 chars, max 20 samples
  const samples: string[] = [];
  let pos = 0;
  for (const ch of chapters) {
    while (pos < ch.content.length && samples.length < 20) {
      const end = Math.min(pos + 500, ch.content.length);
      samples.push(ch.content.slice(pos, end));
      pos += 5000;
    }
    pos = Math.max(0, pos - ch.content.length);
    if (samples.length >= 20) break;
  }

  const prompt = `分析以下小说片段，识别所有有台词的角色。为每个角色输出：name（角色名）、aliases（别名数组）、gender（男/女/未知）、age_range（儿童/青年/中年/老年）、personality（性格描述，10字内）、role_type（main/supporting/background）。

小说片段：
${samples.join("\n---\n")}

只输出JSON。`;

  const result = await callMiMoPro([{ role: "user", content: prompt }]);

  // Insert characters
  const insertChar = db.prepare(
    `INSERT OR IGNORE INTO characters (book_id, name, aliases, gender, age_range, personality, role_type)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );

  const characters: { name: string; aliases?: string[]; gender?: string; age_range?: string; personality?: string; role_type?: string }[] =
    result.characters || [];

  // Merge aliases
  const merged: Map<string, typeof characters[0]> = new Map();
  const aliasMap: Map<string, string> = new Map();

  for (const c of characters) {
    const canonName = aliasMap.get(c.name) || c.name;
    if (merged.has(canonName)) {
      const existing = merged.get(canonName)!;
      existing.aliases = [...(existing.aliases || []), ...(c.aliases || [])];
    } else {
      merged.set(canonName, c);
    }
    for (const a of c.aliases || []) {
      aliasMap.set(a, canonName);
    }
  }

  // Voice pool — assign by gender + age
  const VOICE_POOL: Record<string, Record<string, string[]>> = {
    "女": { "儿童": ["female_child"], "青年": ["default_zh"], "中年": ["default_zh"], "老年": ["default_zh"] },
    "男": { "儿童": ["male_child"], "青年": ["male_youth"], "中年": ["male_adult"], "老年": ["male_elder"] },
    "未知": { "青年": ["mimo_default"] },
  };

  const insertVoice = db.prepare(
    `INSERT OR REPLACE INTO character_voices (character_id, mimo_voice_id, voice_name)
     VALUES (?, ?, ?)`
  );

  for (const [, c] of merged) {
    insertChar.run(bookId, c.name, JSON.stringify(c.aliases || []), c.gender || "未知", c.age_range || "青年", c.personality || "", c.role_type || "supporting");
    const charRow = db.prepare("SELECT id FROM characters WHERE book_id = ? AND name = ?").get(bookId, c.name) as { id: number };
    const pool = VOICE_POOL[c.gender || "未知"]?.[c.age_range || "青年"] || ["mimo_default"];
    const voiceId = pool[0];
    insertVoice.run(charRow.id, voiceId, voiceId);
  }
}

export async function annotateChapter(chapterId: number) {
  const db = getDb();
  const chapter = db.prepare("SELECT * FROM chapters WHERE id = ?").get(chapterId) as Chapter | undefined;
  if (!chapter) throw new Error("章节不存在");

  const characters = db.prepare(
    "SELECT c.id, c.name, c.aliases, cv.mimo_voice_id FROM characters c LEFT JOIN character_voices cv ON cv.character_id = c.id WHERE c.book_id = ?"
  ).all(chapter.book_id);

  // Mark as analyzing
  db.prepare("UPDATE chapters SET analysis_status = 'analyzing' WHERE id = ?").run(chapterId);

  const charNames = characters.map((c: any) => `${c.name}(${c.id})`).join("、");

  // Split long chapters
  const maxLen = 30000;
  const text = chapter.content;
  let allSegments: any[] = [];

  for (let i = 0; i < text.length; i += maxLen) {
    const chunk = text.slice(i, Math.min(i + maxLen, text.length));
    const prompt = `分析以下小说片段，将文本拆分为朗读段落（按自然段分割）。每段标注：type（"narration"叙述 或 "dialogue"对话）、如果是对话则标注character为说话角色名、emotion（情绪标签如：开心、悲伤、生气、轻声、急促、疲惫、温和、严肃、耳语、惊讶，用空格分隔最多2个）。

角色列表：${charNames}

文本：
${chunk}

只输出JSON：{"segments": [{"type":"narration","text":"..."},{"type":"dialogue","character":"林婉儿","text":"...","emotion":"轻声"} ]}`;

    const result = await callMiMoPro([{ role: "user", content: prompt }]);
    allSegments = allSegments.concat(result.segments || []);
  }

  // Save segments
  const insertSeg = db.prepare(
    `INSERT OR REPLACE INTO chapter_segments (chapter_id, segment_index, type, character_id, text, emotion)
     VALUES (?, ?, ?, ?, ?, ?)`
  );

  const charMap = new Map<string, number>();
  for (const c of characters as any[]) {
    charMap.set(c.name, c.id);
    // Also map aliases
    if (c.aliases) {
      try {
        for (const a of JSON.parse(c.aliases)) charMap.set(a, c.id);
      } catch {}
    }
  }

  const insertAll = db.transaction(() => {
    for (let i = 0; i < allSegments.length; i++) {
      const s = allSegments[i];
      const charId = s.character ? (charMap.get(s.character) || null) : null;
      insertSeg.run(chapterId, i, s.type, charId, s.text, s.emotion || null);
    }
  });

  insertAll();

  db.prepare("UPDATE chapters SET analysis_status = 'done' WHERE id = ?").run(chapterId);
}
```

- [ ] **Step 2: Write analyze API route**

`src/app/api/analyze/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import { scanCharacters, annotateChapter } from "@/lib/services";

export async function POST(req: NextRequest) {
  try {
    const { action, bookId, chapterId } = await req.json();

    if (action === "scan" && bookId) {
      await scanCharacters(bookId);
      return NextResponse.json({ ok: true });
    }

    if (action === "annotate" && chapterId) {
      await annotateChapter(chapterId);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Invalid action or missing params" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "分析失败" }, { status: 500 });
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/services.ts src/app/api/analyze/
git commit -m "feat: add character scanning and chapter annotation with MiMo Pro"
```

---

## Phase 4: TTS & Reading

### Task 10: TTS service with caching

**Files:**
- Modify: `src/lib/services.ts` (append)
- Create: `src/app/api/tts/route.ts`

- [ ] **Step 1: Add TTS functions**

Append to `src/lib/services.ts`:

```ts
import crypto from "crypto";

export async function synthesizeSegment(
  chapterId: number,
  segmentIndex: number,
  text: string,
  characterId: number | null,
  emotion: string | null,
  voiceId: string
): Promise<{ audioPath: string; base64: string }> {
  const db = getDb();

  // Check cache
  const cached = db.prepare(
    "SELECT * FROM audio_cache WHERE chapter_id = ? AND segment_index = ?"
  ).get(chapterId, segmentIndex) as { audio_path: string } | undefined;

  if (cached && fs.existsSync(cached.audio_path)) {
    const audioBuffer = fs.readFileSync(cached.audio_path);
    return { audioPath: cached.audio_path, base64: audioBuffer.toString("base64") };
  }

  // Build style tags
  let styledText = text;
  if (emotion) {
    styledText = `<style>${emotion}</style>${styledText}`;
  }

  // TTS call with retry
  let res: Response;
  for (let retry = 0; retry < 3; retry++) {
    res = await fetch(`${MIMO_API_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify({
        model: "mimo-v2.5-tts",
        messages: [{ role: "user", content: styledText }],
        audio: {
          format: "mp3",
          voice: voiceId,
        },
      }),
    });
    if (res.ok) break;
    if (retry < 2) await new Promise((r) => setTimeout(r, 1000 * (retry + 1)));
  }

  if (!res!.ok) throw new Error(`TTS API error: ${res!.status}`);
  const data = await res!.json();
  const base64Audio = data.choices?.[0]?.message?.audio?.data;
  if (!base64Audio) throw new Error("TTS response missing audio data");

  const audioBuffer = Buffer.from(base64Audio, "base64");

  // Get book_id for path
  const chapter = db.prepare(
    "SELECT c.book_id FROM chapters c WHERE c.id = ?"
  ).get(chapterId) as { book_id: number };

  const audioDir = path.join(process.cwd(), "data", "audio", String(chapter.book_id));
  fs.mkdirSync(audioDir, { recursive: true });
  const audioPath = path.join(audioDir, `${chapterId}_${segmentIndex}.mp3`);
  fs.writeFileSync(audioPath, audioBuffer);

  db.prepare(
    `INSERT OR REPLACE INTO audio_cache (chapter_id, segment_index, audio_path, format, size_bytes)
     VALUES (?, ?, ?, 'mp3', ?)`
  ).run(chapterId, segmentIndex, audioPath, audioBuffer.length);

  // Enforce cache limit (3GB per book)
  enforceCacheLimit(chapter.book_id);

  return { audioPath, base64: base64Audio };
}

function enforceCacheLimit(bookId: number) {
  const db = getDb();
  const maxBytes = 3 * 1024 * 1024 * 1024; // 3GB
  const result = db.prepare(
    `SELECT COALESCE(SUM(ac.size_bytes), 0) as total
     FROM audio_cache ac
     JOIN chapters c ON c.id = ac.chapter_id
     WHERE c.book_id = ?`
  ).get(bookId) as { total: number };

  let total = result.total;
  if (total > maxBytes) {
    const oldest = db.prepare(
      `SELECT ac.id, ac.audio_path, ac.size_bytes
       FROM audio_cache ac
       JOIN chapters c ON c.id = ac.chapter_id
       WHERE c.book_id = ?
       ORDER BY ac.created_at ASC`
    ).all(bookId) as { id: number; audio_path: string; size_bytes: number }[];

    for (const row of oldest) {
      if (total <= maxBytes * 0.8) break;
      db.prepare("DELETE FROM audio_cache WHERE id = ?").run(row.id);
      if (fs.existsSync(row.audio_path)) fs.unlinkSync(row.audio_path);
      total -= row.size_bytes;
    }
  }
}

export function saveProgress(bookId: number, chapterIndex: number, segmentIndex: number) {
  const db = getDb();
  db.prepare(
    `INSERT INTO reading_progress (book_id, chapter_index, segment_index, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(book_id) DO UPDATE SET chapter_index = ?, segment_index = ?, updated_at = datetime('now')`
  ).run(bookId, chapterIndex, segmentIndex, chapterIndex, segmentIndex);
}
```

- [ ] **Step 2: Write TTS API route**

`src/app/api/tts/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import { synthesizeSegment } from "@/lib/services";
import { getDb } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const { chapterId, segmentIndex, text, characterId, emotion } = await req.json();

    // Look up voice for this character/chapter
    const db = getDb();
    let voiceId = "mimo_default";
    if (characterId) {
      const voice = db.prepare("SELECT mimo_voice_id FROM character_voices WHERE character_id = ?").get(characterId) as { mimo_voice_id: string } | undefined;
      if (voice) voiceId = voice.mimo_voice_id;
    }

    const result = await synthesizeSegment(chapterId, segmentIndex, text, characterId, emotion, voiceId);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/services.ts src/app/api/tts/
git commit -m "feat: add TTS synthesis with mp3 caching and cache limit enforcement"
```

---

### Task 11: Reading page (PlayerBar + ReadingContent)

**Files:**
- Create: `src/app/read/[bookId]/page.tsx`
- Create: `src/components/PlayerBar.tsx`
- Create: `src/components/ReadingContent.tsx`
- Create: `src/components/CharacterPanel.tsx`

- [ ] **Step 1: Write PlayerBar component**

```tsx
"use client";
import { Play, Pause, SkipBack, SkipForward } from "lucide-react";
import { formatDuration } from "@/lib/utils";

interface PlayerBarProps {
  chapterTitle: string;
  currentSegment: number;
  totalSegments: number;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onPrevSegment: () => void;
  onNextSegment: () => void;
  currentTime: number;
  duration: number;
  speakingCharacter: string | null;
  speed: number;
  onSpeedChange: (speed: number) => void;
}

export function PlayerBar({
  chapterTitle,
  currentSegment,
  totalSegments,
  isPlaying,
  onTogglePlay,
  onPrevSegment,
  onNextSegment,
  currentTime,
  duration,
  speakingCharacter,
}: PlayerBarProps) {
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const segProgress = totalSegments > 0 ? ((currentSegment + 1) / totalSegments) * 100 : 0;

  return (
    <div className="glass p-3 md:p-4 mb-4 sticky top-2 z-10">
      <div className="flex items-center gap-3">
        {/* Play/Pause */}
        <button
          onClick={onTogglePlay}
          className="w-9 h-9 rounded-full flex items-center justify-center transition-colors flex-shrink-0"
          style={{ borderColor: "var(--accent)", borderWidth: 2, backgroundColor: "transparent" }}
        >
          {isPlaying ? <Pause size={16} style={{ color: "var(--accent)" }} /> : <Play size={16} style={{ color: "var(--accent)" }} />}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium truncate">{chapterTitle}</span>
            <span className="text-xs ml-2 flex-shrink-0" style={{ color: "var(--muted)" }}>
              {formatDuration(currentTime)} / {formatDuration(duration)}
            </span>
          </div>

          {/* Timeline progress */}
          <div className="h-1 mt-1.5 rounded-full" style={{ backgroundColor: "var(--border)" }}>
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{ width: `${progress}%`, backgroundColor: "var(--accent)" }}
            />
          </div>

          {/* Segment progress dots */}
          <div className="flex gap-0.5 mt-1.5">
            {Array.from({ length: Math.min(totalSegments, 60) }).map((_, i) => (
              <div
                key={i}
                className="flex-1 h-0.5 rounded-full"
                style={{
                  backgroundColor: i <= currentSegment ? "var(--accent)" : "var(--border)",
                  opacity: i === currentSegment ? 1 : 0.4,
                }}
              />
            ))}
          </div>

          {/* Speaking character indicator */}
          <div className="flex items-center gap-1.5 mt-1.5">
            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "var(--accent)" }} />
            <span className="text-xs" style={{ color: "var(--muted)" }}>
              {speakingCharacter ? `${speakingCharacter} 正在朗读` : "准备播放"}
            </span>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={onPrevSegment} className="p-1.5" style={{ color: "var(--muted)" }}>
            <SkipBack size={16} />
          </button>
          <button onClick={onNextSegment} className="p-1.5" style={{ color: "var(--muted)" }}>
            <SkipForward size={16} />
          </button>
        </div>

        {/* Speed control */}
        <select
          value={speed}
          onChange={(e) => onSpeedChange(Number(e.target.value))}
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

- [ ] **Step 2: Write ReadingContent component**

```tsx
"use client";

interface Segment {
  id: number;
  segment_index: number;
  type: "narration" | "dialogue";
  character_id: number | null;
  text: string;
  character_name?: string;
  character_color?: string;
}

interface ReadingContentProps {
  segments: Segment[];
  activeSegmentIndex: number;
}

const CHARACTER_COLORS = [
  "#c4956a", "#8c9e6b", "#6b8a9e", "#9e6b8a",
  "#6b9e8c", "#9e8c6b", "#8a6b9e", "#6b9e9e",
];

export function ReadingContent({ segments, activeSegmentIndex }: ReadingContentProps) {
  // Assign colors to characters
  const charColorMap = new Map<string, string>();
  let colorIdx = 0;
  for (const seg of segments) {
    if (seg.character_name && !charColorMap.has(seg.character_name)) {
      charColorMap.set(seg.character_name, CHARACTER_COLORS[colorIdx % CHARACTER_COLORS.length]);
      colorIdx++;
    }
  }

  return (
    <div className="glass p-5 md:p-8">
      <div className="prose-lg max-w-none text-serif leading-relaxed md:leading-loose space-y-4">
        {segments.map((seg) => {
          const isActive = seg.segment_index === activeSegmentIndex;
          const charColor = seg.character_name ? charColorMap.get(seg.character_name) : undefined;

          return (
            <p
              key={seg.id}
              className={`transition-all duration-300 px-3 py-1.5 -mx-3 rounded-lg ${
                isActive ? "ring-1" : ""
              }`}
              style={{
                color: seg.type === "dialogue" && charColor ? charColor : "var(--text)",
                backgroundColor: isActive ? "var(--glass-bg)" : "transparent",
                borderColor: isActive ? "var(--accent)" : "transparent",
                opacity: isActive ? 1 : 0.6,
                fontSize: isActive ? "1.05em" : "1em",
              }}
            >
              {seg.text}
            </p>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Write CharacterPanel component**

```tsx
"use client";
import { X, Users } from "lucide-react";

interface Character {
  id: number;
  name: string;
  voice_name: string | null;
  role_type: string;
}

interface CharacterPanelProps {
  characters: Character[];
  activeCharacterName: string | null;
  isOpen: boolean;
  onToggle: () => void;
}

export function CharacterPanel({ characters, activeCharacterName, isOpen, onToggle }: CharacterPanelProps) {
  const roleLabel = (t: string) => ({ main: "主角", supporting: "配角", background: "背景" }[t] || t);

  return (
    <>
      {/* Desktop: sidebar */}
      <div className="hidden lg:block w-48 flex-shrink-0">
        <div className="glass p-3 sticky top-20">
          <div className="flex items-center gap-1.5 mb-3">
            <Users size={14} style={{ color: "var(--muted)" }} />
            <span className="text-xs font-medium" style={{ color: "var(--muted)" }}>角色</span>
          </div>
          <div className="space-y-1.5">
            {characters.map((c) => (
              <div
                key={c.id}
                className="px-2 py-1.5 rounded-lg text-xs transition-all"
                style={{
                  backgroundColor: c.name === activeCharacterName ? "var(--glass-bg)" : "transparent",
                  color: c.name === activeCharacterName ? "var(--accent)" : "var(--muted)",
                  fontWeight: c.name === activeCharacterName ? 600 : 400,
                }}
              >
                <div>{c.name}</div>
                <div className="opacity-60">{roleLabel(c.role_type)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Mobile: bottom sheet toggle */}
      <button
        onClick={onToggle}
        className="lg:hidden fixed bottom-4 right-4 w-11 h-11 rounded-full flex items-center justify-center shadow-lg z-20"
        style={{ backgroundColor: "var(--accent)", color: "var(--bg)" }}
      >
        <Users size={18} />
      </button>

      {/* Mobile: bottom sheet */}
      {isOpen && (
        <div className="lg:hidden fixed inset-0 z-30" onClick={onToggle}>
          <div className="absolute inset-0 bg-black/30" />
          <div
            className="absolute bottom-0 left-0 right-0 p-4 rounded-t-2xl max-h-[50vh] overflow-y-auto"
            style={{ backgroundColor: "var(--bg)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="font-medium">角色列表</span>
              <button onClick={onToggle}><X size={18} /></button>
            </div>
            <div className="space-y-2">
              {characters.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between p-2 rounded-lg"
                  style={{
                    backgroundColor: c.name === activeCharacterName ? "var(--glass-bg)" : "transparent",
                  }}
                >
                  <div>
                    <div className="text-sm font-medium">{c.name}</div>
                    <div className="text-xs" style={{ color: "var(--muted)" }}>{roleLabel(c.role_type)}</div>
                  </div>
                  <span className="text-xs" style={{ color: "var(--muted)" }}>{c.voice_name || "默认"}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 4: Write reader page**

```tsx
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

interface Chapter {
  id: number;
  index: number;
  title: string | null;
  analysis_status: string;
}

interface BookData {
  id: number;
  title: string;
  chapters: Chapter[];
  characters: any[];
  progress: { chapter_index: number; segment_index: number } | null;
}

export default function ReaderPage() {
  const { bookId } = useParams<{ bookId: string }>();
  const [book, setBook] = useState<BookData | null>(null);
  const [currentChapterIdx, setCurrentChapterIdx] = useState(0);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [activeSegment, setActiveSegment] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [characterSheetOpen, setCharacterSheetOpen] = useState(false);
  const [speed, setSpeed] = useState(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioSourceRef = useRef<string | null>(null);

  // Load book data
  useEffect(() => {
    fetch(`/api/books/${bookId}`)
      .then((r) => r.json())
      .then((data: BookData) => {
        setBook(data);
        const prog = data.progress;
        if (prog) {
          setCurrentChapterIdx(prog.chapter_index);
        }
      });
  }, [bookId]);

  // Load chapter data
  useEffect(() => {
    if (!book) return;
    const chapterId = book.chapters[currentChapterIdx]?.id;
    if (!chapterId) return;

    async function loadSegments() {
      const ch = book!.chapters[currentChapterIdx];
      // Trigger annotation if pending
      if (ch.analysis_status === "pending") {
        await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "annotate", chapterId }),
        });
        // Poll for completion (max 30s)
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
    }

    loadSegments().catch(console.error);
  }, [book, currentChapterIdx, bookId]);

  // Play current segment audio
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
      if (data.base64) {
        const audioSrc = `data:audio/mp3;base64,${data.base64}`;
        if (audioRef.current) {
          audioRef.current.src = audioSrc;
          audioRef.current.play();
          setIsPlaying(true);
        }
      }
      if (audioRef.current) {
          audioRef.current.playbackRate = speed;
        }
      }
    } catch (e) {
      console.error("TTS error, skipping segment:", e);
      // Skip to next segment on failure
      if (activeSegment < segments.length - 1) {
        setActiveSegment((s) => s + 1);
      }
    }
  }, [book, segments, currentChapterIdx, speed]);

  // Handle segment progression
  useEffect(() => {
    if (isPlaying && segments.length > 0) {
      playSegment(activeSegment);
    }
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
      // Auto-advance to next chapter
      if (book && currentChapterIdx < book.chapters.length - 1) {
        setCurrentChapterIdx((c) => c + 1);
        setActiveSegment(0);
      }
    }
  };

  // Swipe gesture handling
  const touchStartX = useRef(0);
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 80) {
      if (diff > 0 && book && currentChapterIdx < book.chapters.length - 1) {
        setCurrentChapterIdx((c) => c + 1);
        setActiveSegment(0);
      } else if (diff < 0 && currentChapterIdx > 0) {
        setCurrentChapterIdx((c) => c - 1);
        setActiveSegment(0);
      }
    }
  };

  const togglePlay = () => {
    if (!isPlaying) {
      setIsPlaying(true);
    } else {
      audioRef.current?.pause();
      setIsPlaying(false);
    }
  };

  const currentChapter = book?.chapters[currentChapterIdx];
  const activeCharId = segments[activeSegment]?.character_id;
  const activeChar = book?.characters?.find((c: any) => c.id === activeCharId);

  if (!book) {
    return <div className="flex justify-center py-20" style={{ color: "var(--muted)" }}>加载中...</div>;
  }

  return (
    <div className="flex gap-4">
      {/* Main content */}
      <div className="flex-1 min-w-0" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <Link href="/" className="flex-shrink-0" style={{ color: "var(--muted)" }}>
            <ArrowLeft size={20} />
          </Link>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold truncate">{book.title}</h1>
          </div>
        </div>

        {/* Player */}
        <PlayerBar
          chapterTitle={currentChapter?.title || `第${currentChapterIdx + 1}章`}
          currentSegment={activeSegment}
          totalSegments={segments.length}
          isPlaying={isPlaying}
          onTogglePlay={togglePlay}
          onPrevSegment={() => activeSegment > 0 && setActiveSegment((s) => s - 1)}
          onNextSegment={() => activeSegment < segments.length - 1 && setActiveSegment((s) => s + 1)}
          currentTime={currentTime}
          duration={duration}
          speakingCharacter={activeChar?.name || null}
          speed={speed}
          onSpeedChange={setSpeed}
        />

        {/* Reading content */}
        {segments.length > 0 ? (
          <ReadingContent
            segments={segments.map((s) => ({
              ...s,
              character_name: book.characters?.find((c: any) => c.id === s.character_id)?.name || null,
            }))}
            activeSegmentIndex={activeSegment}
          />
        ) : (
          <div className="glass p-8 text-center" style={{ color: "var(--muted)" }}>
            {currentChapter?.analysis_status === "analyzing" ? "正在分析章节..." : "章节分析中，请稍候..."}
          </div>
        )}

        {/* Chapter navigation */}
        <div className="flex justify-between mt-4">
          <button
            onClick={() => { setCurrentChapterIdx((c) => Math.max(0, c - 1)); setActiveSegment(0); }}
            disabled={currentChapterIdx === 0}
            className="text-sm px-3 py-1.5 rounded-lg disabled:opacity-30"
            style={{ color: "var(--muted)" }}
          >
            ← 上一章
          </button>
          <span className="text-sm" style={{ color: "var(--muted)" }}>
            {currentChapterIdx + 1} / {book.chapters.length}
          </span>
          <button
            onClick={() => { setCurrentChapterIdx((c) => Math.min(book.chapters.length - 1, c + 1)); setActiveSegment(0); }}
            disabled={currentChapterIdx === book.chapters.length - 1}
            className="text-sm px-3 py-1.5 rounded-lg disabled:opacity-30"
            style={{ color: "var(--accent)" }}
          >
            下一章 →
          </button>
        </div>
      </div>

      {/* Character sidebar/sheet */}
      <CharacterPanel
        characters={(book.characters || []).map((c: any) => ({
          id: c.id,
          name: c.name,
          voice_name: c.voice_name,
          role_type: c.role_type || "supporting",
        }))}
        activeCharacterName={activeChar?.name || null}
        isOpen={characterSheetOpen}
        onToggle={() => setCharacterSheetOpen(!characterSheetOpen)}
      />

      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        onEnded={handleAudioEnd}
        onTimeUpdate={(e) => setCurrentTime((e.target as HTMLAudioElement).currentTime * 1000)}
        onLoadedMetadata={(e) => setDuration((e.target as HTMLAudioElement).duration * 1000)}
        className="hidden"
      />
    </div>
  );
}
```

- [ ] **Step 5: Add segments API endpoint**

`src/app/api/books/[id]/segments/route.ts`:
```ts
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const { searchParams } = new URL(req.url);
  const chapterId = searchParams.get("chapterId");
  if (!chapterId) return NextResponse.json({ error: "chapterId required" }, { status: 400 });

  const db = getDb();
  const segments = db.prepare(
    "SELECT * FROM chapter_segments WHERE chapter_id = ? ORDER BY segment_index"
  ).all(Number(chapterId));

  return NextResponse.json(segments);
}
```

- [ ] **Step 6: Add progress API**

`src/app/api/books/progress/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import { saveProgress } from "@/lib/services";

export async function PUT(req: NextRequest) {
  const { bookId, chapterIndex, segmentIndex } = await req.json();
  saveProgress(bookId, chapterIndex, segmentIndex);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 7: Commit**

```bash
git add src/app/read/ src/components/PlayerBar.tsx src/components/ReadingContent.tsx src/components/CharacterPanel.tsx src/app/api/books/
git commit -m "feat: add reader page with player, text sync, and character panel"
```

---

## Phase 5: Settings & Character Management

### Task 12: Settings page

**Files:**
- Create: `src/app/settings/page.tsx`
- Create: `src/app/api/settings/route.ts`

- [ ] **Step 1: Write settings API**

`src/app/api/settings/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import crypto from "crypto";

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "mireader-dev-key-32chars!!!"; // 32 bytes

function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(ENCRYPTION_KEY), iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
}

function decrypt(text: string): string {
  const [ivHex, encrypted] = text.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-cbc", Buffer.from(ENCRYPTION_KEY), iv);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

export async function GET() {
  const db = getDb();
  const rows = db.prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];

  // Decrypt sensitive values for display
  const settings: Record<string, any> = {};
  for (const row of rows) {
    try {
      settings[row.key] = row.key === "api_key" ? JSON.parse(decrypt(row.value)) : JSON.parse(row.value);
    } catch {
      settings[row.key] = row.value;
    }
  }
  return NextResponse.json(settings);
}

export async function PUT(req: NextRequest) {
  const db = getDb();
  const { apiKey, theme } = await req.json();

  const upsert = db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = datetime('now')`
  );

  if (apiKey !== undefined) {
    const encrypted = encrypt(JSON.stringify({ key: apiKey }));
    upsert.run("api_key", encrypted, encrypted);
  }

  if (theme !== undefined) {
    upsert.run("theme", JSON.stringify({ mode: theme }), JSON.stringify({ mode: theme }));
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Write settings page**

```tsx
"use client";
import { useEffect, useState } from "react";
import { ArrowLeft, Trash2 } from "lucide-react";
import Link from "next/link";

export default function SettingsPage() {
  const [apiKey, setApiKey] = useState("");
  const [saved, setSaved] = useState(false);
  const [theme, setTheme] = useState<"system" | "light" | "dark">("system");
  const [cacheSize, setCacheSize] = useState("计算中...");

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        if (data.api_key?.key) setApiKey(data.api_key.key);
        if (data.theme?.mode) setTheme(data.theme.mode);
      });
    // Estimate cache size
    fetch("/api/books")
      .then((r) => r.json())
      .then((books: any[]) => {
        let total = 0;
        // Simple count from audio dir
        setCacheSize(books.length > 0 ? `${books.length} 本书有缓存` : "暂无缓存");
      });
  }, []);

  async function saveSettings() {
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey, theme }),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);

    // Apply theme
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else if (theme === "light") {
      document.documentElement.classList.remove("dark");
    } else {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      document.documentElement.classList.toggle("dark", prefersDark);
    }
    localStorage.setItem("mireader-theme", theme);
  }

  return (
    <div className="max-w-lg mx-auto">
      <Link href="/" className="inline-flex items-center gap-1.5 text-sm mb-6" style={{ color: "var(--muted)" }}>
        <ArrowLeft size={16} /> 返回书架
      </Link>
      <h1 className="text-2xl font-semibold mb-6">设置</h1>

      <div className="space-y-6">
        {/* API Key */}
        <div className="glass p-5">
          <h2 className="font-medium mb-3">MiMo API Key</h2>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="输入你的 MiMo API Key"
            className="w-full px-3 py-2 rounded-lg text-sm border outline-none"
            style={{ borderColor: "var(--border)", backgroundColor: "var(--bg)", color: "var(--text)" }}
          />
          <p className="text-xs mt-1.5" style={{ color: "var(--muted)" }}>
            在 platform.xiaomimimo.com 控制台获取
          </p>
        </div>

        {/* Theme */}
        <div className="glass p-5">
          <h2 className="font-medium mb-3">主题</h2>
          <div className="flex gap-2">
            {[
              { value: "system" as const, label: "跟随系统" },
              { value: "light" as const, label: "浅色" },
              { value: "dark" as const, label: "深色" },
            ].map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setTheme(value)}
                className="flex-1 py-2 rounded-lg text-sm font-medium transition-all"
                style={{
                  backgroundColor: theme === value ? "var(--accent)" : "var(--glass-bg)",
                  color: theme === value ? "var(--bg)" : "var(--text)",
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Cache */}
        <div className="glass p-5">
          <h2 className="font-medium mb-3">音频缓存</h2>
          <p className="text-sm" style={{ color: "var(--muted)" }}>{cacheSize}</p>
        </div>

        {/* Save */}
        <button
          onClick={saveSettings}
          className="w-full py-2.5 rounded-lg text-sm font-medium transition-all"
          style={{ backgroundColor: "var(--accent)", color: "var(--bg)" }}
        >
          {saved ? "已保存 ✓" : "保存设置"}
        </button>

        {/* About */}
        <div className="text-center text-xs" style={{ color: "var(--muted)" }}>
          <p>MiReader v0.1 — 沉浸式有声小说朗读</p>
          <p className="mt-1">Powered by Xiaomi MiMo TTS</p>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/settings/ src/app/api/settings/
git commit -m "feat: add settings page with API key config, theme toggle, and cache info"
```

---

### Task 13: Character management page

**Files:**
- Create: `src/app/books/[bookId]/characters/page.tsx`

- [ ] **Step 1: Write character management page**

```tsx
"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

interface Character {
  id: number;
  name: string;
  gender: string | null;
  age_range: string | null;
  personality: string | null;
  role_type: string;
  mimo_voice_id: string | null;
  voice_name: string | null;
}

export default function CharactersPage() {
  const { bookId } = useParams<{ bookId: string }>();
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/books/${bookId}`)
      .then((r) => r.json())
      .then((data) => {
        setCharacters(data.characters || []);
        setLoading(false);
      });
  }, [bookId]);

  const roleLabel = (t: string) => ({ main: "主角", supporting: "配角", background: "背景" }[t] || t);

  if (loading) {
    return <div className="flex justify-center py-20" style={{ color: "var(--muted)" }}>加载中...</div>;
  }

  return (
    <div className="max-w-lg mx-auto">
      <Link href={`/read/${bookId}`} className="inline-flex items-center gap-1.5 text-sm mb-6" style={{ color: "var(--muted)" }}>
        <ArrowLeft size={16} /> 返回阅读
      </Link>
      <h1 className="text-2xl font-semibold mb-6">角色管理</h1>
      <div className="space-y-3">
        {characters.map((c) => (
          <div key={c.id} className="glass p-4 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium">{c.name}</span>
                <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: "var(--border)", color: "var(--muted)" }}>
                  {roleLabel(c.role_type)}
                </span>
              </div>
              <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                {[c.gender, c.age_range, c.personality].filter(Boolean).join(" · ")}
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm" style={{ color: "var(--accent)" }}>{c.voice_name || "默认音色"}</div>
              <div className="text-xs" style={{ color: "var(--muted)" }}>{c.mimo_voice_id || "-"}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/books/
git commit -m "feat: add character management page with voice info display"
```

---

### Task 14: Wire up auto-scan on import

**Files:**
- Modify: `src/lib/services.ts` (importBook function)
- Modify: `src/app/api/books/route.ts`

- [ ] **Step 1: Update importBook to trigger async scan**

Modify `importBook` in `src/lib/services.ts`, at the end before return, add:
```ts
  // Trigger async character scan (don't await)
  scanCharacters(bookId).catch((e) => console.error("Initial scan failed:", e));
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/services.ts
git commit -m "feat: trigger auto character scan on book import"
```

---

### Task 15: Final integration & polish

**Files:**
- Modify: `src/app/layout.tsx` (add navigation)
- Create: `data/books/.gitkeep` (placeholder)

- [ ] **Step 1: Add navigation bar to layout**

Update `src/app/layout.tsx`, update the body content:
```tsx
        <main className="mx-auto max-w-4xl px-4 py-6 md:px-6 md:py-8">
          <nav className="flex items-center justify-between mb-6">
            <div />
            <Link href="/settings" className="text-sm" style={{ color: "var(--muted)" }}>
              设置
            </Link>
          </nav>
          {children}
        </main>
```

And add the Link import to layout.tsx.

- [ ] **Step 2: Test full flow end-to-end**

1. `npm run dev`
2. Open http://localhost:3000
3. Go to Settings, add MiMo API Key
4. Go to Import, upload a test txt novel
5. Verify redirect to reader page
6. Verify character scan runs
7. Click play, verify audio plays
8. Verify text highlighting follows audio
9. Navigate chapters
10. Go back to bookshelf, verify progress shown
11. Delete book from API, verify cleanup

- [ ] **Step 3: Fix any issues found during testing**

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add navigation and final integration polish"
```

---

## Task Summary

| Phase | Tasks | Output |
|-------|-------|--------|
| 1. Foundation | 1-4 | Next.js scaffold, theme, DB, GlassCard |
| 2. Book Mgmt | 5-8 | Import/parse, API routes, bookshelf, import UI |
| 3. AI Analysis | 9 | Character scan, segment annotation, MiMo Pro |
| 4. TTS & Reading | 10-11 | TTS synth + cache, player, reader, character panel |
| 5. Settings | 12-15 | Settings page, character mgmt, auto-scan, polish |

**Total: 15 tasks, ~60 steps**
