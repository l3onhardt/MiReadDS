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
