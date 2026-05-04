import { NextRequest, NextResponse } from "next/server";
import { scanCharacters, generateChapterAudio, getChapterAudioStatus } from "@/lib/services";

export async function POST(req: NextRequest) {
  try {
    const { action, bookId, chapterId } = await req.json();

    if (action === "scan" && bookId) {
      await scanCharacters(bookId);
      return NextResponse.json({ ok: true });
    }

    if (action === "generate" && chapterId) {
      // Fire and forget — client polls for status
      generateChapterAudio(chapterId).catch((e) =>
        console.error("Chapter audio generation failed:", e)
      );
      return NextResponse.json({ ok: true, status: "generating" });
    }

    if (action === "status" && chapterId) {
      const status = getChapterAudioStatus(chapterId);
      return NextResponse.json(status);
    }

    return NextResponse.json({ error: "Invalid action or missing params" }, { status: 400 });
  } catch (e: any) {
    console.error("Analyze error:", e);
    return NextResponse.json({ error: e.message || "分析失败" }, { status: 500 });
  }
}
