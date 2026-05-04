import { NextRequest, NextResponse } from "next/server";
import { saveProgress } from "@/lib/services";

export async function PUT(req: NextRequest) {
  try {
    const { bookId, chapterIndex, positionMs } = await req.json();
    saveProgress(bookId, chapterIndex || 0, positionMs || 0);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
