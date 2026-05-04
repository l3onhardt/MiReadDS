import { NextRequest, NextResponse } from "next/server";
import { listBooks, importBook, generateChapterAudio } from "@/lib/services";
import { getDb } from "@/lib/db";

export async function GET() {
  try {
    const books = listBooks();
    return NextResponse.json(books);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    if (!file) return NextResponse.json({ error: "请选择文件" }, { status: 400 });
    const book = await importBook(file);

    // Trigger chapter 1 audio generation (fire and forget — client polls progress)
    const db = getDb();
    const ch1 = db.prepare(
      "SELECT id FROM chapters WHERE book_id = ? AND \"index\" = 0"
    ).get(book.id) as { id: number } | undefined;

    if (ch1) {
      generateChapterAudio(ch1.id).catch((e: any) =>
        console.error(`Chapter 1 pre-generation failed:`, e)
      );
    }

    return NextResponse.json(book, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "导入失败" }, { status: 500 });
  }
}
