import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const { searchParams } = new URL(req.url);
  const chapterId = searchParams.get("chapterId");
  if (!chapterId) return NextResponse.json({ error: "chapterId required" }, { status: 400 });

  const db = getDb();
  const segments = db.prepare(
    "SELECT * FROM chapter_segments WHERE chapter_id = ? ORDER BY segment_index"
  ).all(Number(chapterId));

  return NextResponse.json(segments);
}
