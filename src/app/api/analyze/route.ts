import { NextRequest, NextResponse } from "next/server";
import { scanCharacters, annotateChapter } from "@/lib/services";

export async function POST(req: NextRequest) {
  try {
    const { action, bookId, chapterId } = await req.json();

    if (action === "scan" && bookId) {
      await scanCharacters(bookId);
      return NextResponse.json({ ok: true });
    }

    if (action === "annotate" && chapterId) {
      await annotateChapter(chapterId);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Invalid action or missing params" }, { status: 400 });
  } catch (e: any) {
    console.error("Analyze error:", e);
    return NextResponse.json({ error: e.message || "分析失败" }, { status: 500 });
  }
}
