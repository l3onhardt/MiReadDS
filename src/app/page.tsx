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
  chapter_count: number;
  character_count: number;
  progress_chapter: number | null;
}

export default function BookshelfPage() {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/books")
      .then((r) => r.json())
      .then((data) => { setBooks(Array.isArray(data) ? data : []); setLoading(false); })
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

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 md:gap-5">
        {books.map((book) => (
          <BookCard
            key={book.id}
            id={book.id}
            title={book.title}
            author={book.author}
            cover_color={book.cover_color}
            chapterCount={book.chapter_count || 0}
            characterCount={book.character_count || 0}
            progressPercent={
              book.progress_chapter != null && book.chapter_count > 0
                ? Math.round((book.progress_chapter / (book.chapter_count - 1)) * 100)
                : 0
            }
          />
        ))}
      </div>
    </div>
  );
}
