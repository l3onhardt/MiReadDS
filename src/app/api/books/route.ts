import { NextRequest, NextResponse } from "next/server";
import { listBooks, importBook } from "@/lib/services";

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
    return NextResponse.json(book, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "导入失败" }, { status: 500 });
  }
}
