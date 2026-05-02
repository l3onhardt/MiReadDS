import { NextRequest, NextResponse } from "next/server";
import { synthesizeSegment } from "@/lib/services";
import { getDb } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const { chapterId, segmentIndex, text, characterId, emotion } = await req.json();

    // Look up voice for this character
    const db = getDb();
    let voiceId = "mimo_default";
    if (characterId) {
      const voice = db.prepare("SELECT mimo_voice_id FROM character_voices WHERE character_id = ?").get(characterId) as { mimo_voice_id: string } | undefined;
      if (voice) voiceId = voice.mimo_voice_id;
    }

    const result = await synthesizeSegment(chapterId, segmentIndex, text, characterId, emotion, voiceId);
    return NextResponse.json(result);
  } catch (e: any) {
    console.error("TTS error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
