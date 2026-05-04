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
      p.position_ms as progress_position_ms
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

const MIMO_API_BASE = process.env.MIMO_API_BASE || "https://token-plan-sgp.xiaomimimo.com/v1";

function getApiKey(): string {
  // Prefer environment variable (server-side only, never exposed to frontend)
  if (process.env.MIMO_API_KEY) return process.env.MIMO_API_KEY;

  const db = getDb();
  const row = db.prepare("SELECT value FROM settings WHERE key = 'api_key'").get() as { value: string } | undefined;
  if (!row) throw new Error("请先设置 MiMo API Key（环境变量 MIMO_API_KEY 或通过设置页面配置）");
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

  // Voice pool — assign by gender + age, mapped to actual MiMo v2.5 presets
  // Presets: 冰糖(活泼少女), 茉莉(知性女声), 苏打(阳光少年), 白桦(成熟男声)
  const VOICE_POOL: Record<string, Record<string, string[]>> = {
    "女": { "儿童": ["冰糖"], "青年": ["冰糖"], "中年": ["茉莉"], "老年": ["茉莉"] },
    "男": { "儿童": ["苏打"], "青年": ["苏打"], "中年": ["白桦"], "老年": ["白桦"] },
    "未知": { "青年": ["白桦"] },
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

// ============================================================
// Chapter audio generation pipeline
// ============================================================

interface DirectorScene {
  text: string;
  speaker: string | null;
  voice_style: string;
  emotion: string;
}

const CHAPTER_AUDIO_DIR = path.join(process.cwd(), "data", "chapter-audio");

// Emotion tag mapping for TTS inline tags
const EMOTION_TAG_MAP: Record<string, string> = {
  "开心": "开心", "悲伤": "悲伤", "生气": "愤怒", "轻声": "轻声",
  "急促": "语速加快", "疲惫": "疲惫", "温和": "温柔", "严肃": "严肃",
  "耳语": "轻声", "惊讶": "惊讶", "兴奋": "兴奋", "平静": "平静",
  "紧张": "紧张", "沉稳": "",
};

function buildTtsTag(voiceStyle: string, emotion: string): string {
  const parts: string[] = [];
  if (voiceStyle) parts.push(voiceStyle);
  if (emotion) {
    const mapped = emotion.split(/\s+/).map((e) => EMOTION_TAG_MAP[e] || e).filter(Boolean);
    parts.push(...mapped);
  }
  // Deduplicate
  const unique = [...new Set(parts)];
  return unique.length > 0 ? `(${unique.join(" ")})` : "";
}

async function generateSceneAudio(
  scene: DirectorScene,
  baseVoice: string,
  apiKey: string,
  bookId: number,
  sceneIndex: number,
  tmpDir: string
): Promise<string> {
  const tag = buildTtsTag(scene.voice_style, scene.emotion);
  const styledText = tag ? tag + scene.text : scene.text;

  const styleInstruction = "你是一个专业的有声书主播，正在为听众朗读一本小说。请用自然流畅、富有感情的语气朗读以下内容。";

  let res: Response | undefined;
  for (let retry = 0; retry < 3; retry++) {
    try {
      res = await fetch(`${MIMO_API_BASE}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "api-key": apiKey },
        body: JSON.stringify({
          model: "mimo-v2.5-tts",
          messages: [
            { role: "user", content: styleInstruction },
            { role: "assistant", content: styledText },
          ],
          audio: { format: "mp3", voice: baseVoice },
        }),
      });
      if (res.ok) break;
    } catch {}
    if (retry < 2) await new Promise((r) => setTimeout(r, 1000 * (retry + 1)));
  }

  if (!res || !res.ok) throw new Error(`TTS scene ${sceneIndex} error: ${res?.status || "network"}`);
  const data = await res.json();
  const base64Audio = data.choices?.[0]?.message?.audio?.data;
  if (!base64Audio) throw new Error(`TTS scene ${sceneIndex} missing audio`);

  const audioBuffer = Buffer.from(base64Audio, "base64");
  const scenePath = path.join(tmpDir, `scene_${sceneIndex}.mp3`);
  fs.writeFileSync(scenePath, audioBuffer);
  return scenePath;
}

function concatScenes(scenePaths: string[], outputPath: string): void {
  // MP3 frames are self-contained — simple Buffer.concat works for concatenation
  const buffers = scenePaths.map((p) => fs.readFileSync(p));
  const combined = Buffer.concat(buffers);
  fs.writeFileSync(outputPath, combined);
}

function getAudioDuration(audioPath: string): number {
  // Estimate: MP3 at ~128kbps = ~16KB/s. Rough estimate for progress bar.
  const stat = fs.statSync(audioPath);
  return Math.round((stat.size / 16000) * 1000);
}

interface SceneManifest {
  scenes: {
    path: string;
    text: string;
    speaker: string | null;
    voice_style: string;
    emotion: string;
    duration_ms: number;
  }[];
  total_duration_ms: number;
}

function enforceChapterCacheLimit(bookId: number) {
  const db = getDb();
  const maxBytes = 3 * 1024 * 1024 * 1024; // 3GB per book
  const result = db.prepare(
    `SELECT COALESCE(SUM(ca.size_bytes), 0) as total
     FROM chapter_audio ca
     JOIN chapters c ON c.id = ca.chapter_id
     WHERE c.book_id = ?`
  ).get(bookId) as { total: number };

  let total = result.total;
  if (total > maxBytes) {
    const oldest = db.prepare(
      `SELECT ca.id, ca.audio_path, ca.size_bytes
       FROM chapter_audio ca
       JOIN chapters c ON c.id = ca.chapter_id
       WHERE c.book_id = ?
       ORDER BY ca.created_at ASC`
    ).all(bookId) as { id: number; audio_path: string; size_bytes: number }[];

    for (const row of oldest) {
      if (total <= maxBytes * 0.8) break;
      db.prepare("DELETE FROM chapter_audio WHERE id = ?").run(row.id);
      if (fs.existsSync(row.audio_path)) fs.unlinkSync(row.audio_path);
      total -= row.size_bytes;
    }
  }
}

export async function generateChapterAudio(chapterId: number): Promise<{ audioPath: string; durationMs: number } | null> {
  const db = getDb();

  try {
    const chapter = db.prepare("SELECT * FROM chapters WHERE id = ?").get(chapterId) as Chapter | undefined;
    if (!chapter) throw new Error("章节不存在");

    // Check if already ready
    const existing = db.prepare("SELECT * FROM chapter_audio WHERE chapter_id = ? AND status = 'ready'").get(chapterId) as any;
    if (existing && fs.existsSync(existing.audio_path)) {
      return { audioPath: existing.audio_path, durationMs: existing.duration_ms || 0 };
    }

    // If already generating, don't start again
    const inProgress = db.prepare("SELECT * FROM chapter_audio WHERE chapter_id = ? AND status = 'generating'").get(chapterId) as any;
    if (inProgress) return null;

    // Set status to generating
    db.prepare(
      `INSERT INTO chapter_audio (chapter_id, audio_path, status) VALUES (?, '', 'generating')
       ON CONFLICT(chapter_id) DO UPDATE SET status = 'generating', error_message = null`
    ).run(chapterId);

    const apiKey = getApiKey();
    const book = db.prepare("SELECT * FROM books WHERE id = ?").get(chapter.book_id) as any;
    const characters = db.prepare(
      "SELECT c.name, cv.mimo_voice_id FROM characters c LEFT JOIN character_voices cv ON cv.character_id = c.id WHERE c.book_id = ?"
    ).all(chapter.book_id) as any[];

    const baseVoice = book?.narrator_voice || "白桦";

    const charContext = characters.length > 0
      ? "角色列表：" + characters.map((c: any) => `${c.name}(${c.mimo_voice_id || "未知声线"})`).join("、")
      : "";

    // === Phase 1: LLM Director ===
    const maxBatchSize = 6000;
    let allScenes: DirectorScene[] = [];

    for (let batchStart = 0; batchStart < chapter.content.length; batchStart += maxBatchSize) {
      const batchText = chapter.content.slice(batchStart, batchStart + maxBatchSize);

      const directorPrompt = `你是一个有声剧导演。分析以下小说片段，将文本切分为演绎场景（scenes），为每个场景标注声音演绎指令。

规则：
1. 保持原文完全不变，每个场景的text必须是原文的连续片段
2. 场景长度建议 200-500 字，对话可以更短，旁白可以稍长
3. 标注每个场景的 voice_style（声音风格）和 emotion（情绪）
4. 如果是对话，标注 speaker（说话角色名）；旁白 speaker 为 null

声音风格可选：少年音、少女音、御姐音、大叔音、老年音（旁白用空字符串）
情绪可选：开心、悲伤、愤怒、紧张、轻声、急促、严肃、温柔、惊讶、平静、疲惫（最多2个用空格分隔，旁白可用 沉稳）

${charContext}

小说片段：
${batchText}

只输出JSON：
{"scenes": [{"text": "原文片段", "speaker": "角色名或null", "voice_style": "声音风格或空", "emotion": "情绪标签"}]}`;

      const result = await callMiMoPro([{ role: "user", content: directorPrompt }]);
      const scenes: DirectorScene[] = (result.scenes || []).map((s: any) => ({
        text: s.text || "",
        speaker: s.speaker || null,
        voice_style: s.voice_style || "",
        emotion: s.emotion || "",
      }));
      allScenes = allScenes.concat(scenes);

      // Update progress
      db.prepare("UPDATE chapter_audio SET size_bytes = ? WHERE chapter_id = ?")
        .run(Math.round((batchStart + batchText.length) / chapter.content.length * 50), chapterId);
    }

    if (allScenes.length === 0) {
      allScenes = [{ text: chapter.content, speaker: null, voice_style: "", emotion: "沉稳" }];
    }

    // Save the full scene plan (without audio paths) to DB first
    const initialManifest = {
      scenes: allScenes.map((s) => ({
        path: "",
        text: s.text,
        speaker: s.speaker,
        voice_style: s.voice_style,
        emotion: s.emotion,
        duration_ms: 0,
      })),
      total_duration_ms: 0,
      total_scenes: allScenes.length,
      generated_scenes: 0,
    };
    db.prepare(
      `UPDATE chapter_audio SET size_bytes = 50, scene_script = ? WHERE chapter_id = ?`
    ).run(JSON.stringify(initialManifest), chapterId);

    // === Phase 2: TTS generation (first batch → mark ready, rest in background) ===
    const sceneDir = path.join(CHAPTER_AUDIO_DIR, String(chapterId));
    fs.mkdirSync(sceneDir, { recursive: true });

    const totalScenes = allScenes.length;
    const CONCURRENCY = 5;
    const chapterBookId = chapter.book_id;
    const FIRST_BATCH_SIZE = Math.min(10, totalScenes); // Generate at least 10 scenes before ready

    // Generate a single batch of scenes
    async function generateBatch(batchStart: number, count: number): Promise<{ index: number; path: string; duration_ms: number }[]> {
      const batch = allScenes.slice(batchStart, batchStart + count);
      const promises = batch.map(async (scene, offset) => {
        const i = batchStart + offset;
        const tmpDir = path.join(sceneDir, `tmp_${i}`);
        fs.mkdirSync(tmpDir, { recursive: true });
        const tmpPath = await generateSceneAudio(scene, baseVoice, apiKey, chapterBookId, i, tmpDir);
        const permPath = path.join(sceneDir, `scene_${i}.mp3`);
        fs.renameSync(tmpPath, permPath);
        try { fs.rmSync(tmpDir, { recursive: true }); } catch {}
        return { index: i, path: permPath, duration_ms: getAudioDuration(permPath) };
      });
      return Promise.all(promises);
    }

    function saveManifest(generatedResults: { index: number; path: string; duration_ms: number }[]) {
      // Read current manifest, update paths, save
      const row = db.prepare("SELECT scene_script FROM chapter_audio WHERE chapter_id = ?").get(chapterId) as any;
      const current: any = row?.scene_script ? JSON.parse(row.scene_script) : initialManifest;
      for (const r of generatedResults) {
        if (current.scenes[r.index]) {
          current.scenes[r.index].path = r.path;
          current.scenes[r.index].duration_ms = r.duration_ms;
        }
      }
      current.generated_scenes = current.scenes.filter((s: any) => s.path).length;
      current.total_duration_ms = current.scenes.reduce((sum: number, s: any) => sum + (s.duration_ms || 0), 0);
      const progress = Math.round(50 + (current.generated_scenes / totalScenes) * 50);
      db.prepare(
        `UPDATE chapter_audio SET audio_path = ?, duration_ms = ?, size_bytes = ?, scene_script = ? WHERE chapter_id = ?`
      ).run(current.scenes.find((s: any) => s.path)?.path || "", current.total_duration_ms, progress, JSON.stringify(current), chapterId);
      return current;
    }

    // Generate first batch (blocking — client needs this to start playing)
    const firstResults = await generateBatch(0, FIRST_BATCH_SIZE);
    const firstManifest = saveManifest(firstResults);

    // Mark as ready — client can start playing
    db.prepare(
      `UPDATE chapter_audio SET status = 'ready', error_message = null WHERE chapter_id = ?`
    ).run(chapterId);
    db.prepare("UPDATE chapters SET analysis_status = 'done' WHERE id = ?").run(chapterId);

    // Continue generating remaining scenes in background (don't await)
    const bgChapterId = chapterId;
    (async () => {
      try {
        let allResults = [...firstResults];
        for (let batchStart = FIRST_BATCH_SIZE; batchStart < totalScenes; batchStart += CONCURRENCY) {
          const count = Math.min(CONCURRENCY, totalScenes - batchStart);
          const batchResults = await generateBatch(batchStart, count);
          allResults = allResults.concat(batchResults);
          saveManifest(allResults);
        }
        db.prepare("UPDATE chapter_audio SET size_bytes = 100 WHERE chapter_id = ?").run(bgChapterId);
        enforceChapterCacheLimit(chapterBookId);
      } catch (e) {
        console.error(`Background generation for chapter ${bgChapterId} failed:`, e);
      }
    })();

    return { audioPath: firstManifest.scenes.find((s: any) => s.path)?.path || "", durationMs: firstManifest.total_duration_ms };
  } catch (e: any) {
    try {
      db.prepare("UPDATE chapter_audio SET status = 'error', error_message = ? WHERE chapter_id = ?")
        .run(String(e.message || e).slice(0, 500), chapterId);
    } catch {}
    throw e;
  }
}

export function getChapterAudioStatus(chapterId: number): { status: string; audioPath: string | null; durationMs: number; sceneManifest: any; progress: number } {
  const db = getDb();
  const row = db.prepare("SELECT status, audio_path, duration_ms, scene_script, size_bytes FROM chapter_audio WHERE chapter_id = ?").get(chapterId) as any;
  if (!row) return { status: "pending", audioPath: null, durationMs: 0, sceneManifest: null, progress: 0 };
  let sceneManifest: any = null;
  if (row.scene_script) {
    try { sceneManifest = JSON.parse(row.scene_script); } catch {}
  }
  // size_bytes doubles as progress (0-100) during generation
  const progress = (row.size_bytes && row.size_bytes > 0 && row.status === 'generating') ? row.size_bytes : (row.status === 'ready' ? 100 : 0);
  return { status: row.status, audioPath: row.audio_path, durationMs: row.duration_ms || 0, sceneManifest, progress };
}

export function getSceneAudioPath(chapterId: number, sceneIndex: number): string | null {
  const status = getChapterAudioStatus(chapterId);
  if (!status.sceneManifest?.scenes?.[sceneIndex]) return null;
  return status.sceneManifest.scenes[sceneIndex].path;
}

export async function maybePreloadNextChapter(bookId: number, currentChapterIdx: number) {
  const db = getDb();
  const nextChapter = db.prepare(
    "SELECT id FROM chapters WHERE book_id = ? AND \"index\" = ?"
  ).get(bookId, currentChapterIdx + 1) as { id: number } | undefined;

  if (!nextChapter) return;

  const status = getChapterAudioStatus(nextChapter.id);
  if (status.status === "pending") {
    // Fire and forget — don't block the response
    generateChapterAudio(nextChapter.id).catch((e) =>
      console.error(`Preload chapter ${currentChapterIdx + 1} failed:`, e)
    );
  }
}

export function saveProgress(bookId: number, chapterIndex: number, positionMs: number) {
  const db = getDb();
  db.prepare(
    `INSERT INTO reading_progress (book_id, chapter_index, position_ms, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(book_id) DO UPDATE SET chapter_index = ?, position_ms = ?, updated_at = datetime('now')`
  ).run(bookId, chapterIndex, positionMs, chapterIndex, positionMs);
}
