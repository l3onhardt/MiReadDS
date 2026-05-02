import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import crypto from "crypto";

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "mireader-dev-key-32chars!!!";

function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(ENCRYPTION_KEY), iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
}

function decrypt(text: string): string {
  const [ivHex, encrypted] = text.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-cbc", Buffer.from(ENCRYPTION_KEY), iv);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

export async function GET() {
  const db = getDb();
  const rows = db.prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];

  const settings: Record<string, any> = {};
  for (const row of rows) {
    try {
      const raw = row.key === "api_key" ? JSON.parse(decrypt(row.value)) : JSON.parse(row.value);
      settings[row.key] = raw;
    } catch {
      settings[row.key] = row.value;
    }
  }
  return NextResponse.json(settings);
}

export async function PUT(req: NextRequest) {
  const db = getDb();
  const { apiKey, theme } = await req.json();

  const upsert = db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = datetime('now')`
  );

  if (apiKey !== undefined) {
    const encrypted = encrypt(JSON.stringify({ key: apiKey }));
    upsert.run("api_key", encrypted, encrypted);
  }

  if (theme !== undefined) {
    upsert.run("theme", JSON.stringify({ mode: theme }), JSON.stringify({ mode: theme }));
  }

  return NextResponse.json({ ok: true });
}
