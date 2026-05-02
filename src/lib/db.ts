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
