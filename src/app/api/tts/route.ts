import { NextRequest, NextResponse } from "next/server";
import { generateChapterAudio, getChapterAudioStatus, getSceneAudioPath } from "@/lib/services";
import fs from "fs";

export async function POST(req: NextRequest) {
  try {
    const { chapterId } = await req.json();

    if (!chapterId) {
      return NextResponse.json({ error: "chapterId is required" }, { status: 400 });
    }

    let status = getChapterAudioStatus(chapterId);

    // If pending or error, trigger async generation and return immediately
    if (status.status === "pending" || status.status === "error") {
      // Fire and forget — client polls for completion
      generateChapterAudio(chapterId).catch((e) =>
        console.error(`Chapter ${chapterId} generation failed:`, e)
      );
      status = getChapterAudioStatus(chapterId);
    }

    return NextResponse.json({
      status: status.status,
      durationMs: status.durationMs,
      sceneManifest: status.sceneManifest,
    });
  } catch (e: any) {
    console.error("TTS error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const chapterId = req.nextUrl.searchParams.get("chapterId");
  const scene = req.nextUrl.searchParams.get("scene");

  if (!chapterId) {
    return NextResponse.json({ error: "chapterId required" }, { status: 400 });
  }

  // If scene index provided, serve that specific scene MP3
  if (scene !== null) {
    const scenePath = getSceneAudioPath(parseInt(chapterId), parseInt(scene));
    if (!scenePath || !fs.existsSync(scenePath)) {
      return NextResponse.json({ error: "Scene not found" }, { status: 404 });
    }
    const buffer = fs.readFileSync(scenePath);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(buffer.length),
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=31536000",
      },
    });
  }

  // Otherwise return status with manifest
  const status = getChapterAudioStatus(parseInt(chapterId));
  return NextResponse.json({
    status: status.status,
    durationMs: status.durationMs,
    sceneManifest: status.sceneManifest,
  });
}
