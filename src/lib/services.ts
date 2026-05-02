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
        const fullText = (epub.flow || []).map((f: any) => f.text || "").join("\n\n");
        resolve(fullText);
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
  db.prepare("DELETE FROM books WHERE id = ?").run(id);
  // Clean up files
  const bookDir = path.join(process.cwd(), "data", "books", String(id));
  const audioDir = path.join(process.cwd(), "data", "audio", String(id));
  if (fs.existsSync(bookDir)) fs.rmSync(bookDir, { recursive: true });
  if (fs.existsSync(audioDir)) fs.rmSync(audioDir, { recursive: true });
}

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
