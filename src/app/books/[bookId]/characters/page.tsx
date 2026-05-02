"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

interface Character {
  id: number;
  name: string;
  gender: string | null;
  age_range: string | null;
  personality: string | null;
  role_type: string;
  mimo_voice_id: string | null;
  voice_name: string | null;
}

export default function CharactersPage() {
  const { bookId } = useParams<{ bookId: string }>();
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/books/${bookId}`)
      .then((r) => r.json())
      .then((data) => {
        setCharacters(data.characters || []);
        setLoading(false);
      });
  }, [bookId]);

  const roleLabel = (t: string) => ({ main: "主角", supporting: "配角", background: "背景" }[t] || t);

  if (loading) {
    return <div className="flex justify-center py-20" style={{ color: "var(--muted)" }}>加载中...</div>;
  }

  return (
    <div className="max-w-lg mx-auto">
      <Link href={`/read/${bookId}`} className="inline-flex items-center gap-1.5 text-sm mb-6" style={{ color: "var(--muted)" }}>
        <ArrowLeft size={16} /> 返回阅读
      </Link>
      <h1 className="text-2xl font-semibold mb-6">角色管理</h1>
      <div className="space-y-3">
        {characters.map((c) => (
          <div key={c.id} className="glass p-4 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium">{c.name}</span>
                <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: "var(--border)", color: "var(--muted)" }}>
                  {roleLabel(c.role_type)}
                </span>
              </div>
              <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                {[c.gender, c.age_range, c.personality].filter(Boolean).join(" · ")}
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm" style={{ color: "var(--accent)" }}>{c.voice_name || "默认音色"}</div>
              <div className="text-xs" style={{ color: "var(--muted)" }}>{c.mimo_voice_id || "-"}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
