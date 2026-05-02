import { NextRequest, NextResponse } from "next/server";
import { getBook, deleteBook } from "@/lib/services";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const book = getBook(Number(params.id));
    if (!book) return NextResponse.json({ error: "书籍不存在" }, { status: 404 });
    return NextResponse.json(book);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    deleteBook(Number(params.id));
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
