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
    // EPUB: write to temp file, parse with epub library
    const tmpDir = path.join(process.cwd(), "data", "tmp");
    fs.mkdirSync(tmpDir, { recursive: true });
    const tmpPath = path.join(tmpDir, `${Date.now()}.epub`);
    fs.writeFileSync(tmpPath, buffer);

    const EPub = require("epub");
    const epub = new EPub(tmpPath);

    text = await new Promise<string>((resolve, reject) => {
      epub.on("end", () => {
        const flow = epub.flow || [];
        if (flow.length === 0) {
          resolve("");
          return;
        }
        const chapterTexts: string[] = [];
        let completed = 0;
        flow.forEach((f: any, idx: number) => {
          epub.getChapter(f.id, (err: Error | null, chapterText: string) => {
            if (!err && chapterText) chapterTexts[idx] = chapterText;
            completed++;
            if (completed === flow.length) {
              resolve(chapterTexts.filter(Boolean).join("\n\n"));
            }
          });
        });
      });
      epub.on("error", (err: Error) => reject(err));
      epub.parse();
    });

    // Clean up temp file
    try { fs.unlinkSync(tmpPath); } catch {}

    // Try chapter split on EPUB content
    chapters = splitTxtIntoChapters(text);
  }

  const db = getDb();

  const result = db.prepare(
    `INSERT INTO books (title, author, format, file_path, cover_color)
     VALUES (?, ?, ?, ?, ?)`
  ).run(
    path.basename(file.name, path.extname(file.name)),
    null,
    ext,
    "", // placeholder, updated below
    getRandomCoverColor()
  );

  const bookId = result.lastInsertRowid as number;

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
    (chs: { title: string; content: string }[]) => {
      for (let i = 0; i < chs.length; i++) {
        insertStmt.run(bookId, i, chs[i].title, chs[i].content, chs[i].content.length);
      }
    }
  );

  insertMany(chapters);

  // Trigger async character scan (fire-and-forget)
  scanCharacters(bookId).catch((e) => console.error("Initial scan failed:", e));

  return db.prepare("SELECT * FROM books WHERE id = ?").get(bookId) as Book;
}

export function listBooks(): Book[] {
  const db = getDb();
  const books = db.prepare(`
    SELECT b.*,
      (SELECT COUNT(*) FROM chapters WHERE book_id = b.id) as chapter_count,
      (SELECT COUNT(*) FROM characters WHERE book_id = b.id) as character_count,
      p.chapter_index as progress_chapter,
      p.segment_index as progress_segment
    FROM books b
    LEFT JOIN reading_progress p ON p.book_id = b.id
    ORDER BY b.updated_at DESC
  `).all();
  return books as Book[];
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
  db.prepare("DELETE FROM books WHERE id = ?").run(id);
  // Clean up files
  const bookDir = path.join(process.cwd(), "data", "books", String(id));
  const audioDir = path.join(process.cwd(), "data", "audio", String(id));
  if (fs.existsSync(bookDir)) fs.rmSync(bookDir, { recursive: true });
  if (fs.existsSync(audioDir)) fs.rmSync(audioDir, { recursive: true });
}

import crypto from "crypto";

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "mireader-dev-key-32chars!!!!!!!!";

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
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`MiMo Pro API error: ${res.status} ${errText}`);
  }
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("MiMo Pro returned empty response");
  try {
    return JSON.parse(content);
  } catch {
    throw new Error("MiMo Pro returned invalid JSON: " + content.slice(0, 200));
  }
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

  if (samples.length === 0) return;

  const prompt = `分析以下小说片段，识别所有有台词的角色。为每个角色输出：name（角色名）、aliases（别名数组）、gender（男/女/未知）、age_range（儿童/青年/中年/老年）、personality（性格描述，10字内）、role_type（main/supporting/background）。

小说片段：
${samples.join("\n---\n")}

只输出JSON。`;

  const result = await callMiMoPro([{ role: "user", content: prompt }]);

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
  ).all(chapter.book_id) as any[];

  // Mark as analyzing
  db.prepare("UPDATE chapters SET analysis_status = 'analyzing' WHERE id = ?").run(chapterId);

  const charNames = characters.map((c) => `${c.name}(${c.id})`).join("、");

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
    const segs = result.segments || [];
    allSegments = allSegments.concat(segs);
  }

  // Save segments
  const insertSeg = db.prepare(
    `INSERT OR REPLACE INTO chapter_segments (chapter_id, segment_index, type, character_id, text, emotion)
     VALUES (?, ?, ?, ?, ?, ?)`
  );

  const charMap = new Map<string, number>();
  for (const c of characters) {
    charMap.set(c.name, c.id);
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

  const apiKey = getApiKey();

  // TTS call with retry (max 3 attempts with exponential backoff)
  let res: Response | undefined;
  for (let retry = 0; retry < 3; retry++) {
    try {
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
    } catch {}
    if (retry < 2) await new Promise((r) => setTimeout(r, 1000 * (retry + 1)));
  }

  if (!res || !res.ok) throw new Error(`TTS API error: ${res?.status || "network"}`);
  const data = await res.json();
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
