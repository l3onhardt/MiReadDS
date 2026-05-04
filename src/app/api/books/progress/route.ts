import { NextRequest, NextResponse } from "next/server";
import { saveProgress, getBookAudioProgress } from "@/lib/services";

export async function GET(req: NextRequest) {
  const bookId = req.nextUrl.searchParams.get("bookId");
  if (!bookId) {
    return NextResponse.json({ error: "bookId required" }, { status: 400 });
  }
  try {
    const progress = getBookAudioProgress(parseInt(bookId));
    return NextResponse.json(progress);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { bookId, chapterIndex, positionMs } = await req.json();
    saveProgress(bookId, chapterIndex || 0, positionMs || 0);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
